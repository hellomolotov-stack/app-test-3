// js/ui/story.js – «поделиться в сторис» после записи на хайк.
// Рисуем картинку 1080×1920: на весь экран – снимок нашей 3D-карты с жёлтым треком, сверху дата и название,
// снизу плашки (км, сложность, время, сколько идут) и подпись клуба. Показываем превью, по кнопке
// грузим картинку на /api/story (Telegram берёт сторис и сохранение только по публичной ссылке)
// и открываем редактор сторис Telegram или сохраняем файл на телефон.
import { state } from '../state.js';
import { haptic, tg } from '../utils.js';
import { log } from '../api.js';
import { loadAllParticipants } from '../firebase.js';

const W = 1080, H = 1920, PAD = 80;
const YELLOW = '#D9FD19';
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const WD = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const BOT_LINK = 'https://t.me/yaltahiking_bot';

const isGuest = () => state.userCard?.status !== 'active';

function hikeTags(h) {
    const raw = Array.isArray(h.tags) ? h.tags : String(h.tags || '').split(',');
    return raw.map(t => String(t).trim()).filter(Boolean);
}

function peopleWord(n) {
    const a = n % 10, b = n % 100;
    return (a >= 2 && a <= 4 && (b < 10 || b >= 20)) ? 'человека' : 'человек';
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

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

async function drawStory(hike) {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0A0B09';
    ctx.fillRect(0, 0, W, H);

    // 1. карта на весь кадр (или мягкое жёлтое свечение, если трека нет)
    const [mapCanvas, participants] = await Promise.all([
        import('./calendar.js').then(m => m.snapshotHikeMap(hike, { width: 360, height: 640, ratio: 3 })).catch(() => null),
        loadAllParticipants(hike.date).catch(() => [])
    ]);
    if (mapCanvas) {
        ctx.drawImage(mapCanvas, 0, 0, W, H);
    } else {
        const g = ctx.createRadialGradient(W / 2, H * .55, 50, W / 2, H * .55, 900);
        g.addColorStop(0, 'rgba(217, 253, 25, .16)');
        g.addColorStop(1, 'rgba(217, 253, 25, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
    }

    // 2. затемнения сверху и снизу, чтобы текст читался на любой карте
    let g = ctx.createLinearGradient(0, 0, 0, 820);
    g.addColorStop(0, 'rgba(10, 11, 9, .92)');
    g.addColorStop(1, 'rgba(10, 11, 9, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, 820);
    g = ctx.createLinearGradient(0, H - 760, 0, H);
    g.addColorStop(0, 'rgba(10, 11, 9, 0)');
    g.addColorStop(1, 'rgba(10, 11, 9, .95)');
    ctx.fillStyle = g;
    ctx.fillRect(0, H - 760, W, 760);

    // 3. верх: дата, «я иду на хайк», название
    const d = new Date(hike.date + 'T12:00:00');
    ctx.textBaseline = 'alphabetic';
    let y = 230;
    ctx.fillStyle = YELLOW;
    ctx.font = `700 46px ${FONT}`;
    ctx.fillText(`${d.getDate()} ${MONTHS[d.getMonth()]} · ${WD[d.getDay()]}${hike.start_time ? ` · ${hike.start_time}` : ''}`, PAD, y);
    y += 78;
    ctx.fillStyle = 'rgba(255, 255, 255, .78)';
    ctx.font = `500 48px ${FONT}`;
    ctx.fillText('я иду на хайк 🏔', PAD, y);

    let size = 118, lines;
    do {
        ctx.font = `800 ${size}px ${FONT}`;
        lines = wrap(ctx, String(hike.title || 'хайк').trim(), W - PAD * 2);
        size -= 6;
    } while (lines.length > 3 && size > 70);
    size += 6;
    ctx.fillStyle = '#fff';
    y += 30;
    lines.slice(0, 3).forEach(l => { y += size * 1.04; ctx.fillText(l, PAD, y); });

    // 4. низ: плашки с деталями
    const chips = hikeTags(hike).slice(0, 3);
    const count = Array.isArray(participants) ? participants.length : 0;
    if (count >= 2) chips.push(`👥 идут ${count} ${peopleWord(count)}`);
    ctx.font = `600 40px ${FONT}`;
    const chipH = 84, gap = 18;
    const rows = [[]];
    let rowW = 0;
    chips.forEach(t => {
        const w = ctx.measureText(t).width + 56;
        if (rowW + w > W - PAD * 2 && rows[rows.length - 1].length) { rows.push([]); rowW = 0; }
        rows[rows.length - 1].push({ t, w });
        rowW += w + gap;
    });
    let cy = H - 330 - (rows.length - 1) * (chipH + gap);
    rows.forEach(row => {
        let cx = PAD;
        row.forEach(({ t, w }) => {
            roundRect(ctx, cx, cy, w, chipH, chipH / 2);
            ctx.fillStyle = 'rgba(10, 11, 9, .72)';
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = 'rgba(255, 255, 255, .22)';
            ctx.stroke();
            ctx.fillStyle = '#fff';
            ctx.fillText(t, cx + 28, cy + 56);
            cx += w + gap;
        });
        cy += chipH + gap;
    });

    // 5. подпись клуба
    ctx.fillStyle = 'rgba(255, 255, 255, .25)';
    ctx.fillRect(PAD, H - 200, W - PAD * 2, 2);
    ctx.fillStyle = '#fff';
    ctx.font = `800 44px ${FONT}`;
    ctx.fillText('хайкинг интеллигенция', PAD, H - 128);
    ctx.fillStyle = 'rgba(255, 255, 255, .7)';
    ctx.font = `500 34px ${FONT}`;
    ctx.fillText('главный хайкинг-клуб большой Ялты', PAD, H - 78);
    ctx.fillStyle = YELLOW;
    ctx.font = `700 34px ${FONT}`;
    const handle = '@yaltahiking_bot';
    ctx.fillText(handle, W - PAD - ctx.measureText(handle).width, H - 128);
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
        const opts = { text: `иду на ${hike.title} с хайкинг интеллигенцией 🏔` };
        if (tg.initDataUnsafe?.user?.is_premium) opts.widget_link = { url: `${BOT_LINK}?startapp=hike_${hikeDate}`, name: 'записаться' };
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
