# приглашение в близкий круг: правки в Apps Script

всё делается в файле **Файрбейс.gs** живого проекта. шесть точечных замен, файл целиком не вставлять.
после правок: «Сохранить проект на Диск» → «Развертывание» → «Управление развертываниями» → у развёртывания **AKfycbxtX047…** (то, что в /js/config.js) → «Новая версия».

## 1. функция initPayment – цена по предложению

найти (поиск по `sum = cardOfferSettings_().price.toFixed(2);`):

```js
        if (!activeCardOffer_(params.user_id)) {
          return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'предложение недоступно или истекло' }))
            .setMimeType(ContentService.MimeType.JSON);
        }
        sum = cardOfferSettings_().price.toFixed(2);
```

заменить на:

```js
        const offerNow = activeCardOffer_(params.user_id);
        if (!offerNow) {
          return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'предложение недоступно или истекло' }))
            .setMimeType(ContentService.MimeType.JSON);
        }
        // у приглашения в круг своя цена (карта минус оплаченные билеты), у обычного – общая
        sum = Number(offerNow.price || cardOfferSettings_().price).toFixed(2);
```

## 2. функция handleCardOffer – последние строки

найти:

```js
  return out({ status: 'ok', active: true, price: st.price, full_price: st.full_price, expires_at: o.expires_at,
    title: st.title, text: st.text });
```

заменить на:

```js
  return out({ status: 'ok', active: true, price: Number(o.price || st.price), full_price: st.full_price, expires_at: o.expires_at,
    title: st.title, text: st.text, kind: o.kind || '', tickets_count: o.tickets_count || 0, tickets_sum: o.tickets_sum || 0 });
```

## 3. функция adminNewcomers_ – три места

а) найти строку `const ensure = id => (info[id] = info[id] || { name: '', username: '', dates: {}, ticketDates: {} });` и заменить на:

```js
  const ensure = id => (info[id] = info[id] || { name: '', username: '', dates: {}, ticketDates: {}, paid: 0, paidSum: 0 });
```

б) найти строку `if (p.hike_date) { u.dates[p.hike_date] = true; u.ticketDates[p.hike_date] = true; }` и **сразу под ней** добавить:

```js
    u.paid++; u.paidSum += Number(p.amount) || 0;
```

в) найти строку `auto_until: auto ? auto.expires_at : null,` и **сразу под ней** добавить:

```js
      tickets_count: u.paid, tickets_sum: Math.round(u.paidSum), circle_price: circlePrice_(u.paidSum),
```

и в той же функции найти `offer: o ? { sent_at: o.sent_at || 0,` – заменить на `offer: o ? { kind: o.kind || '', price: o.price || 0, sent_at: o.sent_at || 0,`

## 4. новые функции

вставить **перед** строкой `// Выключить предложение: params.user_ids`:

```js
// ==================== ПРИГЛАШЕНИЕ В БЛИЗКИЙ КРУГ (22.10.2026) ====================
// Админ сам выбирает людей, которых хочет видеть в клубе. Все их оплаченные билеты засчитываются в бессрочную
// карту: цена = 7 500 − сумма билетов, но не дороже обычного спецпредложения (5 500) и не дешевле 1 500.
// Запись – тот же card_offers/<id> с kind 'circle' и личной ценой; срок 30 дней, в приложении он не показывается.
const CIRCLE_DAYS = 30;
const CIRCLE_MIN_PRICE = 1500;
function circlePrice_(ticketsSum) {
  const full = CARD_OFFER.full_price;
  return Math.max(CIRCLE_MIN_PRICE, Math.min(full - Math.round(Number(ticketsSum) || 0), CARD_OFFER.price));
}
// оплаченные билеты человека: { count, sum }
function paidTicketsOf_(userId, payments) {
  let count = 0, sum = 0;
  Object.keys(payments || {}).forEach(k => {
    const p = payments[k];
    if (p && p.completed === true && String(p.user_id) === String(userId) && p.card_type === 'ticket') { count++; sum += Number(p.amount) || 0; }
  });
  return { count: count, sum: Math.round(sum) };
}
function ticketsWord_(n) {
  const a = n % 10, b = n % 100;
  return n + ' ' + (a === 1 && b !== 11 ? 'билет' : a >= 2 && a <= 4 && (b < 12 || b > 14) ? 'билета' : 'билетов');
}
function rubText_(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₽'; }
// params.user_ids – JSON [id…], params.names – JSON {id: имя}, params.text – сообщение с [имя] [билеты] [сумма] [цена]
function adminInviteCircle_(params) {
  const ids = (JSON.parse(params.user_ids || '[]') || []).map(String).filter(id => /^\d+$/.test(id));
  if (!ids.length) throw new Error('никого не выбрали');
  const text = String(params.text || '').trim();
  if (!text) throw new Error('пустой текст сообщения');
  const names = JSON.parse(params.names || '{}') || {};
  const payments = fbGet_('pending_payments') || {};
  const users = fbGet_('app_users') || {};
  const now = Math.floor(Date.now() / 1000);
  const expires = now + CIRCLE_DAYS * 24 * 3600;
  const patch = {};
  let sent = 0, failed = 0, skipped = 0;
  ids.forEach(id => {
    const t = paidTicketsOf_(id, payments);
    const price = circlePrice_(t.sum);
    const rec = { kind: 'circle', price: price, tickets_count: t.count, tickets_sum: t.sum,
      sent_at: now, expires_at: expires, days: CIRCLE_DAYS, notified: false };
    if ((users[id] || {}).can_message === false) skipped++;
    else {
      const name = String(names[id] || '').split(' ')[0] || 'друг';
      const msg = text.replace(/\[имя\]/gi, name).replace(/\[билеты\]/gi, ticketsWord_(t.count))
        .replace(/\[сумма\]/gi, rubText_(t.sum)).replace(/\[цена\]/gi, rubText_(price));
      const res = sendAutoMessage({ userId: id, text: msg, messageKey: 'card_circle', firstName: name,
        startapp: 'card_offer', buttonText: 'посмотреть карту' });
      if (res && res.ok) { sent++; rec.notified = true; } else failed++;
    }
    patch[id] = rec;
  });
  UrlFetchApp.fetch(FIREBASE_URL + 'card_offers.json?auth=' + FIREBASE_SECRET, {
    method: 'patch', contentType: 'application/json', payload: JSON.stringify(patch), muteHttpExceptions: true
  });
  return { status: 'ok', invited: ids.length, sent: sent, failed: failed, skipped: skipped };
}
```

## 5. handleAdmin – новое действие

найти строку `case 'adminOpenCardOffer': return _adminOut(adminOpenCardOffer_(params));` и **сразу под ней** добавить:

```js
      case 'adminInviteCircle': return _adminOut(adminInviteCircle_(params));
```

## проверка

открыть админку → «💳 продажа карты» → у человека с билетами видно «оплатил N билетов на … → карта для него …» и кнопку «🤝 пригласить в круг». пригласить себя тестовым аккаунтом нельзя (у владельца карты нет в списке), поэтому первым можно пригласить того, кого и так хотел.
