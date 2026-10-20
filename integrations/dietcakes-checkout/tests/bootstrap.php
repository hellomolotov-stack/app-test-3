<?php
// Local contract harness, not WordPress. Real theme callbacks and WooCommerce fees API are loaded below.
define('ABSPATH', __DIR__ . '/');
$GLOBALS['hooks'] = array();
$GLOBALS['options'] = array();
$GLOBALS['store_callback'] = null;
function add_action($tag, $callback, $priority = 10, $args = 1) { $GLOBALS['hooks'][$tag][$priority][] = array($callback, $args); }
function remove_action($tag, $callback, $priority = 10) {
    $removed = false;
    foreach ($GLOBALS['hooks'][$tag][$priority] ?? array() as $i => $row) {
        if ($row[0] === $callback) { unset($GLOBALS['hooks'][$tag][$priority][$i]); $removed = true; }
    }
    return $removed;
}
function add_filter($tag, $callback, $priority = 10, $args = 1) { add_action($tag, $callback, $priority, $args); }
function do_action($tag, ...$args) {
    $hooks = $GLOBALS['hooks'][$tag] ?? array(); ksort($hooks);
    foreach ($hooks as $rows) foreach ($rows as $row) call_user_func_array($row[0], array_slice($args, 0, $row[1]));
}
function apply_filters($tag, $value, ...$args) {
    $hooks = $GLOBALS['hooks'][$tag] ?? array(); ksort($hooks);
    foreach ($hooks as $rows) foreach ($rows as $row) $value = call_user_func_array($row[0], array_slice(array_merge(array($value), $args), 0, $row[1]));
    return $value;
}
function get_option($key, $default = false) { return $GLOBALS['options'][$key] ?? $default; }
function update_option($key, $value, $autoload = null) { $GLOBALS['options'][$key] = $value; }
function is_admin() { return false; }
function wp_doing_ajax() { return false; }
function is_checkout() { return true; }
function is_order_received_page() { return false; }
function sanitize_text_field($value) { return trim(strip_tags(preg_replace('/[\r\n\t]+/', ' ', $value))); }
function sanitize_title($value) { return rawurlencode(mb_strtolower(trim($value))); }
function wc_get_price_decimals() { return 2; }
function wc_price($value) { return number_format($value, 2, '.', '') . ' ₽'; }
function wp_parse_args($args, $defaults = array()) { return array_merge($defaults, (array) $args); }
function absint($value) { return abs((int) $value); }
function __($s, $domain = '') { return $s; }
function doing_action($name) { return false; }
function wp_unslash($value) { return $value; }
function esc_attr($value) { return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8'); }
function esc_html($value) { return esc_attr($value); }
function wp_date($format, $timestamp = null, $tz = null) { return (new DateTimeImmutable('@' . ($timestamp ?? time())))->setTimezone($tz ?? new DateTimeZone('Europe/Moscow'))->format($format); }
function woocommerce_store_api_register_update_callback($options) { $GLOBALS['store_callbacks'][$options['namespace']] = $options['callback']; if ($options['namespace'] === 'hiking-club') $GLOBALS['store_callback'] = $options['callback']; }
class WC_Tax {
    static function get_tax_class_slugs() { return array('reduced'); }
    static function get_tax_classes() { return array('Reduced'); }
}
function wc_string_to_bool($value) { return $value === true || in_array(strtolower((string) $value), array('yes', 'true', '1'), true); }
function wc_format_decimal($value) { return (string) (float) $value; }
class WP_Error {
    public $errors = array();
    function __construct($code = '', $message = '') { if ($code) $this->add($code, $message); }
    function add($code, $message) { $this->errors[$code][] = $message; }
}
require __DIR__ . '/fixtures/class-wc-cart-fees.php';
class LocalSession {
    public $values = array();
    function get($key, $default = null) { return $this->values[$key] ?? $default; }
    function set($key, $value) { $this->values[$key] = $value; }
    function __unset($key) { unset($this->values[$key]); }
    function set_customer_session_cookie($value) {}
}
class LocalCart {
    public $base = 1000;
    public $coupon = false;
    public $packages = array(array('contents' => array()));
    private $fees;
    function __construct() { $this->fees = new WC_Cart_Fees(); }
    function fees_api() { return $this->fees; }
    function get_cart_contents_total() { return $this->base; }
    function has_discount($code) { return $code === 'intelligent' && $this->coupon; }
    function get_shipping_packages() { return $this->packages; }
    function add_fee($name, $amount, $taxable = false) { return $this->fees->add_fee(array('name' => $name, 'amount' => $amount, 'taxable' => $taxable)); }
    function recalculate() { $this->fees->remove_all_fees(); do_action('woocommerce_cart_calculate_fees', $this); }
}
class LocalShippingItem {
    public $title = 'Самовывоз';
    function get_method_id() { return 'local_pickup'; }
    function get_instance_id() { return 8; }
    function set_method_title($value) { $this->title = $value; }
}
class WC_Order {
    public $meta = array();
    public $shipping;
    function __construct() { $this->shipping = new LocalShippingItem(); }
    function delete_meta_data($key) { unset($this->meta[$key]); }
    function update_meta_data($key, $value) { $this->meta[$key] = $value; }
    function get_meta($key) { return $this->meta[$key] ?? ''; }
    function get_items($type) { return array($this->shipping); }
    public $id = 501; public $notes = array(); public $saved = 0;
    function get_id() { return $this->id; }
    function add_order_note($n) { $this->notes[] = $n; }
    function save() { $this->saved++; }
    function get_order_number() { return (string) $this->id; }
    function get_billing_first_name() { return 'Анна'; } function get_billing_last_name() { return 'К'; }
    function get_billing_phone() { return '+79780000000'; } function get_total() { return 476.0; }
}
// Заглушка API клуба: записываем запросы, ответ задаёт тест.
$GLOBALS['api_calls'] = array(); $GLOBALS['api_reply'] = null;
function wp_remote_post($url, $args) { $GLOBALS['api_calls'][] = array('url' => $url, 'timeout' => $args['timeout'], 'headers' => $args['headers'], 'body' => json_decode($args['body'], true));
    $r = is_callable($GLOBALS['api_reply']) ? call_user_func($GLOBALS['api_reply'], json_decode($args['body'], true)) : $GLOBALS['api_reply'];
    return $r === 'timeout' ? new WP_Error('http', 'timeout') : $r; }
function is_wp_error($v) { return $v instanceof WP_Error; }
function wp_remote_retrieve_body($r) { return is_array($r) ? json_encode($r['body']) : ''; }
function wp_remote_retrieve_response_code($r) { return is_array($r) ? $r['code'] : 0; }
function wp_json_encode($v) { return json_encode($v); }
function WC() { return $GLOBALS['wc']; }
$GLOBALS['wc'] = (object) array('session' => new LocalSession(), 'cart' => new LocalCart());
require __DIR__ . '/../hi-club-checkout/hi-club-checkout.php';
function start_case($enabled = true, $club = true, $way = 'pickup', $card = false) {
    $GLOBALS['hooks'] = array();
    $GLOBALS['options'] = $enabled ? array(HI_Club_Checkout::OPTION => 'pilot') : array();
    $GLOBALS['store_callback'] = null;
    $_POST = array();
    $GLOBALS['wc'] = (object) array('session' => new LocalSession(), 'cart' => new LocalCart());
    HI_Club_Checkout::boot();
    // Theme functions cannot be redeclared between cases; callbacks can be registered again.
    include __DIR__ . '/fixtures/dietcakes-checkout.php';
    do_action('woocommerce_blocks_loaded');
    WC()->cart->coupon = $card;
    WC()->cart->base = $card ? 900 : 1000;
    if ($enabled && $club) {
        call_user_func($GLOBALS['store_callback'], array('source' => 'intelligentsia', 'pilot' => '1', 'way' => $way, 'date' => date('Y-m-d', time() + 7 * 86400), 'route' => 'Ай-Петри'));
    } else {
        WC()->session->set('eco_fulfillment_type', $way === 'home' ? 'delivery' : 'pickup');
        WC()->session->set('chosen_shipping_methods', array($way === 'home' ? 'flat_rate:5' : 'local_pickup:8'));
    }
}
function fees_named($name) { return array_values(array_filter(WC()->cart->fees_api()->get_fees(), function ($fee) use ($name) { return $fee->name === $name; })); }
function local_total() { return round(WC()->cart->base + array_sum(array_map(function ($f) { return $f->amount; }, WC()->cart->fees_api()->get_fees())), 2); }
