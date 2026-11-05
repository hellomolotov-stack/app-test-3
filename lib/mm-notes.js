// Саммари мастермайндов из Plaud (вкладка «Шаблон мастермайнда»), которые читаются прямо в приложении.
// Firebase mmNotes/<plaud id> = { id, date: 'YYYY-MM-DD', title, place, body (markdown), updatedAt }.
// Публикует воскресная задача на Mac (Plaud → POST /api/club-content с x-summary-secret), правки берутся из Plaud.
const DB = 'https://hiking-club-app-b6c7c-default-rtdb.europe-west1.firebasedatabase.app';
const PREVIEW = 650; // гостям – начало текста

async function readNotes(token) {
    const r = await fetch(`${DB}/mmNotes.json`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`mmNotes ${r.status}`);
    return Object.values((await r.json()) || {}).filter(n => n && n.id && n.body).sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

// для приложения: владельцу карты – целиком, гостю – начало и locked
async function notesFor(token, full) {
    return (await readNotes(token)).map(n => ({
        id: n.id, date: n.date, title: n.title || '', place: n.place || '',
        body: full ? n.body : String(n.body).slice(0, PREVIEW), locked: !full,
    }));
}

const clean = (v, max) => String(v ?? '').slice(0, max);
async function publishNotes(token, notes) {
    if (!Array.isArray(notes) || !notes.length || notes.length > 60) throw new Error('нет заметок');
    const patch = {};
    for (const n of notes) {
        const id = String(n?.id || '').replace(/[^A-Za-z0-9_]/g, '');
        if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(String(n.date || '')) || !String(n.body || '').trim()) throw new Error('плохая заметка ' + id);
        patch[id] = { id, date: n.date, title: clean(n.title, 200), place: clean(n.place, 120), body: clean(n.body, 60000), updatedAt: Date.now() };
    }
    const r = await fetch(`${DB}/mmNotes.json`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(patch), signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error('запись не удалась');
    return Object.keys(patch).length;
}

module.exports = { notesFor, publishNotes };
