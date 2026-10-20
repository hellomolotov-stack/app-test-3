<?php
require __DIR__ . '/bootstrap.php';
$checks = array();
function check($name, $cond) { global $checks; $checks[] = array('name' => $name, 'passed' => (bool) $cond); if (!$cond) throw new Exception('FAILED: ' . $name); }
$CARD = 'dc1_163665735_' . str_repeat('A', 28);
$KEY = str_repeat('k', 40);
function loyalty_case($on, $card, $way = 'pickup') {
    global $KEY;
    start_case(true, true, $way, false);
    if ($on) { $GLOBALS['options'][HI_Club_Checkout::LOYALTY] = 'on'; $GLOBALS['options'][HI_Club_Checkout::LOYALTY_KEY] = $KEY; }
    $GLOBALS['hooks'] = array(); HI_Club_Checkout::boot(); include __DIR__ . '/fixtures/dietcakes-checkout.php'; do_action('woocommerce_blocks_loaded');
    WC()->cart->base = 1000;
    call_user_func($GLOBALS['store_callback'], array('source' => 'intelligentsia', 'pilot' => '1', 'way' => $way, 'date' => date('Y-m-d', time() + 7 * 86400), 'route' => 'Ай-Петри', 'card' => $card));
    $GLOBALS['api_calls'] = array();
}
$quote10 = function ($b) { return $b['action'] === 'quote' ? array('code' => 200, 'body' => array('discount' => (int) round($b['gross'] / 10))) : array('code' => 200, 'body' => array('state' => $b['action'] === 'confirm' ? 'confirmed' : 'reserved', 'discount' => 10000)); };

// Выключено: никаких запросов и скидки, поведение как в 0.2.0
loyalty_case(false, $CARD); $GLOBALS['api_reply'] = $quote10; WC()->cart->recalculate();
check('Loyalty off: no API calls', count($GLOBALS['api_calls']) === 0);
check('Loyalty off: club pickup without coupon stays 970', local_total() === 970.0);

// Включено, карта есть, самовывоз: 10% от 1000, 3% за самовывоз снимается
loyalty_case(true, $CARD); $GLOBALS['api_reply'] = $quote10; WC()->cart->recalculate();
check('Card fee added', count(fees_named(HI_Club_Checkout::CARD_FEE)) === 1);
check('Card pickup total 900 (no extra 3%)', local_total() === 900.0);
check('Quote sends store key, card and kopecks', $GLOBALS['api_calls'][0]['headers']['x-dc-store-key'] === $KEY && $GLOBALS['api_calls'][0]['body']['card'] === $CARD && $GLOBALS['api_calls'][0]['body']['gross'] === 100000);
WC()->cart->recalculate(); WC()->cart->recalculate();
check('Repeated recalculation uses cached quote (1 API call)', count($GLOBALS['api_calls']) === 1 && local_total() === 900.0);
WC()->cart->base = 2000; WC()->cart->recalculate();
check('Changed cart total asks again', count($GLOBALS['api_calls']) === 2 && local_total() === 1800.0);

// Сервер ответил смесью 10%/5% – ставим ровно его скидку
loyalty_case(true, $CARD); $GLOBALS['api_reply'] = array('code' => 200, 'body' => array('discount' => 7500)); WC()->cart->recalculate();
check('Server split respected (75 ₽)', local_total() === 925.0);

// Карта не принята / сервер недоступен – без скидки, заказ не ломается, обычные 3% возвращаются
loyalty_case(true, $CARD); $GLOBALS['api_reply'] = array('code' => 403, 'body' => array('error' => 'inactive_card')); WC()->cart->recalculate();
check('Inactive card: no card fee', count(fees_named(HI_Club_Checkout::CARD_FEE)) === 0);
loyalty_case(true, $CARD); $GLOBALS['api_reply'] = 'timeout'; WC()->cart->recalculate();
check('Timeout: no card fee, no crash', count(fees_named(HI_Club_Checkout::CARD_FEE)) === 0);
check('Timeout: one call only, no retries', count($GLOBALS['api_calls']) === 1);

// Подделанный ID не принимается
loyalty_case(true, 'dc1_1_bad'); $GLOBALS['api_reply'] = $quote10; WC()->cart->recalculate();
check('Malformed card ignored, no API call', count($GLOBALS['api_calls']) === 0);

// Старый купон в корзине – скидка по карте не добавляется (нет двойной скидки)
loyalty_case(true, $CARD); $GLOBALS['api_reply'] = $quote10; WC()->cart->coupon = true; WC()->cart->base = 900; WC()->cart->recalculate();
check('Coupon present: no card fee on top', count(fees_named(HI_Club_Checkout::CARD_FEE)) === 0 && local_total() === 900.0);

// Хайк: 10% по карте, 3% нет
loyalty_case(true, $CARD, 'hike'); $GLOBALS['api_reply'] = $quote10; WC()->cart->recalculate();
check('Hike with card: 900', local_total() === 900.0);

// Заказ: метаданные, учёт при оплате, повтор безопасен, возврат
loyalty_case(true, $CARD); $GLOBALS['api_reply'] = $quote10; WC()->cart->recalculate();
$order = new WC_Order(); HI_Club_Checkout::stamp_order($order, array());
check('Order stores card, gross, discount', $order->get_meta('_hi_club_card') === $CARD && $order->get_meta('_hi_club_gross') === 100000 && $order->get_meta('_hi_club_card_discount') === 10000);
$GLOBALS['api_calls'] = array(); HI_Club_Checkout::ledger_confirm($order);
check('Paid order: reserve then confirm with order reference', array_column(array_column($GLOBALS['api_calls'], 'body'), 'action') === array('reserve', 'confirm') && $GLOBALS['api_calls'][0]['body']['reference'] === 'wc501');
check('Ledger marked confirmed', $order->get_meta('_hi_club_ledger') === 'confirmed');
HI_Club_Checkout::ledger_confirm($order);
check('Second status hook does not double count', count($GLOBALS['api_calls']) === 2);
HI_Club_Checkout::ledger_refund($order);
check('Cancel after payment refunds full gross', end($GLOBALS['api_calls'])['body']['action'] === 'refund' && $order->get_meta('_hi_club_ledger') === 'refunded');

// Ошибка учёта – заметка в заказе, без исключений
$o2 = new WC_Order(); $o2->meta = array('_hi_club_card' => $CARD, '_hi_club_gross' => 100000, '_hi_club_card_discount' => 10000);
$GLOBALS['api_reply'] = 'timeout'; HI_Club_Checkout::ledger_confirm($o2);
check('Ledger failure leaves order note', $o2->get_meta('_hi_club_ledger') === 'error' && count($o2->notes) === 1);

// Заказ без карты не трогает журнал
$o3 = new WC_Order(); $GLOBALS['api_calls'] = array(); HI_Club_Checkout::ledger_confirm($o3);
check('Order without card: no ledger calls', count($GLOBALS['api_calls']) === 0);

// ---- сроки заказа на хайк ----
$tz = new DateTimeZone('Europe/Moscow');
check('Regular: deadline is 17:00 the day before', HI_Club_Checkout::hike_deadline('2026-10-25', false)->format('Y-m-d H:i') === '2026-10-24 17:00');
check('Ready food: deadline is 20:00 two days before', HI_Club_Checkout::hike_deadline('2026-10-25', true)->format('Y-m-d H:i') === '2026-10-23 20:00');
check('Regular open at 16:59 the day before', HI_Club_Checkout::hike_open('2026-10-25', false, new DateTimeImmutable('2026-10-24 16:59', $tz)));
check('Regular closed at 17:00 the day before', !HI_Club_Checkout::hike_open('2026-10-25', false, new DateTimeImmutable('2026-10-24 17:00', $tz)));
check('Ready food closed the day before', !HI_Club_Checkout::hike_open('2026-10-25', true, new DateTimeImmutable('2026-10-24 09:00', $tz)));
check('Ready food open two days before at 19:59', HI_Club_Checkout::hike_open('2026-10-25', true, new DateTimeImmutable('2026-10-23 19:59', $tz)));

// ---- уведомления о заказах на хайк ----
loyalty_case(true, $CARD, 'hike'); $GLOBALS['api_reply'] = array('code' => 200, 'body' => array('ok' => true));
$h = new WC_Order(); $h->meta = array('_hi_club_way' => 'hike', '_hi_club_hike_date' => '2026-10-25', '_hi_club_hike_route' => 'Ай-Петри', '_hi_club_card_discount' => 4760);
$GLOBALS['api_calls'] = array(); HI_Club_Checkout::notify_paid($h);
$p = $GLOBALS['api_calls'][0]['body'] ?? array();
check('Paid hike order sent to club with details', ($p['action'] ?? '') === 'hike_order' && $p['order']['status'] === 'paid' && $p['order']['date'] === '2026-10-25' && $p['order']['name'] === 'Анна К' && $p['order']['total'] === 47600);
HI_Club_Checkout::notify_paid($h);
check('Paid notice sent once', count($GLOBALS['api_calls']) === 1);
HI_Club_Checkout::notify_cancelled($h);
check('Cancellation of paid hike order is reported', count($GLOBALS['api_calls']) === 2 && $GLOBALS['api_calls'][1]['body']['order']['status'] === 'cancelled');
$home = new WC_Order(); $home->meta = array('_hi_club_way' => 'home'); $GLOBALS['api_calls'] = array(); HI_Club_Checkout::notify_paid($home);
check('Non-hike orders are not reported', count($GLOBALS['api_calls']) === 0);

echo json_encode(array('engine' => PHP_VERSION, 'checks' => $checks), JSON_UNESCAPED_UNICODE);
