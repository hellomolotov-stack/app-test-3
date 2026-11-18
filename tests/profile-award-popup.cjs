const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('js/ui/profile-award.js', 'utf8')
    .replace(/import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];?/g, '')
    .replace("import('./achievements-popup.js')", 'Promise.resolve({ openAchievementsPopup: globalThis.testPopup })')
    .replace(/export /g, '');
const calls = [], badge = { id: 'badge-profile', title: 'показал себя клубу', seenAt: null };
const context = vm.createContext({
    state: { user: { id: 101 }, userCard: { status: 'inactive' } },
    achievementRequest: async action => { calls.push(action); return { granted: ['показал себя клубу'] }; },
    clearAchievementCache: () => calls.push('clear-cache'),
    loadAchievementCollections: async () => ({ '101': [badge] }),
    testPopup: (items, options) => calls.push({ items, options }),
    Promise,
});
vm.runInContext(source, context);
(async () => {
    assert.equal(await context.showProfileAwardAfterSave(), true);
    assert.deepEqual(calls.slice(0, 2), ['claim', 'clear-cache']);
    assert.equal(calls[2].items[0].title, 'показал себя клубу');
    assert.equal(calls[2].options.fresh, true, 'Reuse the first-entry fresh award popup');

    calls.length = 0;
    context.achievementRequest = async () => ({ granted: [] });
    assert.equal(await context.showProfileAwardAfterSave(), false, 'Repeated saves in the same session do not reopen an unseen award');
    assert.equal(calls.filter(c => typeof c === 'object').length, 0);

    calls.length = 0;
    context.achievementRequest = async action => { calls.push(action); return { granted: ['показал себя клубу'] }; };
    context.state.user.id = 102;
    context.loadAchievementCollections = async () => ({ '102': [badge] });
    context.state.userCard.status = 'active';
    assert.equal(await context.showProfileAwardAfterSave(), true, 'Card holders see the same award');
    assert.equal(calls.filter(c => typeof c === 'object').length, 1);

    calls.length = 0;
    context.achievementRequest = async () => ({ granted: [] });
    context.loadAchievementCollections = async () => ({ '102': [{ ...badge, seenAt: 123 }] });
    assert.equal(await context.showProfileAwardAfterSave(), false, 'An edited profile with an already-seen award must not re-open it');
    assert.equal(calls.filter(c => typeof c === 'object').length, 0);

    context.state.user.id = 103;
    context.loadAchievementCollections = async () => ({ '103': [badge] });
    assert.equal(await context.showProfileAwardAfterSave(), true, 'An existing unseen award can show after editing');

    calls.length = 0;
    context.achievementRequest = async () => { throw new Error('network'); };
    await assert.rejects(context.showProfileAwardAfterSave(), /network/);
    assert.equal(calls.filter(c => typeof c === 'object').length, 0, 'Never show a reward before the server confirms it');
    console.log('Profile award popup test passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
