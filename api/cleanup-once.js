// Одноразово: снимаем тестовую запись @hellointelligent (7845375334) с хайка 2026-10-11 и освобождаем +1 Макса.
// Цель жёстко зашита, файл удаляется сразу после запуска.
const crypto = require('crypto');
const DB = 'https://hiking-club-app-b6c7c-default-rtdb.europe-west1.firebasedatabase.app';
const UID = '7845375334', DATE = '2026-10-11', INVITER = '163665735';
const b64url = buf => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
async function token() {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    const now = Math.floor(Date.now() / 1000);
    const u = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }))}`;
    const jwt = `${u}.${b64url(crypto.createSign('RSA-SHA256').update(u).sign(sa.private_key))}`;
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${jwt}` });
    return (await r.json()).access_token;
}
module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).end();
    const t = await token();
    const call = async (method, path, body) => {
        const r = await fetch(`${DB}/${path}.json?access_token=${t}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
        return { status: r.status, body: await r.text() };
    };
    const out = {};
    out.before = (await call('GET', `hikeParticipants/${DATE}/${UID}`)).body;
    out.delParticipant = (await call('DELETE', `hikeParticipants/${DATE}/${UID}`)).status;
    out.userReg = (await call('PUT', `userRegistrations/${UID}/${DATE}`, false)).status;
    const code = JSON.parse((await call('GET', `invites_by/${INVITER}_${DATE}`)).body || 'null');
    out.code = code;
    if (code) {
        const inv = JSON.parse((await call('GET', `invites/${code}`)).body || 'null');
        out.inviteUsedBy = inv && inv.used_by;
        if (inv && String(inv.used_by) === UID) out.inviteReset = (await call('PATCH', `invites/${code}`, { used_by: null, used_name: null, used_at: null })).status;
    }
    out.countAfter = Object.keys(JSON.parse((await call('GET', `hikeParticipants/${DATE}`)).body || '{}') || {}).length;
    res.status(200).json(out);
};
