<?php
namespace Automattic\WooCommerce\StoreApi\Utilities {
    class CartController {
        public function add_to_cart($r) {
            $cart = \WC()->cart; $product = \wc_get_product($r['id']);
            $key = 'item-' . $r['id']; $qty = ($cart->contents[$key]['quantity'] ?? 0) + $r['quantity'];
            if ($qty > $product->stock || $r['id'] === ($GLOBALS['fail_id'] ?? 0)) throw new \Exception('stock changed');
            $cart->contents[$key] = array('data' => $product, 'quantity' => $qty, 'product_id' => $r['id']);
            \do_action('woocommerce_add_to_cart', $key, $r['id'], $r['quantity']);
            return $key;
        }
        public function set_cart_item_quantity($key, $qty) {
            $cart = \WC()->cart; if ($qty > $cart->contents[$key]['data']->stock) throw new \Exception('stock changed');
            $cart->contents[$key]['quantity'] = $qty;
        }
    }
}
namespace {
require __DIR__ . '/bootstrap.php';
$checks = array();
function check($n, $v) { global $checks; $checks[] = array('name' => $n, 'passed' => (bool) $v); if (!$v) throw new Exception('FAILED: ' . $n); }
class BoxProduct {
    public $stock = 5; public $buy = true; public $simple = true;
    function is_type($type) { return $this->simple; } function is_purchasable() { return $this->buy; }
    function is_in_stock() { return $this->stock > 0; } function backorders_allowed() { return false; }
}
function wc_get_product($id) { return $GLOBALS['products'][$id] ?? null; }
function wc_add_notice($s, $type) { $GLOBALS['notices'][] = $s; }
class BoxCart extends LocalCart {
    public $contents = array(); public $removed = array(); public $totals_calls = 0;
    function get_cart_contents() { return $this->contents; } function set_cart_contents($c) { $this->contents = $c; }
    function get_cart() { return $this->contents; }
    function get_removed_cart_contents() { return $this->removed; } function set_removed_cart_contents($c) { $this->removed = $c; }
    function calculate_totals() { $this->totals_calls++; $this->base = array_sum(array_column($this->contents, 'quantity')) * 100; $this->recalculate(); }
    function remove_cart_item($key) { $this->removed[$key] = $this->contents[$key]; unset($this->contents[$key]); return true; }
}
function setup_box() {
    start_case(true, true, 'hike', false); $GLOBALS['wc']->cart = new BoxCart();
    $GLOBALS['products'] = array(1 => new BoxProduct(), 2 => new BoxProduct()); $GLOBALS['fail_id'] = 0; $GLOBALS['notices'] = array();
    $GLOBALS['options'][HI_Club_Checkout::LOYALTY] = 'on'; $GLOBALS['options'][HI_Club_Checkout::LOYALTY_KEY] = str_repeat('k', 40);
    HI_Club_Checkout::boot(); add_action('woocommerce_add_to_cart', array(WC()->cart, 'calculate_totals'), 20, 0);
    $GLOBALS['api_reply'] = function ($b) { return array('code' => 200, 'body' => array('discount' => (int) round($b['gross'] / 10))); };
    $GLOBALS['api_calls'] = array();
    return array('source' => 'intelligentsia', 'pilot' => '1', 'way' => 'hike', 'date' => date('Y-m-d', time() + 7 * 86400), 'card' => 'dc1_163665735_' . str_repeat('A',28), 'request_id' => 'test-request-0123456789', 'items' => array(array('id'=>1, 'quantity'=>2),array('id'=>2,'quantity'=>1)));
}
function rejected($data) { try { HI_Club_Checkout::set_box($data); return false; } catch (Throwable $e) { return true; } }
$d = setup_box(); HI_Club_Checkout::set_box($d);
check('Complete box added in one callback', count(WC()->cart->contents) === 2 && WC()->cart->contents['item-1']['quantity'] === 2);
check('No intermediate totals or quote requests', WC()->cart->totals_calls === 0 && count($GLOBALS['api_calls']) === 0);
WC()->cart->calculate_totals(); check('Final totals request applies signed card discount', count($GLOBALS['api_calls']) === 1 && count(fees_named(HI_Club_Checkout::CARD_FEE)) === 1);
ob_start(); HI_Club_Checkout::card_notice(); $notice = ob_get_clean(); check('Card summary reflects actual applied fee', strpos($notice, 'уже учтена') !== false);
WC()->cart->fees_api()->remove_all_fees(); ob_start(); HI_Club_Checkout::card_notice(); $notice=ob_get_clean(); check('Absent fee never presented as applied discount', strpos($notice, 'Не удалось') !== false && strpos($notice, 'уже учтена') === false);
HI_Club_Checkout::set_box($d); check('Repeated request adds no duplicate quantity', WC()->cart->contents['item-1']['quantity'] === 2);
$altered=$d;$altered['items'][0]['quantity']=3;check('Same request ID with changed payload rejected',rejected($altered));
check('Native per-item total hook restored after success', count($GLOBALS['hooks']['woocommerce_add_to_cart'][20] ?? array()) === 1);
$d=setup_box(); $before=WC()->cart->contents; $context=HI_Club_Checkout::context();$GLOBALS['fail_id']=2;
check('Late native stock failure rejects box',rejected($d));
check('Late failure restores entire prior cart',WC()->cart->contents===$before && HI_Club_Checkout::context()===$context);
check('Native totals hook restored after failure',count($GLOBALS['hooks']['woocommerce_add_to_cart'][20] ?? array())===1);
$d=setup_box();$d['items'][0]['quantity']=6;check('Native stock ceiling enforced',rejected($d)&&WC()->cart->contents===array());
$d=setup_box();$GLOBALS['products'][2]->stock=0;check('Unavailable product rejects before any item addition',rejected($d)&&WC()->cart->contents===array());
$d=setup_box();$d['items'][0]['quantity']='2';check('String quantities rejected',rejected($d));
$d=setup_box();$d['items'][]=$d['items'][0];check('Duplicate item IDs rejected',rejected($d));
$d=setup_box();$d['source']='other';check('Non-club source rejected without changing cart',rejected($d)&&WC()->cart->contents===array());
$d=setup_box();$d['request_id']='x';check('Malformed request identity rejected',rejected($d));
$d=setup_box();HI_Club_Checkout::set_box($d);$item=WC()->cart->contents['item-1'];
$html=HI_Club_Checkout::checkout_quantity('old',$item,'item-1');check('Checkout exposes minus plus remove and serialized quantity',strpos($html,'data-hi-step="-1"')!==false && strpos($html,'data-hi-remove')!==false && strpos($html,'hi_club_qty[item-1]')!==false);
HI_Club_Checkout::update_quantities('hi_club_qty[item-1]=4');check('Checkout increase reaches native controller',WC()->cart->contents['item-1']['quantity']===4);
HI_Club_Checkout::update_quantities('hi_club_qty[item-1]=8');check('Stock overflow preserves prior quantity and adds notice',WC()->cart->contents['item-1']['quantity']===4&&count($GLOBALS['notices'])===1);
HI_Club_Checkout::update_quantities('hi_club_qty[item-1]=1');check('Checkout decrease works',WC()->cart->contents['item-1']['quantity']===1);
HI_Club_Checkout::update_quantities('hi_club_qty[item-2]=0');check('Checkout removal works',!isset(WC()->cart->contents['item-2']));
HI_Club_Checkout::update_quantities('hi_club_qty[unknown]=3');check('Unknown cart key cannot add product',count(WC()->cart->contents)===1);
WC()->session->__unset(HI_Club_Checkout::SESSION);check('Ordinary checkout markup unchanged',HI_Club_Checkout::checkout_quantity('old',$item,'item-1')==='old');
HI_Club_Checkout::update_quantities('hi_club_qty[item-1]=3');check('Ordinary checkout update not intercepted',WC()->cart->contents['item-1']['quantity']===1);
echo json_encode(array('engine'=>PHP_VERSION,'checks'=>$checks),JSON_UNESCAPED_UNICODE);
}
