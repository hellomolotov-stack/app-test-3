const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('js/ui/calendar.js', 'utf8');
const recovery = source.slice(source.indexOf('export const TICKET_PENDING_TTL'),
    source.indexOf('// ==================== КОРОТКИЙ БАННЕР ВЫБОРА:'))
    .replace(/export /g, '');
const date = '2099-01-10';

function fixture(statuses = []) {
    const pending = JSON.stringify({ type: 'ticket', hikeDate: date, hikeTitle: 'Test hike', ts: Date.now() });
    const storage = new Map([['pending_reg_celebration', pending]]);
    const elements = new Map(), overlays = [], successes = [], writes = [];
    let reads = 0;
    const context = vm.createContext({
        Date, Promise, JSON, console,
        setTimeout: resolve => { resolve(); },
        ticketWatch: null, TICKET_SUPPORT_LINK: 'https://t.me/hellointelligent',
        state: { user: { id: 123 }, hikesWithTitle: [{ date, title: 'Test hike' }], hikeBookingStatus: {} },
        localStorage: {
            getItem: key => storage.get(key) || null,
            removeItem: key => storage.delete(key),
        },
        document: {
            querySelector: () => null,
            getElementById: id => elements.get(id) || null,
            body: { appendChild: overlay => overlays.push(overlay) },
            createElement: () => ({
                removed: false,
                remove() { this.removed = true; },
                set innerHTML(html) {
                    this.html = html;
                    for (const [, id] of html.matchAll(/id="([^"]+)"/g)) {
                        const button = { disabled: false, addEventListener(_, handler) { this.click = handler; } };
                        elements.set(id, button);
                    }
                },
            }),
        },
        loadUserRegistrations: async userId => {
            assert.equal(userId, 123);
            const status = statuses[Math.min(reads++, statuses.length - 1)];
            if (status instanceof Error) throw status;
            return status || {};
        },
        setUserRegistrationStatus: (...args) => { writes.push(args); throw new Error('Forbidden client booking write'); },
        addParticipant: (...args) => { writes.push(args); throw new Error('Forbidden client participant write'); },
        updateRegistrationInSheet: (...args) => { writes.push(args); },
        sendBookingNotification: (...args) => { writes.push(args); },
        showRegistrationSuccess: (...args) => successes.push(args),
        saveBookingStatusToLocal() {}, renderUserBookings() {}, renderCalendar() {},
        haptic() {}, log() {}, markPaymentSeen() {}, openLink() {},
    });
    vm.runInContext(recovery, context);
    return { context, storage, elements, overlays, successes, writes, get reads() { return reads; } };
}

(async () => {
    for (const status of [{}, { [date]: false }, { [date]: 'true' }, { '2099-02-01': true }, new Error('offline')]) {
        const f = fixture([status]);
        assert.equal(await f.context.completeTicketRegistration(date), false);
        assert.equal(f.successes.length, 0, 'No success without server registration');
        assert.equal(f.writes.length, 0, 'No client booking writes');
        assert.ok(f.storage.has('pending_reg_celebration'), 'Keep pending context for later verification');
        assert.equal(f.reads, 8);
    }
    const paid = fixture([{}, {}, { [date]: true }]);
    assert.equal(await paid.context.completeTicketRegistration(date), true);
    assert.equal(paid.reads, 3, 'Wait for delayed callback');
    assert.equal(paid.successes.length, 1);
    assert.equal(paid.writes.length, 0);
    assert.equal(paid.context.state.hikeBookingStatus[0], true);
    assert.ok(!paid.storage.has('pending_reg_celebration'));

    const anonymous = fixture([{ [date]: true }]);
    anonymous.context.state.user = null;
    assert.equal(await anonymous.context.completeTicketRegistration(date), false);
    assert.equal(anonymous.successes.length, 0);
    assert.equal(anonymous.reads, 0);

    const clicked = fixture([{}]);
    clicked.context.offerPendingTicketRecovery();
    const button = clicked.elements.get('ticketPaidYesBtn');
    assert.ok(clicked.overlays[0].html.includes('проверить оплату'));
    const checking = button.click();
    assert.equal(button.disabled, true);
    await button.click();
    await checking;
    assert.equal(clicked.reads, 8, 'Double click does not start a second check');
    assert.equal(clicked.writes.length, 0);
    assert.equal(clicked.successes.length, 0);
    assert.ok(clicked.storage.has('pending_reg_celebration'));
    assert.ok(clicked.overlays[0].removed);

    const clickedPaid = fixture([{ [date]: true }]);
    clickedPaid.context.offerPendingTicketRecovery();
    await clickedPaid.elements.get('ticketPaidYesBtn').click();
    assert.equal(clickedPaid.successes.length, 1);
    assert.equal(clickedPaid.writes.length, 0);
    console.log('Ticket recovery security regression tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
