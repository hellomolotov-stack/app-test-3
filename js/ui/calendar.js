// js/ui/calendar.js – финальная версия (городские события: запись для владельцев карт, баннеры для гостей)
import { haptic, openLink, parseLinks, formatDateForDisplay, normalizeDate, mainDiv, tg, showConfetti } from '../utils.js';
import { state, saveBookingStatusToLocal } from '../state.js';
import { log, updateRegistrationInSheet, initPayment, sendBookingNotification } from '../api.js';
import {
    getDatabase,
    addParticipant,
    removeParticipant,
    setUserRegistrationStatus,
    subscribeToParticipantCount,
    loadAllParticipants,
    loadAllProfiles
} from '../firebase.js';
import { renderHome } from './home.js';
import { renderUserBookings } from './home.js';
import { renderProfiles } from './profiles.js';
import { renderNewcomerPage, renderGift, renderPassPage, renderGuestPrivileges } from './privileges.js';
import { renderSuggestEvent } from './suggest-event.js';
import { openOnboardingChat } from './onboarding-chat.js';

let currentCalendarYear = new Date().getFullYear();
let currentCalendarMonth = new Date().getMonth();

function hasHikesInMonth(year, month) {
    const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
    return state.hikesWithTitle.some(hike => hike.date.startsWith(monthStr));
}

function startSpinner(btn) {
    btn.innerHTML = '<span class="btn-spinner"></span>';
    return () => {};
}

export function renderCalendar(container) {
    const year = currentCalendarYear,
        month = currentCalendarMonth;
    const today = new Date();
    const currentYear = today.getFullYear(),
        currentMonth = today.getMonth(),
        currentDate = today.getDate();
    const monthNames = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
    const firstDay = new Date(year, month, 1).getDay();
    let startOffset = firstDay === 0 ? 6 : firstDay - 1;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const weekdays = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
    const hasPrevMonth = hasHikesInMonth(year, month - 1);
    const hasNextMonth = hasHikesInMonth(year, month + 1);

    let calendarHtml = `
        <h2 class="section-title" style="margin:0 16px 16px 16px;">🗓️ календарь событий</h2>
        <div class="calendar-item">
            <div class="calendar-header-with-legend">
                <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; margin-bottom: 8px;">
                    <h3 style="margin:0;">${monthNames[month]} ${year}</h3>
                    <div style="display: flex; gap: 8px;">
                        <button class="calendar-nav-arrow" id="prevMonthBtn" ${!hasPrevMonth ? 'disabled style="opacity:0.3; pointer-events:none;"' : ''}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
                        </button>
                        <button class="calendar-nav-arrow" id="nextMonthBtn" ${!hasNextMonth ? 'disabled style="opacity:0.3; pointer-events:none;"' : ''}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
                        </button>
                    </div>
                </div>
                <div class="calendar-legend" style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px;">
                    <span class="bottom-sheet-tag" style="background: rgba(255,255,255,0.1); color: white;">📷 отчёт</span>
                    <span class="bottom-sheet-tag" style="background: rgba(255,255,255,0.1); color: white;">🎟️ запись</span>
                    <span class="bottom-sheet-tag" style="background: rgba(255,255,255,0.1); color: white;">⛰️ готовим хайк</span>
                    <span class="bottom-sheet-tag" style="background: rgba(255,255,255,0.1); color: white;">🌧️ переносим дату</span>
                    <span class="bottom-sheet-tag" style="background: rgba(255,255,255,0.1); color: white;">🏄🏻‍♂️ готовим событие</span>
                </div>
            </div>
            <div class="weekdays">${weekdays.map(d => `<span>${d}</span>`).join('')}</div>
            <div class="calendar-grid" id="calendarGrid">
    `;

    for (let i = 0; i < startOffset; i++) calendarHtml += `<div class="calendar-day empty"></div>`;

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const isToday = year === currentYear && month === currentMonth && day === currentDate;
        const hike = state.hikesData[dateStr];
        const isHikeExist = !!hike;
        const isPlaceholder = isHikeExist && (!hike.title || hike.title.trim() === '');
        const isFullHike = isHikeExist && hike.title && hike.title.trim() !== '';
        const isPast = isFullHike && new Date(dateStr) < today;
        const isCancelled = isFullHike && hike.cancelled === true;
        const isWoman = isFullHike && hike.woman === 'yes';
        const isCity = isFullHike && (hike.city === true || hike.city === 'yes');
        const isBookClub = isFullHike && hike.book_club === true;

        let classes = 'calendar-day';
        if (isToday) classes += ' today';
        if (isFullHike) {
            classes += ' hike-day';
            if (isPast) classes += ' past';
            if (isWoman) classes += ' woman-hike';
        } else if (isPlaceholder) {
            classes += ' placeholder-day';
        }

        let innerHtml = `${day}`;
        if (isFullHike) {
            if (isPast && hasReportLink(hike))
                innerHtml += `<span class="calendar-emoji">📷</span>`;
            else if (isPast && (hike.letter_text || hike.letter_link))
                innerHtml += `<span class="calendar-emoji-letter">✉️</span>`;
            else if (hike.emoji && hike.emoji.trim() !== '')
                innerHtml += `<span class="calendar-emoji">${hike.emoji}</span>`;
            else {
                const hikeIndex = state.hikesWithTitle.findIndex(h => h.date === dateStr);
                if (!isPast && hikeIndex !== -1 && state.hikeBookingStatus[hikeIndex] === true && !isCancelled) {
                    innerHtml += `<span class="calendar-emoji">🎟️</span>`;
                    classes += ' booked-day';
                }
            }
            if (isCancelled) {
                innerHtml += `<span class="calendar-emoji">🚫</span>`;
                classes += ' cancelled-hike';
            }
        } else if (isPlaceholder) {
            if (hike.emoji && hike.emoji.trim() !== '')
                innerHtml += `<span class="calendar-emoji">${hike.emoji}</span>`;
            else
                innerHtml += `<span class="calendar-emoji">💫</span>`;
        }

        let inlineStyle = '';
        if (isBookClub && isPast) {
            inlineStyle = ' style="background: rgba(255, 241, 178, 0.3) !important; color: #000000 !important; border-radius: 50%;"';
        } else if (isBookClub) {
            inlineStyle = ' style="background: #FFF1B2 !important; color: #000000 !important; border-radius: 50%;"';
        } else if (isCity && isPast) {
            inlineStyle = ' style="background: rgba(65, 181, 237, 0.3) !important; color: #000000 !important; border-radius: 50%;"';
        } else if (isCity) {
            inlineStyle = ' style="background: #41B5ED !important; color: #ffffff !important; border-radius: 50%;"';
        } else if (isToday) {
            inlineStyle = ' style="background: #ffffff !important; color: #000000 !important;"';
        }

        if (isFullHike || isPlaceholder) {
            calendarHtml += `<div class="${classes}" data-date="${dateStr}"${inlineStyle}>${innerHtml}</div>`;
        } else {
            calendarHtml += `<div class="${classes}">${day}</div>`;
        }
    }
    calendarHtml += `</div>
            <div style="display: flex; justify-content: flex-end; padding: 8px 4px 4px 4px;">
                <button class="btn-suggest-event" id="suggestEventBtn">+ предложить событие</button>
            </div>
        </div>`;
    container.innerHTML = calendarHtml;

    const prevBtn = document.getElementById('prevMonthBtn');
    const nextBtn = document.getElementById('nextMonthBtn');
    if (prevBtn)
        prevBtn.addEventListener('click', () => {
            if (hasPrevMonth) {
                currentCalendarMonth--;
                if (currentCalendarMonth < 0) {
                    currentCalendarMonth = 11;
                    currentCalendarYear--;
                }
                renderCalendar(container);
            }
        });
    if (nextBtn)
        nextBtn.addEventListener('click', () => {
            if (hasNextMonth) {
                currentCalendarMonth++;
                if (currentCalendarMonth > 11) {
                    currentCalendarMonth = 0;
                    currentCalendarYear++;
                }
                renderCalendar(container);
            }
        });

    document.querySelectorAll('.calendar-day.hike-day').forEach(el => {
        el.addEventListener('click', () => {
            const date = el.dataset.date;
            const index = state.hikesWithTitle.findIndex(h => h.date === date);
            if (index !== -1) {
                log('выбор даты', state.userCard.status !== 'active', state.user, { date });
                showBottomSheet(index);
            }
        });
    });

    const suggestBtn = document.getElementById('suggestEventBtn');
    if (suggestBtn) {
        suggestBtn.addEventListener('click', () => {
            haptic();
            log('предложить событие', state.userCard.status !== 'active', state.user);
            const isGuest = state.userCard.status !== 'active';
            if (isGuest) {
                const overlay = document.createElement('div');
                overlay.className = 'modal-overlay';
                overlay.innerHTML = `
                    <div class="modal-content" style="max-width:360px; text-align:center;">
                        <div style="font-size:52px; margin-bottom:16px;">🔒</div>
                        <div class="modal-title" style="text-align:center; font-size:20px; color: var(--yellow);">события в городе</div>
                        <div class="modal-text" style="text-align:center; margin-top:8px;">члены клуба могут предлагать свои события</div>
                        <button class="btn btn-yellow" id="closeLockBtn" style="margin-top:16px;">понятно</button>
                    </div>
                `;
                document.body.appendChild(overlay);
                overlay.addEventListener('click', (e) => { if (e.target === overlay) { haptic(); overlay.remove(); } });
                document.getElementById('closeLockBtn').addEventListener('click', () => { haptic(); overlay.remove(); });
                return;
            }
            renderSuggestEvent();
        });
    }
}

function showLetterPopup(letterText, letterLink, isGuest) {
    const overlayPopup = document.createElement('div');
    overlayPopup.className = 'letter-popup';
    const processedText = parseLinks(letterText, isGuest);
    const chatHtml = letterLink ? `<p style="margin-top: 16px;"><a href="${letterLink}" class="dynamic-link" data-url="${letterLink}" data-guest="false" style="color: var(--yellow); text-decoration: underline;">открыть письмо в чате</a></p>` : '';
    overlayPopup.innerHTML = `
        <div class="letter-popup-content">
            <div class="letter-popup-header">
                <div class="letter-popup-title">✉️ письмо Макса после хайка</div>
                <button class="letter-popup-close">&times;</button>
            </div>
            <div class="letter-popup-text">${processedText}${chatHtml}</div>
        </div>
    `;
    document.body.appendChild(overlayPopup);
    const closeBtn = overlayPopup.querySelector('.letter-popup-close');
    closeBtn.addEventListener('click', () => { haptic(); overlayPopup.remove(); });
    overlayPopup.addEventListener('click', (e) => { if (e.target === overlayPopup) { haptic(); overlayPopup.remove(); } });
}

function getPlaceWord(count) {
    const lastDigit = count % 10;
    const lastTwoDigits = count % 100;
    if (lastDigit === 1 && lastTwoDigits !== 11) return 'место';
    if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 10 || lastTwoDigits >= 20)) return 'места';
    return 'мест';
}

function applyImageBlurAndOverlay(container, shouldBlur, imageUrl, overlayImageUrl) {
    if (!container) return;
    const img = container.querySelector('#hikeMainImage');
    const overlayImg = container.querySelector('#soldOutOverlay');
    if (shouldBlur) {
        if (img) img.style.filter = 'blur(6px)';
        if (!overlayImg) {
            const newOverlay = document.createElement('img');
            newOverlay.id = 'soldOutOverlay';
            newOverlay.src = overlayImageUrl;
            newOverlay.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 80%; max-width: 300px; z-index: 10; pointer-events: none;';
            container.style.position = 'relative';
            container.appendChild(newOverlay);
        }
    } else {
        if (img) img.style.filter = '';
        if (overlayImg) overlayImg.remove();
    }
}

// Отчёт (кнопка и значок 📷) показывается только если в report_link реальная
// ссылка, а не пустое значение/заглушка/случайный текст.
function hasReportLink(hike) {
    const v = (hike && hike.report_link != null ? String(hike.report_link) : '').trim();
    return /^(https?:\/\/|tg:\/\/|t\.me\/)/i.test(v);
}

// ==================== ЖИВАЯ КАРТА МАРШРУТА (трек по точкам) ====================
// Реестр хайков с треком. Карта рисуется только для дат из этого объекта,
// остальные хайки показывают обычную картинку маршрута как раньше.
const HIKE_TRACKS = {
    '2026-06-25': {
        lake: [44.457771, 34.088326],
        coords: [
[44.467423,34.091265],[44.467337,34.091286],[44.467209,34.091158],[44.466994,34.091029],[44.466565,34.090857],[44.466458,34.090750],[44.466307,34.090342],[44.466028,34.090192],[44.465513,34.089720],[44.465471,34.089634],[44.464612,34.088819],[44.464462,34.088626],[44.464333,34.088368],[44.464247,34.088325],[44.464183,34.088153],[44.463969,34.087939],[44.463690,34.087746],[44.463539,34.088132],[44.463389,34.088239],[44.463067,34.088325],[44.462810,34.088282],[44.462681,34.088325],[44.462531,34.088475],[44.462295,34.088518],[44.461994,34.088368],[44.461801,34.088497],[44.461780,34.088561],[44.461587,34.088776],[44.461415,34.088862],[44.461286,34.088862],[44.461093,34.088947],[44.460793,34.089183],[44.460621,34.089419],[44.460600,34.089398],[44.460342,34.089591],[44.460235,34.089505],[44.460149,34.089505],[44.460020,34.089377],[44.459677,34.089441],[44.459570,34.089377],[44.459484,34.089419],[44.459420,34.089377],[44.459312,34.089398],[44.459334,34.089312],[44.459183,34.089377],[44.458926,34.089355],[44.458883,34.089398],[44.458797,34.089334],[44.458711,34.089419],[44.458583,34.089398],[44.458411,34.089484],[44.458046,34.089398],[44.457960,34.089248],[44.458003,34.089334],[44.457896,34.088711],[44.457681,34.088776],[44.457531,34.088905],[44.457338,34.088647],[44.457338,34.088390],[44.457445,34.088111],[44.457596,34.088003],[44.457681,34.088111],[44.457596,34.087982],[44.457531,34.087960],[44.457360,34.088003],[44.457231,34.088175],[44.457166,34.088175],[44.457059,34.088261],[44.457016,34.088411],[44.456651,34.088690],[44.456523,34.089012],[44.456265,34.089462],[44.456201,34.089462],[44.456136,34.089527],[44.455879,34.089570],[44.455943,34.089570],[44.455750,34.089613],[44.455622,34.089698],[44.455407,34.089698],[44.454806,34.089505],[44.454699,34.089505],[44.454592,34.089570],[44.454613,34.089570],[44.454570,34.089656],[44.454592,34.089613],[44.454506,34.089698],[44.454270,34.089763],[44.454248,34.089698],[44.454205,34.089741],[44.454034,34.089698],[44.453841,34.089827],[44.453798,34.089763],[44.453690,34.089892],[44.453368,34.089934],[44.453175,34.089870],[44.453068,34.089784],[44.452853,34.089741],[44.452682,34.089591],[44.452617,34.089613],[44.452575,34.089570],[44.452553,34.089591],[44.452424,34.089548],[44.452446,34.089570],[44.452317,34.089441],[44.452188,34.089419],[44.452210,34.089441],[44.452124,34.089334],[44.451845,34.089141],[44.451866,34.089055],[44.451866,34.089076],[44.451781,34.088947],[44.451587,34.088883],[44.451459,34.088776],[44.451330,34.088411],[44.451223,34.088411],[44.451244,34.088432],[44.451137,34.088390],[44.451051,34.088561],[44.450987,34.088540],[44.450901,34.088647],[44.450686,34.088776],[44.450622,34.088733],[44.450536,34.088754],[44.450450,34.088840],[44.450450,34.088905],[44.450364,34.088926],[44.450343,34.089055],[44.450364,34.089012],[44.450236,34.089119],[44.449849,34.089269],[44.449699,34.089484],[44.449485,34.089548],[44.449249,34.089527],[44.449141,34.089677],[44.449120,34.089849],[44.449077,34.089913],[44.449034,34.089913],[44.448948,34.090106],[44.448498,34.090128],[44.448476,34.090213],[44.448433,34.090192],[44.448262,34.090321],[44.448176,34.090235],[44.448025,34.090299],[44.447983,34.090385],[44.447832,34.090428],[44.447789,34.090364],[44.447725,34.090449],[44.447768,34.090471],[44.447725,34.090600],[44.447639,34.090664],[44.447532,34.090664],[44.447468,34.090621],[44.447210,34.090685],[44.447038,34.090771],[44.446802,34.090492],[44.446674,34.090492],[44.446609,34.090449],[44.446652,34.090449],[44.446373,34.090643],[44.446330,34.090621],[44.446073,34.090814],[44.446008,34.090814],[44.445966,34.090900],[44.445730,34.090836],[44.445730,34.090900],[44.445601,34.090964],[44.445515,34.091265],[44.445451,34.091265],[44.445300,34.091437],[44.445215,34.091479],[44.445000,34.091458],[44.444914,34.091479],[44.444785,34.091415],[44.444592,34.091479],[44.444506,34.091372],[44.444206,34.091479],[44.444099,34.091437],[44.444013,34.091608],[44.444013,34.091565],[44.443949,34.091608],[44.443734,34.091887],[44.443605,34.091930],[44.443519,34.092123],[44.443434,34.092166],[44.443369,34.092273],[44.443283,34.092295],[44.442940,34.092617],[44.442511,34.092595],[44.442361,34.092788],[44.442404,34.092917]
        ]
    },
    '2026-07-05': {
        loop: true,
        finalCamera: { center: [34.1327185, 44.4558105], zoom: 10.79, pitch: 45, bearing: 0 },
        coords: [[44.437181,34.107451],[44.436886,34.107703],[44.436710,34.108175],[44.436507,34.108835],[44.436453,34.109200],[44.436461,34.109629],[44.436495,34.110353],[44.436633,34.110675],[44.436909,34.110836],[44.437223,34.111195],[44.437339,34.112337],[44.437336,34.112691],[44.437221,34.113029],[44.437060,34.113383],[44.436654,34.113748],[44.436206,34.114156],[44.435976,34.114714],[44.435612,34.114971],[44.435439,34.115459],[44.435236,34.116023],[44.435056,34.116543],[44.435095,34.117096],[44.435344,34.117396],[44.435723,34.117868],[44.435738,34.118286],[44.435861,34.118549],[44.436175,34.119113],[44.436356,34.119728],[44.436414,34.120345],[44.436586,34.120769],[44.437096,34.121037],[44.437264,34.121483],[44.437368,34.122191],[44.437724,34.122920],[44.437935,34.123489],[44.437927,34.123988],[44.437866,34.124814],[44.437827,34.125227],[44.437743,34.125908],[44.437984,34.126557],[44.438339,34.127561],[44.438653,34.128028],[44.438772,34.128151],[44.438830,34.127770],[44.438960,34.127775],[44.439278,34.128033],[44.439712,34.128286],[44.440199,34.128098],[44.440613,34.128141],[44.441264,34.127814],[44.441493,34.127771],[44.441551,34.127691],[44.441555,34.127573],[44.441716,34.127315],[44.442187,34.127208],[44.442439,34.127165],[44.442677,34.127095],[44.442972,34.127229],[44.443160,34.127546],[44.443397,34.127337],[44.443849,34.126993],[44.444125,34.127025],[44.444312,34.127181],[44.444630,34.127181],[44.444761,34.127047],[44.444856,34.127095],[44.444918,34.127438],[44.445059,34.127514],[44.445209,34.127401],[44.445278,34.127197],[44.445358,34.127009],[44.445764,34.126881],[44.445994,34.126934],[44.446235,34.126650],[44.446798,34.126485],[44.447139,34.126694],[44.447227,34.127107],[44.447127,34.127547],[44.447219,34.127826],[44.447537,34.128008],[44.447656,34.128180],[44.447878,34.128454],[44.448311,34.128588],[44.448614,34.128905],[44.448862,34.128975],[44.449414,34.128690],[44.449785,34.128653],[44.450057,34.128540],[44.450214,34.128218],[44.450383,34.128090],[44.450578,34.128186],[44.450708,34.128395],[44.450938,34.128132],[44.451375,34.128020],[44.451608,34.128106],[44.451762,34.128205],[44.452209,34.128652],[44.452472,34.128600],[44.452732,34.128493],[44.453230,34.128691],[44.453471,34.128675],[44.453655,34.129029],[44.453996,34.129662],[44.454195,34.130317],[44.454195,34.130537],[44.454475,34.130966],[44.454325,34.131368],[44.454406,34.131781],[44.454628,34.132366],[44.454716,34.133122],[44.454921,34.133721],[44.455154,34.133947],[44.455265,34.134199],[44.454993,34.134253],[44.455307,34.134768],[44.455296,34.135352],[44.455104,34.135599],[44.454859,34.135835],[44.454702,34.135953],[44.454893,34.136168],[44.455070,34.136227],[44.455093,34.135985],[44.455070,34.135722],[44.455246,34.135460],[44.455345,34.135320],[44.455349,34.134837],[44.455322,34.134601],[44.455112,34.134338],[44.455322,34.134258],[44.455345,34.134033],[44.455479,34.134129],[44.455621,34.134467],[44.455920,34.134907],[44.456456,34.135299],[44.456705,34.135202],[44.456953,34.135261],[44.457195,34.135658],[44.457620,34.135942],[44.457957,34.136066],[44.458367,34.136576],[44.458397,34.136769],[44.458141,34.136662],[44.458076,34.137139],[44.457865,34.137751],[44.457727,34.138019],[44.457689,34.138239],[44.457888,34.138341],[44.458642,34.138282],[44.458818,34.138749],[44.458979,34.139387],[44.459328,34.139720],[44.459756,34.139752],[44.459894,34.139569],[44.460388,34.138711],[44.460714,34.138389],[44.461135,34.138319],[44.461541,34.138556],[44.461835,34.138556],[44.462023,34.138802],[44.462280,34.139103],[44.462689,34.139451],[44.462992,34.139521],[44.463344,34.139564],[44.463715,34.139940],[44.464075,34.140471],[44.464443,34.140739],[44.464711,34.140943],[44.464883,34.141624],[44.465063,34.142166],[44.465277,34.142600],[44.465557,34.143201],[44.465865,34.143326],[44.466343,34.143551],[44.466849,34.143857],[44.467327,34.144007],[44.468006,34.144338],[44.468305,34.144360],[44.468630,34.144290],[44.469101,34.144649],[44.469549,34.145245],[44.469874,34.145803],[44.469725,34.146071],[44.469610,34.146419],[44.469522,34.146618],[44.469641,34.146951],[44.469672,34.147219],[44.469400,34.147385],[44.469185,34.147643],[44.468963,34.147718],[44.468667,34.148138],[44.468843,34.148165],[44.469268,34.148079],[44.469612,34.148186],[44.469788,34.148342],[44.470202,34.148390],[44.470366,34.148395],[44.470458,34.148562],[44.470608,34.148739],[44.470562,34.148980],[44.470642,34.149297],[44.470554,34.149495],[44.470619,34.149726],[44.470638,34.150010],[44.470585,34.150166],[44.470757,34.150155],[44.470845,34.150026],[44.470956,34.150219],[44.471308,34.150418],[44.471591,34.150498],[44.471967,34.150783],[44.472211,34.150943],[44.472491,34.151223],[44.472870,34.151448],[44.473203,34.151738],[44.473257,34.151888],[44.473303,34.152001],[44.473383,34.151920],[44.473482,34.152188],[44.473624,34.152333],[44.473815,34.152741],[44.473877,34.152972],[44.474011,34.153213],[44.474202,34.153508],[44.474424,34.153852],[44.474504,34.154104],[44.474780,34.154351],[44.475052,34.154700],[44.475354,34.154995],[44.475534,34.155145],[44.476265,34.155579],[44.476705,34.155829],[44.476885,34.156038],[44.477371,34.156462],[44.477681,34.156746],[44.478064,34.156950],[44.478492,34.157159],[44.478775,34.157363],[44.479248,34.157584],[44.479562,34.157664],[44.479899,34.157836],[44.480565,34.157986]]
    },
    '2026-07-19': {
        loop: true,
        finalCamera: { center: [33.786, 44.495], zoom: 13, pitch: 45, bearing: 0 },
        coords: [[44.493100,33.793747],[44.492947,33.793114],[44.493314,33.792416],[44.493612,33.791515],[44.494240,33.790748],[44.494646,33.790179],[44.494879,33.790314],[44.495246,33.790249],[44.495467,33.789863],[44.495872,33.787240],[44.496335,33.786505],[44.496875,33.785909],[44.497047,33.784879],[44.496974,33.783436],[44.497097,33.782476],[44.497384,33.782320],[44.498751,33.782247],[44.499469,33.781852],[44.499645,33.781492],[44.499939,33.781256],[44.500261,33.780581],[44.501034,33.780328],[44.502006,33.780361],[44.502718,33.780310],[44.503282,33.780061],[44.503485,33.780050],[44.503944,33.779782],[44.504460,33.779723],[44.504904,33.779862],[44.505325,33.779905],[44.505176,33.779674],[44.504774,33.779278],[44.504246,33.779084],[44.504101,33.779208],[44.503875,33.779245],[44.503328,33.779412],[44.502880,33.779599],[44.502421,33.779680],[44.501855,33.779522],[44.501137,33.779351],[44.500678,33.779260],[44.500341,33.779400],[44.500019,33.779737],[44.499840,33.779802],[44.499748,33.780177],[44.499465,33.780725],[44.499105,33.781288],[44.498607,33.781768],[44.497857,33.781790],[44.497271,33.781795],[44.496927,33.781945],[44.496778,33.782294],[44.496736,33.783072],[44.496690,33.783839],[44.496736,33.784231],[44.496648,33.784542],[44.496544,33.785186],[44.496139,33.785615],[44.495446,33.786049],[44.495067,33.785990],[44.494712,33.786344],[44.494343,33.786779],[44.494170,33.787836],[44.493964,33.788179],[44.493773,33.788785],[44.493489,33.789316],[44.493145,33.789960],[44.492736,33.790690],[44.492292,33.791146],[44.491752,33.791559],[44.491626,33.791639],[44.492154,33.792337],[44.492311,33.792562],[44.492494,33.792868],[44.493099,33.793744]]
    },
    '2026-06-28': {
        loop: true,
        coords: [
[44.528771,34.170637],[44.528771,34.171474],[44.528535,34.172654],[44.528256,34.173641],[44.528213,34.173920],[44.528213,34.174242],[44.528384,34.175443],[44.528470,34.175551],[44.528663,34.175551],[44.528899,34.175486],[44.529093,34.175508],[44.530037,34.175894],[44.530208,34.176323],[44.530509,34.177396],[44.530659,34.177675],[44.530680,34.177889],[44.530659,34.178104],[44.530530,34.178233],[44.530466,34.178426],[44.530573,34.178769],[44.530702,34.179027],[44.531002,34.179134],[44.530959,34.179306],[44.530659,34.179499],[44.530509,34.179456],[44.530423,34.179349],[44.530316,34.179434],[44.530037,34.179778],[44.529715,34.180379],[44.529693,34.180722],[44.529586,34.180872],[44.529200,34.181280],[44.528835,34.181409],[44.528728,34.181537],[44.527848,34.182245],[44.527591,34.182717],[44.527526,34.182975],[44.527376,34.183190],[44.527204,34.184112],[44.527247,34.184262],[44.527633,34.184327],[44.528148,34.184262],[44.528384,34.183962],[44.528578,34.183812],[44.528814,34.183747],[44.529157,34.183790],[44.529307,34.183705],[44.529736,34.183340],[44.530015,34.183232],[44.530316,34.183297],[44.530595,34.183211],[44.530766,34.183318],[44.531045,34.183426],[44.531195,34.183383],[44.531260,34.182953],[44.531174,34.181559],[44.531260,34.181473],[44.531389,34.181430],[44.531625,34.181859],[44.531989,34.182117],[44.532204,34.182181],[44.532354,34.182160],[44.532676,34.181924],[44.532612,34.181752],[44.532612,34.181602],[44.532740,34.181430],[44.532569,34.181280],[44.532697,34.181387],[44.532826,34.181409],[44.533127,34.181130],[44.533255,34.181065],[44.533470,34.180786],[44.533556,34.180743],[44.533792,34.180872],[44.534307,34.181366],[44.534843,34.182224],[44.534951,34.182267],[44.535101,34.182224],[44.535229,34.182245],[44.535337,34.182310],[44.535616,34.182717],[44.535830,34.182031],[44.536195,34.181773],[44.536860,34.181087],[44.537289,34.180915],[44.537611,34.180872],[44.537804,34.180808],[44.538191,34.180915],[44.538362,34.180786],[44.538534,34.180722],[44.538684,34.180872],[44.539006,34.180808],[44.539264,34.180421],[44.539972,34.179842],[44.540165,34.179628],[44.540122,34.179263],[44.540143,34.178362],[44.540487,34.177739],[44.540851,34.176387],[44.541002,34.176130],[44.540937,34.175787],[44.541087,34.175336],[44.541409,34.175079],[44.542182,34.174585],[44.542568,34.174285],[44.542868,34.173984],[44.543383,34.172825],[44.543298,34.172697],[44.542997,34.172847],[44.542353,34.173298],[44.541903,34.173491],[44.541452,34.173576],[44.541023,34.173813],[44.540100,34.173877],[44.539993,34.173941],[44.540057,34.174220],[44.540036,34.174370],[44.539843,34.174499],[44.539650,34.174757],[44.539392,34.175014],[44.539435,34.175164],[44.539414,34.175422],[44.539285,34.175594],[44.539371,34.176151],[44.539349,34.176473],[44.539221,34.176838],[44.539113,34.177546],[44.538920,34.177739],[44.538770,34.177804],[44.538598,34.177825],[44.537740,34.177482],[44.537483,34.177439],[44.537246,34.177482],[44.537032,34.177396],[44.536839,34.177224],[44.536624,34.177117],[44.536302,34.177289],[44.536088,34.177160],[44.535766,34.177138],[44.535616,34.177246],[44.535616,34.177460],[44.535573,34.177138],[44.535337,34.177138],[44.535187,34.177224],[44.535122,34.177160],[44.535101,34.176860],[44.534822,34.176280],[44.534564,34.176066],[44.534285,34.175658],[44.534135,34.175272],[44.534071,34.174800],[44.533985,34.174585],[44.533963,34.174177],[44.533792,34.173855],[44.532805,34.173233],[44.532461,34.172976],[44.532204,34.172310],[44.532097,34.171881],[44.531861,34.171538],[44.531625,34.171431],[44.531453,34.171452],[44.531303,34.171323],[44.531217,34.171409],[44.531217,34.171559],[44.531088,34.171645],[44.530680,34.171517],[44.530273,34.171281],[44.529865,34.171173],[44.529565,34.170937],[44.529264,34.170766],[44.529135,34.170658],[44.529007,34.170465],[44.528578,34.170379]
        ]
    }
};

let _maplibreLoading = null;
function ensureMapLibre() {
    if (window.maplibregl) return Promise.resolve();
    if (_maplibreLoading) return _maplibreLoading;
    _maplibreLoading = new Promise((resolve, reject) => {
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
        document.head.appendChild(css);
        const s = document.createElement('script');
        s.src = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
    });
    return _maplibreLoading;
}

function _hvKm(a1, o1, a2, o2) {
    const R = 6371, dLa = (a2 - a1) * Math.PI / 180, dLo = (o2 - o1) * Math.PI / 180;
    const a = Math.sin(dLa / 2) ** 2 + Math.cos(a1 * Math.PI / 180) * Math.cos(a2 * Math.PI / 180) * Math.sin(dLo / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

let currentHikeMap = null;
function initHikeMap(el, track) {
    try { if (currentHikeMap) { currentHikeMap.remove(); currentHikeMap = null; } } catch (e) {}
    const C = track.coords;
    const DEST = track.dest || track.lake;
    let line;
    if (track.loop) {
        line = C;
    } else {
        let ni = 0, best = Infinity;
        for (let k = 0; k < C.length; k++) {
            const d = _hvKm(C[k][0], C[k][1], DEST[0], DEST[1]);
            if (d < best) { best = d; ni = k; }
        }
        line = [DEST].concat(C.slice(ni));
    }
    const geojson = { type: 'Feature', geometry: { type: 'LineString', coordinates: line.map(c => [c[1], c[0]]) } };
    el.style.background = '#0A0B09';

    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (const c of line) { minLat = Math.min(minLat, c[0]); maxLat = Math.max(maxLat, c[0]); minLon = Math.min(minLon, c[1]); maxLon = Math.max(maxLon, c[1]); }
    const cLon = (minLon + maxLon) / 2, cLat = (minLat + maxLat) / 2;

    const CRIMEA = [[32.4, 44.2], [36.7, 46.3]];

    const map = new maplibregl.Map({
        container: el,
        style: {
            version: 8,
            sources: {
                'satellite': {
                    type: 'raster',
                    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
                    tileSize: 256, maxzoom: 18
                }
            },
            layers: [{
                id: 'satellite-layer', type: 'raster', source: 'satellite',
                paint: { 'raster-brightness-max': 0.7, 'raster-contrast': 0.15, 'raster-saturation': -1 }
            }]
        },
        center: [cLon, cLat + 0.06],
        zoom: 9.5,
        pitch: 0,
        bearing: 0,
        maxPitch: 85,
        maxBounds: CRIMEA,
        attributionControl: false,
        keyboard: false,
        doubleClickZoom: false
    });
    currentHikeMap = map;

    map.on('load', () => {
        map.addSource('dem', {
            type: 'raster-dem',
            tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
            tileSize: 256, encoding: 'terrarium', maxzoom: 15
        });
        map.setTerrain({ source: 'dem', exaggeration: 1.8 });
        map.setSky({ 'sky-color': '#0A0B09', 'horizon-color': '#1a1a1a', 'fog-color': '#0A0B09' });

        map.addSource('route', { type: 'geojson', data: geojson });
        map.addLayer({
            id: 'route-glow', type: 'line', source: 'route',
            paint: { 'line-color': '#D9FD19', 'line-width': 7, 'line-opacity': 0.35, 'line-blur': 5 }
        });
        map.addLayer({
            id: 'route-line', type: 'line', source: 'route',
            paint: { 'line-color': '#D9FD19', 'line-width': 3.5, 'line-opacity': 0.95 },
            layout: { 'line-cap': 'round', 'line-join': 'round' }
        });

        const mkDot = (sz) => { const d = document.createElement('div'); d.style.cssText = `width:${sz}px;height:${sz}px;background:#D9FD19;border-radius:50%;box-shadow:0 0 6px #D9FD19;`; return d; };
        if (track.loop) {
            new maplibregl.Marker({ element: mkDot(10) }).setLngLat([line[0][1], line[0][0]]).addTo(map);
            const lastPt = line[line.length - 1];
            if (_hvKm(lastPt[0], lastPt[1], line[0][0], line[0][1]) > 0.05) {
                new maplibregl.Marker({ element: mkDot(10) }).setLngLat([lastPt[1], lastPt[0]]).addTo(map);
            }
        } else {
            const startCoord = line[line.length - 1];
            new maplibregl.Marker({ element: mkDot(10) }).setLngLat([startCoord[1], startCoord[0]]).addTo(map);
            new maplibregl.Marker({ element: mkDot(12) }).setLngLat([DEST[1], DEST[0]]).addTo(map);
        }

        map.once('idle', () => {
            let target;
            if (track.finalCamera) {
                target = { ...track.finalCamera };
            } else {
                const latSpan = maxLat - minLat;
                const span = Math.max(latSpan, maxLon - minLon);
                const z = Math.min(14.5, 14.5 - Math.log2(span / 0.005));
                target = { center: [cLon, cLat - latSpan * 0.45], zoom: z, pitch: 45, bearing: 0 };
            }
            map.flyTo({ ...target, speed: 0.4, curve: 1.2, essential: true });
        });
    });

    const hint = document.createElement('div');
    hint.className = 'map-swipe-hint';
    hint.innerHTML = '<div class="mh-dot mh-l"></div><div class="mh-dot mh-r"></div><div class="mh-dot mh-cw"></div><div class="mh-dot mh-ccw"></div>';
    el.appendChild(hint);
    setTimeout(() => { hint.remove(); }, 4500);
}

let sheetCurrentIndex = 0;
let sheetScrollListener = null;
let dragStartY = 0;
let isDragging = false;
let currentUnsubscribe = null;

const avatarCache = new Map();
const CACHE_TTL = 60 * 60 * 1000;

async function getCachedAvatar(userId, photoUrl) {
    const now = Date.now();
    if (avatarCache.has(userId)) {
        const entry = avatarCache.get(userId);
        if (now - entry.timestamp < CACHE_TTL) return entry.url;
    }
    avatarCache.set(userId, { url: photoUrl, timestamp: now });
    return photoUrl;
}

// Сколько карт осталось в этом месяце — управляется из Firebase (popupConfig.cardsLeft).
// Фолбэк 9, если значение не задано.
export function getAvailableCardsCount() {
    const v = state.popupConfig?.cardsLeft;
    if (v === undefined || v === null || v === '') return 9;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? Math.max(0, n) : 9;
}

// Всего карт в месяц (popupConfig.cardsTotal, фолбэк 10)
export function getTotalCardsCount() {
    const n = parseInt(state.popupConfig?.cardsTotal, 10);
    return Number.isFinite(n) && n > 0 ? n : 10;
}

export function showBottomSheet(index) {
    if (!state.hikesWithTitle.length) return;

    const existingOverlay = document.querySelector('.bottom-sheet-overlay');
    if (existingOverlay) existingOverlay.remove();
    const existingSheetButtons = document.querySelector('.floating-sheet-buttons');
    if (existingSheetButtons) existingSheetButtons.remove();
    const existingLetter = document.querySelector('.letter-icon');
    if (existingLetter) existingLetter.remove();

    document.body.style.overflow = 'hidden';

    const overlay = document.createElement('div');
    overlay.className = 'bottom-sheet-overlay';
    overlay.innerHTML = `<div class="bottom-sheet" id="hikeBottomSheet"><div class="bottom-sheet-handle"></div><div class="bottom-sheet-content-wrapper" id="bottomSheetContent"></div></div>`;
    document.body.appendChild(overlay);

    const sheet = document.getElementById('hikeBottomSheet');
    const contentWrapper = document.getElementById('bottomSheetContent');

    const safeTop = tg?.contentSafeAreaInset?.top || 0;
    const windowHeight = window.innerHeight;
    const availableHeight = windowHeight - safeTop - 40;
    const maxHeight = availableHeight * 0.95;
    sheet.style.maxHeight = `${maxHeight}px`;
    sheet.style.height = `${maxHeight}px`;
    overlay.style.paddingTop = safeTop + 'px';

    sheetCurrentIndex = index;
    const isGuest = state.userCard.status !== 'active';
    if (currentUnsubscribe) {
        currentUnsubscribe();
        currentUnsubscribe = null;
    }

    if (Object.keys(state.profiles).length === 0) {
        loadAllProfiles().then(profiles => {
            state.profiles = profiles;
        }).catch(() => {});
    }

    function updateContent() {
        const hike = state.hikesWithTitle[sheetCurrentIndex];
        if (!hike) return;

        const isWoman = hike.woman === 'yes';
        const isCity = hike.city === true || hike.city === 'yes';
        const isBookClub = hike.book_club === true;
        let accentColor;
        if (isBookClub) {
            accentColor = '#FFF1B2';
        } else if (isCity) {
            accentColor = '#41B5ED';
        } else if (isWoman) {
            accentColor = '#FB5EB0';
        } else {
            accentColor = 'var(--yellow)';
        }

        contentWrapper.classList.remove('city-sheet', 'bookclub-sheet');
        if (isBookClub) {
            contentWrapper.classList.add('bookclub-sheet');
        } else if (isCity) {
            contentWrapper.classList.add('city-sheet');
        }

        const isCancelled = hike.cancelled === true;
        const isPlaceholder = !hike.title || hike.title.trim() === '';

        const monthNamesArr = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
        let formattedDate = '';
        if (hike.date) {
            const parts = hike.date.split('-');
            if (parts.length === 3) {
                const day = parseInt(parts[2], 10);
                const month = parseInt(parts[1], 10) - 1;
                formattedDate = `${day} ${monthNamesArr[month]}`;
            } else formattedDate = hike.date;
        }

        const hasPrev = sheetCurrentIndex > 0;
        const hasNext = sheetCurrentIndex < state.hikesWithTitle.length - 1;

        let tagsHtml = '';
        if (hike.tags && hike.tags.length > 0) {
            tagsHtml = '<div class="bottom-sheet-tags">';
            hike.tags.forEach(tag => {
                tagsHtml += `<span class="bottom-sheet-tag">${tag}</span>`;
            });
            tagsHtml += '</div>';
        }

        let sectionsHtml = '';
        if (hike.features && hike.features.trim() !== '') {
            let processedText = parseLinks(hike.features, isGuest);
            processedText = processedText.replace(/\n/g, '<br>');
            let featureTagsHtml = '';
            if (hike.feature_tags && hike.feature_tags.length > 0) {
                featureTagsHtml = '<div class="feature-tags-container">';
                const tagTextColor = accentColor === '#41B5ED' ? '#ffffff' : '#000000';
                hike.feature_tags.forEach(tag => {
                    featureTagsHtml += `<span class="feature-tag" style="background: ${accentColor} !important; color: ${tagTextColor} !important;">${tag}</span>`;
                });
                featureTagsHtml += '</div>';
            }
            sectionsHtml += `
                <div class="bottom-sheet-section">
                    <div class="bottom-sheet-section-title" style="color: ${accentColor};">особенности</div>
                    ${featureTagsHtml}
                    <div class="bottom-sheet-section-content${isWoman ? ' woman-content' : ''}">${processedText}</div>
                </div>
            `;
        }
        if (hike.access && hike.access.trim() !== '') {
            let processedText = parseLinks(hike.access, isGuest);
            processedText = processedText.replace(/\n/g, '<br>');
            sectionsHtml += `
                <div class="bottom-sheet-section">
                    <div class="bottom-sheet-section-title" style="color: ${accentColor};">как добраться</div>
                    <div class="bottom-sheet-section-content${isWoman ? ' woman-content' : ''}">${processedText}</div>
                </div>
            `;
        }
        if (hike.details && hike.details.trim() !== '') {
            let processedText = parseLinks(hike.details, isGuest);
            processedText = processedText.replace(/\n/g, '<br>');
            sectionsHtml += `
                <div class="bottom-sheet-section">
                    <div class="bottom-sheet-section-title" style="color: ${accentColor};">${isBookClub ? 'что читаем' : 'детали'}</div>
                    <div class="bottom-sheet-section-content${isWoman ? ' woman-content' : ''}">${processedText}</div>
                </div>
            `;
        }

        let shareButtonHtml = '';
        if (!isPlaceholder && !isCancelled) {
            let buttonColor, buttonTextColor, buttonText;
            if (isBookClub) {
                buttonColor = '#FFF1B2';
                buttonTextColor = '#000000';
                buttonText = 'поделиться событием';
            } else if (isCity) {
                buttonColor = '#41B5ED';
                buttonTextColor = '#ffffff';
                buttonText = 'поделиться событием';
            } else {
                buttonColor = 'var(--yellow)';
                buttonTextColor = '#000000';
                buttonText = 'поделиться хайком';
            }
            shareButtonHtml = `
                <div style="margin-top: 20px; margin-bottom: 16px;">
                    <button class="btn btn-share" id="shareEventBtn" style="background-color: ${buttonColor} !important; color: ${buttonTextColor} !important; font-weight: 800; border-radius: 40px; padding: 12px 24px; width: auto; display: block; margin: 0 auto; border: none;">🔗 ${buttonText}</button>
                </div>
            `;
        }

        const hikeDateObj = new Date(hike.date);
        const todayDate = new Date();
        todayDate.setHours(0, 0, 0, 0);
        const isPast = hikeDateObj < todayDate;

        let imageHtml = '';
        const hikeTrack = HIKE_TRACKS[hike.date];
        if ((hikeTrack || hike.image) && !isPlaceholder) {
            const participantText = isPast
                ? (isBookClub ? 'читали' : (isCity ? 'были' : 'ходили'))
                : (isBookClub ? 'читают' : (isCity ? 'будут' : 'идут'));
            const mediaHtml = hikeTrack
                ? `<div class="hike-map-box" id="hikeMapBox"></div>`
                : `<img src="${hike.image}" class="bottom-sheet-image" loading="lazy" onerror="this.style.display='none'" id="hikeMainImage">`;
            imageHtml = `
                <div class="image-container${hikeTrack ? ' has-map' : ''}">
                    ${mediaHtml}
                    <div class="participant-counter" id="participantCounter" data-hike-date="${hike.date}" style="color: ${accentColor};">
                        <span class="participant-text" style="color: ${accentColor};">${participantText}</span>
                        <span class="participant-count" id="participantCountValue" style="color: ${accentColor}; display: none;">0</span>
                        <div class="participant-avatars" id="participantAvatars"></div>
                    </div>
                </div>
            `;
        }

        let extraInfoHtml = '';
        if (!isPast && !isCancelled && !isPlaceholder) {
            extraInfoHtml = '<div class="hike-extra-info">';
            if (hike.start_time) {
                if (isCity || isBookClub) {
                    if (!isGuest) {
                        extraInfoHtml += `
                            <div class="info-row ${isWoman ? 'woman-row' : ''}" style="color: ${accentColor};">
                                <span class="info-icon" style="color: ${accentColor};">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                </span>
                                <span><strong>начало:</strong> ${hike.start_time}</span>
                            </div>
                        `;
                    } else {
                        extraInfoHtml += `
                            <div class="info-row ${isWoman ? 'woman-row' : ''}" style="color: ${accentColor};">
                                <span class="info-icon" style="color: ${accentColor};">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                </span>
                                <span><strong>начало:</strong> 🔒</span>
                            </div>
                        `;
                    }
                } else {
                    extraInfoHtml += `
                        <div class="info-row ${isWoman ? 'woman-row' : ''}" style="color: ${accentColor};">
                            <span class="info-icon" style="color: ${accentColor};">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                            </span>
                            <span><strong>начало:</strong> ${hike.start_time}</span>
                        </div>
                    `;
                }
            }
            if (hike.location_link) {
                let locationHtml = '';
                if (hike.location_link.includes('[') && hike.location_link.includes('](')) {
                    locationHtml = parseLinks(hike.location_link, isGuest);
                } else {
                    locationHtml = `<a href="#" data-url="${hike.location_link}" data-guest="${isGuest}" class="dynamic-link">открыть на карте</a>`;
                }
                const locationLabel = (isCity || isBookClub) ? 'локация' : 'точка сбора';
                extraInfoHtml += `
                    <div class="info-row ${isWoman ? 'woman-row' : ''}" style="color: ${accentColor};">
                        <span class="info-icon" style="color: ${accentColor};">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                        </span>
                        <span><strong>${locationLabel}:</strong> ${locationHtml}</span>
                    </div>
                `;
            }
            if (hike.leaders && hike.leaders.length) {
                const leaderLinks = hike.leaders.map(leaderUsername => {
                    const leaderData = state.leaders[leaderUsername];
                    const displayName = leaderData ? leaderData.name.split(' ')[0] : leaderUsername;
                    return `<a href="#" class="leader-name dynamic-link" data-leader-username="${leaderUsername}">${displayName}</a>`;
                });
                let leaderText = '';
                const leaderVerb = hike.leaders.length === 1 ? 'ведёт' : 'ведут';
                if (leaderLinks.length === 1) leaderText = leaderLinks[0];
                else if (leaderLinks.length === 2) leaderText = `${leaderLinks[0]} <span style="color: white;">и</span> ${leaderLinks[1]}`;
                else {
                    const last = leaderLinks.pop();
                    leaderText = `${leaderLinks.join(', ')} <span style="color: white;">и</span> ${last}`;
                }
                extraInfoHtml += `
                    <div class="info-row ${isWoman ? 'woman-row' : ''}" style="color: ${accentColor};">
                        <span class="info-icon" style="color: ${accentColor};">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M5 20v-2a7 7 0 0 1 14 0v2"/></svg>
                        </span>
                        <span><strong>${leaderVerb}:</strong> ${leaderText}</span>
                    </div>
                `;
            }
            extraInfoHtml += '</div>';
        }

        const prevArrow = hasPrev
            ? `<div class="bottom-sheet-nav-arrow" id="prevHike"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M15 7 L9 12 L15 17" stroke="currentColor" stroke-width="2.2"/></svg></div>`
            : '<div class="bottom-sheet-nav-arrow hidden" id="prevHike"></div>';
        const nextArrow = hasNext
            ? `<div class="bottom-sheet-nav-arrow" id="nextHike"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M9 7 L15 12 L9 17" stroke="currentColor" stroke-width="2.2"/></svg></div>`
            : '<div class="bottom-sheet-nav-arrow hidden" id="nextHike"></div>';

        let inviteButtonHtml = '';

        contentWrapper.innerHTML = `
            <div class="bottom-sheet-header-block">
                <div class="bottom-sheet-header">
                    <div class="bottom-sheet-header-left">
                        <div class="bottom-sheet-header-date" style="color: ${accentColor};">${formattedDate}</div>
                        <div class="bottom-sheet-header-title">${isPlaceholder ? 'Готовим хайк' : hike.title}</div>
                    </div>
                    <div class="bottom-sheet-nav">${prevArrow}${nextArrow}</div>
                </div>
                ${tagsHtml}
            </div>
            ${imageHtml}
            ${extraInfoHtml}
            ${sectionsHtml}
            ${shareButtonHtml}
            ${inviteButtonHtml}
        `;

        if (hikeTrack) {
            const mapBox = contentWrapper.querySelector('#hikeMapBox');
            if (mapBox) ensureMapLibre().then(() => initHikeMap(mapBox, hikeTrack)).catch(() => {});
        }

        const shareBtn = contentWrapper.querySelector('#shareEventBtn');
        if (shareBtn) {
            shareBtn.addEventListener('click', (e) => {
                e.preventDefault();
                haptic();
                const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(`https://t.me/yaltahiking_bot?startapp=hike_${hike.date}`)}`;
                if (tg && tg.openTelegramLink) {
                    tg.openTelegramLink(shareUrl);
                } else {
                    window.open(shareUrl, '_blank');
                }
                log('поделиться хайком', isGuest, state.user, { hike_date: hike.date });
            });
        }

        if (!isCancelled && !isPlaceholder) {
            const updateAvatars = async (participants, totalCount) => {
                const count = totalCount !== undefined ? totalCount : participants.length;
                const countEl = contentWrapper.querySelector('#participantCountValue');
                const avatarsEl = contentWrapper.querySelector('#participantAvatars');
                if (countEl) {
                    if (count === 0) {
                        countEl.style.display = 'inline';
                        countEl.textContent = count;
                    } else countEl.style.display = 'none';
                }
                if (avatarsEl) {
                    avatarsEl.innerHTML = '';
                    for (const p of participants.slice(0, 3)) {
                        const cachedUrl = await getCachedAvatar(p.userId, p.photoUrl);
                        const hasProfile = !!state.profiles[p.userId];
                        const img = document.createElement('img');
                        img.src = cachedUrl || '';
                        img.className = 'participant-avatar' + (hasProfile ? ' has-profile' : '');
                        img.alt = p.name || '';
                        img.title = p.name || '';
                        img.dataset.userId = p.userId;
                        img.style.cssText = `
                            width: 28px !important;
                            height: 28px !important;
                            border-radius: 50% !important;
                            object-fit: cover !important;
                            box-shadow: 0 0 0 2px rgba(255,255,255,0.3) !important;
                        `;
                        img.onerror = function () {
                            const placeholder = document.createElement('div');
                            placeholder.className = 'participant-avatar placeholder' + (hasProfile ? ' has-profile' : '');
                            placeholder.style.cssText = `
                                width: 28px !important;
                                height: 28px !important;
                                border-radius: 50% !important;
                                background-color: #40a7e3 !important;
                                display: flex !important;
                                align-items: center !important;
                                justify-content: center !important;
                                font-weight: bold !important;
                                font-size: 14px !important;
                                color: white !important;
                                text-transform: uppercase !important;
                                box-shadow: 0 0 0 2px rgba(255,255,255,0.3) !important;
                            `;
                            const initial = p.name ? p.name.charAt(0).toUpperCase() : '?';
                            placeholder.textContent = initial;
                            placeholder.dataset.userId = p.userId;
                            this.parentNode.replaceChild(placeholder, this);
                        };
                        avatarsEl.appendChild(img);
                    }
                }
                const imageContainer = contentWrapper.querySelector('.image-container');
                const isSoldOut = count >= 12;
                applyImageBlurAndOverlay(imageContainer, isSoldOut, hike.image, 'https://i.postimg.cc/zGR0SStj/ilrmdosl-2.png');
                window._participantCount = count;
                updateFloatingSheetButtons();
            };

            if (isPast) {
                loadAllParticipants(hike.date).then(updateAvatars);
            } else {
                if (currentUnsubscribe) currentUnsubscribe();
                currentUnsubscribe = subscribeToParticipantCount(hike.date, (count, participants) => {
                    updateAvatars(participants, count);
                });
            }
        }

        updateFloatingSheetButtons();

        const imageContainer = contentWrapper.querySelector('.image-container');
        const isSoldOut = (window._participantCount || 0) >= 12 && !isPast;
        applyImageBlurAndOverlay(imageContainer, isSoldOut, hike.image, 'https://i.postimg.cc/zGR0SStj/ilrmdosl-2.png');

        const participantCounterEl = document.getElementById('participantCounter');
        if (participantCounterEl) {
            participantCounterEl.removeEventListener('click', participantCounterHandler);
            participantCounterEl.addEventListener('click', participantCounterHandler);
        }

        document.getElementById('prevHike')?.addEventListener('click', e => {
            e.stopPropagation();
            if (sheetCurrentIndex > 0) {
                closeParticipantDropdown();
                closeLeaderDropdown();
                sheetCurrentIndex--;
                updateContent();
                contentWrapper.scrollTop = 0;
                haptic();
                log('предыдущий хайк', false, state.user);
            }
        });
        document.getElementById('nextHike')?.addEventListener('click', e => {
            e.stopPropagation();
            if (sheetCurrentIndex < state.hikesWithTitle.length - 1) {
                closeParticipantDropdown();
                closeLeaderDropdown();
                sheetCurrentIndex++;
                updateContent();
                contentWrapper.scrollTop = 0;
                haptic();
                log('следующий хайк', false, state.user);
            }
        });
    }

    updateContent();

    function participantCounterHandler(e) {
        e.stopPropagation();
        const hike = state.hikesWithTitle[sheetCurrentIndex];
        if (!hike) return;
        toggleParticipantDropdown(e.currentTarget, hike.date);
    }

    function removeFloatingSheetButtons() {
        const btn = document.querySelector('.floating-sheet-buttons');
        if (btn) btn.remove();
    }

    function createFloatingButtons() {
        removeFloatingSheetButtons();
        const container = document.createElement('div');
        container.className = 'floating-sheet-buttons';
        container.id = 'floatingSheetButtons';
        document.body.appendChild(container);
        updateFloatingSheetButtons();
    }
    createFloatingButtons();

    function checkScroll() {
        const container = document.querySelector('.floating-sheet-buttons');
        if (!container) return;
        const scrollTop = contentWrapper.scrollTop;
        const scrollHeight = contentWrapper.scrollHeight;
        const clientHeight = contentWrapper.clientHeight;
        const maxScroll = scrollHeight - clientHeight;
        if (maxScroll <= 0) return;
        const scrollPercentage = (scrollTop / maxScroll) * 100;
        if (scrollPercentage > 95) container.classList.add('hidden');
        else container.classList.remove('hidden');
    }

    if (sheetScrollListener) contentWrapper.removeEventListener('scroll', sheetScrollListener);
    sheetScrollListener = checkScroll;
    contentWrapper.addEventListener('scroll', sheetScrollListener);

    setTimeout(() => {
        overlay.classList.add('visible');
        sheet.classList.add('visible');
    }, 20);

    overlay.addEventListener('click', e => {
        if (e.target === overlay) closeBottomSheet();
    });

    const onTouchStart = e => {
        const target = e.target;
        const isInteractive =
            target.closest('.bottom-sheet-nav-arrow') ||
            target.closest('a') ||
            target.closest('.btn') ||
            target.closest('.swipe-track') ||
            target.closest('.hike-map-box') ||
            target.closest('.bottom-sheet-handle');
        if (isInteractive) {
            isDragging = false;
            return;
        }
        dragStartY = e.touches[0].clientY;
        isDragging = true;
        sheet.classList.add('dragging');
    };
    const onTouchMove = e => {
        if (!isDragging) return;
        if (contentWrapper.scrollTop > 0) {
            isDragging = false;
            sheet.classList.remove('dragging');
            return;
        }
        const deltaY = e.touches[0].clientY - dragStartY;
        if (deltaY > 0) {
            e.preventDefault();
            sheet.style.transform = `translateY(${deltaY}px)`;
        } else {
            isDragging = false;
            sheet.classList.remove('dragging');
        }
    };
    const onTouchEnd = e => {
        if (!isDragging) return;
        isDragging = false;
        sheet.classList.remove('dragging');
        const deltaY = e.changedTouches[0].clientY - dragStartY;
        if (deltaY > 80) closeBottomSheet();
        else sheet.style.transform = '';
    };

    sheet.addEventListener('touchstart', onTouchStart, { passive: false });
    sheet.addEventListener('touchmove', onTouchMove, { passive: false });
    sheet.addEventListener('touchend', onTouchEnd, { passive: false });
    sheet.addEventListener('touchcancel', onTouchEnd, { passive: false });

    log('детали хайка', false, state.user);
}

export function closeBottomSheet() {
    closeParticipantDropdown();
    closeLeaderDropdown();
    if (currentUnsubscribe) {
        currentUnsubscribe();
        currentUnsubscribe = null;
    }
    const overlay = document.querySelector('.bottom-sheet-overlay');
    if (overlay) {
        overlay.classList.remove('visible');
        const sheet = document.getElementById('hikeBottomSheet');
        if (sheet) sheet.classList.remove('visible');
        document.body.style.overflow = '';
        const sheetButtons = document.querySelector('.floating-sheet-buttons');
        if (sheetButtons) sheetButtons.remove();
        if (sheetScrollListener) {
            const contentWrapper = document.getElementById('bottomSheetContent');
            if (contentWrapper) contentWrapper.removeEventListener('scroll', sheetScrollListener);
            sheetScrollListener = null;
        }
        setTimeout(() => overlay.remove(), 300);
    }
}

const isTouchDevice = () => 'ontouchstart' in window || navigator.maxTouchPoints > 0;

function renderSwipeControl({ isBooked, isGuest, hike, accentColor }) {
    if (!isTouchDevice()) return null;

    const isBookClub = hike.book_club === true;
    const isCity = hike.city === true || hike.city === 'yes';
    const bookedText = isBookClub ? 'читаю' : (hike.woman === 'yes' ? 'ты записана' : 'ты записан');
    const unbookedText = isBookClub ? 'читаю' : 'иду';
    const thumbText = isBooked ? bookedText : unbookedText;

    const hintTextBooked = 'сдвинь для отмены ‹';
    const hintTextUnbooked = '› сдвинь, чтобы записаться';

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = '700 italic 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const thumbTextWidth = ctx.measureText(thumbText).width;
    const minThumbWidth = 80;
    const THUMB_PADDING = 18;
    let currentThumbWidth = isBooked ? Math.max(minThumbWidth, thumbTextWidth + THUMB_PADDING * 2) : minThumbWidth;

    const trackWidth = Math.min(400, Math.max(280, 
        (isBooked ? ctx.measureText(hintTextBooked).width : ctx.measureText(hintTextUnbooked).width) + currentThumbWidth + 64));

    const track = document.createElement('div');
    track.className = 'swipe-track';
    track.style.cssText = `
        width: ${trackWidth}px;
        margin: 0 auto;
        padding: 0 12px;
        box-sizing: border-box;
        height: 56px;
        border-radius: 40px;
        background: rgba(73, 138, 176, 0.15);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255,255,255,0.2);
        position: relative;
        overflow: hidden;
        user-select: none;
        touch-action: none;
        -webkit-user-select: none;
        pointer-events: auto;
        z-index: 20;
    `;

    const hint = document.createElement('div');
    hint.className = 'swipe-hint';
    hint.style.cssText = `
        position: absolute;
        top: 0; bottom: 0;
        display: flex; align-items: center;
        font-size: 14px; font-weight: 500;
        color: rgba(255,255,255,0.7);
        pointer-events: none;
        white-space: nowrap;
        overflow: hidden;
        z-index: 1;
    `;

    const thumb = document.createElement('div');
    thumb.className = 'swipe-thumb';
    thumb.style.cssText = `
        position: absolute;
        top: 50%; transform: translateY(-50%);
        height: 40px;
        border-radius: 40px;
        background: ${accentColor};
        display: flex; align-items: center; justify-content: center;
        font-size: 14px; font-weight: 900;
        color: #000;
        transition: left 0.2s ease-out, width 0.25s ease;
        z-index: 2;
        cursor: pointer;
        white-space: nowrap;
        overflow: hidden;
        width: ${currentThumbWidth}px;
    `;
    thumb.textContent = thumbText;
    thumb.style.fontWeight = '900';
    if (isBooked) {
        thumb.style.fontStyle = 'italic';
    } else {
        thumb.style.fontStyle = 'normal';
    }

    track.appendChild(hint);
    track.appendChild(thumb);

    let startX = 0, thumbLeft = 0, maxLeft = 0, isDown = false, completed = false;
    const THUMB_MARGIN = 8;
    const EDGE_PADDING = 30;
    const GAP_BETWEEN = 0;

    function placeHint(thumbLeftPos) {
        const trackW = track.clientWidth;
        const thumbW = thumb.offsetWidth;

        if (!isBooked) {
            const availableLeft = thumbLeftPos + thumbW + GAP_BETWEEN;
            const availableRight = trackW - EDGE_PADDING;
            const hintWidth = Math.max(0, availableRight - availableLeft);
            hint.style.left = availableLeft + 'px';
            hint.style.right = 'auto';
            hint.style.width = hintWidth + 'px';
            hint.style.justifyContent = 'flex-end';
            hint.textContent = hintTextUnbooked;
        } else {
            const availableRight = thumbLeftPos - GAP_BETWEEN;
            const availableLeft = EDGE_PADDING;
            const hintWidth = Math.max(0, availableRight - availableLeft);
            hint.style.left = availableLeft + 'px';
            hint.style.right = 'auto';
            hint.style.width = hintWidth + 'px';
            hint.style.justifyContent = 'flex-start';
            hint.textContent = hintTextBooked;
        }
    }

    function initPosition() {
        maxLeft = track.clientWidth - thumb.offsetWidth - THUMB_MARGIN;
        if (isBooked) {
            thumb.style.left = maxLeft + 'px';
            thumbLeft = maxLeft;
        } else {
            thumb.style.left = THUMB_MARGIN + 'px';
            thumbLeft = THUMB_MARGIN;
        }
        placeHint(thumbLeft);
    }
    setTimeout(initPosition, 20);

    const onStart = (clientX) => {
        if (completed) return;
        startX = clientX;
        isDown = true;
        thumb.style.transition = 'none';
        hint.style.transition = 'none';
        maxLeft = track.clientWidth - thumb.offsetWidth - THUMB_MARGIN;
        thumbLeft = parseFloat(thumb.style.left) || THUMB_MARGIN;
    };

    const onMove = (clientX) => {
        if (!isDown || completed) return;
        const delta = clientX - startX;
        let newLeft = thumbLeft + delta;
        newLeft = Math.max(THUMB_MARGIN, Math.min(newLeft, maxLeft));
        thumb.style.left = newLeft + 'px';
        placeHint(newLeft);

        if (isBooked && delta < 0) tg?.HapticFeedback?.impactOccurred('light');

        if (!isBooked && newLeft >= maxLeft * 0.95) {
            if (isGuest) {
                isDown = false;
                thumb.style.transition = 'left 0.2s ease-out';
                hint.style.transition = 'left 0.2s ease-out, width 0.2s ease-out';
                thumb.style.left = maxLeft + 'px';
                placeHint(maxLeft);
                showGuestBookingPopup(hike.date, hike.title, () => {
                    completed = false;
                    thumb.style.transition = 'left 0.3s ease-out, width 0.25s ease';
                    hint.style.transition = 'left 0.3s ease-out, width 0.3s ease-out';
                    currentThumbWidth = minThumbWidth;
                    thumb.style.width = currentThumbWidth + 'px';
                    thumb.style.left = THUMB_MARGIN + 'px';
                    thumb.textContent = unbookedText;
                    thumb.style.fontWeight = '900';
                    thumb.style.fontStyle = 'normal';
                    placeHint(THUMB_MARGIN);
                });
                return;
            }
            completed = true;
            isDown = false;
            const newText = bookedText;
            const newWidth = Math.max(minThumbWidth, ctx.measureText(newText).width + THUMB_PADDING * 2);
            currentThumbWidth = newWidth;
            thumb.style.transition = 'left 0.2s ease-out, width 0.25s ease';
            hint.style.transition = 'left 0.2s ease-out, width 0.2s ease-out';
            thumb.style.width = currentThumbWidth + 'px';
            thumb.style.left = maxLeft + 'px';
            thumb.textContent = newText;
            thumb.style.fontWeight = '900';
            thumb.style.fontStyle = 'italic';
            isBooked = true;
            placeHint(maxLeft);
            tg?.HapticFeedback?.impactOccurred('heavy');
            setTimeout(() => tg?.HapticFeedback?.impactOccurred('heavy'), 70);

            const hikeDate = hike.date;
            const hikeTitle = hike.title;
            const userId = state.user?.id;
            setUserRegistrationStatus(userId, hikeDate, true)
                .then(() => {
                    state.hikeBookingStatus[sheetCurrentIndex] = true;
                    return addParticipant(hikeDate, userId, {
                        first_name: state.user?.first_name,
                        photo_url: state.user?.photo_url,
                    });
                })
                .then(() => {
                    updateRegistrationInSheet(hikeDate, hikeTitle, 'booked', 'card_holder', state.user, true);
                    sendBookingNotification(hikeDate, hikeTitle, state.user);
                    updateFloatingSheetButtons();
                    renderUserBookings(document.getElementById('userBookingsContainer'));
                    const cal = document.getElementById('calendarContainer');
                    if (cal) renderCalendar(cal);
                    showRegistrationSuccess(hikeDate, hikeTitle);
                })
                .catch(error => {
                    console.error(error);
                    updateFloatingSheetButtons();
                });
            log('записаться', false, state.user);
        }
    };

    const onEnd = () => {
        if (!isDown) return;
        isDown = false;
        if (completed) return;

        const currentLeft = parseFloat(thumb.style.left) || THUMB_MARGIN;
        if (isBooked && currentLeft <= THUMB_MARGIN + 10) {
            const hikeDate = hike.date;
            const hikeTitle = hike.title;
            const userId = state.user?.id;
            if (isGuest) {
                removeParticipant(hikeDate, userId)
                    .then(() => {
                        delete state.hikeBookingStatus[sheetCurrentIndex];
                        saveBookingStatusToLocal();
                        updateRegistrationInSheet(hikeDate, hikeTitle, 'cancelled', '', state.user, false);
                        updateFloatingSheetButtons();
                        renderUserBookings(document.getElementById('userBookingsContainer'));
                        const cal = document.getElementById('calendarContainer');
                        if (cal) renderCalendar(cal);
                    });
            } else {
                Promise.all([removeParticipant(hikeDate, userId), setUserRegistrationStatus(userId, hikeDate, false)])
                    .then(() => {
                        delete state.hikeBookingStatus[sheetCurrentIndex];
                        updateFloatingSheetButtons();
                        updateRegistrationInSheet(hikeDate, hikeTitle, 'cancelled', '', state.user, true);
                        renderUserBookings(document.getElementById('userBookingsContainer'));
                        const cal = document.getElementById('calendarContainer');
                        if (cal) renderCalendar(cal);
                    });
            }
            return;
        }

        thumb.style.transition = 'left 0.2s ease-out, width 0.25s ease';
        hint.style.transition = 'left 0.2s ease-out, width 0.2s ease-out';
        thumb.style.width = currentThumbWidth + 'px';
        if (isBooked) {
            thumb.style.left = maxLeft + 'px';
            thumbLeft = maxLeft;
        } else {
            thumb.style.left = THUMB_MARGIN + 'px';
            thumbLeft = THUMB_MARGIN;
        }
        placeHint(thumbLeft);
    };

    track.addEventListener('touchstart', (e) => {
        e.stopPropagation();
        e.preventDefault();
        onStart(e.touches[0].clientX);
    }, { passive: false });

    track.addEventListener('touchmove', (e) => {
        e.stopPropagation();
        e.preventDefault();
        onMove(e.touches[0].clientX);
    }, { passive: false });

    track.addEventListener('touchend', (e) => {
        e.stopPropagation();
        e.preventDefault();
        onEnd();
    }, { passive: false });

    return track;
}

function updateFloatingSheetButtons() {
    const container = document.querySelector('.floating-sheet-buttons');
    if (!container) return;
    const hike = state.hikesWithTitle[sheetCurrentIndex];
    if (!hike) return;

    const isPlaceholder = !hike.title || hike.title.trim() === '';
    const isCancelled = hike.cancelled === true;
    const isCity = (hike.city === true || hike.city === 'yes');
    const isBookClub = hike.book_club === true;
    const isGuest = state.userCard.status !== 'active';
    const isPast = new Date(hike.date) < new Date().setHours(0,0,0,0);

    // Фазы по времени в день хайка:
    //   запись закрыта  — через час после старта и до 20:00
    //   хайк завершён    — после 20:00 того же дня
    let isClosedRegistration = false;
    let isCompletedToday = false;
    if (!isPast && !isCancelled && !isPlaceholder && hike.start_time) {
        const tm = String(hike.start_time).match(/(\d{1,2})[:.](\d{2})/);
        const dp = String(hike.date).split('-').map(Number);
        if (tm && dp.length === 3) {
            const startDT = new Date(dp[0], dp[1] - 1, dp[2], Number(tm[1]), Number(tm[2]));
            const closedDT = new Date(startDT.getTime() + 60 * 60 * 1000);
            const completedDT = new Date(dp[0], dp[1] - 1, dp[2], 20, 0);
            const now = new Date();
            if (now >= completedDT) isCompletedToday = true;
            else if (now >= closedDT) isClosedRegistration = true;
        }
    }

    container.innerHTML = '';

    // Городские события / книжный клуб: для гостей – баннеры, для владельцев карт – свайп-контрол
    if ((isCity || isBookClub) && !isPast && !isCancelled && !isPlaceholder) {
        if (isGuest) {
            // Баннер "вход по карте"
            const infoMsg = document.createElement('div');
            infoMsg.className = 'availability-floating';
            const bcBg = isBookClub ? 'rgba(255, 241, 178, 0.15)' : 'rgba(73, 138, 176, 0.15)';
            infoMsg.style.cssText = `margin: 0 auto 6px auto; width: auto; max-width: calc(100% - 32px); border-radius: 28px; padding: 12px 16px; background: ${bcBg}; backdrop-filter: blur(12px); text-align: center; color: #ffffff;`;
            infoMsg.textContent = 'вход по карте интеллигента';
            container.appendChild(infoMsg);

            // Блок доступных карт
            const monthNamesGen = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];
            const currentMonthName = monthNamesGen[new Date().getMonth()];
            const availableCards = getAvailableCardsCount();

            const cardsBlock = document.createElement('div');
            cardsBlock.className = 'availability-floating';
            const bcBg2 = isBookClub ? 'rgba(255, 241, 178, 0.15)' : 'rgba(73, 138, 176, 0.15)';
            const bcAccent = isBookClub ? '#FFF1B2' : '#41B5ED';
            const bcBtnText = isBookClub ? '#000000' : '#ffffff';
            cardsBlock.style.cssText = `margin: 0 auto 6px auto; width: auto; max-width: calc(100% - 32px); border-radius: 28px; padding: 12px 16px; background: ${bcBg2}; backdrop-filter: blur(12px); text-align: center;`;
            cardsBlock.innerHTML = `
                <div style="font-size: 14px; line-height: 1.4;">
                    <strong style="color: ${bcAccent}; font-style: italic; font-weight: 800;">в ${currentMonthName} доступно</strong>
                    <span style="color: #ffffff; font-style: italic;"> ${availableCards} из 10 карт</span>
                </div>
                <button id="buyCardFromFloatingBtn" class="btn" style="margin-top: 10px; background-color: ${bcAccent}; color: ${bcBtnText}; font-weight: 800; border-radius: 40px; padding: 8px 20px; border: none; width: auto; display: inline-block;">купить</button>
            `;
            const buyBtn = cardsBlock.querySelector('#buyCardFromFloatingBtn');
            if (buyBtn) {
                buyBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    haptic();
                    closeBottomSheet();
                    renderHome();
                    setTimeout(() => {
                        const cardBlock = document.getElementById('cardBlock');
                        if (cardBlock) {
                            cardBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            cardBlock.style.transition = 'box-shadow 0.5s';
                            cardBlock.style.boxShadow = '0 0 20px 5px white';
                            setTimeout(() => { cardBlock.style.boxShadow = ''; }, 2000);
                            const guestAccordion = document.querySelector('#cardAccordionGuest .dropdown-menu');
                            if (guestAccordion && !guestAccordion.classList.contains('show')) {
                                guestAccordion.classList.add('show');
                            }
                        }
                    }, 300);
                    log('купить карту', true, state.user);
                });
            }
            container.appendChild(cardsBlock);
            return;
        } else {
            // Владельцы карт – показываем интерфейс записи (свайп-контрол)
            const isWoman = hike.woman === 'yes';
            const accentColor = isBookClub ? '#FFF1B2' : (isCity ? '#41B5ED' : (isWoman ? '#FB5EB0' : 'var(--yellow)'));
            const isBooked = state.hikeBookingStatus[sheetCurrentIndex] || false;
            const swipeControl = renderSwipeControl({ isBooked, isGuest: false, hike, accentColor });
            if (swipeControl) {
                container.appendChild(swipeControl);
                container.style.pointerEvents = 'auto';
                return;
            }
            // fallback: кнопка "я иду" если свайп не поддерживается
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.gap = '12px';
            row.style.justifyContent = 'center';
            row.style.width = '100%';
            const goBtn = document.createElement('a');
            goBtn.href = '#';
            goBtn.className = 'btn btn-yellow btn-glow';
            goBtn.textContent = isBooked ? (isBookClub ? 'читаю' : 'ты записан') : (isBookClub ? 'читаю' : 'я иду');
            goBtn.style.backgroundColor = accentColor;
            goBtn.style.color = (accentColor === '#41B5ED') ? '#ffffff' : '#000000';
            goBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const userId = state.user?.id;
                const hikeDate = hike.date;
                const hikeTitle = hike.title;
                if (isBooked) {
                    Promise.all([removeParticipant(hikeDate, userId), setUserRegistrationStatus(userId, hikeDate, false)])
                        .then(() => {
                            delete state.hikeBookingStatus[sheetCurrentIndex];
                            updateRegistrationInSheet(hikeDate, hikeTitle, 'cancelled', '', state.user, true);
                            updateFloatingSheetButtons();
                            renderUserBookings(document.getElementById('userBookingsContainer'));
                            const cal = document.getElementById('calendarContainer');
                            if (cal) renderCalendar(cal);
                        });
                } else {
                    setUserRegistrationStatus(userId, hikeDate, true)
                        .then(() => {
                            state.hikeBookingStatus[sheetCurrentIndex] = true;
                            return addParticipant(hikeDate, userId, {
                                first_name: state.user?.first_name,
                                photo_url: state.user?.photo_url,
                            });
                        })
                        .then(() => {
                            updateRegistrationInSheet(hikeDate, hikeTitle, 'booked', 'card_holder', state.user, true);
                            sendBookingNotification(hikeDate, hikeTitle, state.user);
                            updateFloatingSheetButtons();
                            renderUserBookings(document.getElementById('userBookingsContainer'));
                            const cal = document.getElementById('calendarContainer');
                            if (cal) renderCalendar(cal);
                            showRegistrationSuccess(hikeDate, hikeTitle);
                        });
                }
                log('городское событие', false, state.user);
            });
            row.appendChild(goBtn);
            container.appendChild(row);
            container.style.pointerEvents = 'auto';
            return;
        }
    }

    // Далее – обычные хайки (не городские)
    if (isPlaceholder) {
        const placeholderMsg = document.createElement('div');
        placeholderMsg.className = 'availability-floating';
        placeholderMsg.style.cssText = 'margin: 0 auto 6px auto; width: auto; max-width: calc(100% - 32px); border-radius: 28px; padding: 12px 16px; background: rgba(73, 138, 176, 0.15); backdrop-filter: blur(12px); text-align: center; color: #ffffff;';
        placeholderMsg.textContent = '💫 скоро появится';
        container.appendChild(placeholderMsg);
        return;
    }

    if (isCancelled) {
        const cancelledMsg = document.createElement('div');
        cancelledMsg.className = 'availability-floating';
        cancelledMsg.style.cssText = 'margin: 0 auto 6px auto; width: auto; max-width: calc(100% - 32px); border-radius: 28px; padding: 12px 16px; background: rgba(73, 138, 176, 0.15); backdrop-filter: blur(12px); text-align: center; color: #ffffff;';
        cancelledMsg.textContent = '🚫 хайк отменён';
        container.appendChild(cancelledMsg);
        return;
    }

    const isWoman = hike.woman === 'yes';
    let accentColor;
    if (isCity) {
        accentColor = '#41B5ED';
    } else if (isWoman) {
        accentColor = '#FB5EB0';
    } else {
        accentColor = 'var(--yellow)';
    }
    const isBooked = state.hikeBookingStatus[sheetCurrentIndex] || false;
    const MAX_TICKETS = 12;
    const bookedCount = window._participantCount || 0;
    const available = Math.max(0, MAX_TICKETS - bookedCount);
    const isSoldOut = bookedCount >= MAX_TICKETS;
    const firstName = state.user?.first_name || 'друг';

    if (!isPast && !isClosedRegistration && !isCompletedToday && available === 0) {
        const availBlock = document.createElement('div');
        availBlock.className = 'availability-floating';
        availBlock.style.cssText = 'margin: 0 auto 6px auto; width: auto; max-width: calc(100% - 32px); border-radius: 28px; padding: 10px 18px; background: rgba(73, 138, 176, 0.15); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); box-shadow: 0 4px 20px rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.2); box-sizing: border-box; text-align: center;';
        availBlock.innerHTML = `
            <div style="font-size: 14px; color: rgba(255,255,255,0.9); line-height: 1.6;">
                👀 места закончились<br>
                но можно <a href="#" id="supportLinkSoldOut" style="color: var(--yellow); font-weight: 700; text-decoration: none;">написать нам</a> и договориться
            </div>
        `;
        container.appendChild(availBlock);

        setTimeout(() => {
            const supportLink = document.getElementById('supportLinkSoldOut');
            if (supportLink) {
                supportLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    haptic();
                    openOnboardingChat('support');
                });
            }
        }, 50);
    }

    if (isPast || isCompletedToday) {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.gap = '12px';
        row.style.justifyContent = 'center';
        row.style.width = '100%';

        const completedBtn = document.createElement('a');
        completedBtn.href = '#';
        completedBtn.className = 'btn btn-outline';
        completedBtn.textContent = (isCity || isBookClub) ? 'событие завершено' : 'хайк завершён';
        completedBtn.style.pointerEvents = 'none';
        row.appendChild(completedBtn);

        if (hasReportLink(hike)) {
            const reportBtn = document.createElement('a');
            reportBtn.href = '#';
            reportBtn.className = 'btn btn-yellow';
            if (isBookClub) reportBtn.style.backgroundColor = '#FFF1B2';
            else if (isCity) reportBtn.style.backgroundColor = '#41B5ED';
            else if (isWoman) reportBtn.style.backgroundColor = '#FB5EB0';
            else reportBtn.style.backgroundColor = 'var(--yellow)';
            reportBtn.style.color = isCity ? '#ffffff' : '#000000';
            reportBtn.textContent = 'отчёт';
            reportBtn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                haptic();
                const url = hike.report_link.trim();
                if (url) openLink(url, 'отчёт хайка', state.userCard.status !== 'active');
                return false;
            });
            row.appendChild(reportBtn);
        }
        container.appendChild(row);
        container.style.pointerEvents = 'none';
        return;
    }

    if (isClosedRegistration) {
        const closedMsg = document.createElement('div');
        closedMsg.className = 'availability-floating';
        closedMsg.style.cssText = 'margin: 0 auto 6px auto; width: auto; max-width: calc(100% - 32px); border-radius: 28px; padding: 12px 16px; background: rgba(73, 138, 176, 0.15); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); box-shadow: 0 4px 20px rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.2); box-sizing: border-box; text-align: center; color: #ffffff; font-weight: 600;';
        closedMsg.textContent = '⏳ запись закрыта';
        container.appendChild(closedMsg);
        container.style.pointerEvents = 'none';
        return;
    }


    // Плашку показываем только когда есть хотя бы одна запись — иначе ничего
    if (!isSoldOut && bookedCount > 0) {
        const MAX_SPOTS = 12;
        const spotsLeft = Math.max(0, MAX_SPOTS - bookedCount);
        const chipRow = document.createElement('div');
        chipRow.style.cssText = 'flex-basis: 100%; display: flex; justify-content: center; pointer-events: none;';
        const chip = document.createElement('div');
        chip.className = 'spots-counter-chip';
        if (bookedCount <= 9) {
            const w = bookedCount === 1 ? 'человек' : bookedCount < 5 ? 'человека' : 'человек';
            chip.innerHTML = `⛰️ уже идут <strong>${bookedCount}</strong> ${w}`;
        } else {
            const w = getPlaceWord(spotsLeft);
            chip.innerHTML = spotsLeft > 0
                ? `⏳ осталось <strong>${spotsLeft}</strong> ${w}`
                : '⏳ последние места разобраны';
        }
        chipRow.appendChild(chip);
        container.appendChild(chipRow);
    }

    const swipeControl = renderSwipeControl({ isBooked, isGuest, hike, accentColor });
    if (swipeControl) {
        container.appendChild(swipeControl);
        container.style.pointerEvents = 'auto';
        return;
    }

    container.style.pointerEvents = 'auto';
    if (isBooked) {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.gap = '12px';
        row.style.justifyContent = 'center';
        row.style.width = '100%';

        const cancelBtn = document.createElement('a');
        cancelBtn.href = '#';
        cancelBtn.className = 'btn btn-outline';
        cancelBtn.textContent = 'отменить';
        cancelBtn.addEventListener('click', e => {
            e.preventDefault();
            const userId = state.user?.id;
            const hikeDate = hike.date;
            const hikeTitle = hike.title;
            if (isGuest) {
                removeParticipant(hikeDate, userId)
                    .then(() => {
                        delete state.hikeBookingStatus[sheetCurrentIndex];
                        saveBookingStatusToLocal();
                        updateRegistrationInSheet(hikeDate, hikeTitle, 'cancelled', '', state.user, false);
                        updateFloatingSheetButtons();
                        renderUserBookings(document.getElementById('userBookingsContainer'));
                        const cal = document.getElementById('calendarContainer');
                        if (cal) renderCalendar(cal);
                    });
            } else {
                Promise.all([removeParticipant(hikeDate, userId), setUserRegistrationStatus(userId, hikeDate, false)])
                    .then(() => {
                        delete state.hikeBookingStatus[sheetCurrentIndex];
                        updateFloatingSheetButtons();
                        updateRegistrationInSheet(hikeDate, hikeTitle, 'cancelled', '', state.user, true);
                        renderUserBookings(document.getElementById('userBookingsContainer'));
                        const cal = document.getElementById('calendarContainer');
                        if (cal) renderCalendar(cal);
                    });
            }
            log('отменить запись', false, state.user);
        });
        row.appendChild(cancelBtn);

        const goBtn = document.createElement('a');
        goBtn.href = '#';
        goBtn.className = 'btn btn-yellow';
        goBtn.textContent = 'ты записан';
        goBtn.style.backgroundColor = accentColor;
        goBtn.style.color = accentColor === '#41B5ED' ? '#ffffff' : '#000000';
        goBtn.style.pointerEvents = 'none';
        row.appendChild(goBtn);
        container.appendChild(row);
        return;
    }

    if (isGuest) {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.gap = '12px';
        row.style.justifyContent = 'center';
        row.style.width = '100%';

        const questionBtn = document.createElement('a');
        questionBtn.href = '#';
        questionBtn.className = 'btn btn-outline';
        questionBtn.textContent = 'задать вопрос';
        questionBtn.addEventListener('click', e => {
            e.preventDefault();
            openLink('https://t.me/hellointelligent', 'написать организатору', true);
        });
        row.appendChild(questionBtn);

        const goBtn = document.createElement('a');
        goBtn.href = '#';
        goBtn.className = 'btn btn-yellow btn-glow';
        goBtn.textContent = 'иду';
        goBtn.style.fontWeight = '900';
        goBtn.style.backgroundColor = accentColor;
        goBtn.style.color = accentColor === '#41B5ED' ? '#ffffff' : '#000000';
        goBtn.addEventListener('click', e => {
            e.preventDefault();
            showGuestBookingPopup(hike.date, hike.title);
        });
        row.appendChild(goBtn);
        container.appendChild(row);
        return;
    }

    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '12px';
    row.style.justifyContent = 'center';
    row.style.width = '100%';

    const goBtn = document.createElement('a');
    goBtn.href = '#';
    goBtn.className = 'btn btn-yellow btn-glow';
    goBtn.textContent = 'иду';
    goBtn.style.fontWeight = '900';
    goBtn.style.backgroundColor = accentColor;
    goBtn.style.color = accentColor === '#41B5ED' ? '#ffffff' : '#000000';
    goBtn.addEventListener('click', e => {
        e.preventDefault();
        const userId = state.user?.id;
        const hikeDate = hike.date;
        const hikeTitle = hike.title;
        setUserRegistrationStatus(userId, hikeDate, true)
            .then(() => {
                state.hikeBookingStatus[sheetCurrentIndex] = true;
                return addParticipant(hikeDate, userId, {
                    first_name: state.user?.first_name,
                    photo_url: state.user?.photo_url,
                });
            })
            .then(() => {
                updateRegistrationInSheet(hikeDate, hikeTitle, 'booked', 'card_holder', state.user, true);
                sendBookingNotification(hikeDate, hikeTitle, state.user);
                updateFloatingSheetButtons();
                renderUserBookings(document.getElementById('userBookingsContainer'));
                const cal = document.getElementById('calendarContainer');
                if (cal) renderCalendar(cal);
                showRegistrationSuccess(hikeDate, hikeTitle);
            })
            .catch(error => {
                console.error(error);
                updateFloatingSheetButtons();
            });
        log('записаться', false, state.user);
    });
    row.appendChild(goBtn);
    container.appendChild(row);
}

// «Возвращающийся» = есть хотя бы один прошедший хайк, на который человек был записан (по Firebase).
// Серверный источник правды: админ может вернуть право на бесплатный первый хайк, удалив userRegistrations.
function hasPastBooking() {
    const regs = state._userRegs || {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Object.keys(regs).some(date => {
        if (regs[date] !== true) return false;
        const d = new Date(date);
        return !isNaN(d.getTime()) && d < today;
    });
}

export function showGuestBookingPopup(hikeDate, hikeTitle, onClose, feature = 'hike') {
    haptic();
    const config = state.popupConfig;
    const isHikeContext = feature === 'hike';

    window._bookingPopupHikeDate = hikeDate;
    window._bookingPopupHikeIndex = state.hikesWithTitle.findIndex(h => h.date === hikeDate);

    // Returning visitor = has any past hike registration
    const isReturning = hasPastBooking();

    const firstName = state.user?.first_name || '';
    const nameLower = firstName.toLowerCase();
    const isFemale = nameLower.endsWith('а') || nameLower.endsWith('я');
    const walked = isFemale ? 'ходила' : 'ходил';
    const was = isFemale ? 'была' : 'был';

    const FEATURE_TEXTS = {
        profiles: `
            <div class="bpu-text">
                <div class="bpu-line bpu-title">профили – это не тиндер</div>
                <div class="bpu-line">здесь живут анкеты людей, которые ходят с нами</div>
                <div class="bpu-line"><em>кто чем занят, что умеет, с кем стоит обсудить твою идею</em></div>
                <div class="bpu-divider"></div>
                <div class="bpu-line">публично профили не покажем. это не реклама себя в интернете. это закрытый круг деятельных личностей</div>
                <div class="bpu-line bpu-accent">с картой – ты станешь его частью и обретёшь новые связи</div>
            </div>
        `,
        mastermind: `
            <div class="bpu-text">
                <div class="bpu-line bpu-title">мастермайнды – на вершине, не в офисе</div>
                <div class="bpu-line">поднимаемся на вершину, садимся в круг и разбираем задачи друг друга</div>
                <div class="bpu-line"><em>после общего подъёма разговор идёт по-настоящему</em></div>
                <div class="bpu-divider"></div>
                <div class="bpu-line">работает с теми, кто ещё не знаком – но уже прошёл первый подъём вместе</div>
                <div class="bpu-line bpu-accent">карта – вход в этот круг и возможность читать саммари</div>
            </div>
        `,
        generic: `
            <div class="bpu-text">
                <div class="bpu-line bpu-title">эта часть клуба – для своих</div>
                <div class="bpu-line">и ещё десятки: события в городе, чат с членами клуба, привилегии у десятка партнёров в городе, безлимитный *PN, мастермайнды, профили членов клуба</div>
                <div class="bpu-line"><em>одна карта – все двери открыты</em></div>
                <div class="bpu-divider"></div>
                <div class="bpu-line">мы не продаём доступы по билетам – <em>намеренно</em></div>
                <div class="bpu-line">клуб – это единое целое, а не набор кнопок</div>
                <div class="bpu-line bpu-accent">здесь не туристы. личности</div>
            </div>
        `
    };

    const hikeReturningHtml = `
        <div class="bpu-text">
            <div class="bpu-line bpu-title">рады знакомству с тобой, ${firstName || 'друг'}</div>
            <div class="bpu-line">один хайк позади – и обычным походом это уже не назовёшь</div>
            <div class="bpu-divider"></div>
            <div class="bpu-line">мы ждём тебя в клубе</div>
            <div class="bpu-line">карта интеллигента – твой вход в закрытое окружение</div>
            <div class="bpu-line bpu-accent">здесь не туристы. личности</div>
        </div>
    `;
    const hikeNewHtml = `
        <div class="bpu-text">
            <div class="bpu-line">мы не продаём разовые билеты – <em>принципиально</em></div>
            <div class="bpu-line bpu-accent">клуб не для всех. и это честно</div>
            <div class="bpu-line">сюда идут за тишиной, горами и своими людьми – не за толпой</div>
            <div class="bpu-divider"></div>
            <div class="bpu-line">первый хайк – за наш счёт</div>
            <div class="bpu-line bpu-accent">здесь не туристы. личности</div>
        </div>
    `;

    const popupTextHtml = isHikeContext
        ? (isReturning ? hikeReturningHtml : hikeNewHtml)
        : (FEATURE_TEXTS[feature] || FEATURE_TEXTS.generic);

    let faqItemsHtml = '';
    if (state.faq && state.faq.length) {
        state.faq.forEach((item, i) => {
            faqItemsHtml += `
                <div class="booking-popup-faq-item">
                    <div class="booking-popup-faq-q" data-idx="${i}">${item.q}</div>
                    <div class="booking-popup-faq-a" id="bpfaq-a-${i}">${item.a}</div>
                </div>
            `;
        });
    }
    const faqHtml = faqItemsHtml ? `
        <div class="booking-popup-faq-toggle" id="faqToggle">
            <span>частые вопросы</span><span class="faq-toggle-arrow">↓</span>
        </div>
        <div id="faqBody" style="display:none;">${faqItemsHtml}</div>
    ` : '';

    // #2 динамический счётчик карт
    const cardsLeft = getAvailableCardsCount();
    const cardsTotal = getTotalCardsCount();
    const soldOut = cardsLeft <= 0;

    // #3 социальное доказательство (аватарки членов клуба + счётчик)
    const membersText = state.popupConfig?.membersText || '20+';
    const socialProofHtml = `
        <div class="booking-social-proof" id="bookingSocialProof">
            <div class="sp-avatars" id="spAvatars"></div>
            <div class="sp-text">нас уже <strong>${membersText}</strong> – и каждого знаем по имени</div>
        </div>`;

    // #4 превью привилегий внутри аккордеона
    const perks = (state.guestPrivileges?.club || []).filter(p => p && p.title);
    const perksPreviewHtml = perks.length ? `
        <div class="booking-perks">
            <button class="booking-perks-toggle" id="perksToggle">что даёт карта <span class="booking-perks-arrow">›</span></button>
            <div class="booking-perks-body" id="perksBody" style="display:none;">
                ${perks.slice(0, 6).map(p => `<div class="booking-perk-item">${p.title.replace(/^новое:\s*/i, '')}</div>`).join('')}
                <button class="btn btn-outline" id="allPerksBtn" style="width:100%; margin:10px 0 0;">смотреть все привилегии</button>
            </div>
        </div>` : '';

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay booking-popup-overlay';
    overlay.id = 'guestBookingPopup';
    overlay.innerHTML = `
        <div class="modal-content booking-popup-content">
            <button class="modal-close" id="closePopup">&times;</button>
            ${popupTextHtml}

            ${socialProofHtml}

            <div style="display: flex; flex-direction: column; gap: 8px; width: 100%; margin-top: 4px;">
                ${!isReturning ? (isHikeContext
                    ? `<button class="btn btn-outline" id="freeRegistrationBtn" style="width: 100%; margin: 0;">первый хайк – бесплатно 🎟️</button>`
                    : `<button class="btn btn-outline" id="pickHikeBtn" style="width: 100%; margin: 0;">выбрать первый хайк – бесплатно 🎟️</button>`
                ) : ''}
                <button class="btn btn-yellow" id="joinClubBtn" style="width: 100%; margin: 0;">${isReturning ? 'хочу карту' : 'вступить в клуб'}</button>
            </div>

            <div id="clubJoinAccordion" style="display: none; margin-top: 20px;">
                <div class="booking-popup-scarcity${soldOut ? ' booking-popup-scarcity--out' : ''}">
                    <div class="booking-popup-scarcity-num">${soldOut ? '0' : cardsLeft}</div>
                    <div class="booking-popup-scarcity-text">
                        ${soldOut
                            ? `<strong>карты на этот месяц закончились</strong><br>возвращайся в начале следующего месяца – откроем ещё ${cardsTotal}`
                            : `<strong>${cardsTotal} карт доступно в месяц</strong><br>чтобы каждый новый член клуба получил наше внимание, а не растворился в толпе<br>не шумное количество – тихое качество`}
                    </div>
                </div>

                <div class="booking-popup-what-is-card">
                    карта интеллигента – это членство в клубе. именная, с твоим счётом хайков. с ней ты не покупаешь билеты – становишься членом клуба
                </div>

                <div class="booking-popup-economy">один хайк по разовому билету стоил 1500 ₽. карта окупается к пятому. дальше каждый поход – бесплатно</div>

                <div class="booking-card-option">
                    <div class="booking-card-name">бессрочная – <span style="opacity:0.45; text-decoration:line-through; font-weight:600; margin-right:2px;">7500</span> ${config.seasonCardPrice} ₽ <span style="font-size:11px; font-weight:700; color:#000; background:var(--yellow); padding:2px 8px; border-radius:9px; vertical-align:middle; margin-left:6px;">навсегда</span></div>
                    <div class="booking-card-care">🕊 на время ЧС в Крыму бессрочная карта доступна по цене сезонной – сильное окружение сейчас самый ценный ресурс</div>
                    <div class="booking-card-desc">оплатил один раз – доступ к клубу всегда. без продлений и подписок<br>выгоднее сезонной уже на второй год – а *PN и привилегии остаются навсегда<br>*PN, все хайки, городские события, привилегии у партнёров, книжный клуб и все новые функции карты</div>
                    <button class="btn btn-yellow" id="buyPermanentCardBtn" style="width: 100%; margin: 0;">оформить навсегда</button>
                    <div class="booking-card-ticket-note">если ты оплачивал билет, но так и не успел сходить по нему – можешь приобрести карту с учётом ранее оплаченного билета. для этого напиши нам в поддержку и пришли чек билета – отправим тебе специальную ссылку для оформления карты</div>
                    <button class="btn btn-outline booking-card-support-btn" id="cardTicketSupportBtn" style="width: 100%; margin: 10px 0 0;">написать в поддержку</button>
                </div>

                <div class="booking-card-option" style="margin-top: 12px;">
                    <div class="booking-card-name">сезонная – ${config.seasonCardPrice} ₽</div>
                    <div class="booking-card-desc">попробовать клуб на сезон – все привилегии до конца 2026, потом продление</div>
                    <button class="btn btn-outline" id="buySeasonCardBtn" style="width: 100%; margin: 0;">взять на сезон</button>
                </div>

                <div class="booking-popup-reassurance">🔒 оформление через Robokassa займёт минуту – карта появится в приложении сразу после оплаты. платёж защищён</div>

                ${perksPreviewHtml}

                ${faqHtml}
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    // Отступ под системные кнопки Telegram (fullscreen) – чтобы контент не заезжал под них
    const tgw = window.Telegram?.WebApp;
    const topInset = (tgw?.safeAreaInset?.top || 0) + (tgw?.contentSafeAreaInset?.top || 0);
    const bottomInset = (tgw?.safeAreaInset?.bottom || 0) + (tgw?.contentSafeAreaInset?.bottom || 0);
    overlay.style.paddingTop = Math.max(topInset + 12, 64) + 'px';
    const _content = overlay.querySelector('.booking-popup-content');
    if (_content) _content.style.maxHeight = `calc(100dvh - ${Math.max(topInset + 12, 64) + bottomInset + 24}px)`;

    const closePopup = () => {
        if (overlay && overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }
        if (onClose) onClose();
    };

    document.getElementById('closePopup').addEventListener('click', () => {
        haptic();
        closePopup();
    });

    // #3 подгружаем аватарки членов клуба (лениво, не блокируя показ попапа)
    (async () => {
        try {
            if (!state.profiles || !Object.keys(state.profiles).length) {
                state.profiles = await loadAllProfiles();
            }
            const arr = Object.values(state.profiles || {}).filter(p => p && (p.avatarUrl || p.photoUrl));
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
            const picks = arr.slice(0, 3);
            const el = document.getElementById('spAvatars');
            if (el && picks.length) {
                el.innerHTML = picks.map(p => `<img src="${p.avatarUrl || p.photoUrl}" class="sp-avatar" onerror="this.remove()">`).join('');
            } else {
                document.getElementById('bookingSocialProof')?.classList.add('sp--noavatars');
            }
        } catch (_) {
            document.getElementById('bookingSocialProof')?.classList.add('sp--noavatars');
        }
    })();

    // #4 превью привилегий: разворот + переход к полному списку
    document.getElementById('perksToggle')?.addEventListener('click', () => {
        haptic();
        const body = document.getElementById('perksBody');
        const arrow = document.querySelector('#perksToggle .booking-perks-arrow');
        if (!body) return;
        const opening = body.style.display === 'none';
        body.style.display = opening ? 'block' : 'none';
        if (arrow) arrow.style.transform = opening ? 'rotate(90deg)' : '';
    });
    document.getElementById('allPerksBtn')?.addEventListener('click', () => {
        haptic();
        closePopup();
        closeBottomSheet();
        log('все привилегии из попапа', true, state.user);
        setTimeout(() => renderGuestPrivileges(true), 150);
    });

    overlay.addEventListener('click', e => {
        if (e.target === overlay) {
            haptic();
            closePopup();
        }
    });

    document.getElementById('joinClubBtn').addEventListener('click', (e) => {
        e.preventDefault();
        haptic();
        const btn = e.currentTarget;
        const accordion = document.getElementById('clubJoinAccordion');
        if (!accordion) return;
        const opening = accordion.style.display === 'none';
        accordion.style.display = opening ? 'block' : 'none';
        // при раскрытии гасим акцент кнопки – фокус уходит на «оформить»
        btn.classList.toggle('btn-yellow', !opening);
        btn.classList.toggle('btn-outline', opening);
        if (opening) {
            const content = overlay.querySelector('.booking-popup-content');
            if (content) setTimeout(() => {
                content.scrollTo({ top: accordion.offsetTop - 16, behavior: 'smooth' });
            }, 60);
        }
        log('вступить в клуб', true, state.user);
    });

    // FAQ section toggle
    overlay.addEventListener('click', e => {
        const toggle = e.target.closest('#faqToggle');
        if (toggle) {
            const body = document.getElementById('faqBody');
            const arrow = toggle.querySelector('.faq-toggle-arrow');
            if (body) {
                const isOpen = body.style.display !== 'none';
                body.style.display = isOpen ? 'none' : 'block';
                if (arrow) arrow.textContent = isOpen ? '↓' : '↑';
            }
            return;
        }
        // FAQ item toggle
        const q = e.target.closest('.booking-popup-faq-q');
        if (!q) return;
        const idx = q.dataset.idx;
        const answer = document.getElementById(`bpfaq-a-${idx}`);
        if (answer) answer.classList.toggle('open');
    });

    if (!isReturning && !isHikeContext) {
        document.getElementById('pickHikeBtn')?.addEventListener('click', e => {
            e.preventDefault();
            haptic();
            closePopup();
            try { showHikePickerSheet(); } catch (_) {}
            log('выбрать хайк из попапа фичи', true, state.user, { feature });
        });
    }

    if (!isReturning && isHikeContext) {
        document.getElementById('freeRegistrationBtn').addEventListener('click', e => {
            e.preventDefault();
            if (e.target.dataset.processing === 'true') return;
            e.target.dataset.processing = 'true';

            haptic();
            tg?.HapticFeedback?.impactOccurred('heavy');
            setTimeout(() => tg?.HapticFeedback?.impactOccurred('heavy'), 70);

            const userId = state.user?.id;
            addParticipant(hikeDate, userId, {
                first_name: state.user?.first_name,
                photo_url: state.user?.photo_url,
            })
                .then(() => setUserRegistrationStatus(userId, hikeDate, true))
                .then(() => {
                    const hikeIndex = state.hikesWithTitle.findIndex(h => h.date === hikeDate);
                    if (hikeIndex !== -1) state.hikeBookingStatus[hikeIndex] = true;
                    if (state.userCard.status !== 'active') saveBookingStatusToLocal();
                    updateFloatingSheetButtons();
                    renderUserBookings(document.getElementById('userBookingsContainer'));
                    const calendarContainer = document.getElementById('calendarContainer');
                    if (calendarContainer) renderCalendar(calendarContainer);
                    updateRegistrationInSheet(hikeDate, hikeTitle, 'booked', 'free_first', state.user, false);
                    sendBookingNotification(hikeDate, hikeTitle, state.user);
                    closePopup();
                    showRegistrationSuccess(hikeDate, hikeTitle);
                })
                .catch(error => {
                    console.error(error);
                    alert('Ошибка при регистрации. Попробуйте ещё раз.');
                });

            log('первый хайк бесплатно', true, state.user);
        });
    }

    document.getElementById('buySeasonCardBtn')?.addEventListener('click', async e => {
        e.preventDefault();
        const btn = e.target;
        if (btn.dataset.processing === 'true') return;
        btn.dataset.processing = 'true';
        const origText = btn.textContent;
        log('клик сезонная карта', true, state.user, { hike_date: hikeDate });
        const stopSpinner = startSpinner(btn);
        try {
            const { url } = await initPayment({
                userId: state.user?.id,
                firstName: state.user?.first_name,
                lastName: state.user?.last_name,
                username: state.user?.username,
                hikeDate, hikeTitle, cardType: 'season'
            });
            stopSpinner();
            closePopup();
            localStorage.setItem('pending_reg_celebration', JSON.stringify({ hikeDate, hikeTitle }));
            openLink(url, 'оплата сезонной карты', true);
        } catch (err) {
            stopSpinner();
            console.error('initPayment error:', err);
            btn.textContent = origText;
            btn.dataset.processing = 'false';
            alert('Не удалось открыть оплату. Проверь соединение и попробуй ещё раз.');
        }
    });

    document.getElementById('buyPermanentCardBtn')?.addEventListener('click', async e => {
        e.preventDefault();
        const btn = e.target;
        if (btn.dataset.processing === 'true') return;
        btn.dataset.processing = 'true';
        const origText = btn.textContent;
        log('клик бессрочная карта', true, state.user, { hike_date: hikeDate });
        const stopSpinner = startSpinner(btn);
        try {
            // На время ЧС бессрочная карта оформляется по цене и через оплату сезонной
            const { url } = await initPayment({
                userId: state.user?.id,
                firstName: state.user?.first_name,
                lastName: state.user?.last_name,
                username: state.user?.username,
                hikeDate, hikeTitle, cardType: 'season'
            });
            stopSpinner();
            closePopup();
            localStorage.setItem('pending_reg_celebration', JSON.stringify({ hikeDate, hikeTitle }));
            openLink(url, 'оплата бессрочной карты', true);
        } catch (err) {
            stopSpinner();
            console.error('initPayment error:', err);
            btn.textContent = origText;
            btn.dataset.processing = 'false';
            alert('Не удалось открыть оплату. Проверь соединение и попробуй ещё раз.');
        }
    });

    document.getElementById('cardTicketSupportBtn')?.addEventListener('click', e => {
        e.preventDefault();
        haptic();
        log('зачёт билета — написать в поддержку', true, state.user, { hike_date: hikeDate });
        openLink('https://t.me/hellointelligent', 'поддержка зачёт билета', true);
    });
}

let currentDropdownHikeDate = null;
export function closeParticipantDropdown() {
    const existing = document.querySelector('.participant-dropdown.show');
    if (existing) {
        existing.remove();
        currentDropdownHikeDate = null;
    }
}

export async function toggleParticipantDropdown(counterElement, hikeDate) {
    const existing = document.querySelector('.participant-dropdown.show');
    if (existing && currentDropdownHikeDate === hikeDate) {
        closeParticipantDropdown();
        return;
    }
    closeParticipantDropdown();
    haptic();

    if (Object.keys(state.profiles).length === 0) {
        try {
            const profiles = await loadAllProfiles();
            state.profiles = profiles;
        } catch (e) {
            console.error('Failed to load profiles', e);
        }
    }

    const participants = await loadAllParticipants(hikeDate);
    const dropdown = document.createElement('div');
    dropdown.className = 'participant-dropdown';
    dropdown.style.maxHeight = '250px';
    dropdown.style.overflowY = 'auto';

    dropdown.addEventListener('wheel', (e) => e.stopPropagation());
    dropdown.addEventListener('touchstart', (e) => e.stopPropagation());
    dropdown.addEventListener('touchmove', (e) => e.stopPropagation());

    if (participants.length === 0) {
        dropdown.innerHTML = '<div class="participant-dropdown-item" style="justify-content:center;">Пока никого нет</div>';
    } else {
        participants.forEach(p => {
            const name = p.name || 'Участник';
            const hasProfile = !!state.profiles[p.userId];
            const item = document.createElement('div');
            item.className = 'participant-dropdown-item';
            item.dataset.userId = p.userId;
            if (hasProfile) {
                item.classList.add('clickable-profile');
                item.style.cursor = 'pointer';
            }

            if (p.photoUrl) {
                item.innerHTML = `<img src="${p.photoUrl}" class="participant-dropdown-avatar${hasProfile ? ' has-profile' : ''}" alt="${name}" onerror="this.style.display='none'; this.parentNode.innerHTML='<div class=\'participant-dropdown-avatar placeholder${hasProfile ? ' has-profile' : ''}\'>${name.charAt(0).toUpperCase()}</div>';">`;
            } else {
                item.innerHTML = `<div class="participant-dropdown-avatar placeholder${hasProfile ? ' has-profile' : ''}">${name.charAt(0).toUpperCase()}</div>`;
            }
            const nameSpan = document.createElement('span');
            nameSpan.className = 'participant-dropdown-name';
            nameSpan.textContent = name;
            item.appendChild(nameSpan);

            if (hasProfile) {
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    log('профиль участника из списка', false, state.user);
                    closeParticipantDropdown();
                    closeBottomSheet();
                    state.pendingProfileClick = {
                        userId: p.userId,
                        name: name,
                        photoUrl: p.photoUrl || null
                    };
                    renderProfiles();
                    setTimeout(() => {
                        const profileCard = document.querySelector(`.profile-card[data-user-id="${p.userId}"]`);
                        if (profileCard) {
                            profileCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            profileCard.classList.add('highlight-pulse');
                            setTimeout(() => profileCard.classList.remove('highlight-pulse'), 2000);
                        }
                    }, 500);
                });
            }

            dropdown.appendChild(item);
        });
    }

    const container = counterElement.closest('.bottom-sheet-content-wrapper') || document.body;
    const containerRect = container.getBoundingClientRect();
    const elementRect = counterElement.getBoundingClientRect();
    const top = elementRect.bottom - containerRect.top + container.scrollTop;
    const right = containerRect.right - elementRect.right;

    dropdown.style.position = 'absolute';
    dropdown.style.top = top + 'px';
    dropdown.style.right = right + 'px';
    dropdown.style.width = counterElement.offsetWidth + 'px';
    dropdown.style.zIndex = '1001';
    container.appendChild(dropdown);

    setTimeout(() => dropdown.classList.add('show'), 10);
    currentDropdownHikeDate = hikeDate;

    const closeHandler = e => {
        if (!dropdown.contains(e.target) && e.target !== counterElement) {
            closeParticipantDropdown();
            document.removeEventListener('click', closeHandler);
        }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 0);
    log('участники', state.userCard.status !== 'active', state.user);
}

let currentLeaderDropdown = null;
export function closeLeaderDropdown() {
    if (currentLeaderDropdown) {
        currentLeaderDropdown.remove();
        currentLeaderDropdown = null;
    }
}

export function showLeaderDropdown(leaderElement, leaderData) {
    closeLeaderDropdown();
    const dropdown = document.createElement('div');
    dropdown.className = 'participant-dropdown';
    dropdown.style.width = '300px';
    dropdown.style.position = 'fixed';
    dropdown.style.top = '50%';
    dropdown.style.left = '50%';
    dropdown.style.transform = 'translate(-50%, -50%)';
    dropdown.style.zIndex = '9999';
    dropdown.style.backgroundColor = 'rgba(0,0,0,0.9)';
    dropdown.style.border = '1px solid rgba(255,255,255,0.2)';
    dropdown.style.borderRadius = '28px';
    dropdown.style.padding = '20px 0 12px 0';

    const photoUrl = leaderData.username ? `https://t.me/i/userpic/320/${leaderData.username}.jpg` : null;
    const avatarHtml = photoUrl
        ? `<img src="${photoUrl}" class="participant-dropdown-avatar" alt="${leaderData.name}" onerror="this.style.display='none'; this.parentNode.innerHTML='<div class=\'participant-dropdown-avatar placeholder\'>${leaderData.name.charAt(0).toUpperCase()}</div>';">`
        : `<div class="participant-dropdown-avatar placeholder">${leaderData.name.charAt(0).toUpperCase()}</div>`;

    const contactHtml = leaderData.username
        ? `<a href="#" data-url="https://t.me/${leaderData.username}" data-guest="false" class="dynamic-link" style="color: var(--yellow); text-decoration: none;">@${leaderData.username}</a>`
        : '';

    dropdown.innerHTML = `
        <div style="position: relative; padding: 0 20px;"><button class="leader-close-btn" style="position: absolute; top: -12px; right: 12px; background: none; border: none; color: #aaa; font-size: 28px; cursor: pointer; z-index: 10000; line-height: 1;">&times;</button></div>
        <div style="display: flex; flex-direction: column; gap: 12px; padding: 0 20px 16px;">
            <div style="display: flex; align-items: center; gap: 12px;">${avatarHtml}<span style="font-weight: 600; color: white;">${leaderData.name}</span></div>
            <div style="font-size: 14px; color: rgba(255,255,255,0.9);">${leaderData.bio || ''}</div>
            <div style="font-size: 14px;">${contactHtml}</div>
        </div>
    `;
    document.body.appendChild(dropdown);
    setTimeout(() => dropdown.classList.add('show'), 10);

    const closeBtn = dropdown.querySelector('.leader-close-btn');
    if (closeBtn)
        closeBtn.addEventListener('click', e => {
            e.stopPropagation();
            closeLeaderDropdown();
        });

    currentLeaderDropdown = dropdown;
    const closeHandler = e => {
        if (!dropdown.contains(e.target) && e.target !== leaderElement) {
            closeLeaderDropdown();
            document.removeEventListener('click', closeHandler);
        }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 0);
}

// ==================== ЭКРАН ПОСЛЕ РЕГИСТРАЦИИ ====================
export function showRegistrationSuccess(hikeDate, hikeTitle) {
    const hikeObj = state.hikesWithTitle.find(h => h.date === hikeDate);
    if (hikeObj && (hikeObj.city === true || hikeObj.book_club === true)) return;

    const isReturning = hasPastBooking();
    const hasCard = state.userCard.status === 'active';
    const isExperienced = isReturning || hasCard;
    const formattedDate = formatDateForDisplay(hikeDate);

    const chatText = isExperienced
        ? 'напомним – там обычно договариваются о такси и отвечают на вопросы'
        : 'там договариваются о совместном такси и задают вопросы про маршрут';
    const chatBtn = isExperienced ? 'открыть чат' : 'вступить в чат';
    const packText = isExperienced
        ? 'на всякий случай – вода, перекус, удобная обувь, головной убор, санскрин'
        : 'вода 1.5л, перекус, удобная обувь с закрытым носком, санскрин, головной убор';

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay reg-success-overlay';
    overlay.innerHTML = `
        <div class="modal-content reg-success-content">
            <div class="reg-success-emoji">🎉</div>
            <div class="reg-success-title">ты в деле!</div>
            <div class="reg-success-subtitle" id="regSuccessSubtitle">«${hikeTitle}» – ${formattedDate}</div>
            <div class="reg-success-cards">
                <div class="reg-success-card">
                    <div class="reg-success-card-icon">💬</div>
                    <div class="reg-success-card-text">${chatText}</div>
                    <button class="reg-success-card-btn" id="regChatBtn">${chatBtn}</button>
                </div>
                <div class="reg-success-card">
                    <div class="reg-success-card-icon">🎒</div>
                    <div class="reg-success-card-text" id="regPackText">${packText}</div>
                    <button class="reg-success-card-btn" id="regPackBtn">показать список</button>
                </div>
                <div class="reg-success-card">
                    <div class="reg-success-card-icon">🌤</div>
                    <div class="reg-success-card-text">погода на дату хайка</div>
                    <button class="reg-success-card-btn" id="regWeatherBtn">открыть</button>
                </div>
            </div>
            <div class="reg-success-phone">обязательно запиши (или сделай скрин) телефон организатора на случай, если пропадёт интернет: <b style="white-space:nowrap">+7 (978) 549 09 74 Максим</b></div>
            <button class="btn btn-outline reg-success-close-btn" id="regSuccessCloseBtn">закрыть</button>
        </div>
    `;
    document.body.appendChild(overlay);
    showConfetti();
    haptic();
    tg?.HapticFeedback?.notificationOccurred?.('success');

    loadAllParticipants(hikeDate).then(pts => {
        const el = document.getElementById('regSuccessSubtitle');
        if (el && pts.length > 0) {
            el.textContent = `ты ${pts.length}-й участник «${hikeTitle}» – ${formattedDate}`;
        }
    }).catch(() => {});

    document.getElementById('regChatBtn')?.addEventListener('click', () => {
        haptic();
        openLink('https://t.me/yaltahikingchat', 'чат хайка из успешной регистрации', false);
    });

    let packExpanded = false;
    document.getElementById('regPackBtn')?.addEventListener('click', () => {
        haptic();
        if (packExpanded) return;
        packExpanded = true;
        const textEl = document.getElementById('regPackText');
        const btn = document.getElementById('regPackBtn');
        if (textEl) textEl.innerHTML = `<div class="reg-packlist">
            <div>✅ вода 1.5л</div>
            <div>✅ перекус</div>
            <div>✅ удобная обувь с закрытым носком</div>
            <div>✅ солнцезащитный крем</div>
            <div>✅ головной убор</div>
        </div>`;
        if (btn) btn.style.display = 'none';
    });

    document.getElementById('regWeatherBtn')?.addEventListener('click', () => {
        haptic();
        openLink('https://yandex.ru/pogoda/yalta', 'погода из успешной регистрации', false);
    });

    document.getElementById('regSuccessCloseBtn')?.addEventListener('click', () => {
        haptic();
        overlay.remove();
    });
    overlay.addEventListener('click', e => {
        if (e.target === overlay) { haptic(); overlay.remove(); }
    });
}

// ==================== ВЫБОР ХАЙКА (для гостей без карты) ====================
export function showHikePickerSheet() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcoming = (state.hikesWithTitle || [])
        .filter(h => h.date && !h.cancelled && h.city !== true && h.city !== 'yes' && h.book_club !== true && new Date(h.date) >= today)
        .slice(0, 6);
    if (!upcoming.length) return;

    const pickerOverlay = document.createElement('div');
    pickerOverlay.className = 'bottom-sheet-overlay';
    pickerOverlay.innerHTML = `
        <div class="bottom-sheet hike-picker-sheet">
            <div class="bottom-sheet-handle"></div>
            <div class="hike-slider hike-picker-slider">
                ${upcoming.map(h => `
                    <div class="hike-slide" data-date="${h.date}" data-title="${(h.title || '').replace(/"/g, '&quot;')}">
                        <div class="hike-slide-image-wrap">
                            ${h.image ? `<img src="${h.image}" class="hike-slide-img" alt="" onerror="this.style.display='none'">` : ''}
                            <div class="hike-slide-overlay"></div>
                            <div class="hike-slide-info">
                                <div class="hike-slide-date">${formatDateForDisplay(h.date)}</div>
                                <div class="hike-slide-title">${h.title}</div>
                            </div>
                        </div>
                        <div class="hike-slide-footer">
                            <button class="btn btn-yellow hike-slide-reg-btn">записаться</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    document.body.appendChild(pickerOverlay);
    requestAnimationFrame(() => {
        pickerOverlay.classList.add('visible');
        pickerOverlay.querySelector('.bottom-sheet')?.classList.add('visible');
    });
    pickerOverlay.addEventListener('click', e => {
        if (e.target.closest('.hike-slide-reg-btn')) {
            const slide = e.target.closest('.hike-slide');
            pickerOverlay.classList.remove('visible');
            pickerOverlay.querySelector('.bottom-sheet')?.classList.remove('visible');
            setTimeout(() => pickerOverlay.remove(), 400);
            showGuestBookingPopup(slide.dataset.date, slide.dataset.title);
            return;
        }
        if (e.target === pickerOverlay) {
            pickerOverlay.classList.remove('visible');
            pickerOverlay.querySelector('.bottom-sheet')?.classList.remove('visible');
            setTimeout(() => pickerOverlay.remove(), 400);
        }
    });
}

// ==================== ПРЕВЬЮ ХАЙКА НА ГЛАВНОЙ (гостевой экран) ====================
export function mountHikePreviewCard(containerId, hike, onRegisterClick) {
    const container = document.getElementById(containerId);
    if (!container || !hike) return null;

    const monthNames = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    let formattedDate = '';
    if (hike.date) {
        const parts = hike.date.split('-');
        if (parts.length === 3) {
            formattedDate = `${parseInt(parts[2], 10)} ${monthNames[parseInt(parts[1], 10) - 1]}`;
        }
    }

    let tagsHtml = '';
    if (hike.tags && hike.tags.length) {
        tagsHtml = '<div class="bottom-sheet-tags preview-tags">' +
            hike.tags.map(t => `<span class="bottom-sheet-tag">${t}</span>`).join('') +
            '</div>';
    }

    container.innerHTML = `
        <div class="hike-preview-header">
            <div class="hike-preview-date">${formattedDate}</div>
            <div class="hike-preview-title">${hike.title}</div>
        </div>
        ${tagsHtml}
        ${hike.image ? `
        <div class="image-container hike-preview-img-wrap">
            <img src="${hike.image}" class="bottom-sheet-image hike-preview-img" loading="lazy" onerror="this.style.display='none'">
            <div class="participant-counter" id="hikePreviewCounter" style="color: var(--yellow);">
                <span class="participant-text" style="color: var(--yellow);">идут</span>
                <span class="participant-count" id="hikePreviewCountVal" style="color: var(--yellow); display: none;">0</span>
                <div class="participant-avatars" id="hikePreviewAvatars"></div>
            </div>
        </div>
        ` : ''}
        <div class="hike-preview-footer">
            <button class="btn btn-yellow hike-preview-reg-btn">записаться на хайк</button>
        </div>
    `;

    container.querySelector('.hike-preview-reg-btn')?.addEventListener('click', () => {
        haptic();
        if (onRegisterClick) onRegisterClick();
    });

    const updateAvatars = async (participants) => {
        const countEl = container.querySelector('#hikePreviewCountVal');
        const avatarsEl = container.querySelector('#hikePreviewAvatars');
        if (countEl) {
            countEl.style.display = participants.length === 0 ? 'inline' : 'none';
            countEl.textContent = participants.length;
        }
        if (avatarsEl) {
            avatarsEl.innerHTML = '';
            for (const p of participants.slice(0, 3)) {
                const cachedUrl = await getCachedAvatar(p.userId, p.photoUrl);
                const img = document.createElement('img');
                img.src = cachedUrl || '';
                img.className = 'participant-avatar';
                img.alt = p.name || '';
                img.style.cssText = 'width:28px!important;height:28px!important;border-radius:50%!important;object-fit:cover!important;box-shadow:0 0 0 2px rgba(255,255,255,0.3)!important;';
                img.onerror = function() { this.style.display = 'none'; };
                avatarsEl.appendChild(img);
            }
        }
    };

    const unsub = subscribeToParticipantCount(hike.date, (_count, participants) => {
        updateAvatars(participants);
    });

    return unsub;
}

// ==================== ГЛОБАЛЬНЫЙ ОБРАБОТЧИК ДЛЯ ССЫЛОК ====================
document.addEventListener('click', function(e) {
    const dynamicLink = e.target.closest('.dynamic-link');
    if (dynamicLink) {
        e.preventDefault();
        const url = dynamicLink.getAttribute('data-url');
        const isGuest = dynamicLink.getAttribute('data-guest') === 'true';
        if (url) {
            openLink(url, 'ссылка', isGuest);
        }
        return;
    }
});
