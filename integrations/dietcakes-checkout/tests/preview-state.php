<?php
$input = $_GET;
require __DIR__ . '/bootstrap.php';
$enabled = ($input['enabled'] ?? true) === true;
$club = ($input['club'] ?? true) === true;
$card = ($input['card'] ?? true) === true;
$way = in_array($input['way'] ?? '', array('home', 'pickup', 'hike'), true) ? $input['way'] : 'hike';
if (!$club || !$enabled) $way = $way === 'hike' ? 'pickup' : $way;
start_case($enabled, $club, $way, $card);
if ($enabled && $club) {
    $ctx = HI_Club_Checkout::context();
    $ctx['date'] = isset($input['date']) && is_string($input['date']) ? $input['date'] : date('Y-m-d', time() + 5 * 86400);
    WC()->session->set(HI_Club_Checkout::SESSION, $ctx);
}
WC()->cart->recalculate();
ob_start(); do_action('woocommerce_checkout_billing'); $markup = ob_get_clean();
ob_start(); do_action('wp_footer'); $theme_js = ob_get_clean();
$_POST = array('payment_method' => 'yookassa_sbp', 'eco_fulfillment_type' => $way === 'home' ? 'delivery' : 'pickup', 'hi_club_way' => $way, 'hi_club_date' => $input['date'] ?? date('Y-m-d', time() + 5 * 86400));
$errors = new WP_Error(); do_action('woocommerce_after_checkout_validation', array(), $errors);
$order = new WC_Order(); if (!$errors->errors) do_action('woocommerce_checkout_create_order', $order, array());
echo json_encode(array('markup' => $markup, 'theme_js' => $theme_js, 'total' => local_total(), 'fees' => array_values(WC()->cart->fees_api()->get_fees()), 'errors' => $errors->errors, 'order' => $order->meta, 'way' => $way, 'card' => $card, 'club' => $club, 'enabled' => $enabled), JSON_UNESCAPED_UNICODE);
