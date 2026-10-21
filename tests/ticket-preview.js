import { state } from '../js/state.js';
import { initFirebase } from '../js/firebase.js';
import { showBottomSheet, closeBottomSheet, renderCalendar, confirmTicketPaymentReturn, offerPendingTicketRecovery } from '../js/ui/calendar.js';

const date = '2099-01-10';
let paid = false;
const haptics = [], links = [], writes = [];
const initialParticipants = { '456': { userId: 456, name: 'Ксения', timestamp: 1 } };
state.user = { id: 123, username: 'TicketPreview', first_name: 'Александр' };
state.userCard = { status: new URLSearchParams(location.search).has('member') ? 'active' : 'inactive' };
state.hikesWithTitle = state.hikesList = [{ date, title: 'Ай-Йори', location: 'Виноградное', start_time: '10:00', description: 'поход к вершине', distance: '9 км' }];
state.hikesData = { [date]: state.hikesWithTitle[0] };
state.hikeBookingStatus = {};
window.Telegram.WebApp.HapticFeedback.impactOccurred = style => haptics.push(style);
window.Telegram.WebApp.HapticFeedback.notificationOccurred = () => {};
window.Telegram.WebApp.openLink = url => links.push(url);
window.firebase = {
    initializeApp() {},
    database: () => ({ ref: path => ({
        once: async () => ({ val: () => path.startsWith('userRegistrations/') ? (paid ? { [date]: true } : {})
            : path.startsWith('hikeParticipants/') ? { ...initialParticipants, ...(paid ? { '123': { userId: 123, name: 'Александр', timestamp: 2 } } : {}) } : null }),
        on() {}, off() {},
        set: async value => { writes.push([path, value]); if (path.startsWith('hikeParticipants/')) paid = true; },
        remove: async () => { writes.push([path, null]); if (path.startsWith('hikeParticipants/')) paid = false; },
        update: async value => { writes.push([path, value]); },
    }) }),
};
window.firebase.database.ServerValue = { TIMESTAMP: Date.now() };
initFirebase();
document.getElementById('initial-loader')?.remove();
document.documentElement.classList.add('app-ready');
window.toggleShareButton = () => {};
window.previewTicket = {
    state, haptics, links, writes, date, showBottomSheet, closeBottomSheet, renderCalendar,
    paid(value = true) { paid = value; },
    confirm: () => confirmTicketPaymentReturn(date), offerPendingTicketRecovery,
};
const calendar = document.createElement('div');
calendar.id = 'calendarContainer';
document.getElementById('mainContent').append(calendar);
renderCalendar(calendar);
showBottomSheet(0);
offerPendingTicketRecovery();
