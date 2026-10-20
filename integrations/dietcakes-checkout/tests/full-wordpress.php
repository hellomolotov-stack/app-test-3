<?php
// Execute only in disposable WordPress Playground. Never copy into the store.
register_shutdown_function(function(){file_put_contents('/hi-reports/local-last-error.json',json_encode(error_get_last()));});
require '/wordpress/wp-load.php';
if (strpos(home_url(), '127.0.0.1') === false) throw new Exception('Local test site required');
require '/hi-fixtures/eco-delivery-slots.php';
// Fake local gateway: no network, no payment processing.
class HI_Local_SBP_Gateway extends WC_Payment_Gateway {
    public function __construct() { $this->id='yookassa_sbp'; $this->enabled='yes'; $this->title='Local SBP'; }
    public function process_payment($id) { throw new Exception('Payments are forbidden in local tests'); }
}
add_filter('woocommerce_payment_gateways', function($gateways) { $gateways[]='HI_Local_SBP_Gateway'; return $gateways; });
$checks = array();
function hi_full_check($name, $condition) {
    global $checks;
    $checks[] = array('name' => $name, 'passed' => (bool) $condition);
    file_put_contents('/hi-reports/local-progress.json',json_encode($checks));
    if (!$condition) throw new Exception('FAILED: ' . $name);
}
update_option('woocommerce_currency', 'RUB');
update_option('woocommerce_default_country', 'RU');
update_option('woocommerce_calc_taxes', 'no');
update_option('woocommerce_enable_guest_checkout', 'yes');
update_option('woocommerce_default_customer_address', 'base');
$product = new WC_Product_Simple();
$product->set_name('Local test product'); $product->set_regular_price('1000'); $product->set_status('publish');
$product_id = $product->save();
$coupon = new WC_Coupon(); $coupon->set_code('intelligent'); $coupon->set_discount_type('percent'); $coupon->set_amount(10); $coupon->save();
$zone = new WC_Shipping_Zone(0);
$ids = array();
for ($i = 1; $i <= 8; $i++) $ids[] = $zone->add_shipping_method($i === 8 ? 'local_pickup' : 'flat_rate');
hi_full_check('Shipping fixture matches actual store instance IDs 5 and 8', $ids[4] === 5 && $ids[7] === 8);
foreach ($ids as $id) {
    $type = $id === 8 ? 'local_pickup' : 'flat_rate';
    update_option('woocommerce_' . $type . '_' . $id . '_settings', array('title' => $id === 8 ? 'Самовывоз' : 'Доставка', 'cost' => '0', 'tax_status' => 'none'));
    if ($id !== 5 && $id !== 8) {
        global $wpdb;
        $wpdb->update($wpdb->prefix . 'woocommerce_shipping_zone_methods', array('is_enabled' => 0), array('instance_id' => $id));
    }
}
wp_set_current_user(0);
if (!WC()->session) wc_load_cart();
WC()->customer->set_billing_country('RU'); WC()->customer->set_shipping_country('RU');
WC()->customer->set_billing_city('Test'); WC()->customer->set_shipping_city('Test');
WC()->customer->set_billing_postcode('298600'); WC()->customer->set_shipping_postcode('298600');
WC()->customer->set_billing_address_1('Test'); WC()->customer->set_shipping_address_1('Test');
$GLOBALS['hi_test_product_id'] = $product_id;
function hi_full_start($club, $way, $card) {
    WC()->cart->empty_cart();
    WC()->cart->add_to_cart($GLOBALS['hi_test_product_id'], 1);
    if ($club) HI_Club_Checkout::set_context(array('source' => 'intelligentsia', 'pilot' => '1', 'way' => $way, 'date' => date('Y-m-d', time() + 7*86400), 'route' => 'Ай-Петри'));
    else {
        WC()->session->set('eco_fulfillment_type', $way === 'home' ? 'delivery' : 'pickup');
        WC()->session->set('chosen_shipping_methods', array($way === 'home' ? 'flat_rate:5' : 'local_pickup:8'));
    }
    if ($card) WC()->cart->apply_coupon('intelligent');
    WC()->cart->calculate_totals();
}
function hi_full_total() { return round((float) WC()->cart->get_total('edit'), 2); }
hi_full_start(false, 'pickup', false);
hi_full_check('Real Woo ordinary customer pickup total 970', hi_full_total() === 970.0);
hi_full_check('Real Woo ordinary customer no club state', HI_Club_Checkout::context() === null);
hi_full_start(true, 'pickup', false);
hi_full_check('Real Woo club customer without coupon retains 3%', hi_full_total() === 970.0);
hi_full_start(true, 'pickup', true);
hi_full_check('Real Woo coupon plus pickup is 900, not 873', hi_full_total() === 900.0);
WC()->cart->calculate_totals();
hi_full_check('Real Woo repeated total stays 900', hi_full_total() === 900.0);
WC()->cart->remove_coupon('intelligent'); WC()->cart->calculate_totals();
hi_full_check('Real Woo removing coupon restores 970', hi_full_total() === 970.0);
hi_full_start(true, 'hike', false);
hi_full_check('Real Woo hike without coupon is 1000', hi_full_total() === 1000.0);
hi_full_start(true, 'hike', true);
hi_full_check('Real Woo hike with coupon is 900', hi_full_total() === 900.0);
do_action('woocommerce_checkout_update_order_review', 'eco_fulfillment_type=delivery&hi_club_way=home'); WC()->cart->calculate_totals();
hi_full_check('Real Woo switches back to native delivery', WC()->session->get('chosen_shipping_methods') === array('flat_rate:5') && hi_full_total() === 900.0);
do_action('woocommerce_checkout_update_order_review', 'eco_fulfillment_type=pickup&hi_club_way=hike'); WC()->cart->calculate_totals();
hi_full_check('Real Woo switches back to native pickup for hike', HI_Club_Checkout::is_hike() && hi_full_total() === 900.0);
$data = array('billing_first_name' => 'Local', 'billing_last_name' => 'Test', 'billing_email' => 'test@example.invalid', 'billing_phone' => '+70000000000', 'billing_country' => 'RU', 'billing_city' => 'Test', 'billing_address_1' => 'Test', 'billing_postcode' => '298600', 'shipping_country' => 'RU', 'shipping_city' => 'Test', 'shipping_address_1' => 'Test', 'shipping_postcode' => '298600', 'payment_method' => 'yookassa_sbp', 'customer_note' => 'Local test only', 'ship_to_different_address' => false);
$_POST = array_merge($data, array('eco_fulfillment_type' => 'pickup', 'hi_club_way' => 'hike', 'hi_club_date' => date('Y-m-d', time()+7*86400)));
do_action('woocommerce_checkout_process');
hi_full_check('Actual ECO slot validation does not demand native time for hike', wc_notice_count('error')===0);
$errors = new WP_Error(); do_action('woocommerce_after_checkout_validation', $data, $errors);
hi_full_check('Real Woo club validation has no errors', !$errors->has_errors());
$id = WC()->checkout()->create_order(apply_filters('woocommerce_checkout_posted_data', $data));
hi_full_check('Real Woo checkout creates local order', !is_wp_error($id) && $id > 0);
$order = wc_get_order($id);
hi_full_check('Real order total is 900', round((float) $order->get_total(),2) === 900.0);
hi_full_check('Real order stores native pickup plus separate hike choice', $order->get_meta('_eco_fulfillment_type') === 'pickup' && $order->get_meta('_hi_club_way') === 'hike');
hi_full_check('Real order saves date and route', $order->get_meta('_hi_club_hike_date') === $_POST['hi_club_date'] && $order->get_meta('_hi_club_hike_route') === 'Ай-Петри');
$shipping = array_values($order->get_items('shipping'));
hi_full_check('Real order shipping label is exactly Получить на хайке', count($shipping) === 1 && $shipping[0]->get_method_title() === 'Получить на хайке');
$totals = $order->get_order_item_totals();
hi_full_check('Real customer order totals identify hike', ($totals['eco_fulfillment_type']['value'] ?? '') === 'Получить на хайке');

hi_full_check('Hike order has no stale native pickup time/date', !$order->get_meta('_eco_pickup_date') && !$order->get_meta('_eco_pickup_time'));
$fields=WC()->checkout()->get_checkout_fields();
hi_full_check('Real Woo cached slot requirements are disabled only for hike', !$fields['billing'][HI_Club_Checkout::SLOT_DATE]['required'] && !$fields['billing'][HI_Club_Checkout::SLOT_TIME]['required'] && $fields['billing']['billing_email']['required']);
$available=WC()->payment_gateways()->get_available_payment_gateways();
hi_full_check('Real Woo available gateway list is SBP only for hike', array_keys($available)===array('yookassa_sbp'));
$_POST['payment_method']='cod';
$errors=new WP_Error(); do_action('woocommerce_after_checkout_validation',$data,$errors);
hi_full_check('Cash rejected by hike server validator', $errors->get_error_message('hi_club_payment')!=='');
$method=new ReflectionMethod(WC_Checkout::class,'validate_checkout');
$cash=$data; $cash['payment_method']='cod'; $errors=new WP_Error();
$method->invokeArgs(WC()->checkout(), array(&$cash,&$errors));
hi_full_check('WooCommerce itself also rejects cash for hike', $errors->get_error_message('payment')!=='');
$_POST['payment_method']='yookassa_sbp';
$valid=$data; $errors=new WP_Error();
$method->invokeArgs(WC()->checkout(),array(&$valid,&$errors));
file_put_contents('/hi-reports/core-validation-errors.json',json_encode($errors->errors));
hi_full_check('WooCommerce accepts local SBP without native slot requirements', !$errors->has_errors());
// Reattach the native hooks to model the next HTTP request (WordPress loads them anew).
function hi_restore_eco_hooks() {
    add_action('woocommerce_checkout_process',array('ECO_Delivery_Slots','validate_fields'),10);
    add_action('woocommerce_checkout_create_order',array('ECO_Delivery_Slots','save_order_meta'),10,2);
    wc_clear_notices();
}
hi_restore_eco_hooks();
hi_full_start(false,'pickup',false);
$_POST=array('eco_fulfillment_type'=>'pickup','payment_method'=>'cod');
do_action('woocommerce_checkout_process');
hi_full_check('Ordinary pickup still invokes actual native slot validation', wc_notice_count('error')>0 && has_action('woocommerce_checkout_process',array('ECO_Delivery_Slots','validate_fields'))===10);
$native=apply_filters('woocommerce_checkout_fields',array('billing'=>array()));
hi_full_check('Ordinary pickup keeps required native date and time', $native['billing'][HI_Club_Checkout::SLOT_DATE]['required'] && $native['billing'][HI_Club_Checkout::SLOT_TIME]['required']);
$nativeOrder=new WC_Order();
$_POST[HI_Club_Checkout::SLOT_DATE]=date('Y-m-d',time()+7*86400);
$_POST[HI_Club_Checkout::SLOT_TIME]='SLOT_10:00_12:00';
do_action('woocommerce_checkout_create_order',$nativeOrder,array());
hi_full_check('Ordinary pickup still saves native slot metadata', $nativeOrder->get_meta('_eco_pickup_time')==='SLOT_10:00_12:00');
$nativeGateways=array('cod'=>(object)array('id'=>'cod'),'cod_second'=>(object)array('id'=>'cod_second'),'yookassa_sbp'=>(object)array('id'=>'yookassa_sbp'));
hi_full_check('Ordinary gateway objects are untouched', HI_Club_Checkout::payment_gateways($nativeGateways)===$nativeGateways);
hi_restore_eco_hooks();
hi_full_start(true,'hike',false);
$_POST=array('eco_fulfillment_type'=>'pickup','hi_club_way'=>'pickup','payment_method'=>'cod');
do_action('woocommerce_checkout_process');
hi_full_check('Switching to ordinary pickup restores native validation on submit', !HI_Club_Checkout::is_hike() && wc_notice_count('error')>0);
hi_full_check('Switching to ordinary pickup restores all payment objects', HI_Club_Checkout::payment_gateways($nativeGateways)===$nativeGateways);
hi_restore_eco_hooks();
hi_full_start(true,'hike',false);
$_POST=array('eco_fulfillment_type'=>'pickup','hi_club_way'=>'hike','payment_method'=>'yookassa_sbp',HI_Club_Checkout::SLOT_DATE=>'2020-01-01',HI_Club_Checkout::SLOT_TIME=>'SLOT_19:00_20:00');
do_action('woocommerce_checkout_process');
hi_full_check('Obsolete hidden slot values cannot block hike in actual ECO validator', wc_notice_count('error')===0);
$clean=apply_filters('woocommerce_checkout_posted_data',$_POST);
hi_full_check('Obsolete native slot data removed before order creation', !isset($clean[HI_Club_Checkout::SLOT_DATE]) && !isset($clean[HI_Club_Checkout::SLOT_TIME]));
$fakeOrder=new WC_Order(); $fakeOrder->update_meta_data('_eco_pickup_time','SLOT_19:00_20:00');
do_action('woocommerce_checkout_create_order',$fakeOrder,$clean);
hi_full_check('Hike stamping prevents contradictory native slot order metadata', !$fakeOrder->get_meta('_eco_pickup_time') && $fakeOrder->get_meta('_hi_club_hike_date')!=='' && $fakeOrder->get_meta('_hi_club_way')==='hike');
WC()->cart->empty_cart();
hi_full_check('Real cart cleanup clears club state', HI_Club_Checkout::context() === null);
$request = new WP_REST_Request('POST', '/wc/store/v1/cart/extensions');
$request->set_header('Nonce', wp_create_nonce('wc_store_api'));
$request->set_param('namespace', 'hiking-club');
$request->set_param('data', array('source' => 'intelligentsia', 'pilot' => '1', 'way' => 'pickup', 'date' => '', 'route' => 'Test'));
$response = rest_do_request($request);
hi_full_check('Real Store API accepts guest context through extension endpoint', $response->get_status() === 200 && HI_Club_Checkout::context()['way'] === 'pickup');
file_put_contents('/hi-reports/05-real-woocommerce.json', json_encode(array('wp' => get_bloginfo('version'), 'php' => PHP_VERSION, 'woocommerce' => WC_VERSION, 'checks' => $checks, 'scope' => 'Disposable real WordPress + WooCommerce, SQLite, saved checkout callbacks; actual ECO Delivery Slots 1.3.4 PHP source; Woodmart callbacks fixture; SBP stub only, no real payments or full live-store test'), JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT));
