// Only user-confirmed holds from the personal mode participate in new records.
export const personalHofSessions = sessions => (sessions || []).filter(s => s.mode === 'personal');

export function createHoldTracker(mode, now = () => performance.now()) {
    const holds = [];
    let active = null;
    return {
        holds,
        begin(round) { if (active?.round !== round) active = { round, start: now() }; },
        elapsed() { return active ? Math.max(0, (now() - active.start) / 1000) : 0; },
        confirm() {
            if (mode !== 'personal' || !active) return;
            holds[active.round - 1] = Math.max(1, Math.round((now() - active.start) / 1000));
            active = null;
        },
        discard() { active = null; },
    };
}
