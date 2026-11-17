const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('js/firebase.js', 'utf8')
    .replace(/import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];?/g, '')
    .replace(/export /g, '');
const profiles = {
    oldMember: { name: 'member' },
    oldGuest: { name: 'guest' },
    upgraded: { name: 'upgraded', guest: true },
    expired: { name: 'expired', guest: false },
    offline: { name: 'offline', guest: true },
    fallback: { name: 'fallback', userId: 'member-id' },
};
const reads = [];
const context = vm.createContext({
    console: { warn() {} },
    membershipRead: async path => {
        reads.push(path);
        if (path === 'userProfiles') return profiles;
        if (path === 'members/offline') throw new Error('offline');
        return ['members/oldMember', 'members/upgraded', 'members/member-id'].includes(path)
            ? { user_id: path.split('/')[1] } : null;
    },
});
vm.runInContext(source, context);
vm.runInContext('database = {}; fastRead = membershipRead;', context);
(async () => {
    const resolved = await context.loadAllProfiles();
    assert.equal(resolved.oldMember.guest, false, 'Old member needs no stored guest flag');
    assert.equal(resolved.oldGuest.guest, true, 'Old free profile is classified from missing membership');
    assert.equal(resolved.upgraded.guest, false, 'Purchase overrides stale guest=true');
    assert.equal(resolved.expired.guest, true, 'Missing membership overrides stale guest=false');
    assert.equal(resolved.offline.guest, null, 'Network failure is unknown, not a guest or a member');
    assert.equal(resolved.fallback.guest, false, 'Read membership using profile userId when present');
    assert.ok(reads.includes('members/member-id'));
    assert.equal(profiles.oldGuest.guest, undefined, 'Do not write classifications back to records');
    console.log('Profile membership regression tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
