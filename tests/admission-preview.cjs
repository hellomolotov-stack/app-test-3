// Local-only preview. All application writes, bot messages and payments stay in memory.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { installFixture } = require('./admission-fixture.cjs');
const fixture = installFixture();
const handler = require('../api/admission');
const root = path.resolve(__dirname, '..');
const port = Number(process.argv[2] || 4185);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname === '/api/admission') {
        let raw = '';
        for await (const chunk of req) { raw += chunk; if (raw.length > 20000) { res.writeHead(413); res.end(); return; } }
        let body;
        try { body = JSON.parse(raw); } catch { body = {}; }
        await handler({ method: req.method, body }, { setHeader: (...args) => res.setHeader(...args), status(code) { res.statusCode = code; return this; }, json(data) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); } });
        return;
    }
    if (url.pathname === '/api/hikes') { res.setHeader('Content-Type', 'application/json'); res.end('{}'); return; }
    if (req.method !== 'GET') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"status":"ok"}'); return; }
    let pathname = url.pathname === '/' ? '/index.html' : url.pathname;
    if (!/^\/(index\.html|style\.css|js\/[^.].*|assets\/.*|tests\/(admission|profiles)-preview\.js)$/.test(pathname) || pathname.includes('..')) { res.writeHead(404); res.end(); return; }
    try {
        let content = fs.readFileSync(path.join(root, pathname));
        if (pathname === '/index.html') {
            const user = { id: 7845375334, username: 'HelloIntelligent', first_name: 'Макс' };
            const screen = url.searchParams.get('screen') === 'profiles' ? 'profiles' : 'admission';
            content = content.toString().replace(/<script[^>]+src="https:\/\/telegram.org\/js\/telegram-web-app.js[^>]*><\/script>/, '')
                .replace(/<script type="module" src="js\/main.js[^>]*><\/script>/, `<script>window.Telegram={WebApp:{initData:${JSON.stringify(fixture.signed())},initDataUnsafe:{user:${JSON.stringify(user)}},HapticFeedback:{impactOccurred(){},notificationOccurred(){}},BackButton:{hide(){},show(){},onClick(){},offClick(){}},openLink(){},openTelegramLink(){},onEvent(){},offEvent(){}}};</script><script type="module" src="/tests/${screen}-preview.js"></script>`);
        }
        res.writeHead(200, { 'Content-Type': mime[path.extname(pathname)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(content);
    } catch { res.writeHead(404); res.end(); }
}).listen(port, '127.0.0.1', () => console.log(`Admission preview http://localhost:${port} (in-memory only)`));
