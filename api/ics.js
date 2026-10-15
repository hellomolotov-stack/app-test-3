// api/ics.js – файл события для календаря телефона («добавить в календарь» после записи).
//   GET /api/ics?d=2026-10-22&t=18:00&title=…&loc=…&url=…
// Время – по Москве, длительность 3 часа. Ничего не читает и не пишет, только собирает .ics.
const clean = v => String(v || '').replace(/[\r\n]+/g, ' ').replace(/([,;\\])/g, '\\$1').slice(0, 300);

module.exports = (req, res) => {
    const d = String(req.query.d || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return res.status(400).send('bad date');
    const tm = String(req.query.t || '').match(/^(\d{1,2})[:.](\d{2})$/);
    const [hh, mm] = tm ? [Number(tm[1]), Number(tm[2])] : [12, 0];
    const start = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10), hh - 3, mm)); // МСК = UTC+3
    const end = new Date(start.getTime() + 3 * 3600 * 1000);
    const f = x => x.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const title = clean(req.query.title) || 'событие клуба';
    const lines = [
        'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//hiking intelligentsia//club//RU', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        `UID:${d}-${encodeURIComponent(title).slice(0, 40)}@intelligentsia-club`,
        `DTSTAMP:${f(new Date())}`, `DTSTART:${f(start)}`, `DTEND:${f(end)}`,
        `SUMMARY:${title}`,
        req.query.loc ? `LOCATION:${clean(req.query.loc)}` : '',
        req.query.url ? `URL:${clean(req.query.url)}` : '',
        'DESCRIPTION:хайкинг интеллигенция – до встречи!',
        'BEGIN:VALARM', 'TRIGGER:-PT3H', 'ACTION:DISPLAY', `DESCRIPTION:${title}`, 'END:VALARM',
        'END:VEVENT', 'END:VCALENDAR'
    ].filter(Boolean);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="event-${d}.ics"`);
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.status(200).send(lines.join('\r\n'));
};
