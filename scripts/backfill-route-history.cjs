// Локальный запуск: --snapshot <private JSON> --access-module <local auth helper> [--apply].
const fs = require('node:fs');
const path = require('node:path');
const { planRouteHistory } = require('../lib/route-history');
const { routeCatalog } = require('../lib/hike-badges');
const arg = key => process.argv[process.argv.indexOf(key) + 1];
(async () => {
    if (!process.argv.includes('--snapshot')) throw Error('укажи --snapshot');
    const input = JSON.parse(fs.readFileSync(arg('--snapshot'), 'utf8'));
    const { routeBadgeForHike } = await routeCatalog();
    const plan = planRouteHistory(input, routeBadgeForHike, { through: '2026-11-08', notifyDate: '2026-11-08', now: Date.now() });
    if (plan.hikes.length !== 36 || plan.hikes.find(h => h.date === '2026-11-08')?.participants !== 6) throw Error('ожидались 36 хайков и 6 участников Аю-Дага');
    const report = { migration: plan.migration, hikes: plan.hikes, histogram: plan.histogram, users: plan.users, notify: plan.notify, unverified: plan.unverified };
    const output = path.resolve(path.dirname(arg('--snapshot')), 'route-history-report.json');
    fs.writeFileSync(output, JSON.stringify(report, null, 2), { mode: 0o600 });
    console.log(JSON.stringify(report, null, 2));
    if (!process.argv.includes('--apply')) return;
    if (!process.argv.includes('--access-module')) throw Error('укажи --access-module');
    const { access } = require(path.resolve(arg('--access-module')));
    const { DB, headers, checked } = await access();
    for (const change of plan.changes) {
        const url = `${DB}/clubAchievements/${change.id}.json`;
        const r = await checked(url, { headers: { ...headers, 'X-Firebase-ETag': 'true' } });
        const current = await r.json();
        if (current.routeHistoryMigration === plan.migration) continue;
        if (JSON.stringify(current) !== JSON.stringify(change.old)) throw Error(`запись ${change.id} изменилась, пересобери снимок`);
        if (!r.headers.get('etag')) throw Error('нет ETag');
        await checked(url, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json', 'If-Match': r.headers.get('etag') }, body: JSON.stringify(change.record) });
    }
    console.log('APPLIED: '+plan.changes.length+' route records; no bot messages or historical popups');
})().catch(e => { console.error(e.message); process.exitCode = 1; });
