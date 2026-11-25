import { haptic } from '../utils.js';

const PILOT_ID = '7845375334';
const LABELS = new Map([
    ['first-hike', 'сходить на первый хайк'],
    ['meet', 'познакомиться'],
    ['talk', 'поговорить о важном'],
    ['adventure', 'попасть в приключение'],
    ['walk', 'хорошенько пройтись'],
    ['forest', 'послушать тишину леса'],
]);
const choicesByDate = new Map();

export function hasHikeIntentPilot(user) {
    return String(user?.id) === PILOT_ID && !!window.Telegram?.WebApp?.initData;
}

async function requestChoice(date, change = {}) {
    const response = await fetch('/api/hike-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, ...change, initData: window.Telegram.WebApp.initData }),
        signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`hike intent ${response.status}`);
    const { choice } = await response.json();
    return LABELS.has(choice) ? choice : null;
}

function readChoice(date) {
    if (!choicesByDate.has(date)) {
        choicesByDate.set(date, requestChoice(date).catch(error => {
            choicesByDate.delete(date);
            throw error;
        }));
    }
    return choicesByDate.get(date);
}

export function mountHikeIntent(container, date, previous) {
    if (previous?.dataset.date === date) {
        container.appendChild(previous);
        return;
    }

    const poll = document.createElement('details');
    poll.className = 'hike-intent';
    poll.dataset.date = date;
    poll.innerHTML = `
        <summary class="hike-intent-question">
            <span>чего тебе хочется от этого хайка?<small class="hike-intent-answer" hidden></small></span>
        </summary>
        <div class="hike-intent-options" role="group" aria-label="выбери один ответ"></div>
        <p class="hike-intent-message" role="status" hidden></p>`;
    const options = poll.querySelector('.hike-intent-options');
    const answer = poll.querySelector('.hike-intent-answer');
    const message = poll.querySelector('.hike-intent-message');
    let selected = null;

    function displayChoice(choice) {
        selected = choice;
        answer.textContent = LABELS.get(choice) || '';
        answer.hidden = !choice;
        for (const tag of options.children) {
            tag.setAttribute('aria-pressed', String(tag.dataset.choice === choice));
        }
    }

    for (const [choice, label] of LABELS) {
        const tag = document.createElement('button');
        tag.type = 'button';
        tag.className = 'status-tag hike-intent-tag';
        tag.dataset.choice = choice;
        tag.textContent = label;
        tag.setAttribute('aria-pressed', 'false');
        tag.disabled = true;
        tag.addEventListener('click', async () => {
            haptic();
            message.hidden = true;
            for (const button of options.children) button.disabled = true;
            const oldChoice = choicesByDate.get(date);
            const saving = requestChoice(date, { choice: choice === selected ? null : choice });
            choicesByDate.set(date, saving);
            try {
                displayChoice(await saving);
                poll.open = false;
            } catch {
                if (oldChoice) choicesByDate.set(date, oldChoice);
                else choicesByDate.delete(date);
                message.textContent = 'ответ не сохранился, попробуй ещё раз';
                message.hidden = false;
            } finally {
                for (const button of options.children) button.disabled = false;
            }
        });
        options.appendChild(tag);
    }

    container.appendChild(poll);
    readChoice(date).then(displayChoice).catch(() => {
        message.textContent = 'ответ не загрузился, можно выбрать заново';
        message.hidden = false;
    }).finally(() => {
        for (const tag of options.children) tag.disabled = false;
    });
}

export function addHikeIntentToParticipant(name, user, participantId, date) {
    if (!hasHikeIntentPilot(user) || String(participantId) !== PILOT_ID) return;
    readChoice(date).then(choice => {
        if (!choice || !name.isConnected) return;
        const answer = document.createElement('small');
        answer.className = 'hike-intent-answer';
        answer.textContent = LABELS.get(choice);
        name.appendChild(answer);
        name.closest('.participant-dropdown')?.classList.add('has-hike-intent');
    }).catch(() => {});
}
