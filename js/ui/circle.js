// «Твои связи» – блок на главной и шторка: люди, с которыми человек был на хайках клуба,
// и связи между ними. Данные считает сервер (/api/me, action 'circle' → lib/circle.js).
// Пока только для теста (CIRCLE_USERS тут и в api/me.js).
import { state } from '../state.js';
import { haptic } from '../utils.js';
import { log } from '../api.js';

// видят все: с картой – все связи, без карты – 5 самых близких, остальные «?» (сервер их имён не отдаёт)
export const circleEnabled = () => !!state.user?.id;

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MON3 = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const GRADS = [['#f6b26b', '#e06666'], ['#6fa8dc', '#3d85c6'], ['#93c47d', '#38761d'], ['#c27ba0', '#741b47'], ['#ffd966', '#bf9000'], ['#8e7cc3', '#351c75']];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plural = (n, a, b, c) => { const x = n % 10, y = n % 100; return x === 1 && y !== 11 ? a : x >= 2 && x <= 4 && (y < 12 || y > 14) ? b : c; };
const initials = name => String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
const dayLabel = d => { const [, m, dd] = d.split('-').map(Number); return `${dd} ${MONTHS[m - 1]}`; };
const dayShort = d => { const [, m, dd] = d.split('-').map(Number); return `${dd} ${MON3[m - 1]}`; };
const firstName = n => String(n || '').trim().split(/\s+/)[0] || 'участник';
const short = n => { const p = String(n || '').trim().split(/\s+/); return p[1] ? `${p[0]} ${p[1][0]}.` : (p[0] || 'участник'); };

const STYLE = `
#circleContainer.cc-card { position: relative; overflow: hidden; padding-bottom: 0; }
.cc-card .cc-hdr { position: relative; z-index: 2; }
.cc-panel { position: relative; height: 250px; margin-top: -40px; cursor: pointer; }
/* сеть во всю карточку: уходит за края, сверху и снизу мягко растворяется */
.cc-panel svg { position: absolute; inset: 0; width: 100%; height: 100%;
  -webkit-mask-image: linear-gradient(180deg, transparent 0, #000 70px, #000 150px, rgba(0,0,0,.2) 100%); mask-image: linear-gradient(180deg, transparent 0, #000 70px, #000 150px, rgba(0,0,0,.2) 100%); }
.cc-fade { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(90% 75% at 0% 100%, rgba(10,16,24,.78), rgba(10,16,24,0) 70%); }
.cc-foot { position: absolute; left: 16px; right: 16px; bottom: 16px; display: flex; justify-content: space-between; align-items: flex-end; gap: 8px; }
.cc-foot .t { font-size: 13px; line-height: 1.35; color: rgba(255,255,255,.8); }
.cc-foot .t b { font-size: 26px; font-weight: 800; color: #fff; }
.cc-foot .t { text-shadow: 0 1px 8px rgba(10,16,24,.8); }
.cc-foot .t i { font-style: normal; color: var(--yellow); font-weight: 700; }
.cc-pill { flex: none; font-size: 12.5px; font-weight: 800; padding: 7px 10px; border-radius: 12px; background: var(--yellow); color: #1d2200; border: 0; font-family: inherit; cursor: pointer; }
.cc-lock { display: flex; align-items: center; gap: 12px; width: calc(100% - 32px); margin: 10px 16px 16px; padding: 12px 14px; border-radius: 18px; background: rgba(217,253,25,.1); border: 1px solid rgba(217,253,25,.3); color: #fff; font: inherit; text-align: left; cursor: pointer; }
.cc-lock img { flex: none; width: 46px; height: 30px; border-radius: 5px; object-fit: cover; transform: rotate(-6deg); }
.cc-lock span { flex: 1; font-size: 13px; line-height: 1.35; color: rgba(255,255,255,.8); }
.cc-lock span b { display: block; font-size: 14.5px; color: #fff; }
.cc-lock em { font-style: normal; font-weight: 800; color: var(--yellow); }
.cs2-pc.q .cs2-av { background: rgba(255,255,255,.08); color: rgba(255,255,255,.45); border: 1.5px dashed rgba(255,255,255,.28); }
.cc-hdr { display: flex; justify-content: space-between; align-items: baseline; margin: 0 16px 14px; }
.cc-hdr h2 { margin: 0; font-size: 18px; font-weight: 700; color: #fff; }
.cc-hdr button { border: 0; background: none; color: var(--yellow); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; padding: 0; }
.cc-load { margin: 0 16px; height: 200px; border-radius: 20px; background: rgba(0,0,0,.28); display: flex; align-items: center; justify-content: center; font-size: 13px; color: rgba(255,255,255,.55); }
.cs2-overlay { position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,.55); opacity: 0; transition: opacity .25s ease; }
.cs2-overlay.is-on { opacity: 1; }
.cs2-sheet { position: absolute; left: 0; right: 0; bottom: 0; max-width: 600px; margin: 0 auto; max-height: 92vh; overflow-y: auto; box-sizing: border-box;
  padding: 10px 0 calc(env(safe-area-inset-bottom, 0px) + 22px); border-radius: 28px 28px 0 0; background: rgba(16,22,30,.96); color: #fff;
  border: 1px solid rgba(255,255,255,.1); border-bottom: 0; transform: translateY(100%); transition: transform .32s cubic-bezier(.2,.9,.25,1); }
.cs2-overlay.is-on .cs2-sheet { transform: none; }
.cs2-grab { margin: -6px 0 4px; } /* полоска-ручка – общая .cs-grab, свайп вниз закрывает (sheet-drag.js) */
.cs2-x { position: absolute; top: 14px; right: 16px; width: 32px; height: 32px; border: 0; border-radius: 50%; background: rgba(255,255,255,.1); color: #fff; font-size: 14px; cursor: pointer; }
.cs2-h { text-align: center; font-size: 21px; font-weight: 800; }
.cs2-sub { text-align: center; font-size: 13px; line-height: 1.4; color: rgba(255,255,255,.6); margin: 4px 24px 0; }
.cs2-net { margin: 14px 16px 12px; border-radius: 20px; background: rgba(0,0,0,.28); }
.cs2-net svg { display: block; width: 100%; height: auto; overflow: hidden; }
.cs2-tg { display: flex; margin: 12px 16px 0; padding: 4px; border-radius: 14px; background: rgba(0,0,0,.28); }
.cs2-tg button { flex: 1; border: 0; background: none; color: rgba(255,255,255,.65); font: inherit; font-size: 13px; font-weight: 700; padding: 8px 6px; border-radius: 11px; cursor: pointer; }
.cs2-tg button.on { background: var(--yellow); color: #1d2200; }
.cs2-node { transform: translate(var(--x1), var(--y1)) scale(var(--s1)); transition: transform .55s cubic-bezier(.3,.8,.3,1), opacity .4s, filter .4s; cursor: pointer; }
.cs2-node.l2 { opacity: .35; filter: blur(1.2px); }
.is-all .cs2-node { transform: translate(var(--x2), var(--y2)) scale(var(--s2)); }
.is-all .cs2-node.l2 { opacity: 1; filter: none; }
.has-sel .cs2-node:not(.sel) { opacity: .4; }
.has-sel .cs2-node.l2:not(.sel) { opacity: .2; }
.cs2-node .halo { opacity: 0; transition: opacity .3s; }
.cs2-node.sel .halo { opacity: 1; }
.cs2-lines { transition: opacity .25s; }
.cs2-stats { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin: 0 16px 12px; }
.cs2-stats div { border-radius: 16px; background: rgba(0,0,0,.28); padding: 9px 6px; text-align: center; font-size: 11.5px; line-height: 1.25; color: rgba(255,255,255,.65); }
.cs2-stats b { display: block; font-size: 19px; font-weight: 800; color: #fff; margin-bottom: 3px; }
.cs2-car { display: flex; gap: 8px; overflow-x: auto; padding: 0 16px 2px; scroll-snap-type: x mandatory; scrollbar-width: none; }
.cs2-car::-webkit-scrollbar { display: none; }
.cs2-pc { flex: none; width: 124px; padding: 12px 10px; border-radius: 18px; background: rgba(0,0,0,.28); text-align: center; border: 0; color: #fff; font: inherit; cursor: pointer; scroll-snap-align: start; }
.cs2-pc.on { background: rgba(217,253,25,.12); box-shadow: inset 0 0 0 1.5px rgba(217,253,25,.5); }
.cs2-av { width: 44px; height: 44px; margin: 0 auto; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px; color: #fff; background-size: cover; background-position: center; }
.cs2-pc b { display: block; font-size: 13.5px; margin-top: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cs2-pc span { display: block; font-size: 11.5px; color: rgba(255,255,255,.6); margin-top: 2px; }
.cs2-sec { font-size: 18px; font-weight: 700; margin: 20px 16px 10px; }
.cs2-next { margin: 0 16px; border-radius: 20px; background: rgba(0,0,0,.28); padding: 14px; }
.cs2-next .top b { font-size: 16px; }
.cs2-next .row { display: flex; align-items: center; gap: 10px; margin-top: 10px; font-size: 13px; line-height: 1.35; color: rgba(255,255,255,.75); }
.cs2-next .row em { font-style: normal; color: var(--yellow); font-weight: 700; }
.cs2-stack { display: flex; flex: none; }
.cs2-stack i { width: 30px; height: 30px; border-radius: 50%; margin-left: -9px; border: 2px solid #1a222b; display: flex; align-items: center; justify-content: center; font-style: normal; font-size: 10px; font-weight: 800; color: #fff; background-size: cover; background-position: center; }
.cs2-stack i:first-child { margin-left: 0; }
.cs2-stack i.new { background: rgba(217,253,25,.18); color: var(--yellow); border: 2px dashed rgba(217,253,25,.6); }
.cs2-go { display: block; width: 100%; height: 50px; margin-top: 12px; border: 0; border-radius: 16px; background: var(--yellow); color: #1d2200; font: inherit; font-size: 15px; font-weight: 800; cursor: pointer; }
.cs2-org { margin: 16px 24px 0; text-align: center; font-size: 12.5px; line-height: 1.45; color: rgba(255,255,255,.5); }
`;
function ensureCss() {
    if (document.getElementById('circleCss')) return;
    const st = document.createElement('style');
    st.id = 'circleCss';
    st.textContent = STYLE;
    document.head.appendChild(st);
}

let data = null;
const NEAR = 40; // первый слой – самые близкие
async function load() {
    const initData = window.Telegram?.WebApp?.initData || '';
    if (!initData) return null;
    const r = await fetch('/api/me', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData, action: 'circle' }) });
    if (!r.ok) return null;
    return r.json();
}

// раскладка: самые близкие (больше общих хайков) – ближе к тебе; угол – по золотому сечению, чтобы точки не слипались
function layout(people, W, H, cx, cy, sx = 1, sy = 1) {
    const N = people.length, R0 = Math.min(W, H) * 0.17, R1 = Math.min(W, H) * 0.46;
    return people.map((p, i) => {
        const t = N > 1 ? i / (N - 1) : 0;
        const a = i * 2.39996 + 0.6;
        const R = R0 + (R1 - R0) * Math.sqrt(t);
        return { ...p, x: cx + Math.cos(a) * R * sx, y: cy + Math.sin(a) * R * sy };
    });
}

function netSvg(d, { W, H, cx, cy, sx, sy, big, sel = null, uid }) {
    const pts = layout(d.people, W, H, cx, cy, sx, sy);
    const at = new Map(pts.map(p => [p.id, p]));
    const maxN = Math.max(1, ...pts.map(p => p.n));
    const curve = (a, b, k = .12) => `M${a.x.toFixed(1)} ${a.y.toFixed(1)} Q${((a.x + b.x) / 2 + (a.y - b.y) * k).toFixed(1)} ${((a.y + b.y) / 2 + (b.x - a.x) * k).toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
    let defs = `<radialGradient id="${uid}gl"><stop offset="0" stop-color="#D9FD19" stop-opacity=".35"/><stop offset="1" stop-color="#D9FD19" stop-opacity="0"/></radialGradient>`;
    GRADS.forEach((g, k) => { defs += `<linearGradient id="${uid}g${k}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${g[0]}"/><stop offset="1" stop-color="${g[1]}"/></linearGradient>`; });
    let out = '';
    // связи между людьми
    d.links.forEach(([a, b, w]) => {
        const A = at.get(a), B = at.get(b); if (!A || !B) return;
        const on = sel && (a === sel || b === sel);
        out += `<path d="${curve(A, B)}" fill="none" stroke="${on ? '#D9FD19' : '#a9bccf'}" stroke-opacity="${on ? .7 : (sel ? .04 : Math.min(.06 + w * .03, .22))}" stroke-width="${on ? 1.4 : .7}" stroke-linecap="round"/>`;
    });
    // связи к тебе: толще и ярче – чем чаще вместе
    const me = { x: cx, y: cy };
    pts.forEach(p => {
        if (p.hidden) { out += `<path d="${curve(me, p)}" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width=".8" stroke-dasharray="3 4"/>`; return; }
        const strong = p.n > 1, dim = sel && p.id !== sel;
        const op = dim ? (strong ? .15 : .06) : (strong ? .35 + .5 * p.n / maxN : .3);
        out += `<path d="${curve(me, p)}" fill="none" stroke="${strong ? '#D9FD19' : '#d6aa6e'}" stroke-opacity="${op.toFixed(2)}" stroke-width="${(strong ? 1 + 2.4 * p.n / maxN : .8) * (big ? 1 : .8)}" stroke-linecap="round"/>`;
    });
    // люди
    const base = big ? 10 : 7;
    pts.forEach((p, i) => {
        const strong = p.n > 1, r = base + (big ? 6 : 4) * Math.sqrt(p.n / maxN), dim = sel && p.id !== sel;
        const ring = strong ? '#D9FD19' : 'rgba(255,255,255,.5)';
        if (p.hidden) {
            const rh = base;
            out += `<g opacity=".8"><circle cx="${p.x}" cy="${p.y}" r="${rh}" fill="rgba(255,255,255,.07)" stroke="rgba(255,255,255,.32)" stroke-dasharray="2 2"/><text x="${p.x}" y="${p.y + rh * .36}" text-anchor="middle" font-size="${(rh * .95).toFixed(1)}" font-weight="800" fill="rgba(255,255,255,.45)">?</text></g>`;
            return;
        }
        out += `<g opacity="${dim ? .4 : 1}" data-id="${esc(p.id)}">`;
        if (p.id === sel) out += `<circle cx="${p.x}" cy="${p.y}" r="${r * 2.3}" fill="url(#${uid}gl)"/>`;
        if (p.photo) {
            out += `<clipPath id="${uid}c${i}"><circle cx="${p.x}" cy="${p.y}" r="${r}"/></clipPath><circle cx="${p.x}" cy="${p.y}" r="${r}" fill="url(#${uid}g${i % 6})"/>`
                + `<image href="${esc(p.photo)}" x="${p.x - r}" y="${p.y - r}" width="${r * 2}" height="${r * 2}" clip-path="url(#${uid}c${i})" preserveAspectRatio="xMidYMid slice"/>`;
        } else {
            out += `<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="url(#${uid}g${i % 6})"/>`;
            if (r >= 8) out += `<text x="${p.x}" y="${p.y + r * .33}" text-anchor="middle" font-size="${(r * .85).toFixed(1)}" font-weight="800" fill="#fff">${esc(initials(p.name))}</text>`;
        }
        out += `<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="none" stroke="${ring}" stroke-width="${strong ? 1.8 : 1}"/></g>`;
    });
    const mr = big ? 20 : 15;
    const myPhoto = state.user?.photo_url;
    out += `<circle cx="${cx}" cy="${cy}" r="${mr * 1.9}" fill="url(#${uid}gl)"/>`;
    if (myPhoto) out += `<clipPath id="${uid}me"><circle cx="${cx}" cy="${cy}" r="${mr}"/></clipPath><image href="${esc(myPhoto)}" x="${cx - mr}" y="${cy - mr}" width="${mr * 2}" height="${mr * 2}" clip-path="url(#${uid}me)" preserveAspectRatio="xMidYMid slice"/>`;
    else out += `<circle cx="${cx}" cy="${cy}" r="${mr}" fill="#fff"/><text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="${big ? 12 : 10}" font-weight="800" fill="#121a23">ты</text>`;
    out += `<circle cx="${cx}" cy="${cy}" r="${mr}" fill="none" stroke="#D9FD19" stroke-width="2.5"/>`;
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><defs>${defs}</defs>${out}</svg>`;
}

function avStyle(p, i) {
    return p.photo ? `background-image:url('${esc(p.photo)}')` : `background:linear-gradient(135deg,${GRADS[i % 6][0]},${GRADS[i % 6][1]})`;
}

function blockHtml(d) {
    const n = d.total, nx = d.next;
    return `
        <div class="cc-hdr"><h2>🫂 твои связи</h2><button type="button" data-cc-open>${n} ›</button></div>
        <div class="cc-panel" data-cc-open>
            ${netSvg({ ...d, people: d.people.slice(0, NEAR) }, { W: 390, H: 250, cx: 236, cy: 122, sx: 1.9, sy: 1.08, big: false, uid: 'ccm' })}
            <div class="cc-fade"></div>
            <div class="cc-foot">
                <div class="t"><b>${n}</b> ${plural(n, 'знакомство', 'знакомства', 'знакомств')}<br>${d.locked ? `<i>${d.open}</i> видно сейчас` : `<i>${d.strong}</i> – твой близкий круг`}</div>
                ${nx && nx.freshCount && !d.locked ? `<button type="button" class="cc-pill" data-cc-next>${dayShort(nx.date)} +${nx.freshCount} ›</button>` : ''}
            </div>
        </div>${d.locked ? lockHtml(d) : ''}`;
}
const lockHtml = d => `<button type="button" class="cc-lock" data-cc-card><img src="assets/card-front.jpg" alt=""><span><b>обрети больше связей</b>с картой интеллигента откроются все ${d.total} – и те, с кем вы были вместе не раз</span><em>›</em></button>`;
async function openCard(source) {
    log(`твои связи: карта (${source})`, true, state.user);
    const { openCardSheet } = await import('./card-sheet.js');
    openCardSheet({ source: 'твои связи' });
}

export async function mountCircle(container) {
    if (!container || !circleEnabled()) return;
    ensureCss();
    container.className = 'card-container cc-card';
    container.innerHTML = '<div class="cc-hdr"><h2>🫂 твои связи</h2></div><div class="cc-load">собираю твои связи…</div>';
    try {
        data = data || await load();
    } catch (e) { data = null; }
    if (!data || !data.total) { container.remove(); return; }
    container.innerHTML = blockHtml(data);
    container.addEventListener('click', e => {
        if (e.target.closest('[data-cc-next]')) { e.stopPropagation(); haptic(); openNextHike(); return; }
        if (e.target.closest('[data-cc-card]')) { haptic(); openCard('плашка на главной'); return; }
        if (e.target.closest('[data-cc-open]')) { haptic(); openCircleSheet(); }
    });
}

async function openNextHike() {
    const d = data?.next?.date; if (!d) return;
    log('твои связи: ближайший хайк', false, state.user);
    const { showBottomSheet } = await import('./calendar.js');
    const i = (state.hikesWithTitle || []).findIndex(h => h.date === d);
    if (i !== -1) showBottomSheet(i);
}

// ---------- сеть в шторке: два слоя ----------
// первый слой – 40 самых близких, второй – остальные. «близкие»: первый крупно, второй мелко и размыто снаружи;
// «все»: первый сжимается к центру, второй проявляется. Точки едут через CSS transform, линии перерисовываем после.
const SW = 358, SH = 300, SCX = 179, SCY = 150;
function placeAll(people) {
    const m = Math.min(SW, SH), sx = 1.12;
    const near = people.slice(0, NEAR), far = people.slice(NEAR);
    const pos = (list, a0, rFrom, rTo) => list.map((p, i) => {
        const t = list.length > 1 ? i / (list.length - 1) : 0, a = i * 2.39996 + a0, R = rFrom + (rTo - rFrom) * Math.sqrt(t);
        return [SCX + Math.cos(a) * R * m * sx, SCY + Math.sin(a) * R * m];
    });
    const n1 = pos(near, .6, .17, .46), n2 = pos(near, .6, .085, .23);
    const f1 = pos(far, 1.3, .5, .62), f2 = pos(far, 1.3, .26, .48);
    return people.map((p, i) => i < NEAR
        ? { ...p, layer: 1, a: n1[i], b: n2[i] }
        : { ...p, layer: 2, a: f1[i - NEAR], b: f2[i - NEAR] });
}
function sheetNet(d) {
    const pts = placeAll(d.people), maxN = Math.max(1, ...d.people.map(p => p.n));
    let defs = `<radialGradient id="csbgl"><stop offset="0" stop-color="#D9FD19" stop-opacity=".35"/><stop offset="1" stop-color="#D9FD19" stop-opacity="0"/></radialGradient>`;
    GRADS.forEach((g, k) => { defs += `<linearGradient id="csbg${k}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${g[0]}"/><stop offset="1" stop-color="${g[1]}"/></linearGradient>`; });
    let nodes = '';
    pts.forEach((p, i) => {
        const strong = p.n > 1, r = p.layer === 1 ? 10 + 6 * Math.sqrt(p.n / maxN) : 8;
        const s1 = p.layer === 1 ? 1 : .55, s2 = p.layer === 1 ? .62 : .85;
        if (p.hidden) {
            const rh = p.layer === 1 ? 11 : 8;
            nodes += `<g class="cs2-node l${p.layer} q" style="--x1:${p.a[0].toFixed(1)}px;--y1:${p.a[1].toFixed(1)}px;--x2:${p.b[0].toFixed(1)}px;--y2:${p.b[1].toFixed(1)}px;--s1:${p.layer === 1 ? 1 : .55};--s2:${p.layer === 1 ? .62 : .85}"><circle r="${rh}" fill="rgba(255,255,255,.07)" stroke="rgba(255,255,255,.32)" stroke-dasharray="2 2"/><text y="${(rh * .36).toFixed(1)}" text-anchor="middle" font-size="${(rh * .95).toFixed(1)}" font-weight="800" fill="rgba(255,255,255,.45)">?</text></g>`;
            return;
        }
        nodes += `<g class="cs2-node l${p.layer}" data-id="${esc(p.id)}" style="--x1:${p.a[0].toFixed(1)}px;--y1:${p.a[1].toFixed(1)}px;--x2:${p.b[0].toFixed(1)}px;--y2:${p.b[1].toFixed(1)}px;--s1:${s1};--s2:${s2}">`
            + `<circle class="halo" r="${r * 2.3}" fill="url(#csbgl)"/>`;
        if (p.photo) nodes += `<clipPath id="csbc${i}"><circle r="${r}"/></clipPath><circle r="${r}" fill="url(#csbg${i % 6})"/><image href="${esc(p.photo)}" x="${-r}" y="${-r}" width="${r * 2}" height="${r * 2}" clip-path="url(#csbc${i})" preserveAspectRatio="xMidYMid slice"/>`;
        else nodes += `<circle r="${r}" fill="url(#csbg${i % 6})"/><text y="${(r * .33).toFixed(1)}" text-anchor="middle" font-size="${(r * .85).toFixed(1)}" font-weight="800" fill="#fff">${esc(initials(p.name))}</text>`;
        nodes += `<circle r="${r}" fill="none" stroke="${strong ? '#D9FD19' : 'rgba(255,255,255,.5)'}" stroke-width="${strong ? 1.8 : 1}"/></g>`;
    });
    const me = state.user?.photo_url, mr = 20;
    const meHtml = `<circle cx="${SCX}" cy="${SCY}" r="${mr * 1.9}" fill="url(#csbgl)"/>`
        + (me ? `<clipPath id="csbme"><circle cx="${SCX}" cy="${SCY}" r="${mr}"/></clipPath><image href="${esc(me)}" x="${SCX - mr}" y="${SCY - mr}" width="${mr * 2}" height="${mr * 2}" clip-path="url(#csbme)" preserveAspectRatio="xMidYMid slice"/>`
            : `<circle cx="${SCX}" cy="${SCY}" r="${mr}" fill="#fff"/><text x="${SCX}" y="${SCY + 4}" text-anchor="middle" font-size="12" font-weight="800" fill="#121a23">ты</text>`)
        + `<circle cx="${SCX}" cy="${SCY}" r="${mr}" fill="none" stroke="#D9FD19" stroke-width="2.5"/>`;
    return { pts, maxN, svg: `<svg viewBox="0 0 ${SW} ${SH}" xmlns="http://www.w3.org/2000/svg"><defs>${defs}</defs><g class="cs2-lines"></g><g class="cs2-nodes">${nodes}</g>${meHtml}</svg>` };
}
function sheetLines(net, d, mode, sel) {
    const at = new Map(net.pts.map(p => [p.id, p]));
    const P = p => (mode === 'all' ? p.b : p.a);
    const vis = p => mode === 'all' || p.layer === 1;
    const cv = (A, B, k = .12) => `M${A[0].toFixed(1)} ${A[1].toFixed(1)} Q${((A[0] + B[0]) / 2 + (A[1] - B[1]) * k).toFixed(1)} ${((A[1] + B[1]) / 2 + (B[0] - A[0]) * k).toFixed(1)} ${B[0].toFixed(1)} ${B[1].toFixed(1)}`;
    let out = '';
    d.links.forEach(([a, b, w]) => {
        const A = at.get(a), B = at.get(b); if (!A || !B || !vis(A) || !vis(B)) return;
        const on = sel && (a === sel || b === sel);
        if (!on && mode === 'all' && w < 2) return; // во «всех» – только заметные связи, иначе каша
        out += `<path d="M${P(A)[0].toFixed(1)} ${P(A)[1].toFixed(1)} L${P(B)[0].toFixed(1)} ${P(B)[1].toFixed(1)}" stroke="${on ? '#D9FD19' : '#a9bccf'}" stroke-opacity="${on ? .7 : (sel ? .03 : Math.min(.05 + w * .025, .2))}" stroke-width="${on ? 1.3 : .6}" fill="none"/>`;
    });
    net.pts.forEach(p => {
        const strong = p.n > 1, dim = sel && p.id !== sel;
        if (p.hidden) { if (vis(p)) out += `<path d="${cv([SCX, SCY], P(p))}" fill="none" stroke="#fff" stroke-opacity=".1" stroke-width=".8" stroke-dasharray="3 4"/>`; return; }
        if (!vis(p)) { out += `<path d="${cv([SCX, SCY], p.a)}" fill="none" stroke="#fff" stroke-opacity=".06" stroke-width=".6"/>`; return; }
        const op = dim ? .06 : (strong ? .3 + .5 * p.n / net.maxN : .25) * (mode === 'all' && p.layer === 2 ? .7 : 1);
        const w = (strong ? 1 + 2.2 * p.n / net.maxN : .8) * (mode === 'all' ? .7 : 1);
        out += `<path d="${cv([SCX, SCY], P(p))}" fill="none" stroke="${strong ? '#D9FD19' : '#d6aa6e'}" stroke-opacity="${op.toFixed(2)}" stroke-width="${w.toFixed(2)}" stroke-linecap="round"/>`;
    });
    return out;
}

let overlay = null;
export function openCircleSheet() {
    if (overlay || !data) return;
    ensureCss();
    log('твои связи: открыл', false, state.user);
    const d = data, nx = d.next;
    overlay = document.createElement('div');
    overlay.className = 'cs2-overlay';
    const net = sheetNet(d), near = Math.min(NEAR, d.people.length), far = d.people.length - near;
    let mode = 'near', sel = null;
    const hiddenN = d.people.filter(p => p.hidden).length;
    const cardsFor = list => list.filter(p => !p.hidden).map((p, i) => `<button type="button" class="cs2-pc" data-pid="${esc(p.id)}"><div class="cs2-av" style="${avStyle(p, i)}">${p.photo ? '' : esc(initials(p.name))}</div><b>${esc(short(p.name))}</b><span>${p.n} ${plural(p.n, 'общий хайк', 'общих хайка', 'общих хайков')}</span></button>`).join('')
        + (hiddenN ? `<button type="button" class="cs2-pc q" data-cs2-card><div class="cs2-av">?</div><b>ещё ${hiddenN}</b><span>откроются с картой</span></button>` : '');
    const cards = cardsFor(d.people.slice(0, near));
    const stack = nx ? [...nx.known.slice(0, 2).map((p, i) => `<i style="${avStyle(p, i)}">${p.photo ? '' : esc(initials(p.name))}</i>`), nx.freshCount ? `<i class="new">+${nx.freshCount}</i>` : ''].join('') : '';
    overlay.innerHTML = `
        <div class="cs2-sheet" role="dialog" aria-label="твои связи">
            <div class="cs-grab cs2-grab"></div>
            <button type="button" class="cs2-x" aria-label="закрыть">✕</button>
            <div class="cs2-h">🫂 твои связи</div>
            <div class="cs2-sub">${d.locked ? `${d.open} самых близких видно сразу, остальные ${hiddenN} откроются с картой интеллигента` : 'люди, с которыми ты был на хайках клуба. близкий круг – те, с кем вы ходили вместе хотя бы дважды'}</div>
            ${far ? `<div class="cs2-tg" id="cs2Tg"><button type="button" class="on" data-mode="near">близкие · ${near}</button><button type="button" data-mode="all">все · ${d.people.length}</button></div>` : ''}
            <div class="cs2-net" id="cs2Net">${net.svg}</div>
            <div class="cs2-stats"><div><b>${d.total}</b>${plural(d.total, 'знакомство', 'знакомства', 'знакомств')} на хайках</div><div><b style="color:var(--yellow)">${d.strong}</b>близкий круг</div><div><b>${d.hikes}</b>${plural(d.hikes, 'твой хайк', 'твоих хайка', 'твоих хайков')}</div></div>
            <div class="cs2-car" id="cs2Car">${cards}</div>
            ${d.locked ? '<button type="button" class="cs2-go" style="width:calc(100% - 32px);margin:12px 16px 0" data-cs2-card>открыть все связи с картой</button>' : ''}
            ${nx ? `<div class="cs2-sec">🗓 ближайший хайк</div>
            <div class="cs2-next"><div class="top"><b>${dayLabel(nx.date)}${nx.title ? ' · ' + esc(nx.title) : ''}</b></div>
                <div class="row"><div class="cs2-stack">${stack}</div><span>${nx.known.length ? `${nx.known.length} ${plural(nx.known.length, 'человек', 'человека', 'человек')} из твоих связей и ` : ''}<em>${nx.freshCount} ${plural(nx.freshCount, 'новый человек', 'новых человека', 'новых человек')}</em></span></div>
                <button type="button" class="cs2-go" data-cs2-hike>открыть хайк</button></div>` : ''}
        </div>`;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => overlay.classList.add('is-on'));
    const svg = overlay.querySelector('#cs2Net svg'), lines = svg.querySelector('.cs2-lines');
    const drawLines = () => { lines.innerHTML = sheetLines(net, d, mode, sel); };
    drawLines();
    const select = id => {
        sel = id;
        svg.querySelectorAll('.cs2-node').forEach(n => n.classList.toggle('sel', n.dataset.id === id));
        svg.classList.toggle('has-sel', !!id);
        drawLines();
        overlay.querySelectorAll('.cs2-pc').forEach(c => c.classList.toggle('on', c.dataset.pid === id));
    };
    const setMode = m => {
        if (m === mode) return;
        mode = m;
        log(`твои связи: слой ${m === 'all' ? 'все' : 'близкие'}`, false, state.user);
        overlay.querySelectorAll('#cs2Tg button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
        lines.style.opacity = '0';
        svg.classList.toggle('is-all', m === 'all');
        setTimeout(() => { drawLines(); lines.style.opacity = '1'; }, 480);
        overlay.querySelector('#cs2Car').innerHTML = cardsFor(m === 'all' ? d.people : d.people.slice(0, near));
        if (sel) overlay.querySelector(`.cs2-pc[data-pid="${CSS.escape(sel)}"]`)?.classList.add('on');
    };
    overlay.addEventListener('click', e => {
        if (e.target.closest('[data-cs2-card]')) { haptic(); closeCircleSheet(); setTimeout(() => openCard('шторка'), 320); return; }
        const tg = e.target.closest('#cs2Tg button');
        if (tg) { haptic(); setMode(tg.dataset.mode); return; }
        const pc = e.target.closest('.cs2-pc:not(.q)');
        if (pc) { haptic(); select(pc.classList.contains('on') ? null : pc.dataset.pid); return; }
        const node = e.target.closest('#cs2Net .cs2-node');
        if (node && !node.classList.contains('q') && (mode === 'all' || node.classList.contains('l1'))) {
            haptic(); select(node.dataset.id);
            overlay.querySelector(`.cs2-pc[data-pid="${CSS.escape(node.dataset.id)}"]`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            return;
        }
        if (e.target.closest('[data-cs2-hike]')) { haptic(); closeCircleSheet(); setTimeout(openNextHike, 320); return; }
        if (e.target === overlay || e.target.closest('.cs2-x')) { haptic(); closeCircleSheet(); }
    });
}

export function closeCircleSheet() {
    if (!overlay) return;
    const o = overlay; overlay = null;
    o.classList.remove('is-on');
    document.body.style.overflow = '';
    setTimeout(() => o.remove(), 320);
}
