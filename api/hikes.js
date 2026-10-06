// api/hikes.js – список хайков для первого запуска приложения.
// Без кэша главная ждала Firebase: SDK с серверов Google + соединение с базой в Европе –
// из Крыма без VPN это 10+ секунд. Этот ответ отдаёт CDN Vercel (тот же домен, что и само
// приложение), поэтому главная рисуется сразу; Firebase подключается в фоне и обновляет данные.
const DB = 'https://hiking-club-app-b6c7c-default-rtdb.europe-west1.firebasedatabase.app';

module.exports = async (req, res) => {
    try {
        const r = await fetch(`${DB}/hikes.json`);
        if (!r.ok) throw new Error('firebase ' + r.status);
        const hikes = await r.json();
        // минута свежести на CDN, ещё 10 минут – старая копия, пока подтягивается новая
        res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=600');
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.status(200).send(JSON.stringify(hikes || {}));
    } catch (e) {
        res.setHeader('Cache-Control', 'no-store');
        res.status(502).json({ error: 'hikes unavailable' });
    }
};
