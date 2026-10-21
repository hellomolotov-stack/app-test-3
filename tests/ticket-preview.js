import { state } from '../js/state.js';
import { initFirebase } from '../js/firebase.js';
import { showBottomSheet, confirmTicketPaymentReturn, offerPendingTicketRecovery } from '../js/ui/calendar.js';

const date = '2099-01-10';
let paid = false;
const haptics = [], links = [], writes = [];
state.user = { id: 123, username: 'TicketPreview', first_name: 'Александр' };
state.userCard = { status: 'inactive' };
state.hikesWithTitle = state.hikesList = [{ date, title: 'Ай-Йори', location: 'Виноградное', start_time: '10:00', description: 'поход к вершине', distance: '9 км' }];
state.hikesData = { [date]: state.hikesWithTitle[0] };
state.hikeBookingStatus = {};
window.Telegram.WebApp.HapticFeedback.impactOccurred = style => haptics.push(style);
window.Telegram.WebApp.HapticFeedback.notificationOccurred = () => {};
window.Telegram.WebApp.openLink = url => links.push(url);
window.firebase = {
    initializeApp() {},
    database: () => ({ ref: path => ({
        once: async () => ({ val: () => path.startsWith('userRegistrations/') ? (paid ? { [date]: true } : {}) : null }),
        on() {}, off() {},
        set: async value => { writes.push([path, value]); },
        update: async value => { writes.push([path, value]); },
    }) }),
};
initFirebase();
document.getElementById('initial-loader')?.remove();
document.documentElement.classList.add('app-ready');
window.toggleShareButton = () => {};
window.previewTicket = {
    state, haptics, links, writes, date, showBottomSheet,
    paid(value = true) { paid = value; },
    confirm: () => confirmTicketPaymentReturn(date), offerPendingTicketRecovery,
};
showBottomSheet(0);
offerPendingTicketRecovery();
