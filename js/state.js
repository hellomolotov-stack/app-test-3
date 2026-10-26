// js/state.js
export const state = {
    user: null,
    userCard: { status: 'loading', hikes: 0, cardUrl: '' },
    metrics: { hikes: '0', kilometers: '0', locations: '0', meetings: '0' },
    hikesList: [],
    hikesData: {},
    hikesWithTitle: [],   // ← добавлено
    faq: [],
    privileges: { club: [], city: [] },
    guestPrivileges: { club: [], city: [] },
    giftContent: '',
    randomPhrases: [],
    leaders: {},
    passInfo: { content: '', buttonLink: '' },
    profiles: {},
    myProfile: null,
    routeFavorites: {},
    registrationsPopup: {},
    popupConfig: {
        text: 'чтобы забронировать место на хайк нужно приобрести билет или карту интеллигента',
        ticketPrice: 1200,
        ticketLink: '',
        seasonCardPrice: 5500,
        seasonCardLink: '',
        permanentCardPrice: 7500,
        permanentCardLink: ''
    },
    hikeBookingStatus: {},
    updates: [],
    mastermindSummaries: [],
    testimonials: [],
    safety: { active: false, banner: '', intro: '', items: [] },
    pendingProfileClick: null,
};

export function loadCachedState() {
    try {
        const cached = localStorage.getItem('hikingAppCache');
        if (cached) {
            const data = JSON.parse(cached);
            if (data.hikesList) {
                state.hikesList = data.hikesList;
                state.hikesData = data.hikesData;
                state.hikesWithTitle = (data.hikesList || []).filter(h => h.title && h.title.trim() !== '');
            }
            if (data.metrics) state.metrics = data.metrics;
            if (data.faq) state.faq = data.faq;
            if (data.privileges) state.privileges = data.privileges;
            if (data.guestPrivileges) state.guestPrivileges = data.guestPrivileges;
            if (data.passInfo) state.passInfo = data.passInfo;
            if (data.giftContent) state.giftContent = data.giftContent;
            if (data.randomPhrases) state.randomPhrases = data.randomPhrases;
            if (data.leaders) state.leaders = data.leaders;
            if (data.updates) state.updates = data.updates;
            if (data.mastermindSummaries) state.mastermindSummaries = data.mastermindSummaries;
            if (data.testimonials) state.testimonials = data.testimonials;
            if (data.safety) state.safety = data.safety;
            if (data.userCard && data.userId && String(data.userId) === String(state.user?.id)) state.userCard = data.userCard;
            return true;
        }
    } catch (e) {}
    return false;
}

export function saveCachedState() {
    try {
        const toCache = {
            userId: state.user?.id || null,
            savedAt: Date.now(),
            hikesList: state.hikesList,
            hikesData: state.hikesData,
            metrics: state.metrics,
            faq: state.faq,
            privileges: state.privileges,
            guestPrivileges: state.guestPrivileges,
            passInfo: state.passInfo,
            giftContent: state.giftContent,
            randomPhrases: state.randomPhrases,
            leaders: state.leaders,
            updates: state.updates,
            mastermindSummaries: state.mastermindSummaries,
            testimonials: state.testimonials,
            safety: state.safety,
            userCard: state.userCard?._admissionPreview ? state._admissionRealCard : (state.userCard && state.userCard.status !== 'loading' ? state.userCard : undefined),
        };
        localStorage.setItem('hikingAppCache', JSON.stringify(toCache));
    } catch (e) {}
}

export function saveBookingStatusToLocal() {
    const statusObj = {};
    state.hikesWithTitle.forEach((hike, index) => {
        statusObj[hike.date] = state.hikeBookingStatus[index] || false;
    });
    try { localStorage.setItem('hikeBookingStatus', JSON.stringify({ userId: state.user?.id || null, registrations: statusObj })); } catch (e) {}
}

export function loadBookingStatusFromLocal() {
    let saved;
    try { saved = localStorage.getItem('hikeBookingStatus'); } catch (e) { return {}; }
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if (!parsed.userId || String(parsed.userId) !== String(state.user?.id)) return {};
            const statusMap = {};
            state.hikesWithTitle.forEach((hike, index) => {
                statusMap[index] = parsed.registrations?.[hike.date] === true;
            });
            return statusMap;
        } catch (e) {
            return {};
        }
    }
    return {};
}
