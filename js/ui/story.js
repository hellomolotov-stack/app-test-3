// js/ui/story.js – «поделиться в сторис» после записи на хайк.
// Рисуем картинку 1080×1920: на весь экран – снимок нашей 3D-карты с жёлтым треком, сверху дата и название,
// снизу крупно локация, вершина · набор · путь и @yaltahiking, а под ними – место для подписи человека. Показываем превью, по кнопке
// грузим картинку на /api/story (Telegram берёт сторис и сохранение только по публичной ссылке)
// и открываем редактор сторис Telegram или сохраняем файл на телефон.
import { state } from '../state.js';
import { haptic, tg } from '../utils.js';
import { log } from '../api.js';

const W = 1080, H = 1920, PAD = 80;
const YELLOW = '#D9FD19';
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const WD = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const CHANNEL_HANDLE = '@yaltahiking';
const CHANNEL_LINK = 'https://t.me/yaltahiking';

const isGuest = () => state.userCard?.status !== 'active';

function hikeTags(h) {
    const raw = Array.isArray(h.tags) ? h.tags : String(h.tags || '').split(',');
    return raw.map(t => String(t).trim()).filter(Boolean);
}

// переносим текст по словам в заданную ширину
function wrap(ctx, text, maxW) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let line = '';
    words.forEach(w => {
        const test = line ? `${line} ${w}` : w;
        if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
    });
    if (line) lines.push(line);
    return lines;
}

// «хайк на Демерджи» → «Демерджи»: на постере крупно только сама локация
function placeName(title) {
    let t = String(title || 'хайк').trim();
    t = t.replace(/^(хайк|тропа|маршрут|путь|восхождение)\s+(на|в|по|к|до)?\s*/i, '');
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Хайк';
}

function kmLength(pts) {
    let km = 0;
    for (let i = 1; i < pts.length; i++) {
        const [a, b] = pts[i - 1], [c, d] = pts[i];
        const dLat = (c - a) * Math.PI / 180, dLon = (d - b) * Math.PI / 180;
        const h = Math.sin(dLat / 2) ** 2 + Math.cos(a * Math.PI / 180) * Math.cos(c * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
        km += 12742 * Math.asin(Math.sqrt(h));
    }
    return km;
}

// вершина и набор высоты по треку: высоты точек из открытой модели рельефа (Open-Meteo, до 100 точек)
async function trackStats(hike) {
    const { hikeTrackPoints } = await import('./calendar.js');
    const all = hikeTrackPoints(hike);
    if (all.length < 2) return null;
    const step = Math.max(1, Math.ceil(all.length / 100));
    const pts = all.filter((_, i) => i % step === 0);
    if (pts[pts.length - 1] !== all[all.length - 1]) pts.push(all[all.length - 1]);
    const pick = pts.slice(0, 100);
    const r = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${pick.map(p => p[0].toFixed(5)).join(',')}&longitude=${pick.map(p => p[1].toFixed(5)).join(',')}`);
    const els = (await r.json())?.elevation?.filter(Number.isFinite) || [];
    if (els.length < 5) return null;
    let gain = 0;
    for (let i = 1; i < els.length; i++) if (els[i] > els[i - 1]) gain += els[i] - els[i - 1];
    return { peak: Math.max(...els), gain, km: kmLength(all) };
}

const fmt = n => Math.round(n).toLocaleString('ru-RU');
const fmtKm = km => (km >= 10 ? Math.round(km) : Math.round(km * 10) / 10).toLocaleString('ru-RU');

async function drawStory(hike) {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0A0B09';
    ctx.fillRect(0, 0, W, H);

    // 1. 3D-карта на весь кадр: камера наклонена сильнее, чтобы были видны вершина и рельеф
    const [mapCanvas, stats] = await Promise.all([
        import('./calendar.js').then(m => m.snapshotHikeMap(hike, { width: 360, height: 640, ratio: 3, camera: { pitch: 70, zoomDelta: -0.2, centerShift: 0.1 } })).catch(() => null),
        trackStats(hike).catch(() => null)
    ]);
    if (mapCanvas) {
        ctx.drawImage(mapCanvas, 0, 0, W, H);
    } else {
        const g = ctx.createRadialGradient(W / 2, H * .45, 50, W / 2, H * .45, 900);
        g.addColorStop(0, 'rgba(217, 253, 25, .16)');
        g.addColorStop(1, 'rgba(217, 253, 25, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
    }

    // 2. затемнения: сверху под дату, снизу под название, цифры и место для подписи человека
    let g = ctx.createLinearGradient(0, 0, 0, 640);
    g.addColorStop(0, 'rgba(10, 11, 9, .92)');
    g.addColorStop(1, 'rgba(10, 11, 9, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, 640);
    g = ctx.createLinearGradient(0, H - 960, 0, H);
    g.addColorStop(0, 'rgba(10, 11, 9, 0)');
    g.addColorStop(.5, 'rgba(10, 11, 9, .82)');
    g.addColorStop(1, 'rgba(10, 11, 9, .96)');
    ctx.fillStyle = g;
    ctx.fillRect(0, H - 960, W, 960);

    // 3. верх: дата и «я иду на хайк»
    const d = new Date(hike.date + 'T12:00:00');
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = YELLOW;
    ctx.font = `700 46px ${FONT}`;
    ctx.fillText(`${d.getDate()} ${MONTHS[d.getMonth()]} · ${WD[d.getDay()]}${hike.start_time ? ` · ${hike.start_time}` : ''}`, PAD, 210);
    ctx.fillStyle = 'rgba(255, 255, 255, .8)';
    ctx.font = `500 48px ${FONT}`;
    ctx.fillText('я иду на хайк 🏔', PAD, 290);

    // 4. низ: крупно локация (в одну строку, иначе уменьшаем; совсем длинную – в две)
    const name = placeName(hike.title);
    let size = 160, lines;
    do {
        ctx.font = `800 ${size}px ${FONT}`;
        lines = ctx.measureText(name).width <= W - PAD * 2 ? [name] : null;
        size -= 6;
    } while (!lines && size > 96);
    size += 6;
    if (!lines) { ctx.font = `800 ${size}px ${FONT}`; lines = wrap(ctx, name, W - PAD * 2).slice(0, 2); }
    const statsTop = H - 600;
    let y = statsTop - 70 - (lines.length - 1) * size * 1.02;
    ctx.fillStyle = '#fff';
    lines.forEach(l => { ctx.fillText(l, PAD, y); y += size * 1.02; });

    // 5. вершина · набор · путь
    const km = Number(String(hikeTags(hike).join(' ').match(/(\d+(?:[.,]\d+)?)\s*км/)?.[1] || '').replace(',', '.')) || stats?.km;
    const cells = [
        stats ? ['вершина', `${fmt(stats.peak)} м`] : null,
        stats ? ['набор', `↗ ${fmt(stats.gain)} м`] : null,
        km ? ['путь', `${fmtKm(km)} км`] : null
    ].filter(Boolean);
    const cellW = (W - PAD * 2) / 3;
    cells.forEach(([label, value], i) => {
        const x = PAD + i * cellW;
        ctx.fillStyle = 'rgba(255, 255, 255, .62)';
        ctx.font = `500 34px ${FONT}`;
        ctx.fillText(label, x, statsTop);
        ctx.fillStyle = YELLOW;
        ctx.font = `800 66px ${FONT}`;
        ctx.fillText(value, x, statsTop + 76);
    });

    // 6. подпись клуба; ниже (≈ 400 px) – пустое место под текст, который человек допишет в Telegram
    const footY = H - 420;
    ctx.fillStyle = YELLOW;
    ctx.font = `700 38px ${FONT}`;
    ctx.fillText(CHANNEL_HANDLE, PAD, footY);
    const hw = ctx.measureText(CHANNEL_HANDLE).width;
    ctx.fillStyle = 'rgba(255, 255, 255, .7)';
    ctx.font = `500 34px ${FONT}`;
    ctx.fillText('хайкинг интеллигенция', PAD + hw + 24, footY);
    return c;
}

async function upload(dataUrl, date) {
    const r = await fetch('/api/story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: tg?.initData || '', date, img: dataUrl.split(',')[1] })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.url) throw new Error(j.error || 'upload failed');
    return j.url;
}

export async function openStoryShare(hikeDate, source = '') {
    const hike = state.hikesWithTitle.find(h => h.date === hikeDate);
    if (!hike) return;
    haptic();
    log('сторис: открыл', isGuest(), state.user, { hike_date: hikeDate, source });

    document.querySelector('.story-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'inv-overlay story-overlay';
    overlay.innerHTML = `<div class="inv-sheet"><div class="inv-grab cs-grab"></div><div class="inv-scroll">
        <h2>твоя сторис</h2>
        <div class="story-preview"><div class="story-wait"><b>🗺️</b>рисуем 3D-карту маршрута…</div></div>
        <button type="button" class="btn btn-yellow inv-wide" data-share disabled>📸 поделиться в сторис</button>
        <button type="button" class="btn btn-outline inv-wide" data-save disabled>сохранить на телефон</button>
        <div class="inv-note story-note"></div>
    </div></div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('is-on'));
    const close = () => { overlay.classList.remove('is-on'); setTimeout(() => overlay.remove(), 300); };
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    const preview = overlay.querySelector('.story-preview');
    const shareBtn = overlay.querySelector('[data-share]');
    const saveBtn = overlay.querySelector('[data-save]');
    const note = overlay.querySelector('.story-note');

    let dataUrl;
    try {
        const canvas = await drawStory(hike);
        dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    } catch (e) {
        preview.innerHTML = '<div class="story-wait">не получилось нарисовать картинку, попробуй ещё раз</div>';
        return;
    }
    if (!overlay.isConnected) return;
    preview.innerHTML = `<img src="${dataUrl}" alt="сторис хайка">`;
    shareBtn.disabled = false;
    saveBtn.disabled = false;

    // ссылку готовим сразу в фоне – к нажатию кнопки она обычно уже есть
    let urlPromise = upload(dataUrl, hikeDate);
    urlPromise.catch(() => {});
    const getUrl = () => urlPromise.catch(() => (urlPromise = upload(dataUrl, hikeDate)));

    const busy = async (btn, label, fn) => {
        if (btn.dataset.busy) return;
        btn.dataset.busy = '1';
        const text = btn.textContent;
        btn.textContent = label;
        try { await fn(); } catch (e) { note.textContent = 'не получилось – проверь интернет и попробуй ещё раз'; }
        btn.textContent = text;
        delete btn.dataset.busy;
    };

    shareBtn.addEventListener('click', () => busy(shareBtn, 'готовим…', async () => {
        haptic();
        if (!tg?.shareToStory || !tg.isVersionAtLeast?.('7.8')) {
            note.textContent = 'в этой версии Telegram сторис из приложения недоступны – сохрани картинку и выложи её вручную';
            return;
        }
        const url = await getUrl();
        // подпись не добавляем – место внизу картинки оставлено под текст самого человека.
        // Кликабельную ссылку Telegram даёт прикрепить только Premium-аккаунтам, а где она встанет – решает
        // сам Telegram (человек может передвинуть её в редакторе): ведём её в канал клуба.
        const opts = {};
        if (tg.initDataUnsafe?.user?.is_premium) opts.widget_link = { url: CHANNEL_LINK, name: 'хочу с вами' };
        tg.shareToStory(url, opts);
        log('сторис: отправил в Telegram', isGuest(), state.user, { hike_date: hikeDate });
    }));

    saveBtn.addEventListener('click', () => busy(saveBtn, 'сохраняем…', async () => {
        haptic();
        const fileName = `hike-${hikeDate}.jpg`;
        if (tg?.downloadFile && tg.isVersionAtLeast?.('8.0')) {
            const url = await getUrl();
            tg.downloadFile({ url, file_name: fileName });
        } else {
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            a.remove();
        }
        log('сторис: сохранил картинку', isGuest(), state.user, { hike_date: hikeDate });
    }));
}
