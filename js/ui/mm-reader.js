// Читалка саммари мастермайндов: текст заметки из Plaud прямо в приложении, листание между саммари и оглавление.
// Данные – /api/me (action 'notes'): владельцу карты целиком, гостю начало и замок с картой.
import { state } from '../state.js';
import { haptic } from '../utils.js';
import { log } from '../api.js';

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dayLabel = d => { const [y, m, dd] = String(d).split('-').map(Number); return `${dd} ${MONTHS[m - 1]}${y !== new Date().getFullYear() ? ' ' + y : ''}`; };

let loading = null;
export function ensureMmNotes() {
    if (state.mmNotes) return Promise.resolve(state.mmNotes);
    const initData = window.Telegram?.WebApp?.initData || '';
    if (!initData) return Promise.resolve([]);
    loading = loading || fetch('/api/me', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData, action: 'notes' }) })
        .then(r => (r.ok ? r.json() : { notes: [] })).then(d => { state.mmNotes = d.notes || []; return state.mmNotes; })
        .catch(() => []).finally(() => { loading = null; });
    return loading;
}
export const mmNotes = () => state.mmNotes || [];
export const mmNoteForDate = date => mmNotes().find(n => n.date === String(date || '').slice(0, 10)) || null;

// markdown заметки Plaud → html: заголовки, цитаты (информация о встрече), списки с вложенностью, галочки, **жирный**, [имена]
function inline(t) {
    return esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\[([^\]\n]{1,40})\]/g, '<span class="mmr-nm">$1</span>');
}
function render(md) {
    const lines = String(md || '').replace(/&nbsp;/g, '').split('\n');
    let html = '', list = [], quote = [];
    const closeList = () => { while (list.length) html += list.pop(); };
    const flushQuote = () => { if (quote.length) { html += `<div class="mmr-info">${quote.map(q => `<div>${inline(q)}</div>`).join('')}</div>`; quote = []; } };
    for (const raw of lines) {
        const line = raw.replace(/\s+$/, '');
        if (/^>\s?/.test(line)) { closeList(); const q = line.replace(/^>\s?/, '').trim(); if (q) quote.push(q); continue; }
        flushQuote();
        if (!line.trim()) { closeList(); continue; }
        let m;
        if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
            closeList();
            const lvl = m[1].length, txt = m[2];
            if (/^информация о встрече$/i.test(txt.trim())) continue;
            html += lvl <= 2 ? `<h3 class="mmr-h2">${inline(txt)}</h3>` : `<h4 class="mmr-h3">${inline(txt)}</h4>`;
            continue;
        }
        if ((m = line.match(/^(\s*)[-*]\s+(\[( |x)\]\s+)?(.*)$/))) {
            const depth = Math.floor(m[1].length / 2) + 1;
            while (list.length < depth) { html += '<ul class="mmr-ul">'; list.push('</ul>'); }
            while (list.length > depth) html += list.pop();
            html += m[2] ? `<li class="mmr-todo${m[3] === 'x' ? ' is-done' : ''}">${inline(m[4])}</li>` : `<li>${inline(m[4])}</li>`;
            continue;
        }
        closeList();
        html += `<p class="mmr-p">${inline(line)}</p>`;
    }
    closeList(); flushQuote();
    return html;
}

const STYLE = `
.mmr-overlay { position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,.55); opacity: 0; transition: opacity .25s ease; }
.mmr-overlay.is-on { opacity: 1; }
.mmr-sheet { position: absolute; left: 0; right: 0; bottom: 0; max-width: 600px; margin: 0 auto; height: 92vh; display: flex; flex-direction: column; box-sizing: border-box;
  border-radius: 28px 28px 0 0; background: linear-gradient(180deg, rgba(200,210,225,.10), rgba(16,22,30,.97) 22%); color: #fff; border: 1px solid rgba(255,255,255,.12); border-bottom: 0;
  transform: translateY(100%); transition: transform .32s cubic-bezier(.2,.9,.25,1); }
.mmr-overlay.is-on .mmr-sheet { transform: none; }
.mmr-top { flex: none; padding: 6px 18px 10px; position: relative; }
.mmr-x { position: absolute; top: 12px; right: 16px; width: 32px; height: 32px; border: 0; border-radius: 50%; background: rgba(255,255,255,.1); color: #fff; font-size: 14px; cursor: pointer; }
.mmr-tabs { display: flex; gap: 6px; margin: 4px 50px 0 0; }
.mmr-tabs button { border: 0; border-radius: 12px; padding: 7px 12px; background: rgba(255,255,255,.08); color: rgba(255,255,255,.7); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
.mmr-tabs button.on { background: var(--yellow); color: #1d2200; }
.mmr-scroll { flex: 1; overflow-y: auto; padding: 4px 20px calc(env(safe-area-inset-bottom, 0px) + 24px); -webkit-overflow-scrolling: touch; }
.mmr-head { display: flex; gap: 14px; align-items: center; margin: 8px 0 14px; }
.mmr-head img { flex: none; width: 54px; height: 54px; object-fit: contain; transform: rotate(-8deg); filter: drop-shadow(0 6px 12px rgba(0,0,0,.5)); }
.mmr-head .k { font-size: 12.5px; font-weight: 800; color: var(--yellow); }
.mmr-head h2 { margin: 3px 0 0; font-size: 21px; line-height: 1.22; font-weight: 800; }
.mmr-info { margin: 0 0 16px; padding: 12px 14px; border-radius: 16px; background: rgba(255,255,255,.06); font-size: 13px; line-height: 1.55; color: rgba(255,255,255,.75); }
.mmr-info b { color: #fff; font-weight: 700; }
.mmr-h2 { margin: 22px 0 8px; font-size: 18px; font-weight: 800; color: #fff; }
.mmr-h3 { margin: 18px 0 6px; font-size: 16px; font-weight: 700; color: var(--yellow); }
.mmr-p { margin: 8px 0; font-size: 15px; line-height: 1.6; color: rgba(255,255,255,.88); }
.mmr-ul { margin: 4px 0 8px; padding-left: 18px; }
.mmr-ul li { margin: 6px 0; font-size: 15px; line-height: 1.55; color: rgba(255,255,255,.86); }
.mmr-ul li::marker { color: rgba(217,253,25,.7); }
.mmr-ul .mmr-ul li { font-size: 14px; color: rgba(255,255,255,.75); }
.mmr-todo { list-style: none; position: relative; margin-left: -18px !important; padding-left: 28px; }
.mmr-todo::before { content: ''; position: absolute; left: 2px; top: 4px; width: 15px; height: 15px; border-radius: 5px; border: 1.6px solid rgba(217,253,25,.7); }
.mmr-nm { font-weight: 700; color: #fff; }
.mmr-lock { position: relative; margin-top: -90px; padding-top: 90px; background: linear-gradient(180deg, rgba(16,22,30,0), rgba(16,22,30,1) 85px); text-align: center; }
.mmr-lock p { margin: 0 0 12px; font-size: 14px; line-height: 1.45; color: rgba(255,255,255,.8); }
.mmr-btn { display: block; width: 100%; height: 50px; border: 0; border-radius: 16px; background: var(--yellow); color: #1d2200; font: inherit; font-size: 15px; font-weight: 800; cursor: pointer; }
.mmr-nav { display: flex; gap: 8px; margin-top: 24px; }
.mmr-nav button { flex: 1; min-width: 0; text-align: left; padding: 12px 14px; border: 0; border-radius: 16px; background: rgba(255,255,255,.07); color: #fff; font: inherit; cursor: pointer; }
.mmr-nav button.next { text-align: right; }
.mmr-nav small { display: block; font-size: 11.5px; color: rgba(255,255,255,.5); }
.mmr-nav b { display: block; font-size: 13.5px; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mmr-item { display: flex; gap: 12px; align-items: center; width: 100%; margin: 0 0 8px; padding: 12px 14px; border: 0; border-radius: 16px; background: rgba(255,255,255,.06); color: #fff; font: inherit; text-align: left; cursor: pointer; }
.mmr-item.on { background: rgba(217,253,25,.12); box-shadow: inset 0 0 0 1.5px rgba(217,253,25,.45); }
.mmr-item .d { flex: none; width: 62px; font-size: 13px; font-weight: 900; font-style: italic; color: var(--yellow); }
.mmr-item .t { flex: 1; font-size: 14.5px; line-height: 1.35; }
.mmr-item .t small { display: block; font-size: 12px; color: rgba(255,255,255,.5); margin-top: 2px; }
`;
function ensureCss() {
    if (document.getElementById('mmrCss')) return;
    const st = document.createElement('style'); st.id = 'mmrCss'; st.textContent = STYLE; document.head.appendChild(st);
}

let overlay = null;
export async function openMmReader(id) {
    if (overlay) return;
    ensureCss();
    const list = await ensureMmNotes();
    if (!list.length) return;
    let idx = Math.max(0, list.findIndex(n => n.id === id));
    let view = 'read';
    overlay = document.createElement('div');
    overlay.className = 'mmr-overlay';
    overlay.innerHTML = `<div class="mmr-sheet" role="dialog" aria-label="саммари мастермайнда">
        <div class="mmr-top"><div class="cs-grab"></div><button type="button" class="mmr-x" aria-label="закрыть">✕</button>
            <div class="mmr-tabs"><button type="button" class="on" data-v="read">читать</button><button type="button" data-v="all">все саммари · ${list.length}</button></div></div>
        <div class="mmr-scroll"></div></div>`;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => overlay.classList.add('is-on'));
    const scroll = overlay.querySelector('.mmr-scroll');
    const draw = () => {
        overlay.querySelectorAll('.mmr-tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === view));
        if (view === 'all') {
            scroll.innerHTML = '<div style="height:8px"></div>' + list.map((n, i) => `<button type="button" class="mmr-item${i === idx ? ' on' : ''}" data-i="${i}"><span class="d">${esc(dayLabel(n.date))}</span><span class="t">${esc(n.title)}${n.place ? `<small>${esc(n.place)}</small>` : ''}</span></button>`).join('');
        } else {
            const n = list[idx], prev = list[idx + 1], next = list[idx - 1];
            log(`саммари: читает ${n.date} ${n.title}`, n.locked, state.user);
            scroll.innerHTML = `<div class="mmr-head"><img src="assets/plaud.webp" alt=""><div><div class="k">${esc(dayLabel(n.date))}${n.place ? ' · ' + esc(n.place) : ''}</div><h2>${esc(n.title)}</h2></div></div>`
                + render(n.body)
                + (n.locked ? `<div class="mmr-lock"><p>целиком саммари мастермайндов читают владельцы карты интеллигента</p><button type="button" class="mmr-btn" data-card>открыть с картой</button></div>` : '')
                + `<div class="mmr-nav">${prev ? `<button type="button" data-i="${idx + 1}"><small>‹ раньше</small><b>${esc(prev.title)}</b></button>` : '<span style="flex:1"></span>'}${next ? `<button type="button" class="next" data-i="${idx - 1}"><small>позже ›</small><b>${esc(next.title)}</b></button>` : '<span style="flex:1"></span>'}</div>`;
        }
        scroll.scrollTop = 0;
    };
    draw();
    overlay.addEventListener('click', async e => {
        const t = e.target.closest('[data-v]');
        if (t) { haptic(); view = t.dataset.v; draw(); return; }
        const it = e.target.closest('[data-i]');
        if (it) { haptic(); idx = +it.dataset.i; view = 'read'; draw(); return; }
        if (e.target.closest('[data-card]')) {
            haptic(); closeMmReader();
            const { openCardSheet } = await import('./card-sheet.js');
            setTimeout(() => openCardSheet({ source: 'саммари мастермайнда' }), 320);
            return;
        }
        if (e.target === overlay || e.target.closest('.mmr-x')) { haptic(); closeMmReader(); }
    });
}

export function closeMmReader() {
    if (!overlay) return;
    const o = overlay; overlay = null;
    o.classList.remove('is-on');
    document.body.style.overflow = '';
    setTimeout(() => o.remove(), 320);
}

// нажатия на «читать» в блоке саммари и на плашке хайка, где есть заметка
document.addEventListener('click', e => {
    const b = e.target.closest('[data-mm-note]');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    haptic();
    openMmReader(b.dataset.mmNote);
}, true);
