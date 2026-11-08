const assert = require('node:assert/strict');
const { notesFor, publishNotes } = require('../lib/mm-notes');
const original = global.fetch;
let db = { approved: { id: 'approved', date: '2026-11-08', title: 'новая редакция', body: 'одобренный текст', editorialLocked: true, sourceUrl: 'private-source' } };
let writes = 0, conflict = false;
global.fetch = async (url, options = {}) => {
    if (!options.method) return Response.json(db, { headers: { etag: '"revision"' } });
    writes++;
    assert.equal(options.method, 'PUT', 'Firebase conditional writes require PUT');
    assert.equal(options.headers['If-Match'], '"revision"');
    if (conflict) return new Response('', { status: 412 });
    Object.assign(db, JSON.parse(options.body));
    return Response.json(db);
};
(async () => {
    assert.equal(await publishNotes('test', [{ id: 'approved', date: '2026-11-08', body: 'старая редакция' }]), 0);
    assert.equal(writes, 0);
    assert.equal(await publishNotes('test', [{ id: 'other', date: '2026-11-01', body: 'другой выпуск' }]), 1);
    assert.equal(db.approved.body, 'одобренный текст');
    const publicNote = (await notesFor('test', true))[0];
    assert.equal(publicNote.sourceUrl, undefined);
    assert.equal(publicNote.editorialLocked, undefined);
    conflict = true;
    await assert.rejects(publishNotes('test', [{ id: 'other', date: '2026-11-01', body: 'несохранённый текст' }]), /запись не удалась/);
    assert.equal(db.other.body, 'другой выпуск');
    console.log('Summary publishing: editorial protection, normal sync, private metadata and revision conflict: PASS');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => { global.fetch = original; });
