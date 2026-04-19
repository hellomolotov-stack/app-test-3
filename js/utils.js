// js/utils.js
export function haptic() {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
}

export function openLink(url, action, isGuest) {
    haptic();
    if (action && window.log) window.log(action, isGuest);
    const tg = window.Telegram?.WebApp;
    if (!tg) return window.open(url, '_blank');
    if (url.startsWith('https://t.me/')) {
        tg.openTelegramLink(url);
        setTimeout(() => tg.close(), 100);
    } else {
        tg.openLink(url);
    }
}

export function normalizeDate(dateStr) {
    if (!dateStr) return dateStr;
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        const year = parts[0].padStart(4, '0');
        const month = parts[1].padStart(2, '0');
        const day = parts[2].padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    return dateStr;
}

export function formatDateForDisplay(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        const day = parseInt(parts[2], 10);
        const month = parseInt(parts[1], 10) - 1;
        const monthNames = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
        return `${day} ${monthNames[month]}`;
    }
    return dateStr;
}

export function parseLinks(text, isGuest) {
    if (!text) return '';
    return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function(match, linkText, url) {
        url = url.replace(/\.$/, '');
        return `<a href="#" data-url="${url}" data-guest="${isGuest}" class="dynamic-link">${linkText}</a>`;
    });
}

export function showConfetti() {
    const canvas = document.createElement('canvas');
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '9999';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    let width = window.innerWidth, height = window.innerHeight;
    canvas.width = width; canvas.height = height;
    const particles = [];
    const colors = ['#D9FD19', '#40a7e3', '#ffffff', '#ff69b4', '#ffa500'];
    for (let i = 0; i < 80; i++) {
        particles.push({
            x: Math.random() * width,
            y: Math.random() * height,
            vx: Math.random() * 6 - 3,
            vy: Math.random() * -5 - 2,
            size: Math.random() * 6 + 4,
            color: colors[Math.floor(Math.random() * colors.length)]
        });
    }
    let frame = 0;
    function animate() {
        if (frame > 120) { document.body.removeChild(canvas); return; }
        ctx.clearRect(0, 0, width, height);
        particles.forEach(p => {
            p.x += p.vx; p.y += p.vy; p.vy += 0.1;
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x, p.y, p.size, p.size);
        });
        frame++;
        requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
}

export function showQuestionConfetti() {
    const canvas = document.createElement('canvas');
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '9999';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    let width = window.innerWidth, height = window.innerHeight;
    canvas.width = width; canvas.height = height;

    const particles = [];
    for (let i = 0; i < 60; i++) {
        particles.push({
            x: Math.random() * width,
            y: Math.random() * height * 0.5,
            vx: Math.random() * 4 - 2,
            vy: Math.random() * 3 + 1,
            size: Math.random() * 20 + 20,
            opacity: Math.random() * 0.5 + 0.5
        });
    }

    let frame = 0;
    function animate() {
        if (frame > 150) {
            document.body.removeChild(canvas);
            return;
        }
        ctx.clearRect(0, 0, width, height);
        particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.15;
            if (p.y > height + 50) {
                p.y = -50;
                p.x = Math.random() * width;
            }
            ctx.font = `${p.size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
            ctx.fillStyle = `rgba(255, 255, 255, ${p.opacity})`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('❓', p.x, p.y);
        });
        frame++;
        requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
}

// Глобальные ссылки на объекты Telegram и DOM
export const tg = window.Telegram?.WebApp;
export const mainDiv = () => document.getElementById('mainContent');
export const subtitle = () => document.getElementById('subtitle');
