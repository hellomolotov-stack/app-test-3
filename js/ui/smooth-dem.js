// js/ui/smooth-dem.js – сглаживание рельефа вокруг одной вершины.
// В данных высот (terrarium) некоторые вершины – узкий пик, и в 3D гора выглядит иглой, хотя в реальности
// вершина плоская. Источник 'smoothdem://{z}/{x}/{y}?c=lat,lon&r=…&i=…&b=…&h=…' берёт обычный тайл высот
// и только в круге радиуса r (м) вокруг c размывает высоты (b – радиус размытия, м), а внутри i (м)
// срезает их в плато на высоте h (м) или, с p/g, поднимает сглаженный купол до высоты p (выше уровня g). Вне круга тайл не меняется.
// Размытие считается по мозаике 3×3 тайла: иначе на стыке соседних тайлов получается ступенька.

const DEM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';
const S = 256;
let registered = false;

export function smoothDemTiles(cfg) {
    const q = `c=${cfg.center[0]},${cfg.center[1]}&r=${cfg.radius || 600}&i=${cfg.inner || 260}&b=${cfg.blur || 120}${cfg.plateau ? `&h=${cfg.plateau}` : ''}${cfg.peak ? `&p=${cfg.peak}&g=${cfg.base}` : ''}`;
    return [`smoothdem://{z}/{x}/{y}?${q}`];
}

export function ensureSmoothDem(maplibregl) {
    if (registered || !maplibregl?.addProtocol) return !!registered;
    registered = true;
    maplibregl.addProtocol('smoothdem', async (params, ctrl) => {
        const m = params.url.match(/^smoothdem:\/\/(\d+)\/(\d+)\/(\d+)\?(.*)$/);
        const z = +m[1], x = +m[2], y = +m[3];
        const buf = await fetchTile(z, x, y, ctrl?.signal);
        try {
            const out = await smoothTile(buf, z, x, y, new URLSearchParams(m[4]), ctrl?.signal);
            return { data: out || buf };
        } catch (e) {
            if (e?.name === 'AbortError') throw e;
            return { data: buf }; // что-то пошло не так – обычный рельеф
        }
    });
    return true;
}

async function fetchTile(z, x, y, signal) {
    const res = await fetch(`${DEM_URL}/${z}/${x}/${y}.png`, { signal });
    if (!res.ok) throw new Error('dem ' + res.status);
    return res.arrayBuffer();
}

let decodeCanvas = null;
async function decodeHeights(buf) {
    const bmp = await createImageBitmap(new Blob([buf], { type: 'image/png' }));
    if (!decodeCanvas) decodeCanvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(S, S) : Object.assign(document.createElement('canvas'), { width: S, height: S });
    const ctx = decodeCanvas.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, S, S);
    ctx.drawImage(bmp, 0, 0, S, S);
    const d = ctx.getImageData(0, 0, S, S).data;
    const h = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) h[i] = d[4 * i] * 256 + d[4 * i + 1] + d[4 * i + 2] / 256 - 32768;
    return h;
}

async function smoothTile(buf, z, x, y, q, signal) {
    const [lat, lon] = q.get('c').split(',').map(Number);
    const R = +q.get('r'), inner = +q.get('i'), blurM = +q.get('b'), cap = q.get('h') ? +q.get('h') : NaN;
    const peak = q.get('p') ? +q.get('p') : NaN, base = +q.get('g');
    const n = 2 ** z, rad = Math.PI / 180;
    const cx = ((lon + 180) / 360 * n - x) * S;
    const cy = ((1 - Math.log(Math.tan(lat * rad) + 1 / Math.cos(lat * rad)) / Math.PI) / 2 * n - y) * S;
    const mpp = 40075016 * Math.cos(lat * rad) / n / S;
    const rp = R / mpp, ip = inner / mpp;
    if (cx < -rp || cy < -rp || cx > S + rp || cy > S + rp) return null; // вершина далеко – тайл как есть
    const br = Math.max(1, Math.round(blurM / mpp));
    if (br * 3 > S) return null; // слишком мелкий масштаб – вершины всё равно не видно

    // мозаика 3×3 вокруг тайла (соседа нет – повторяем центр)
    const W = 3 * S;
    const big = new Float32Array(W * W);
    const tiles = await Promise.all([-1, 0, 1].flatMap(dy => [-1, 0, 1].map(async dx => {
        if (!dx && !dy) return decodeHeights(buf);
        try { return await decodeHeights(await fetchTile(z, x + dx, y + dy, signal)); } catch (e) { if (e?.name === 'AbortError') throw e; return null; }
    })));
    const center = tiles[4];
    tiles.forEach((t, k) => {
        const ox = (k % 3) * S, oy = Math.floor(k / 3) * S, src = t || center;
        for (let r = 0; r < S; r++) big.set(src.subarray(r * S, r * S + S), (oy + r) * W + ox);
    });

    // размытие: три прохода «коробкой» по строкам и столбцам ≈ гаусс
    let b = big;
    for (let p = 0; p < 3; p++) b = boxPass(boxPass(b, W, br, true), W, br, false);

    // купол: сглаженная вершина ниже настоящей – поднимаем всё выше base так, чтобы макс. стал peak.
    // Максимум ищем по мозаике в круге i – одинаково для всех тайлов, без ступенек на стыках.
    let k = 1;
    if (isFinite(peak)) {
        let top = -Infinity;
        const r2 = ip * ip;
        for (let py = Math.max(0, Math.floor(cy + S - ip)); py <= Math.min(W - 1, Math.ceil(cy + S + ip)); py++)
            for (let px = Math.max(0, Math.floor(cx + S - ip)); px <= Math.min(W - 1, Math.ceil(cx + S + ip)); px++)
                if ((px - cx - S) ** 2 + (py - cy - S) ** 2 <= r2 && b[py * W + px] > top) top = b[py * W + px];
        if (top > base + 1) k = (peak - base) / (top - base);
    }

    const out = new Uint8ClampedArray(S * S * 4);
    for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
        const i = py * S + px, bi = (py + S) * W + px + S;
        let v = center[i];
        const dist = Math.hypot(px - cx, py - cy);
        if (dist <= rp) {
            // вес сглаживания: 1 внутри i, плавно к 0 у края круга
            const t = dist <= ip ? 1 : 1 - (dist - ip) / (rp - ip);
            const w = t * t * (3 - 2 * t);
            let sm = b[bi];
            if (k !== 1 && sm > base) sm = base + (sm - base) * k;
            v = v + (sm - v) * w;
            if (isFinite(cap) && v > cap) v = cap + (v - cap) * (1 - w);
        }
        const e = Math.round((v + 32768) * 256);
        out[4 * i] = (e >> 16) & 255; out[4 * i + 1] = (e >> 8) & 255; out[4 * i + 2] = e & 255; out[4 * i + 3] = 255;
    }
    const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(S, S) : Object.assign(document.createElement('canvas'), { width: S, height: S });
    cv.getContext('2d').putImageData(new ImageData(out, S, S), 0, 0);
    const blob = cv.convertToBlob ? await cv.convertToBlob({ type: 'image/png' }) : await new Promise(r => cv.toBlob(r, 'image/png'));
    return blob.arrayBuffer();
}

function boxPass(src, W, r, horizontal) {
    const out = new Float32Array(W * W), win = 2 * r + 1;
    for (let a = 0; a < W; a++) {
        let sum = 0;
        const at = k => src[horizontal ? a * W + Math.min(W - 1, Math.max(0, k)) : Math.min(W - 1, Math.max(0, k)) * W + a];
        for (let k = -r; k <= r; k++) sum += at(k);
        for (let k = 0; k < W; k++) {
            out[horizontal ? a * W + k : k * W + a] = sum / win;
            sum += at(k + r + 1) - at(k - r);
        }
    }
    return out;
}
