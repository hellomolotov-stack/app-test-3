// ... (весь предыдущий код до функции showBottomSheet остаётся без изменений, 
// добавляем глобальную переменную для списка хайков и обновляем функцию)

let hikesList = []; // массив всех хайков, отсортированный по дате

// В функции loadHikes после заполнения hikesData создаём hikesList
async function loadHikes() {
    try {
        const resp = await fetch(`${HIKES_CSV_URL}&t=${Date.now()}`, { cache: 'no-cache' });
        const text = await resp.text();
        const rows = text.trim().split('\n').map(r => r.split(',').map(c => c.trim()));
        if (rows.length < 2) return;
        const headers = rows[0];
        hikesData = {};
        for (let row of rows.slice(1)) {
            if (row.length < 4) continue;
            let data = {};
            headers.forEach((k, i) => data[k] = row[i]);
            const date = data.date;
            hikesData[date] = {
                title: data.title || 'Хайк',
                description: data.description || 'Описание появится позже',
                image: data.image_url || '',
                date: date
            };
        }
        // Создаём отсортированный список хайков
        hikesList = Object.values(hikesData).sort((a, b) => a.date.localeCompare(b.date));
    } catch (e) {
        console.error('Ошибка загрузки расписания хайков (некритично):', e);
    }
}

// ----- Bottom Sheet с поддержкой листания -----
function showBottomSheet(index) {
    // index - индекс выбранного хайка в hikesList
    if (!hikesList.length) return;

    // Удаляем существующий bottom sheet, если есть
    const existingOverlay = document.querySelector('.bottom-sheet-overlay');
    if (existingOverlay) existingOverlay.remove();

    // Запрещаем скролл фона
    document.body.style.overflow = 'hidden';

    const overlay = document.createElement('div');
    overlay.className = 'bottom-sheet-overlay';
    overlay.innerHTML = `
        <div class="bottom-sheet" id="hikeBottomSheet">
            <div class="bottom-sheet-handle"></div>
            <div class="bottom-sheet-content-wrapper">
                <div class="bottom-sheet-arrow left" id="prevHike">←</div>
                <div class="bottom-sheet-arrow right" id="nextHike">→</div>
                <div class="bottom-sheet-content" id="bottomSheetContent">
                    <!-- контент будет обновляться через JS -->
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const sheet = document.getElementById('hikeBottomSheet');
    const contentDiv = document.getElementById('bottomSheetContent');
    const prevBtn = document.getElementById('prevHike');
    const nextBtn = document.getElementById('nextHike');

    let currentIndex = index;

    // Функция обновления контента
    function updateContent() {
        const hike = hikesList[currentIndex];
        if (!hike) return;

        const monthNames = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
                            'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
        let formattedDate = '';
        if (hike.date) {
            const parts = hike.date.split('-');
            if (parts.length === 3) {
                const day = parseInt(parts[2], 10);
                const month = parseInt(parts[1], 10) - 1;
                formattedDate = `${day} ${monthNames[month]}`;
            } else {
                formattedDate = hike.date;
            }
        }

        contentDiv.innerHTML = `
            ${hike.image ? `<img src="${hike.image}" class="bottom-sheet-image" onerror="this.style.display='none'">` : ''}
            <div class="bottom-sheet-title">${hike.title}</div>
            <div class="bottom-sheet-date">${formattedDate}</div>
            <div class="bottom-sheet-description">${hike.description.replace(/\n/g, '<br>')}</div>
            <!-- Кнопка "я иду" пока оставим, позже заменим на "забронировать" -->
            <a href="#" onclick="event.preventDefault(); openLink('https://t.me/hellointelligent', 'hike_join_click', false); return false;" class="btn btn-yellow bottom-sheet-btn">я иду</a>
        `;

        // Показываем/скрываем стрелки в зависимости от позиции
        prevBtn.classList.toggle('hidden', currentIndex === 0);
        nextBtn.classList.toggle('hidden', currentIndex === hikesList.length - 1);
    }

    // Обработчики стрелок
    prevBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentIndex > 0) {
            currentIndex--;
            updateContent();
            haptic();
            log('hike_swipe_prev', false);
        }
    });

    nextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentIndex < hikesList.length - 1) {
            currentIndex++;
            updateContent();
            haptic();
            log('hike_swipe_next', false);
        }
    });

    updateContent();

    // Небольшая задержка для анимации
    setTimeout(() => {
        overlay.classList.add('visible');
        sheet.classList.add('visible');
    }, 10);

    // Закрытие по клику на overlay
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeBottomSheet();
        }
    });

    // Drag-to-close функциональность
    let startY = 0;
    let currentY = 0;
    let isDragging = false;
    const handle = sheet.querySelector('.bottom-sheet-handle');

    const onTouchStart = (e) => {
        startY = e.touches[0].clientY;
        currentY = startY;
        isDragging = true;
        sheet.classList.add('dragging');
        e.preventDefault();
    };

    const onTouchMove = (e) => {
        if (!isDragging) return;
        currentY = e.touches[0].clientY;
        const delta = currentY - startY;
        if (delta > 0) {
            sheet.style.transform = `translateY(${delta}px)`;
        }
        e.preventDefault();
    };

    const onTouchEnd = (e) => {
        if (!isDragging) return;
        isDragging = false;
        sheet.classList.remove('dragging');
        const delta = currentY - startY;
        if (delta > 80) {
            closeBottomSheet();
        } else {
            sheet.style.transform = '';
        }
        e.preventDefault();
    };

    handle.addEventListener('touchstart', onTouchStart, { passive: false });
    handle.addEventListener('touchmove', onTouchMove, { passive: false });
    handle.addEventListener('touchend', onTouchEnd, { passive: false });
    handle.addEventListener('touchcancel', onTouchEnd, { passive: false });

    log('bottom_sheet_opened', false);
}

function closeBottomSheet() {
    const overlay = document.querySelector('.bottom-sheet-overlay');
    if (overlay) {
        overlay.classList.remove('visible');
        const sheet = document.getElementById('hikeBottomSheet');
        if (sheet) {
            sheet.classList.remove('visible');
        }
        document.body.style.overflow = '';
        setTimeout(() => {
            overlay.remove();
        }, 300);
    }
}

// В renderCalendar нужно изменить вызов showBottomSheet, передавая индекс
function renderCalendar(container) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const currentDate = now.getDate();

    const monthNames = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    let startOffset = firstDay === 0 ? 6 : firstDay - 1;
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    const weekdays = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

    let calendarHtml = `
        <div class="calendar-item">
            <h2 class="section-title" style="margin-top:0; margin-bottom:16px;">🔧 раздел в разработке</h2>
            <div class="calendar-header">
                <h3>${monthNames[currentMonth]} ${currentYear}</h3>
                <div class="calendar-nav">
                    <span id="prevMonth">←</span>
                    <span id="nextMonth">→</span>
                </div>
            </div>
            <div class="weekdays">
                ${weekdays.map(d => `<span>${d}</span>`).join('')}
            </div>
            <div class="calendar-grid" id="calendarGrid">
    `;

    for (let i = 0; i < startOffset; i++) {
        calendarHtml += `<div class="calendar-day empty"></div>`;
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${currentYear}-${String(currentMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const isToday = (day === currentDate);
        const hasHike = hikesData[dateStr] ? true : false;
        let classes = 'calendar-day';
        if (isToday) classes += ' today';
        if (hasHike) classes += ' hike-day';
        if (hasHike) {
            calendarHtml += `<div class="${classes}" data-date="${dateStr}">${day}</div>`;
        } else {
            calendarHtml += `<div class="${classes}">${day}</div>`;
        }
    }

    calendarHtml += `</div></div>`;

    container.innerHTML = calendarHtml;

    // При клике на день с хайком находим индекс в hikesList
    document.querySelectorAll('.calendar-day.hike-day').forEach(el => {
        el.addEventListener('click', () => {
            const date = el.dataset.date;
            // Ищем индекс в hikesList
            const index = hikesList.findIndex(h => h.date === date);
            if (index !== -1) {
                showBottomSheet(index);
            }
        });
    });

    document.getElementById('prevMonth')?.addEventListener('click', () => {
        haptic();
        alert('Переключение между месяцами будет добавлено позже');
    });
    document.getElementById('nextMonth')?.addEventListener('click', () => {
        haptic();
        alert('Переключение между месяцами будет добавлено позже');
    });
}
