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
const AV = [['#f6b26b', '#e06666'], ['#6fa8dc', '#3d85c6'], ['#93c47d', '#38761d'], ['#c27ba0', '#741b47'], ['#ffd966', '#bf9000'], ['#8e7cc3', '#351c75']];
function render(md) {
    const lines = String(md || '').replace(/&nbsp;/g, '').split('\n');
    let html = '', list = [], quote = [], prev = '', sec = '', card = false, nAv = 0;
    const closeList = () => { while (list.length) html += list.pop(); };
    const closeCard = () => { closeList(); if (card) { html += '</div>'; card = false; } };
    const flushQuote = () => { if (quote.length) { html += `<div class="mmr-info">${quote.map(q => `<div>${inline(q)}</div>`).join('')}</div>`; quote = []; } };
    for (const raw of lines) {
        const line = raw.replace(/\s+$/, '');
        if (/^>\s?/.test(line)) { closeList(); const q = line.replace(/^>\s?/, '').trim(); if (q) quote.push(q); continue; }
        flushQuote();
        if (!line.trim()) { closeList(); continue; }
        let m;
        if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
            const lvl = m[1].length, txt = m[2].trim();
            if (/^информация о встрече$/i.test(txt)) continue;
            if (lvl === 1) { closeCard(); prev = 'h1'; continue; } // заголовок заметки уже в шапке читалки
            if (lvl === 2) { closeCard(); sec = txt.toLowerCase(); html += `<h3 class="mmr-sec">${inline(txt)}</h3>`; prev = 'h2'; continue; }
            // «### Имя · о чём» в разделе «взгляды» – карточка участника
            const pm = txt.match(/^([^·]{1,40}?)\s*·\s*(.+)$/);
            if (/^взгляды/.test(sec) && pm) {
                closeCard(); card = true;
                const g = AV[nAv++ % AV.length];
                html += `<div class="mmr-card"><div class="mmr-pn"><span class="mmr-av" style="background:linear-gradient(135deg,${g[0]},${g[1]})">${esc(pm[1].trim()[0] || '')}</span><span><b>${esc(pm[1].trim())}</b><i>${esc(pm[2])}</i></span></div>`;
                prev = 'card'; continue;
            }
            closeCard(); html += `<h4 class="mmr-h3">${inline(txt)}</h4>`; prev = 'h3';
            continue;
        }
        // «**взгляд Жени:** я бы…» – позиция человека от первого лица
        if ((m = line.trim().match(/^\*\*(взгляд[^*]*?:?)\*\*\s*(.+)$/i))) {
            closeList(); html += `<p class="mmr-view"><em>${esc(m[1].replace(/:?$/, ':'))}</em> ${inline(m[2])}</p>`; prev = 'view'; continue;
        }
        // строка целиком жирным: сразу после заголовка ответа – имя участника, иначе – главный совет (старый шаблон)
        if ((m = line.trim().match(/^\*\*(.+)\*\*$/))) {
            closeList();
            html += prev === 'h3' ? `<div class="mmr-who">${esc(m[1])}</div>` : `<p class="mmr-take">${inline(m[1])}</p>`;
            prev = prev === 'h3' ? 'who' : 'take';
            continue;
        }
        if (/^«.*»[.!?…]?$/.test(line.trim())) {
            closeList();
            const t = inline(line.trim());
            if (card) html += `<p class="mmr-cq">${t}</p>`;
            else if (/замолчали/.test(sec) || prev === 'q') html += `<p class="mmr-q">${t}</p>`;
            else if (prev !== 'p' || /^(запрос|с чем уш)/.test(sec)) html += `<p class="mmr-voice">${t}</p>`;
            else html += `<p class="mmr-p">${t}</p>`;
            prev = 'q'; continue;
        }
        if ((m = line.match(/^(\s*)[-*]\s+(\[( |x)\]\s+)?(.*)$/))) {
            // «- **мысль** – пояснение» в «что прозвучало» – плашка с мыслью
            const tm = !m[1] && !m[2] && /прозвучало/.test(sec) && m[4].match(/^\*\*(.+?)\*\*\s*[–—-]?\s*(.*)$/);
            if (tm) { closeList(); html += `<div class="mmr-th"><b>${esc(tm[1])}</b>${inline(tm[2])}</div>`; prev = 'th'; continue; }
            const depth = Math.floor(m[1].length / 2) + 1;
            while (list.length < depth) { html += '<ul class="mmr-ul">'; list.push('</ul>'); }
            while (list.length > depth) html += list.pop();
            prev = 'li';
            html += m[2] ? `<li class="mmr-todo${m[3] === 'x' ? ' is-done' : ''}">${inline(m[4])}</li>` : `<li>${inline(m[4])}</li>`;
            continue;
        }
        closeList();
        if (prev === 'h1' && !html) { prev = 'meta'; continue; } // строка «место, дата» под заголовком – тоже в шапке
        if (/^вопрос себе/.test(sec)) { html += `<p class="mmr-ask">${inline(line)}</p>`; prev = 'ask'; continue; }
        html += `<p class="mmr-p">${inline(line)}</p>`; prev = 'p';
    }
    closeCard(); flushQuote();
    return html;
}

const STYLE = `
.mmr-overlay { position: fixed; inset: 0; z-index: 2300; display: flex; align-items: flex-end; justify-content: center; background: rgba(5,8,12,0); transition: background .3s ease; }
.mmr-overlay.is-on { background: rgba(5,8,12,.62); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
.mmr-sheet { position: relative; width: 100%; max-width: 600px; height: 90vh; height: 90dvh; max-height: calc(100dvh - var(--tg-safe-area-inset-top, 0px) - var(--tg-content-safe-area-inset-top, 0px) - 16px); margin-bottom: 0; border-bottom-left-radius: 0 !important; border-bottom-right-radius: 0 !important; display: flex; flex-direction: column; overflow: hidden; box-sizing: border-box;
  border-radius: 34px; background: rgba(18,26,36,.8); backdrop-filter: blur(36px) saturate(180%); -webkit-backdrop-filter: blur(36px) saturate(180%); border: 1px solid rgba(255,255,255,.2); box-shadow: inset 0 1px 0 rgba(255,255,255,.18), 0 -8px 40px rgba(0,0,0,.28); color: #fff;
  transform: translateY(40px); opacity: 0; transition: transform .38s cubic-bezier(.2,.9,.3,1.08), opacity .25s ease; }
.mmr-overlay.is-on .mmr-sheet { transform: none; opacity: 1; }
.mmr-grab { margin-bottom: -6px; }
.mmr-top { flex: none; display: flex; align-items: center; gap: 6px; padding: 4px 14px 10px 20px; border-bottom: 1px solid rgba(255,255,255,.08); }
.mmr-top .k { flex: 1; min-width: 0; font-size: 13px; font-weight: 800; font-style: italic; color: #B9A2FF; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mmr-top .k span { font-style: normal; font-weight: 600; color: rgba(255,255,255,.55); }
.mmr-ib { flex: none; width: 34px; height: 34px; padding: 0; border: 0; border-radius: 50%; background: rgba(255,255,255,.09); color: #fff; font: inherit; font-size: 15px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.mmr-ib.on { background: #B9A2FF; color: #1a1033; }
.mmr-ib:disabled { opacity: .3; cursor: default; }
.mmr-cnt { flex: none; min-width: 34px; text-align: center; font-size: 12px; color: rgba(255,255,255,.5); }
.mmr-dock { touch-action: none; position: absolute; left: 12px; right: 12px; bottom: calc(12px + env(safe-area-inset-bottom, 0px)); z-index: 3; height: 60px; display: flex; align-items: center; gap: 6px; padding: 0 8px;
  border-radius: 999px; background: rgba(28,32,40,.94); border: 1px solid rgba(255,255,255,.1); box-shadow: 0 14px 34px rgba(0,0,0,.55); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); }
.mmr-ib.mmr-nav { width: 44px; height: 44px; font-size: 19px; }
.mmr-ib.mmr-x { width: 40px; height: 40px; font-size: 16px; }
.mmr-mid { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; line-height: 1.2; padding: 0 4px; }
.mmr-dock .mmr-cnt { font-size: 14px; font-weight: 700; color: #fff; min-width: 0; white-space: nowrap; }
.mmr-mid small { font-size: 11.5px; color: rgba(255,255,255,.45); white-space: nowrap; }
.mmr-all { flex: none; height: 46px; margin-left: 6px; padding: 0 22px; border: 0; border-radius: 999px; background: #B9A2FF; color: #1a1033; font: inherit; font-size: 14px; font-weight: 800; cursor: pointer; white-space: nowrap; }
.mmr-all.on { background: #B9A2FF; color: #1a1033; }
.mmr-people { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; margin: -2px 0 22px; }
.mmr-people:empty { display: none; }
.mmr-avs { display: flex; flex: none; }
.mmr-avs i { position: relative; overflow: hidden; width: 34px; height: 34px; border-radius: 17px; margin-left: -10px; border: 2.5px solid #12151b; display: flex; align-items: center; justify-content: center; font-style: normal; font-size: 13px; font-weight: 800; color: #fff; }
.mmr-avs i:first-child { margin-left: 0; }
.mmr-avs img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.mmr-avs .mmr-more { background: rgba(185,162,255,.22); color: #CBBBFF; font-size: 11px; }
.mmr-ptxt { min-width: 0; font-size: 13.5px; line-height: 1.3; color: rgba(255,255,255,.75); }
.mmr-ptxt b { color: #fff; font-weight: 700; }
.mmr-ptxt small { margin-left: 6px; font-size: 12.5px; color: #B9A2FF; }
.mmr-scroll { touch-action: pan-y; flex: 1; overflow-y: auto; padding: 18px 24px 100px; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; }
.mmr-head { display: flex; gap: 14px; align-items: center; }
.mmr-head img { flex: none; width: 52px; height: 52px; object-fit: contain; transform: rotate(-8deg); filter: drop-shadow(0 6px 12px rgba(0,0,0,.5)); }
.mmr-title { margin: 0 0 6px; font-size: 23px; line-height: 1.25; font-weight: 800; letter-spacing: -.01em; }
.mmr-sub { margin-bottom: 4px; font-size: 13px; color: rgba(255,255,255,.55); }
.mmr-sec { margin: 26px 0 10px; font-size: 12px; font-weight: 800; letter-spacing: .09em; text-transform: uppercase; color: rgba(255,255,255,.5); }
.mmr-h3 { margin: 24px 0 4px; font-size: 18px; line-height: 1.3; font-weight: 800; color: #fff; }
.mmr-who { display: inline-block; margin: 4px 0 6px; padding: 3px 10px; border-radius: 10px; background: rgba(185,162,255,.13); color: #B9A2FF; font-size: 12.5px; font-weight: 800; }
.mmr-take { margin: 0 0 12px; padding: 12px 14px; border-radius: 14px; background: rgba(255,255,255,.06); border-left: 3px solid #B9A2FF; font-size: 15.5px; line-height: 1.5; font-weight: 700; color: #fff; }
.mmr-card { margin: 0 0 14px; padding: 16px 16px 4px; border-radius: 20px; background: rgba(255,255,255,.045); border: 1px solid rgba(255,255,255,.07); }
.mmr-pn { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.mmr-av { flex: none; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 800; color: #fff; }
.mmr-pn b { display: block; font-size: 15px; }
.mmr-pn i { display: block; margin-top: 1px; font-style: normal; font-size: 12px; color: rgba(255,255,255,.5); }
.mmr-cq { margin: 4px 0 12px; padding-left: 12px; border-left: 2px solid #B9A2FF; font-size: 16px; line-height: 1.5; font-weight: 600; color: #fff; }
.mmr-view { margin: 2px 0 12px; font-size: 15.5px; line-height: 1.55; color: rgba(255,255,255,.9); }
.mmr-view em { font-style: normal; font-weight: 800; color: #B9A2FF; }
.mmr-voice { margin: 6px 0 14px; padding: 14px 16px; border-radius: 16px; background: rgba(255,255,255,.05); font-size: 17px; line-height: 1.5; font-style: italic; color: #fff; }
.mmr-th { margin: 0 0 10px; padding: 13px 15px; border-radius: 16px; background: rgba(185,162,255,.07); font-size: 15.5px; line-height: 1.5; color: rgba(255,255,255,.9); }
.mmr-th b { display: block; margin-bottom: 3px; font-size: 13px; color: #B9A2FF; }
.mmr-ask { margin: 4px 0 12px; padding: 18px; border-radius: 20px; background: linear-gradient(135deg, rgba(185,162,255,.16), rgba(185,162,255,.04)); font-size: 18px; line-height: 1.45; font-weight: 700; color: #fff; }
.mmr-q { margin: 0 0 12px; padding-left: 14px; border-left: 2px solid rgba(255,255,255,.25); font-size: 17px; line-height: 1.55; font-style: italic; color: #fff; }
.mmr-info { margin: 0 0 16px; padding: 12px 14px; border-radius: 16px; background: rgba(255,255,255,.06); font-size: 13px; line-height: 1.55; color: rgba(255,255,255,.75); }
.mmr-info b { color: #fff; font-weight: 700; }
.mmr-p { margin: 0 0 12px; font-size: 16px; line-height: 1.65; color: rgba(255,255,255,.88); }
.mmr-ul { margin: 4px 0 8px; padding-left: 18px; }
.mmr-ul li { margin: 6px 0; font-size: 16px; line-height: 1.6; color: rgba(255,255,255,.86); }
.mmr-ul li::marker { color: rgba(185,162,255,.7); }
.mmr-ul .mmr-ul li { font-size: 14px; color: rgba(255,255,255,.75); }
.mmr-todo { list-style: none; position: relative; margin-left: -18px !important; padding-left: 28px; }
.mmr-todo::before { content: ''; position: absolute; left: 2px; top: 4px; width: 15px; height: 15px; border-radius: 5px; border: 1.6px solid rgba(185,162,255,.7); }
.mmr-nm { font-weight: 700; color: #fff; }
.mmr-lock { position: relative; margin-top: -90px; padding-top: 90px; background: linear-gradient(180deg, rgba(18,26,36,0), rgba(18,26,36,.98) 85px); text-align: center; }
.mmr-lock p { margin: 0 0 12px; font-size: 14px; line-height: 1.45; color: rgba(255,255,255,.8); }
.mmr-btn { display: block; width: 100%; height: 50px; border: 0; border-radius: 16px; background: #B9A2FF; color: #1a1033; font: inherit; font-size: 15px; font-weight: 800; cursor: pointer; }
.mmr-item { display: flex; gap: 14px; align-items: center; width: 100%; margin: 0 0 10px; padding: 12px 14px; border: 0; border-radius: 16px; background: rgba(255,255,255,.06); color: #fff; font: inherit; text-align: left; cursor: pointer; }
.mmr-item.on { background: rgba(185,162,255,.12); box-shadow: inset 0 0 0 1.5px rgba(185,162,255,.45); }
.mmr-item .d { flex: none; width: 56px; padding: 6px 8px; border-radius: 12px; background: rgba(185,162,255,.12); text-align: center; line-height: 1.1; font-size: 12px; font-weight: 800; color: #B9A2FF; white-space: nowrap; }
.mmr-item .d b { display: block; font-size: 18px; font-weight: 800; }
.mmr-item .t { flex: 1; font-size: 14.5px; line-height: 1.35; }
.mmr-item .t small { display: block; font-size: 12px; color: rgba(255,255,255,.5); margin-top: 2px; }
`;
function ensureCss() {
    if (document.getElementById('mmrCss')) return;
    const st = document.createElement('style'); st.id = 'mmrCss'; st.textContent = STYLE; document.head.appendChild(st);
}

let overlay = null;
export async function openMmReader(id, { drag = false } = {}) {
    if (overlay) return null;
    ensureCss();
    const list = await ensureMmNotes();
    if (!list.length) return null;
    return buildReader(list, id, drag);
}

// для сторис: читалка выезжает за пальцем (свайп вверх). Заметки должны быть уже загружены (ensureMmNotes).
// Возвращает { set(p 0..1), commit(), cancel() } или null.
export function dragMmReader(id) {
    if (overlay || !state.mmNotes?.length) return null;
    ensureCss();
    return buildReader(state.mmNotes, id, true);
}

function buildReader(list, id, drag) {
    let idx = Math.max(0, list.findIndex(n => n.id === id));
    let view = 'read';
    overlay = document.createElement('div');
    overlay.className = 'mmr-overlay';
    overlay.innerHTML = `<div class="mmr-sheet" role="dialog" aria-label="саммари мастермайнда">
        <div class="cs-grab mmr-grab" aria-hidden="true"></div>
        <div class="mmr-top"><div class="k"></div><button type="button" class="mmr-ib mmr-x" aria-label="закрыть">✕</button></div>
        <div class="mmr-scroll"></div>
        <div class="mmr-dock"><button type="button" class="mmr-ib mmr-nav" data-go="1" aria-label="раньше">‹</button><div class="mmr-mid"><span class="mmr-cnt"></span><small>листай свайпом</small></div><button type="button" class="mmr-ib mmr-nav" data-go="-1" aria-label="позже">›</button><button type="button" class="mmr-all" data-v="all" aria-label="все саммари">☰ все</button></div></div>`;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    const me = overlay, sheetEl = overlay.querySelector('.mmr-sheet');
    // не вплотную к кнопкам Telegram сверху (полноэкранный режим): отступ = системная + верхняя панель Telegram + 16
    { const tw = window.Telegram?.WebApp; const inset = (tw?.safeAreaInset?.top || 0) + (tw?.contentSafeAreaInset?.top || 0); sheetEl.style.maxHeight = `calc(100dvh - ${inset + 16}px)`; }
    if (!drag) requestAnimationFrame(() => overlay.classList.add('is-on'));
    else {
        me.classList.add('mmr-drag');
        me.style.zIndex = '3600'; // поверх сторис
        me.style.pointerEvents = 'none'; // палец ведёт сторис, пока шторка выезжает
        sheetEl.style.transition = 'none';
        sheetEl.style.opacity = '1';
        sheetEl.style.transform = 'translateY(100%)';
    }
    const scroll = overlay.querySelector('.mmr-scroll');
    const draw = () => {
        const cur = list[idx];
        overlay.querySelector('.mmr-top .k').innerHTML = `${esc(dayLabel(cur.date))}${cur.place ? ` <span>· ${esc(cur.place)}</span>` : ''}`;
        overlay.querySelector('.mmr-cnt').textContent = `выпуск ${list.length - idx} из ${list.length}`;
        overlay.querySelector('[data-v]').classList.toggle('on', view === 'all');
        overlay.querySelector('[data-go="1"]').disabled = idx >= list.length - 1;
        overlay.querySelector('[data-go="-1"]').disabled = idx <= 0;
        if (view === 'all') {
            scroll.innerHTML = '<h2 class="mmr-title" style="margin-bottom:14px">все саммари</h2>' + list.map((n, i) => `<button type="button" class="mmr-item${i === idx ? ' on' : ''}" data-i="${i}"><span class="d">${(() => { const [, m, dd] = String(n.date).split('-').map(Number); return `<b>${dd}</b>${['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'][m - 1]}`; })()}</span><span class="t">${esc(n.title)}${n.place ? `<small>${esc(n.place)}</small>` : ''}</span></button>`).join('');
        } else {
            const n = list[idx];
            log(`саммари: читает ${n.date} ${n.title}`, n.locked, state.user);
            scroll.innerHTML = `<div class="mmr-head"><img src="assets/plaud-v2.webp" alt=""><div><h2 class="mmr-title">${esc(n.title)}</h2><div class="mmr-sub">саммари мастермайнда</div></div></div><div class="mmr-people" data-mmp="${esc(n.date)}"></div>`
                + render(n.body)
                + (n.locked ? `<div class="mmr-lock"><p>целиком саммари мастермайндов читают владельцы карты интеллигента</p><button type="button" class="mmr-btn" data-card>открыть с картой</button></div>` : '');
        }
        scroll.scrollTop = 0;
        // кто был на этой встрече – аватарки под заголовком
        const pp = scroll.querySelector('[data-mmp]');
        if (pp) import('./calendar.js').then(m => m.fetchGoingFromServer([pp.dataset.mmp])).then(([lst]) => {
            const ppl = (Array.isArray(lst) ? lst : []).filter(p => p && p.userId);
            if (!ppl.length || !pp.isConnected) return;
            const G = [['#f6b26b', '#e06666'], ['#6fa8dc', '#3d85c6'], ['#93c47d', '#38761d'], ['#c27ba0', '#741b47'], ['#ffd966', '#bf9000']];
            const first = n => String(n || '').trim().split(/\s+/)[0] || '';
            const shown = ppl.slice(0, 9);
            const k = ppl.length;
            pp.innerHTML = `<span class="mmr-avs">${shown.map((p, i) => `<i style="background:linear-gradient(135deg,${G[i % 5][0]},${G[i % 5][1]})">${p.photoUrl ? `<img src="${esc(p.photoUrl)}" alt="" onerror="this.remove()">` : esc((first(p.name)[0] || '?').toUpperCase())}</i>`).join('')}${k > shown.length ? `<i class="mmr-more">+${k - shown.length}</i>` : ''}</span>
                <span class="mmr-ptxt"><b>${shown.slice(0, 3).map(p => esc(first(p.name))).join(', ')}</b>${k > 3 ? ` и ещё ${k - 3}` : ''}<small>${k} ${k % 10 === 1 && k % 100 !== 11 ? 'участник' : k % 10 >= 2 && k % 10 <= 4 && (k % 100 < 12 || k % 100 > 14) ? 'участника' : 'участников'} встречи</small></span>`;
        }).catch(() => {});
    };
    draw();
    // свайп вбок по читалке (и по панели снизу) – соседний выпуск; текст едет за пальцем
    // переход как перелистывание страницы: текущая заворачивается вокруг края, новая раскрывается с другой стороны
    let flipping = false;
    const go = step => {
        const j = idx + step;
        if (view !== 'read' || j < 0 || j >= list.length || flipping) return false;
        haptic(); flipping = true;
        const out = step < 0 ? 'left' : 'right';           // вперёд (свайп влево) – уходит влево
        scroll.style.transformOrigin = out === 'left' ? '0% 50%' : '100% 50%';
        scroll.style.transition = 'transform .24s cubic-bezier(.5,0,.75,0), opacity .24s';
        scroll.style.transform = `perspective(1400px) rotateY(${out === 'left' ? 75 : -75}deg)`;
        scroll.style.opacity = '0';
        setTimeout(() => {
            idx = j; draw();
            scroll.style.transition = 'none';
            scroll.style.transformOrigin = out === 'left' ? '100% 50%' : '0% 50%';
            scroll.style.transform = `perspective(1400px) rotateY(${out === 'left' ? -75 : 75}deg)`;
            scroll.style.opacity = '0';
            requestAnimationFrame(() => requestAnimationFrame(() => {
                scroll.style.transition = 'transform .32s cubic-bezier(.2,.8,.25,1), opacity .32s';
                scroll.style.transform = ''; scroll.style.opacity = '';
                setTimeout(() => { flipping = false; scroll.style.transformOrigin = ''; }, 340);
            }));
        }, 240);
        return true;
    };
    let sw = null;
    sheetEl.addEventListener('touchstart', e => { if (e.touches.length !== 1) { sw = null; return; } const t = e.touches[0]; sw = { x: t.clientX, y: t.clientY, on: false, dx: 0 }; }, { passive: true });
    sheetEl.addEventListener('touchmove', e => {
        if (!sw) return;
        const t = e.touches[0], dx = t.clientX - sw.x, dy = t.clientY - sw.y;
        if (!sw.on) {
            if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { sw = null; return; }
            if (Math.abs(dx) < 10) return;
            sw.on = true;
        }
        if (e.cancelable) e.preventDefault();
        sw.dx = dx;
        scroll.style.transition = 'none';
        scroll.style.transform = `translateX(${dx * .35}px)`;
        scroll.style.opacity = String(1 - Math.min(.5, Math.abs(dx) / 500));
    }, { passive: false });
    const swEnd = () => {
        if (!sw) return;
        const { on, dx } = sw; sw = null;
        if (on && Math.abs(dx) > 60 && go(dx < 0 ? -1 : 1)) return;
        scroll.style.transition = 'transform .22s ease, opacity .22s ease';
        scroll.style.transform = ''; scroll.style.opacity = '';
    };
    sheetEl.addEventListener('touchend', swEnd); sheetEl.addEventListener('touchcancel', swEnd);
    overlay.addEventListener('click', async e => {
        const t = e.target.closest('[data-v]');
        if (t) { haptic(); view = view === 'all' ? 'read' : 'all'; draw(); return; }
        const g = e.target.closest('[data-go]');
        if (g) { if (view !== 'read') { const j = idx + +g.dataset.go; if (j >= 0 && j < list.length) { haptic(); idx = j; view = 'read'; draw(); } } else go(+g.dataset.go); return; }
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
    if (!drag) return null;
    const H = () => sheetEl.getBoundingClientRect().height + 20;
    return {
        set(p) {
            p = Math.max(0, Math.min(1, p));
            sheetEl.style.transform = `translateY(${((1 - p) * H()).toFixed(1)}px)`;
            me.style.background = `rgba(5,8,12,${(.62 * p).toFixed(3)})`;
        },
        commit() {
            sheetEl.style.transition = 'transform .32s cubic-bezier(.2,.9,.3,1)';
            me.style.transition = 'background .32s ease';
            requestAnimationFrame(() => { sheetEl.style.transform = 'translateY(0)'; me.style.background = ''; me.classList.add('is-on'); });
            setTimeout(() => { sheetEl.style.transition = ''; sheetEl.style.transform = ''; sheetEl.style.opacity = ''; me.classList.remove('mmr-drag'); me.style.transition = ''; me.style.zIndex = ''; }, 360);
            me.style.pointerEvents = '';
        },
        cancel() {
            sheetEl.style.transition = 'transform .25s ease';
            me.style.transition = 'background .25s ease';
            sheetEl.style.transform = `translateY(${H()}px)`; me.style.background = 'rgba(5,8,12,0)';
            setTimeout(() => { if (overlay === me) overlay = null; me.remove(); document.body.style.overflow = ''; }, 260);
        },
    };
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
