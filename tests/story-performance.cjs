const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const fastTimer = (fn, ms) => setTimeout(fn, ms / 100);
const story = fs.readFileSync('js/ui/story.js', 'utf8');
const statsSource = story.slice(story.indexOf('function kmLength('), story.indexOf('const fmt ='))
    .replace("import('./calendar.js')", 'Promise.resolve({hikeTrackPoints: h => h.track.coords})');
const calendar = fs.readFileSync('js/ui/calendar.js', 'utf8');
const snapshotSource = calendar.slice(calendar.indexOf('const storyMapSnapshots ='), calendar.indexOf('const FEED_SNAP_KEY ='))
    .replace('export function', 'function');

(async () => {
    let requests = 0, aborted = 0;
    let response = { elevation: [100, 120, 110, 140, 130] };
    let hang = false;
    const stats = vm.createContext({
        AbortController, setTimeout: fastTimer, clearTimeout,
        fetch: async (url, { signal }) => {
            requests++;
            signal.addEventListener('abort', () => aborted++);
            return hang ? new Promise(() => {}) : { ok: true, json: async () => response };
        }
    });
    vm.runInContext(statsSource, stats);
    const hike = { track: { coords: [[44.4, 34], [44.41, 34], [44.42, 34], [44.43, 34], [44.44, 34]], km: 8.2, gain: 490 } };
    let result = await stats.trackStats(hike);
    assert.equal(result.gain, 490, 'Use the ascent already calculated from GPX');
    assert.equal(result.peak, 140);
    assert.equal(result.km, 8.2);
    await stats.trackStats(hike);
    assert.equal(requests, 1, 'Successful statistics are cached');
    hang = true;
    const slowHike = { track: { ...hike.track, coords: hike.track.coords.slice(1) } };
    const started = Date.now();
    result = await stats.trackStats(slowHike);
    assert.ok(Date.now() - started < 500, 'A stalled service has a hard deadline');
    assert.equal(aborted, 1);
    assert.equal(result.gain, 490);
    assert.equal(result.peak, null, 'Do not invent a summit elevation');
    await stats.trackStats(slowHike);
    assert.equal(requests, 3, 'A timeout is not cached as a successful response');
    hang = false;
    response = { elevation: [100, null, 120, 130] };
    result = await stats.trackStats(slowHike);
    assert.equal(result.peak, null);
    assert.equal(result.gain, 490);
    const before = requests;
    result = await stats.trackStats({ track: { ...hike.track, peak: 900 } });
    assert.equal(requests, before, 'Complete GPX statistics need no external request');
    assert.equal(result.peak, 900);

    let maps = 0, removed = 0, hosts = 0, ready = true, layer = true;
    let sdk = Promise.resolve();
    const context = vm.createContext({
        setTimeout: fastTimer, clearTimeout,
        getHikeTrack: h => h.track,
        ensureMapLibre: () => sdk,
        document: {
            body: { appendChild() { hosts++; } },
            createElement: kind => kind === 'div' ? { style: {}, remove() { hosts--; } } : {
                getContext: () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8Array(4000).fill(100) }) })
            }
        },
        initHikeMap: () => {
            maps++;
            let render;
            return {
                once(event, fn) { if (event === 'still-ready') setTimeout(fn, 0); else render = fn; },
                getLayer: () => layer,
                loaded: () => ready, areTilesLoaded: () => ready,
                getCanvas: () => ({ width: 1080, height: 1920 }),
                triggerRepaint: () => setTimeout(() => render?.(), 0),
                remove() { removed++; }
            };
        }
    });
    vm.runInContext(snapshotSource, context);
    const first = context.snapshotHikeMap(hike);
    assert.equal(context.snapshotHikeMap(hike), first, 'Concurrent requests share a single map');
    const frame = await first;
    assert.equal(frame.width, 1080);
    assert.equal(await context.snapshotHikeMap(hike), frame);
    assert.equal(maps, 1);
    assert.equal(hosts, 0);
    assert.equal(removed, 1);
    await context.snapshotHikeMap(hike, { colorful: true });
    assert.equal(maps, 2, 'Style changes invalidate the snapshot');
    await context.snapshotHikeMap(slowHike);
    assert.equal(maps, 3, 'Track changes invalidate the snapshot');
    ready = false;
    await context.snapshotHikeMap(hike, { width: 300, timeout: 100 });
    await context.snapshotHikeMap(hike, { width: 300, timeout: 100 });
    assert.equal(maps, 5, 'Partial timeout frames are not cached');
    layer = false;
    assert.equal(await context.snapshotHikeMap(hike, { width: 301, timeout: 100 }), null);
    sdk = new Promise(() => {});
    assert.equal(await context.snapshotHikeMap(hike, { width: 302, timeout: 100 }), null);
    assert.equal(hosts, 0, 'SDK and tile timeouts leave no hidden map hosts');
    assert.equal(removed, maps);
    console.log('Story performance passed: bounded elevation/SDK/tile waits, GPX stats, snapshot reuse, invalidation, partial-frame retry and cleanup');
})().catch(error => { console.error(error); process.exitCode = 1; });
