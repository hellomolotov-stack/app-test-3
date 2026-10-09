// Credential-free reference; installed in the existing Apps Script project.
function clubPaymentProduct_(params) {
  const type = String(params.card_type || '').trim();
  if (['ticket', 'season', 'permanent', 'offer', 'gift'].indexOf(type) < 0) throw new Error('неверный тип оплаты');
  const giftType = type === 'gift' ? String(params.gift_card_type || 'permanent').trim() : '';
  if (giftType && ['season', 'permanent'].indexOf(giftType) < 0) throw new Error('неверный тип подарочной карты');
  // Older clients offered a permanent gift for 5500; keep that quoted price.
  const legacyGift = type === 'gift' && !params.gift_card_type;
  const permanent = type === 'permanent' || type === 'offer' || giftType === 'permanent';
  const amount = type === 'ticket' ? 1000 : type === 'offer' ? CARD_OFFER_PRICE : permanent && !legacyGift ? 7500 : 5500;
  const description = type === 'ticket'
    ? 'Билет на хайк' + (params.hike_date ? ' ' + params.hike_date : '')
    : (type === 'gift' ? 'Подарочная ' : '') + (permanent ? 'бессрочная' : 'сезонная') + ' карта интеллигента' +
      (type === 'offer' ? ' – спецпредложение' : !permanent ? ' – текущий и следующий сезон' : '');
  return { amount: amount, description: description, giftCardType: giftType };
}
