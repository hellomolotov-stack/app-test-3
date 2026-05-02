// js/state.js
export const state = {
    user: null,
    userCard: { status: 'loading', hikes: 0, cardUrl: '' },
    metrics: { hikes: '0', kilometers: '0', locations: '0', meetings: '0' },
    hikesList: [],
    hikesData: {},
    faq: [],
    privileges: { club: [], city: [] },
    guestPrivileges: { club: [], city: [] },
    giftContent: '',
    randomPhrases: [],
    leaders: {},
    passInfo: { content: '', buttonLink: '' },
    profiles: {},
    myProfile: null,
    registrationsPopup: {},
    popupConfig: {
        text: 'чтобы забронировать место на хайк нужно приобрести билет или карту интеллигента',
        ticketPrice: 1500,
        ticketLink: '',
        seasonCardPrice: 5500,
        seasonCardLink: '',
        permanentCardPrice: 7500,
        permanentCardLink: ''
    },
    hikeBookingStatus: {},
    updates: [],
    mastermindSummaries: [],
    popups: {},                     // <-- динамические попапы
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
            if (data.popups) state.popups = data.popups;
            return true;
        }
    } catch (e) {}
    return false;
}

export function saveCachedState() {
    try {
        const toCache = {
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
            popups: state.popups,
        };
        localStorage.setItem('hikingAppCache', JSON.stringify(toCache));
    } catch (e) {}
}

export function saveBookingStatusToLocal() {
    const statusObj = {};
    state.hikesList.forEach((hike, index) => {
        statusObj[hike.date] = state.hikeBookingStatus[index] || false;
    });
    localStorage.setItem('hikeBookingStatus', JSON.stringify(statusObj));
}

export function loadBookingStatusFromLocal() {
    const saved = localStorage.getItem('hikeBookingStatus');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            const statusMap = {};
            state.hikesList.forEach((hike, index) => {
                statusMap[index] = parsed[hike.date] || false;
            });
            return statusMap;
        } catch (e) {
            return {};
        }
    }
    return {};
}
