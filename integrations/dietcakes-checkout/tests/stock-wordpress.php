<?php
register_shutdown_function(function(){file_put_contents('/hi-reports/stock-last-error.json',json_encode(error_get_last()));});
require '/wordpress/wp-load.php';
if (strpos(home_url(), '127.0.0.1') === false) throw new Exception('Disposable local site required');
$checks = array();
function ck($name, $ok) { global $checks; $checks[] = array('name'=>$name,'passed'=>(bool)$ok); file_put_contents('/hi-reports/stock.json',json_encode($checks)); if (!$ok) throw new Exception($name); }
update_option('woocommerce_manage_stock','yes');update_option('woocommerce_hold_stock_minutes',60);
$p = new WC_Product_Simple();$p->set_name('LOCAL ONLY');$p->set_regular_price('100');$p->set_status('publish');$p->set_manage_stock(true);$p->set_stock_quantity(2);$pid=$p->save();
function hi_stock_order($pid,$club=true,$qty=1) { $o=wc_create_order();$o->add_product(wc_get_product($pid),$qty);$o->set_payment_method('yookassa_sbp');if($club){$o->update_meta_data('_hi_club_source','intelligentsia');HI_Club_Stock_Policy::stamp($o);}$o->calculate_totals();$o->save();return $o; }
$normal=hi_stock_order($pid,false);
ck('Ordinary hold duration remains native sixty minutes',apply_filters('woocommerce_order_hold_stock_minutes',60,$normal)===60);
// Playground SQLite cannot execute Woo's MySQL INSERT...SELECT FOR UPDATE.
// Seed an ordinary reservation as a fixture; read it through Woo's real reservation query.
global $wpdb;
$wpdb->insert($wpdb->wc_reserved_stock,array('order_id'=>$normal->get_id(),'product_id'=>$pid,'stock_quantity'=>1,'timestamp'=>gmdate('Y-m-d H:i:s'),'expires'=>gmdate('Y-m-d H:i:s',time()+3600)));
ck('Native held-stock query sees ordinary reservation fixture',wc_get_held_stock_quantity(wc_get_product($pid))===1);
$club=hi_stock_order($pid);wc_reserve_stock_for_order($club);
ck('Club order adds no reservation',wc_get_held_stock_quantity(wc_get_product($pid))===1);
ck('Pending club does not change physical stock',(int)wc_get_product($pid)->get_stock_quantity()===2);
wc_maybe_reduce_stock_levels($club->get_id());
ck('Pending club does not acquire reduced-stock flag',!$club->get_data_store()->get_stock_reduced($club->get_id()));
$club->update_status('on-hold');
ck('Unpaid on-hold club keeps physical stock and reduction flag',(int)wc_get_product($pid)->get_stock_quantity()===2&&!$club->get_data_store()->get_stock_reduced($club->get_id()));
ck('Validation counts other customers holds',HI_Club_Stock_Policy::unavailable(array(array('id'=>$pid,'quantity'=>2))));
ck('Validation allows available quantity',!HI_Club_Stock_Policy::unavailable(array(array('id'=>$pid,'quantity'=>1))));
ck('Validation aggregates repeated stock-managed items',HI_Club_Stock_Policy::unavailable(array(array('id'=>$pid,'quantity'=>1),array('id'=>$pid,'quantity'=>1))));
wc_release_stock_for_order($normal);
$club->payment_complete('local-no-real-payment');
ck('Native successful payment reduces stock once',(int)wc_get_product($pid)->get_stock_quantity()===1);
wc_maybe_reduce_stock_levels($club->get_id());ck('Duplicate payment hook cannot double reduce',(int)wc_get_product($pid)->get_stock_quantity()===1);
HI_Club_Stock_Policy::schedule($club);HI_Club_Stock_Policy::schedule($club);
ck('Only one expiration task per order',(bool)as_has_scheduled_action(HI_Club_Stock_Policy::HOOK,array($club->get_id()),HI_Club_Stock_Policy::GROUP));
$due=hi_stock_order($pid);$due->update_meta_data(HI_Club_Stock_Policy::DEADLINE,time()-1);$due->save();do_action(HI_Club_Stock_Policy::HOOK,$due->get_id());
ck('Expired unpaid club order cancelled',wc_get_order($due->get_id())->has_status('cancelled'));
ck('Cancellation of never-reduced club does not inflate stock',(int)wc_get_product($pid)->get_stock_quantity()===1);
$club->update_meta_data(HI_Club_Stock_Policy::DEADLINE,time()-1);$club->save();do_action(HI_Club_Stock_Policy::HOOK,$club->get_id());ck('Paid order never cancelled',wc_get_order($club->get_id())->is_paid());
$normal->update_meta_data(HI_Club_Stock_Policy::DEADLINE,time()-1);$normal->save();do_action(HI_Club_Stock_Policy::HOOK,$normal->get_id());ck('Ordinary pending order untouched',wc_get_order($normal->get_id())->has_status('pending'));
$old=hi_stock_order($pid,false);$old->update_meta_data('_hi_club_source','intelligentsia');$old->save();ck('Historic club without explicit new policy keeps native hold',apply_filters('woocommerce_order_hold_stock_minutes',60,$old)===60);
$fresh=hi_stock_order($pid);HI_Club_Stock_Policy::expire($fresh->get_id());ck('Fresh unpaid order not cancelled early',wc_get_order($fresh->get_id())->has_status('pending'));
wc_update_product_stock($pid,0,'set');$blocked=false;try{HI_Club_Stock_Policy::validate_payment($fresh);}catch(Exception $e){$blocked=true;}ck('Repeat payment blocked after product sells out',$blocked);
$blocked=false;try{HI_Club_Stock_Policy::validate_payment(wc_get_order($due->get_id()));}catch(Exception $e){$blocked=true;}ck('Expired payment blocked even before cron',$blocked);
// Real cart validation hook with a stock change after adding the product.
update_option(HI_Club_Checkout::OPTION,'pilot');
if(!WC()->session) wc_load_cart();
wc_update_product_stock($pid,2,'set');
WC()->cart->empty_cart();WC()->cart->add_to_cart($pid,2);
HI_Club_Checkout::set_context(array('source'=>'intelligentsia','pilot'=>'1','way'=>'pickup','date'=>gmdate('Y-m-d',time()+7*86400)));
wc_update_product_stock($pid,1,'set');
$err=new WP_Error();do_action('woocommerce_after_checkout_validation',array(),$err);
ck('Real checkout validation blocks newly insufficient stock',in_array('hi_club_stock',$err->get_error_codes(),true));
WC()->session->__unset(HI_Club_Checkout::SESSION);$err=new WP_Error();HI_Club_Stock_Policy::validate_cart(array(),$err);
ck('Ordinary visitor bypasses added stock validator',!$err->has_errors());
ck('Global hold setting remains sixty minutes',(int)get_option('woocommerce_hold_stock_minutes')===60);
ck('Other filter refusal is respected',HI_Club_Stock_Policy::may_reduce(false,$club)===false);
file_put_contents('/hi-reports/stock-summary.json',json_encode(array('woo'=>WC_VERSION,'checks'=>$checks,'payments'=>'simulated local event only; outgoing HTTP and email blocked')));
