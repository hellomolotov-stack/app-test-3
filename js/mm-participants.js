export function summaryParticipants(list) {
    return (Array.isArray(list) ? list : []).filter(person => {
        if (!person?.userId) return false;
        const username = String(person.username || '').replace(/^@/, '').toLowerCase();
        const name = String(person.name || '').toLowerCase().replace(/[^а-яёa-z]+/g, ' ').trim();
        return String(person.userId) !== '7845375334'
            && username !== 'hellointelligent'
            && name !== 'интеллигентная поддержка';
    });
}
