<?php
require __DIR__ . '/bootstrap.php';
$checks = array();
function check($name, $condition) {
    global $checks;
    $checks[] = array('name' => $name, 'passed' => (bool) $condition);
    if (!$condition) throw new Exception('FAILED: ' . $name);
}
start_case(false, false, 'pickup', false);
WC()->cart->recalculate();
check('Plugin off: ordinary pickup remains 970', local_total() === 970.0);
check('Plugin off: no storefront callback registered', $GLOBALS['store_callback'] === null);
check('Activation does not create options', $GLOBALS['options'] === array());

start_case(true, false, 'pickup', false);
WC()->cart->recalculate();
check('Ordinary visitor keeps 3% with plugin enabled', local_total() === 970.0);
ob_start(); HI_Club_Checkout::render(); $html = ob_get_clean();
check('Ordinary visitor gets no club UI', $html === '');
check('No extra fee hooks added to ordinary totals', count(fees_named('Скидка за самовывоз')) === 1);

start_case(true, true, 'pickup', false);
WC()->cart->recalculate();
check('Club without card, pickup: 970', local_total() === 970.0);

start_case(true, true, 'pickup', true);
WC()->cart->recalculate();
check('Club coupon, pickup: 900 instead of 873', local_total() === 900.0);
WC()->cart->recalculate();
check('Repeated recalculation does not accumulate corrections', local_total() === 900.0);
WC()->cart->coupon = false; WC()->cart->base = 1000; WC()->cart->recalculate();
check('Removing club coupon restores ordinary pickup discount', local_total() === 970.0);

start_case(true, true, 'hike', false);
WC()->cart->recalculate();
check('Hike without card: 1000, no pickup discount', local_total() === 1000.0);
check('Hike retains actual existing local_pickup:8', WC()->session->get('chosen_shipping_methods') === array('local_pickup:8'));
check('Hike uses existing pickup address handling', apply_filters('woocommerce_checkout_fields', array('billing' => array('billing_address_1' => array('required' => true))))['billing']['billing_address_1']['required'] === false);
$_POST = array('eco_fulfillment_type' => 'pickup', 'hi_club_way' => 'hike', 'payment_method' => 'yookassa_sbp', 'hi_club_date' => date('Y-m-d', time() + 7 * 86400));
$errors = new WP_Error(); do_action('woocommerce_after_checkout_validation', array(), $errors);
check('Valid hike passes local validation', !$errors->errors);
$order = new WC_Order(); do_action('woocommerce_checkout_create_order', $order, array());
check('Order retains old pickup mode for theme compatibility', $order->get_meta('_eco_fulfillment_type') === 'pickup');
check('Order separately stores hike/date/route', $order->get_meta('_hi_club_way') === 'hike' && $order->get_meta('_hi_club_hike_route') === 'Ай-Петри' && $order->get_meta('_hi_club_hike_date') === $_POST['hi_club_date']);
check('Order shipping title identifies hike handover', $order->shipping->title === 'Получить на хайке');
$totals = apply_filters('woocommerce_get_order_item_totals', array('payment_method' => array('label' => 'Оплата', 'value' => 'Тест')), $order, 'incl');
check('Customer/email totals identify hike handover', $totals['eco_fulfillment_type']['value'] === 'Получить на хайке' && isset($totals['hi_club_hike']));

start_case(true, true, 'hike', true); WC()->cart->recalculate();
check('Hike with card: 900', local_total() === 900.0);
do_action('woocommerce_checkout_update_order_review', 'eco_fulfillment_type=delivery&hi_club_way=home');
WC()->cart->recalculate();
check('Switch hike to home: delivery method restored', WC()->session->get('chosen_shipping_methods') === array('flat_rate:5') && HI_Club_Checkout::context()['way'] === 'home');
check('Home has no pickup discount', local_total() === 900.0);
do_action('woocommerce_checkout_update_order_review', 'eco_fulfillment_type=pickup&hi_club_way=pickup');
WC()->cart->recalculate();
check('Switch home to ordinary pickup: hike flag removed', !HI_Club_Checkout::is_hike() && HI_Club_Checkout::context()['way'] === 'pickup');

start_case(true, true, 'pickup', true);
add_action('woocommerce_cart_calculate_fees', function ($cart) { $cart->fees_api()->add_fee(array('id' => 'other', 'name' => 'Другой сбор', 'amount' => 50, 'taxable' => true, 'tax_class' => 'reduced')); }, 35);
WC()->cart->recalculate(); $other = fees_named('Другой сбор');
check('Unrelated fee amount and tax properties preserved', local_total() === 950.0 && count($other) === 1 && $other[0]->taxable === true && $other[0]->tax_class === 'reduced');

start_case(true, true, 'pickup', true);
add_action('woocommerce_cart_calculate_fees', function ($cart) { $fees = $cart->fees_api()->get_fees(); foreach ($fees as $f) $f->amount = -50; $cart->fees_api()->set_fees($fees); }, 35);
WC()->cart->recalculate();
check('Unexpected same-name fee is not silently removed', count(fees_named('Скидка за самовывоз')) === 1);
$_POST = array('eco_fulfillment_type' => 'pickup', 'hi_club_way' => 'pickup');
$errors = new WP_Error(); do_action('woocommerce_after_checkout_validation', array(), $errors);
check('Unexpected discount blocks incorrect payment in club order', isset($errors->errors['hi_club_discount']));

start_case(true, true, 'hike', true);
$_POST = array('eco_fulfillment_type' => 'pickup', 'hi_club_way' => 'hike', 'payment_method' => 'yookassa_sbp', 'hi_club_date' => '2020-02-31');
$errors = new WP_Error(); do_action('woocommerce_after_checkout_validation', array(), $errors);
check('Impossible/past hike date rejected', isset($errors->errors['hi_club_date']));

start_case(true, false, 'pickup', false);
$_POST = array('eco_fulfillment_type' => 'pickup', 'hi_club_way' => 'hike');
$errors = new WP_Error(); do_action('woocommerce_after_checkout_validation', array(), $errors);
check('Hike request without club session is rejected', isset($errors->errors['hi_club_context']));

start_case(true, true, 'hike', true);
$context = HI_Club_Checkout::context(); $context['expires'] = time() - 1; WC()->session->set(HI_Club_Checkout::SESSION, $context);
ob_start(); HI_Club_Checkout::render(); $html = ob_get_clean();
check('Expired session no longer renders club UI', $html === '');
$_POST = array('eco_fulfillment_type' => 'pickup', 'hi_club_way' => 'hike');
$errors = new WP_Error(); do_action('woocommerce_after_checkout_validation', array(), $errors);
check('Expired open checkout cannot silently submit hike as normal pickup', isset($errors->errors['hi_club_context']));

start_case(true, true, 'hike', true);
WC()->cart->packages[] = array('contents' => array());
$_POST = array('eco_fulfillment_type' => 'pickup', 'hi_club_way' => 'hike');
$errors = new WP_Error(); do_action('woocommerce_after_checkout_validation', array(), $errors);
check('Multiple shipping packages fail safely for hike pilot', isset($errors->errors['hi_club_shipping']));

start_case(true, true, 'hike', true); do_action('woocommerce_cart_emptied');
check('Empty/completed cart clears club session', HI_Club_Checkout::context() === null);

start_case(true, false, 'pickup', false);
try { call_user_func($GLOBALS['store_callback'], array('source' => 'elsewhere', 'pilot' => '1', 'way' => 'hike')); $rejected = false; } catch (Exception $e) { $rejected = true; }
check('Missing club source cannot initialize pilot', $rejected && HI_Club_Checkout::context() === null);
try { call_user_func($GLOBALS['store_callback'], array('source' => 'intelligentsia', 'way' => 'pickup')); $rejected = false; } catch (Exception $e) { $rejected = true; }
check('Missing pilot marker cannot initialize pilot', $rejected);
try { call_user_func($GLOBALS['store_callback'], array('source' => array('intelligentsia'), 'pilot' => '1', 'way' => 'pickup')); $rejected = false; } catch (Exception $e) { $rejected = true; }
check('Malformed array input rejected without warnings', $rejected);

start_case(true, true, 'hike', false);
$first = WC()->session; $GLOBALS['wc']->session = new LocalSession();
check('Club state does not leak into another customer session', HI_Club_Checkout::context() === null);
$GLOBALS['wc']->session = $first;
check('Original customer keeps own club context', HI_Club_Checkout::context()['way'] === 'hike');

$gateways = array('cod' => (object) array('id'=>'cod'), 'cod_second' => (object) array('id'=>'cod_second'), 'yookassa_sbp' => (object) array('id'=>'yookassa_sbp'));
foreach (array(false, true) as $club) {
    start_case(true, $club, 'pickup', false);
    check('Pickup preserves all payment objects, club=' . (int)$club, apply_filters('woocommerce_available_payment_gateways', $gateways) === $gateways);
}
start_case(true, true, 'hike', false);
check('Hike only keeps the existing SBP object', apply_filters('woocommerce_available_payment_gateways', $gateways) === array('yookassa_sbp'=>$gateways['yookassa_sbp']));
check('Unavailable SBP never falls back to cash', apply_filters('woocommerce_available_payment_gateways', array('cod'=>$gateways['cod'])) === array());
$_POST = array('eco_fulfillment_type'=>'pickup','hi_club_way'=>'hike','payment_method'=>'cod');
$errors=new WP_Error(); HI_Club_Checkout::validate(array(), $errors);
check('Forged cash payment for hike is rejected on server', isset($errors->errors['hi_club_payment']));
$_POST=array('eco_fulfillment_type'=>'pickup','hi_club_way'=>'pickup');
do_action('woocommerce_checkout_process');
check('Submit changing hike to pickup restores gateways before payment validation', apply_filters('woocommerce_available_payment_gateways',$gateways)===$gateways);
$fields=array('billing'=>array('billing_eco_delivery_date'=>array('required'=>true),'billing_eco_delivery_time'=>array('required'=>true),'billing_email'=>array('required'=>true)));
check('Native pickup fields remain required', HI_Club_Checkout::slot_fields($fields)===$fields);
$_POST=array('eco_fulfillment_type'=>'pickup','hi_club_way'=>'hike');
do_action('woocommerce_checkout_process');
$hikefields=HI_Club_Checkout::slot_fields($fields);
check('Hike disables only the two native slot requirements', !$hikefields['billing']['billing_eco_delivery_date']['required'] && !$hikefields['billing']['billing_eco_delivery_time']['required'] && $hikefields['billing']['billing_email']['required']);
$posted=array('billing_eco_delivery_date'=>'2026-10-20','billing_eco_delivery_time'=>'SLOT_10:00_12:00','billing_email'=>'local@example.invalid');
check('Hike strips stale native slot values from order data', HI_Club_Checkout::posted_data($posted)===array('billing_email'=>'local@example.invalid'));
$fragment=HI_Club_Checkout::fragments(array('other'=>'unchanged'));
check('Discount fragment preserves unrelated fragments and reflects no coupon', $fragment['other']==='unchanged' && strpos($fragment['#hi-club-discount-state'],'data-card="0"')!==false);
WC()->cart->coupon=true;
check('Discount fragment reflects actual applied coupon', strpos(HI_Club_Checkout::fragments(array())['#hi-club-discount-state'],'data-card="1"')!==false);
start_case(false, false, 'pickup', false);
check('Off mode registers no payment or slot handlers', empty($GLOBALS['hooks']['woocommerce_available_payment_gateways']) && empty($GLOBALS['hooks']['woocommerce_checkout_process']));
start_case(true,false,'pickup',false);
check('Ordinary visitor gets no club fragments', HI_Club_Checkout::fragments(array('other'=>'same'))===array('other'=>'same'));

echo json_encode(array('engine' => PHP_VERSION, 'kind' => 'local contract tests with actual theme callbacks and WooCommerce 10.5.3 fees class; not a full live-store test', 'checks' => $checks), JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . "\n";
