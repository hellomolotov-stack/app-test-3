const crypto = require('node:crypto');
const assert = require('node:assert/strict');

function installFixture() {
    const token = 'local-admission-test-token';
    process.env.TELEGRAM_BOT_TOKEN = token;
    process.env.REGISTRATION_API_URL = 'https://script.google.com/macros/s/test-only/exec';
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ client_email: 'test@example.invalid', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) });
    const fixture = { record: null, version: 0, writes: 0, messages: [], payments: [], telegramOk: true };
    const revision = () => fixture.record ? `rev_${fixture.version}` : 'null_etag';
    global.fetch = async (url, options = {}) => {
        if (url === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'test-token', expires_in: 3600 });
        if (String(url).startsWith('https://api.telegram.org/')) {
            const message = JSON.parse(options.body);
            assert.equal(message.chat_id, '7845375334');
            fixture.messages.push(message);
            return Response.json({ ok: fixture.telegramOk });
        }
        if (url === process.env.REGISTRATION_API_URL) {
            fixture.payments.push(Object.fromEntries(options.body.entries()));
            return Response.json({ status: 'ok', url: 'https://payment.example.invalid/test-only' });
        }
        assert.equal(url, 'https://hiking-club-app-b6c7c-default-rtdb.europe-west1.firebasedatabase.app/admissionPilot/helloIntelligent.json', 'Never access membership or real registration nodes');
        assert.equal(options.headers.Authorization, 'Bearer test-token');
        if (options.method === 'PUT') {
            if (options.headers['If-Match'] !== revision()) return new Response('', { status: 412 });
            fixture.record = JSON.parse(options.body);
            fixture.version++;
            fixture.writes++;
        }
        return Response.json(fixture.record, { headers: { etag: revision() } });
    };
    fixture.signed = (username = 'HelloIntelligent', id = 7845375334, age = 0) => {
        const params = new URLSearchParams({ user: JSON.stringify({ id, username, first_name: 'Макс' }), auth_date: String(Math.floor(Date.now() / 1000) - age) });
        const check = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
        const key = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
        params.set('hash', crypto.createHmac('sha256', key).update(check).digest('hex'));
        return params.toString();
    };
    return fixture;
}

module.exports = { installFixture };
