const { createHash, createHmac, timingSafeEqual } = require('node:crypto');
const profiles = require('./solo-hiking-routes.json');
const baydar = require('./solo-hiking-baydar.json');
const SIGNATURE_LIFETIME = 10 * 60 * 1000;
const ROUTE_ID = /^[a-z0-9][a-z0-9_-]{0,89}$/;

function distance(a, b) {
    const radians = Math.PI / 180;
    const latDelta = (b[0] - a[0]) * radians;
    const lonDelta = (b[1] - a[1]) * radians;
    const h = Math.sin(latDelta / 2) ** 2 + Math.cos(a[0] * radians)
        * Math.cos(b[0] * radians) * Math.sin(lonDelta / 2) ** 2;
    return 12742017.6 * Math.asin(Math.sqrt(Math.min(1, h)));
}

function trackFingerprint(segments) {
    const coordinates = segments.map(segment => segment.map(([lat, lon]) =>
        `${lat.toFixed(5)},${lon.toFixed(5)}`).join('|')).join(';');
    return createHash('sha256').update(coordinates).digest('hex');
}

function normalise(record, id) {
    if (!record || typeof record !== 'object' || [false, 'false', 'no'].includes(record.active)) return null;
    const name = String(record.title || '').trim();
    if (!name || !ROUTE_ID.test(id)) return null;
    const segments = Object.values(record.segments || {}).map(section => Object.values(section || {})
        .filter(point => Array.isArray(point) && point.length >= 2 && point[0] != null && point[1] != null)
        .map(([lat, lon]) => [Number(lat), Number(lon)])
        .filter(([lat, lon]) => Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lon) && Math.abs(lon) <= 180)
    ).filter(section => section.length >= 2);
    return { id, title: name, segments, description: String(record.description || ''), order: Number(record.order) || 0 };
}

function readCatalog(raw) {
    const list = Object.entries(raw || {}).map(([key, route]) => normalise(route, String(route?.id || key))).filter(Boolean);
    const unique = new Map(list.map(route => [route.id, route]));
    const recordedBaydar = Object.entries(raw || {}).some(([key, record]) => String(record?.id || key) === baydar.id);
    if (!recordedBaydar) unique.set(baydar.id, normalise(baydar, baydar.id));
    return [...unique.values()].sort((a,b) => a.order - b.order || a.title.localeCompare(b.title,'ru'));
}

function shape(segments) {
    if (!segments.length) return [];
    const bounds = [Infinity, -Infinity, Infinity, -Infinity];
    for (const section of segments) for (const [lat, lon] of section) {
        bounds[0] = Math.min(bounds[0],lat); bounds[1] = Math.max(bounds[1],lat);
        bounds[2] = Math.min(bounds[2],lon); bounds[3] = Math.max(bounds[3],lon);
    }
    const [south,north,west,east] = bounds;
    const centerLat = (south + north) / 2;
    const centerLon = (west + east) / 2;
    const ratio = Math.cos(centerLat * Math.PI / 180);
    const scale = Math.min(106 / Math.max((east-west)*ratio,1e-8),64 / Math.max(north-south,1e-8));
    return segments.map(section => {
        const stride = Math.ceil(section.length / 65);
        return section.filter((_, i) => i % stride === 0 || i === section.length - 1)
            .map(([lat,lon]) => `${(64+(lon-centerLon)*ratio*scale).toFixed(1)},${(42-(lat-centerLat)*scale).toFixed(1)}`).join(' ');
    });
}

function describe(route) {
    const { id, title, segments } = route;
    const fingerprint = trackFingerprint(segments);
    const editorial = Object.hasOwn(profiles,id) ? profiles[id] : null;
    const surveyed = editorial?.hash === fingerprint ? editorial : null;
    const start = segments[0]?.[0] ?? null;
    const end = segments.at(-1)?.at(-1);
    const oneWay = segments.reduce((sum, section) => sum + section.slice(1)
        .reduce((length,point,i) => length + distance(section[i],point),0),0);
    const incomplete = segments.some((section,i) => i > 0 && distance(segments[i-1].at(-1),section[0]) > 40);
    const kind = !oneWay ? 'missing' : incomplete ? 'parts' : distance(start,end) <= 40 ? 'loop' : 'linear';
    const meters = oneWay * (kind === 'linear' ? 2 : 1);
    const ascent = !surveyed ? null : surveyed.ascent + (kind === 'linear' ? surveyed.descent : 0);
    const descent = !surveyed ? null : kind === 'linear' ? ascent : surveyed.descent;
    const minutes = kind === 'parts' || ascent === null ? null :
        surveyed.minutes || Math.ceil((meters/4000 + ascent/600)*2)*30;
    return {
        id, title, kind, meters, km: meters > 0 ? Math.ceil(meters/1000) : null, minutes, start,
        difficulty: editorial?.difficulty ?? null, line: shape(segments), profile: surveyed?.profile ?? null,
        ascent: ascent === null ? null : Math.round(ascent/10)*10,
        descent: descent === null ? null : Math.round(descent/10)*10,
        description: surveyed?.description || route.description,
        reference: editorial?.reference ?? null,
    };
}

function signature(id, expires, token) {
    return createHmac('sha256', token).update(`solo-gpx:v1:${id}:${expires}`).digest('hex');
}

function downloadPath(id, token, now = Date.now()) {
    const expires = now + SIGNATURE_LIFETIME;
    return `/api/me?soloGpx=${encodeURIComponent(id)}&expires=${expires}&signature=${signature(id,expires,token)}`;
}

function canDownload(id, expiresText, signed, token, now = Date.now()) {
    if (typeof id !== 'string' || !ROUTE_ID.test(id) || typeof expiresText !== 'string'
        || !/^\d{13}$/.test(expiresText) || typeof signed !== 'string' || !/^[\da-f]{64}$/.test(signed)) return false;
    const expires = Number(expiresText);
    return expires > now && expires <= now + SIGNATURE_LIFETIME &&
        timingSafeEqual(Buffer.from(signed,'hex'),Buffer.from(signature(id,expires,token),'hex'));
}

function gpx(route, kind) {
    const title = route.title.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;' }[c]));
    const forward = route.segments;
    const segments = kind === 'linear' ? [...forward, ...[...forward].reverse().map(part => [...part].reverse())] : forward;
    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="ХАЙКИНГ КЛУБ" xmlns="http://www.topografix.com/GPX/1/1">
<trk><name>${title}</name>${segments.map(part => `<trkseg>${part.map(([lat,lon])=>`<trkpt lat="${lat}" lon="${lon}"/>`).join('')}</trkseg>`).join('')}</trk>
</gpx>`;
}

module.exports = { readCatalog, describe, downloadPath, canDownload, gpx };
