import { setUiCopy } from './copy-editor.js';
import { haptic, tg } from '../utils.js';
import { hikeTrackPoints } from './calendar.js';
import { trackStats, upload } from './story.js';

const width = 1080;
const height = 1920;

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = src;
    });
}

function paintTrack(ctx, points) {
    const radians = Math.PI / 180;
    const scaleLongitude = Math.cos(points[0][0] * radians);
    const x = points.map(point => point[1] * scaleLongitude);
    const y = points.map(point => -point[0]);
    const minX = Math.min(...x), maxX = Math.max(...x);
    const minY = Math.min(...y), maxY = Math.max(...y);
    const spread = Math.max(maxX - minX, maxY - minY);
    if (!spread) throw new Error('invalid route');
    const scale = 328 / spread;
    ctx.beginPath();
    x.forEach((value, index) => {
        const px = width / 2 + (value - (minX + maxX) / 2) * scale;
        const py = 242 + (y[index] - (minY + maxY) / 2) * scale;
        if (index === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    });
    ctx.strokeStyle = '#D9FD19';
    ctx.lineJoin = ctx.lineCap = 'round';
    ctx.lineWidth = 8;
    ctx.stroke();
}

async function renderRoutePhoto(hike, photoPromise) {
    const points = hikeTrackPoints(hike);
    if (points.length < 2) throw new Error('missing route');
    const [photo, logo, stats] = await Promise.all([
        photoPromise, loadImage('/assets/logo-hiking.png'), trackStats(hike).catch(() => null)
    ]);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (photo) {
        const scale = Math.max(width / photo.width, height / photo.height);
        const w = photo.width * scale, h = photo.height * scale;
        ctx.drawImage(photo, (width - w) / 2, (height - h) / 2, w, h);
    } else {
        const background = ctx.createLinearGradient(0, 0, 0, height);
        background.addColorStop(0, '#14243a');
        background.addColorStop(1, '#0a0b0e');
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, width, height);
    }
    const shade = ctx.createLinearGradient(0, 0, 0, height * .49);
    shade.addColorStop(0, '#0d120f86');
    shade.addColorStop(1, '#0d120f00');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, width, height * .49);
    paintTrack(ctx, points);
    const mark = document.createElement('canvas');
    mark.width = 244;
    mark.height = Math.round(244 * logo.height / logo.width);
    const ink = mark.getContext('2d');
    ink.drawImage(logo, 0, 0, mark.width, mark.height);
    ink.globalCompositeOperation = 'source-in';
    ink.fillStyle = '#fff';
    ink.fillRect(0, 0, mark.width, mark.height);
    ctx.drawImage(mark, (width - mark.width) / 2, 426);
    const metrics = [
        ['длина', stats?.km, km => `${km.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} км`],
        ['макс. высота', stats?.peak, metres => `${Math.round(metres)} м`],
        ['набор', stats?.gain, metres => `+${Math.round(metres)} м`]
    ].filter(([, value]) => Number.isFinite(value));
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    metrics.forEach(([label, value, format], index) => {
        const x = width / 2 + (index - (metrics.length - 1) / 2) * 168;
        ctx.font = '600 27px Arial, sans-serif';
        ctx.fillText(label, x, 563);
        ctx.font = '800 38px Arial, sans-serif';
        ctx.fillText(format(value), x, 608);
    });
    return canvas.toDataURL('image/jpeg', .88);
}

async function renderPhoto(file, hike) {
    const url = URL.createObjectURL(file);
    try {
        return await renderRoutePhoto(hike, loadImage(url));
    } finally {
        URL.revokeObjectURL(url);
    }
}

const examples = new WeakMap();

export function photoStoryExample(hike) {
    let example = examples.get(hike);
    if (!example) {
        const photo = import('./rd-home.js').then(({ heroPhotoFor }) => {
            const cover = heroPhotoFor(hike.title, { matchedOnly: true });
            return cover ? loadImage(`/assets/teaser/${cover}.webp`) : null;
        }).catch(() => null);
        example = renderRoutePhoto(hike, photo).catch(error => {
            examples.delete(hike);
            throw error;
        });
        examples.set(hike, example);
    }
    return example;
}

export function openPhotoStory(hike, initialFile) {
    haptic();
    document.querySelector('.story-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'inv-overlay story-overlay post-photo-overlay';
    overlay.innerHTML = `<div class="inv-sheet" role="dialog" aria-modal="true" aria-labelledby="post-photo-title">
        <div class="inv-grab cs-grab"></div>
        <div class="inv-scroll">
            <header><h2 class="story-title" id="post-photo-title">хайк в сторис</h2><button type="button" data-close aria-label="закрыть">×</button></header>
            <p data-app-copy="copy_37c0ec73db672ae3c950" data-intro>выбери фото с хайка, добавим трек и данные маршрута</p>
            <div class="story-preview"><img alt="пример готовой сторис" width="1080" height="1920"></div>
            <button data-app-copy="copy_38a2e88596f1405c2e46" type="button" class="btn btn-yellow inv-wide" data-pick>выбрать фото</button>
            <button data-app-copy="copy_71d7c3833d977926812e" type="button" class="btn btn-yellow inv-wide" data-share hidden>поделиться сторис</button>
            <div class="post-photo-actions" hidden><button data-app-copy="copy_d0bf53b666399eadcb48" type="button" class="story-save" data-save>сохранить фото</button><button data-app-copy="copy_dbe1824ddb9255727d11" type="button" class="story-save" data-replace>заменить фото</button></div>
            <p class="inv-note story-note" role="status"></p>
            <input type="file" accept="image/*" hidden>
        </div></div>`;
    document.body.append(overlay);
    requestAnimationFrame(() => overlay.classList.add('is-on'));
    const get = selector => overlay.querySelector(selector);
    const close = () => { overlay.classList.remove('is-on'); setTimeout(() => overlay.remove(), 300); };
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    get('[data-close]').addEventListener('click', close);
    overlay.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
    const input = get('input');
    const share = get('[data-share]');
    const save = get('[data-save]');
    const replace = get('[data-replace]');
    const pick = get('[data-pick]');
    const note = get('.story-note');
    let photo;
    photoStoryExample(hike).then(url => {
        if (overlay.isConnected && !photo) get('.story-preview img').src = url;
    }).catch(() => {});
    const choose = () => input.click();
    pick.addEventListener('click', choose);
    replace.addEventListener('click', choose);
    async function run(callback) {
        const buttons = [pick, share, save, replace];
        buttons.forEach(button => { button.disabled = true; });
        try { await callback(); }
        finally { buttons.forEach(button => { button.disabled = false; }); }
    }
    const showPhoto = file => run(async () => {
        setUiCopy(note, ["copy_40df80277fd8e1e9b5a5", 'готовим фото…']);
        try {
            photo = await renderPhoto(file, hike);
            const image = get('.story-preview img');
            image.src = photo;
            image.alt = 'твоё фото с треком';
            get('#post-photo-title').textContent = 'твоя сторис готова';
            get('[data-intro]').hidden = true;
            pick.hidden = true;
            share.hidden = false;
            get('.post-photo-actions').hidden = false;
            note.textContent = '';
        } catch {
            setUiCopy(note, ["copy_2bc5d72bb97e10f41740", 'не получилось оформить фото, попробуй другой снимок']);
        }
    });
    input.addEventListener('change', () => {
        const file = input.files[0];
        input.value = '';
        if (file) showPhoto(file);
    });
    if (initialFile) showPhoto(initialFile);
    share.addEventListener('click', () => run(async () => {
        if (!tg?.shareToStory || !tg.isVersionAtLeast?.('7.8')) {
            setUiCopy(note, ["copy_0f99d24f72f52a10994a", 'сохрани фото и поделись им из галереи']);
            return;
        }
        setUiCopy(note, ["copy_28928334d2e31f410b62", 'готовим отправку…']);
        try {
            const publicUrl = await upload(photo, hike.date, true);
            if (!overlay.isConnected || !overlay.classList.contains('is-on')) return;
            tg.shareToStory(publicUrl);
            note.textContent = '';
        } catch {
            setUiCopy(note, ["copy_ae80370c3ec6967aa7f1", 'не получилось открыть сторис, попробуй ещё раз']);
        }
    }));
    save.addEventListener('click', () => run(async () => {
        const filename = `hike-${hike.date}.jpg`;
        try {
            if (tg?.downloadFile && tg.isVersionAtLeast?.('8.0')) {
                const url = await upload(photo, hike.date, true);
                if (!overlay.isConnected || !overlay.classList.contains('is-on')) return;
                tg.downloadFile({ url, file_name: filename });
            } else {
                const link = document.createElement('a');
                link.href = photo;
                link.download = filename;
                document.body.append(link);
                link.click();
                link.remove();
            }
            note.textContent = '';
        } catch {
            setUiCopy(note, ["copy_5cbee837d6f4fe97090d", 'не получилось сохранить фото, попробуй ещё раз']);
        }
    }));
}
