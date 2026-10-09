import { state } from '../js/state.js';
import { initFirebase } from '../js/firebase.js';
import { initAdmission } from '../js/admission.js';
import { renderProfiles } from '../js/ui/profiles.js';

// Synthetic profiles only: no reads or writes to the production database.
const params = new URLSearchParams(location.search);
const names = ['Ксения', 'Александр', 'Мария', 'Сергей', 'Анна', 'Михаил'];
const profiles = params.has('empty') ? {} : Object.fromEntries(names.map((name, index) => [String(index + 1), {
    userId: index + 1, name, updatedAt: index,
    avatarUrl: index === 2 ? '/assets/missing-profile.jpg' : '/assets/card-front.jpg',
    hobbies: ['горы, путешествия и фотография', 'музыка и прогулки у моря'][index % 2],
    profession: ['дизайнер', 'предприниматель'][index % 2], friendshipStatuses: ['дружба'],
}]));
state.user = { ...window.Telegram.WebApp.initDataUnsafe.user };
if (params.has('regular')) state.user.username = 'GuestPreview';
state.userCard = { status: params.has('member') ? 'active' : 'inactive' };
state.hikesWithTitle = [];
window.firebase = {
    initializeApp() {},
    database: () => ({ ref: path => ({ once: async () => ({ val: () =>
        path === 'userProfiles' ? profiles : path.startsWith('userProfiles/') && params.has('member') ? profiles['1'] : null,
    }) }) }),
};
initFirebase();
document.getElementById('initial-loader')?.remove();
document.documentElement.classList.add('app-ready');
window.toggleShareButton = () => {};
initAdmission();
await renderProfiles();
window.previewProfiles = { state, renderProfiles };
