// «Твои связи» – блок на главной и шторка: люди, с которыми человек был на хайках клуба,
// и связи между ними. Данные считает сервер (/api/me, action 'circle' → lib/circle.js).
// Пока только для теста (CIRCLE_USERS тут и в api/me.js).
import { state } from '../state.js';
import { haptic } from '../utils.js';
import { log } from '../api.js';

const CIRCLE_USERS = ['maxmolotov'];
export const circleEnabled = () => CIRCLE_USERS.includes(String(state.user?.username || '').toLowerCase());

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
.cc-panel { position: relative; margin: 0 16px; height: 200px; border-radius: 20px; background: rgba(0,0,0,.28); overflow: hidden; cursor: pointer; }
.cc-panel svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.cc-fade { position: absolute; left: 0; right: 0; bottom: 0; height: 78px; background: linear-gradient(180deg, rgba(14,20,28,0), rgba(14,20,28,.92) 65%); pointer-events: none; }
.cc-foot { position: absolute; left: 12px; right: 12px; bottom: 12px; display: flex; justify-content: space-between; align-items: flex-end; gap: 8px; }
.cc-foot .t { font-size: 13px; line-height: 1.35; color: rgba(255,255,255,.8); }
.cc-foot .t b { font-size: 22px; color: #fff; }
.cc-foot .t i { font-style: normal; color: var(--yellow); font-weight: 700; }
.cc-pill { flex: none; font-size: 12.5px; font-weight: 800; padding: 7px 10px; border-radius: 12px; background: var(--yellow); color: #1d2200; border: 0; font-family: inherit; cursor: pointer; }
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
.cs2-net svg { display: block; width: 100%; height: auto; }
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
        const strong = p.n > 1, dim = sel && p.id !== sel;
        const op = dim ? (strong ? .15 : .06) : (strong ? .35 + .5 * p.n / maxN : .3);
        out += `<path d="${curve(me, p)}" fill="none" stroke="${strong ? '#D9FD19' : '#d6aa6e'}" stroke-opacity="${op.toFixed(2)}" stroke-width="${(strong ? 1 + 2.4 * p.n / maxN : .8) * (big ? 1 : .8)}" stroke-linecap="round"/>`;
    });
    // люди
    const base = big ? 10 : 7;
    pts.forEach((p, i) => {
        const strong = p.n > 1, r = base + (big ? 6 : 4) * Math.sqrt(p.n / maxN), dim = sel && p.id !== sel;
        const ring = strong ? '#D9FD19' : 'rgba(255,255,255,.5)';
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
            ${netSvg(d, { W: 358, H: 200, cx: 179, cy: 92, sx: 1.25, sy: .82, big: false, uid: 'ccm' })}
            <div class="cc-fade"></div>
            <div class="cc-foot">
                <div class="t"><b>${n}</b> ${plural(n, 'знакомство', 'знакомства', 'знакомств')}<br><i>${d.strong}</i> – твой близкий круг</div>
                ${nx && nx.freshCount ? `<button type="button" class="cc-pill" data-cc-next>${dayShort(nx.date)} +${nx.freshCount} ›</button>` : ''}
            </div>
        </div>`;
}

export async function mountCircle(container) {
    if (!container || !circleEnabled()) return;
    ensureCss();
    container.className = 'card-container';
    container.innerHTML = '<div class="cc-hdr"><h2>🫂 твои связи</h2></div><div class="cc-load">собираю твои связи…</div>';
    try {
        data = data || await load();
    } catch (e) { data = null; }
    if (!data || !data.total) { container.remove(); return; }
    container.innerHTML = blockHtml(data);
    container.addEventListener('click', e => {
        if (e.target.closest('[data-cc-next]')) { e.stopPropagation(); haptic(); openNextHike(); return; }
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

let overlay = null;
export function openCircleSheet() {
    if (overlay || !data) return;
    ensureCss();
    log('твои связи: открыл', false, state.user);
    const d = data, nx = d.next;
    overlay = document.createElement('div');
    overlay.className = 'cs2-overlay';
    const cards = d.people.map((p, i) => `<button type="button" class="cs2-pc" data-pid="${esc(p.id)}"><div class="cs2-av" style="${avStyle(p, i)}">${p.photo ? '' : esc(initials(p.name))}</div><b>${esc(short(p.name))}</b><span>${p.n} ${plural(p.n, 'общий хайк', 'общих хайка', 'общих хайков')}</span></button>`).join('');
    const stack = nx ? [...nx.known.slice(0, 2).map((p, i) => `<i style="${avStyle(p, i)}">${p.photo ? '' : esc(initials(p.name))}</i>`), nx.freshCount ? `<i class="new">+${nx.freshCount}</i>` : ''].join('') : '';
    overlay.innerHTML = `
        <div class="cs2-sheet" role="dialog" aria-label="твои связи">
            <div class="cs-grab cs2-grab"></div>
            <button type="button" class="cs2-x" aria-label="закрыть">✕</button>
            <div class="cs2-h">🫂 твои связи</div>
            <div class="cs2-sub">люди, с которыми ты был на хайках клуба. листай – сеть покажет, где человек и с кем он связан</div>
            <div class="cs2-net" id="cs2Net">${netSvg(d, { W: 358, H: 300, cx: 179, cy: 150, sx: 1.12, sy: 1, big: true, uid: 'csb' })}</div>
            <div class="cs2-stats"><div><b>${d.total}</b>${plural(d.total, 'человек', 'человека', 'человек')} в связях</div><div><b style="color:var(--yellow)">${d.strong}</b>не раз вместе</div><div><b>${d.hikes}</b>${plural(d.hikes, 'твой хайк', 'твоих хайка', 'твоих хайков')}</div></div>
            <div class="cs2-car" id="cs2Car">${cards}</div>
            ${d.more ? `<div class="cs2-org" style="margin-top:10px">в сети – ${d.people.length} самых близких, и ещё ${d.more} ${plural(d.more, 'человек', 'человека', 'человек')} в твоих связях</div>` : ''}
            ${nx ? `<div class="cs2-sec">🗓 ближайший хайк</div>
            <div class="cs2-next"><div class="top"><b>${dayLabel(nx.date)}${nx.title ? ' · ' + esc(nx.title) : ''}</b></div>
                <div class="row"><div class="cs2-stack">${stack}</div><span>${nx.known.length ? `${nx.known.length} ${plural(nx.known.length, 'человек', 'человека', 'человек')} из твоих связей и ` : ''}<em>${nx.freshCount} ${plural(nx.freshCount, 'новый человек', 'новых человека', 'новых человек')}</em></span></div>
                <button type="button" class="cs2-go" data-cs2-hike>открыть хайк</button></div>` : ''}
            <div class="cs2-org">и организаторы Макс и Неля – они есть в связях у каждого&nbsp;🤍</div>
        </div>`;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => overlay.classList.add('is-on'));
    const select = id => {
        overlay.querySelector('#cs2Net').innerHTML = netSvg(d, { W: 358, H: 300, cx: 179, cy: 150, sx: 1.12, sy: 1, big: true, sel: id, uid: 'csb' });
        overlay.querySelectorAll('.cs2-pc').forEach(c => c.classList.toggle('on', c.dataset.pid === id));
    };
    overlay.addEventListener('click', e => {
        const pc = e.target.closest('.cs2-pc');
        if (pc) { haptic(); select(pc.classList.contains('on') ? null : pc.dataset.pid); return; }
        const node = e.target.closest('#cs2Net g[data-id]');
        if (node) {
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
