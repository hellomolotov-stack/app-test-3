// npm test – все тесты одной командой: сборка dist, локальные превью-серверы, каждый тест по очереди.
// Ничего не ходит в настоящую базу, бота или оплату: тесты работают на заглушках.
// node tests/run.cjs [--no-build] [фильтр]
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const filter = args.find(a => !a.startsWith('--')) || '';
const TIMEOUT_MS = 180000;

if (!args.includes('--no-build')) {
    const build = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'ignore' });
    if (build.status !== 0) { console.error('сборка не прошла'); process.exit(1); }
}

// превью-серверы, которые ждут тесты профилей, заявок и билета
const previews = [4185, 4186].map(port => spawn(process.execPath, [path.join(__dirname, 'admission-preview.cjs'), String(port)], { cwd: root, stdio: 'ignore' }));
const stopPreviews = () => previews.forEach(p => { try { p.kill(); } catch (e) {} });
process.on('exit', stopPreviews);

const files = fs.readdirSync(__dirname)
    .filter(f => f.endsWith('.cjs') && !f.startsWith('_') && !/fixture|preview|^run\.cjs$/.test(f))
    .filter(f => !filter || f.includes(filter))
    .sort();

function runOne(file) {
    return new Promise(resolve => {
        const started = Date.now();
        const child = spawn(process.execPath, [path.join(__dirname, file)], { cwd: root, env: process.env });
        let out = '';
        child.stdout.on('data', d => { out += d; });
        child.stderr.on('data', d => { out += d; });
        const timer = setTimeout(() => { child.kill('SIGKILL'); out += '\nпревышено время теста'; }, TIMEOUT_MS);
        child.on('close', code => {
            clearTimeout(timer);
            resolve({ file, ok: code === 0, ms: Date.now() - started, out });
        });
    });
}

(async () => {
    await new Promise(r => setTimeout(r, 800)); // превью-серверы успевают подняться
    const results = [];
    for (const file of files) {
        const r = await runOne(file);
        results.push(r);
        console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${file}  ${(r.ms / 1000).toFixed(1)} с`);
        if (!r.ok) {
            const reason = r.out.split('\n').filter(l => l.trim() && !/^\s+at /.test(l)).slice(-4).join('\n      ');
            console.log(`      ${reason}`);
        }
    }
    stopPreviews();
    const failed = results.filter(r => !r.ok);
    console.log(`\n${results.length - failed.length} из ${results.length} прошли`);
    process.exit(failed.length ? 1 : 0);
})();
