const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('js/ui/profiles.js', 'utf8');
const start = source.indexOf("    document.getElementById('editProfileForm').addEventListener('submit'");
const end = source.indexOf("    if(document.getElementById('deleteProfileBtn'))", start);
assert.ok(start > 0 && end > start, 'Profile save handler is present');
const fragment = source.slice(start, end);
const handlers = {}, calls = [];
let unblockRender;
const inputs = {
    profileName: { value: 'Новый профиль' }, profileHobbies: { value: 'хайкинг' }, profileProfession: { value: 'дизайн' },
    allowMessagesCheck: { checked: true }, customLinkInput: { value: '' }, editProfileForm: { addEventListener: (name, cb) => { handlers[name] = cb; } },
};
const context = vm.createContext({
    document: { getElementById: id => inputs[id], querySelectorAll: () => [] },
    state: { user: { id: 101, username: 'tester' }, userCard: { status: 'inactive' } },
    fresh: null, bottomNav: { style: {} }, backHandler() {},
    tg: { BackButton: { offClick() {} } }, Date, Promise,
    haptic() {}, log() {}, syncProfileToSheet: async () => {},
    saveProfile: async () => { calls.push('save'); },
    showProfileAwardAfterSave: async () => { calls.push('award'); },
    renderProfiles: () => { calls.push('render'); return new Promise(resolve => { unblockRender = resolve; }); },
    showBottomNav() {}, setupBottomNav() {}, setActiveNav() {}, cleanupProfileOverlays() {},
    console: { error() {}, warn() {} }, alert() {},
});
vm.runInContext(`function wireProfileSave() { ${fragment} } wireProfileSave();`, context);
(async () => {
    let prevented = false;
    const operation = handlers.submit({ preventDefault() { prevented = true; } });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(prevented, true);
    assert.deepEqual(calls, ['save', 'render', 'award'], 'Reward does not wait for the profile list to reload');
    unblockRender(); await operation;
    assert.deepEqual(calls, ['save', 'render', 'award'], 'Reward is checked immediately after successful save');

    calls.length = 0;
    context.saveProfile = async () => { calls.push('save-failed'); throw new Error('offline'); };
    await assert.rejects(handlers.submit({ preventDefault() {} }), /offline/);
    assert.deepEqual(calls, ['save-failed'], 'A failed profile save cannot show a badge');
    console.log('Profile-save popup hook test passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
