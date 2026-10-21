<?php
/** Stock policy for newly created club checkout orders only. */
defined('ABSPATH') || exit;
final class HI_Club_Stock_Policy {
    const META = '_hi_club_stock_policy';
    const DEADLINE = '_hi_club_unpaid_until';
    const POLICY = 'after-payment-v1';
    const HOOK = 'hi_club_cancel_unpaid_order';
    const GROUP = 'hi-club-checkout';

    public static function boot() {
        add_filter('woocommerce_order_hold_stock_minutes', array(__CLASS__, 'hold_minutes'), 99, 2);
        add_filter('woocommerce_payment_complete_reduce_order_stock', array(__CLASS__, 'may_reduce'), 99, 2);
        add_filter('woocommerce_can_reduce_order_stock', array(__CLASS__, 'may_reduce'), 99, 2);
        add_action('woocommerce_checkout_order_created', array(__CLASS__, 'schedule'), 20);
        add_action('woocommerce_after_checkout_validation', array(__CLASS__, 'validate_cart'), 35, 2);
        add_action('woocommerce_before_pay_action', array(__CLASS__, 'validate_payment'));
        add_action(self::HOOK, array(__CLASS__, 'expire'));
    }
    private static function order($value) {
        return $value instanceof WC_Order ? $value : wc_get_order($value);
    }
    public static function applies($order) {
        return $order instanceof WC_Order && $order->get_meta('_hi_club_source') === 'intelligentsia'
            && $order->get_meta(self::META) === self::POLICY;
    }
    public static function stamp($order) {
        if ($order->get_meta(self::META)) return;
        $order->update_meta_data(self::META, self::POLICY);
        $order->update_meta_data(self::DEADLINE, time() + 15 * 60);
    }
    public static function hold_minutes($minutes, $order) {
        return self::applies($order) ? 0 : $minutes;
    }
    public static function may_reduce($allowed, $value) {
        if (!$allowed) return $allowed;
        $order = self::order($value);
        return !self::applies($order) || $order->is_paid() || $order->get_date_paid() ? $allowed : false;
    }
    public static function schedule($order) {
        if (!self::applies($order)) return;
        $until = (int) $order->get_meta(self::DEADLINE);
        if (!$until) return;
        $args = array($order->get_id());
        if (function_exists('as_schedule_single_action')) {
            if (!as_has_scheduled_action(self::HOOK, $args, self::GROUP)) {
                as_schedule_single_action(max(time() + 1, $until), self::HOOK, $args, self::GROUP, true);
            }
        } elseif (!wp_next_scheduled(self::HOOK, $args)) {
            wp_schedule_single_event(max(time() + 1, $until), self::HOOK, $args);
        }
    }
    public static function expire($id) {
        $order = wc_get_order($id);
        if (!self::applies($order) || $order->is_paid() || $order->get_date_paid()
            || !$order->has_status(array('pending', 'on-hold'))) return;
        $until = (int) $order->get_meta(self::DEADLINE);
        if (!$until || time() < $until) return;
        $order->update_status('cancelled', 'Бокс клуба: заказ не оплачен за 15 минут.');
    }
    // Aggregate variants sharing a stock-managed parent and respect other shoppers' native holds.
    public static function unavailable($items, $exclude_order = 0) {
        $groups = array();
        foreach ($items as $item) {
            $product = wc_get_product($item['id']);
            if (!$product || !$product->is_purchasable() || !$product->is_in_stock()) return true;
            if (!$product->managing_stock() || $product->backorders_allowed()) continue;
            $id = $product->get_stock_managed_by_id();
            if (!isset($groups[$id])) $groups[$id] = array('product' => wc_get_product($id), 'quantity' => 0);
            $groups[$id]['quantity'] += $item['quantity'];
        }
        foreach ($groups as $group) {
            $product = $group['product'];
            if (!$product) return true;
            $held = function_exists('wc_get_held_stock_quantity') ? wc_get_held_stock_quantity($product, $exclude_order) : 0;
            if ((float) $product->get_stock_quantity() - $held < $group['quantity']) return true;
        }
        return false;
    }
    public static function validate_cart($data, $errors) {
        if (!HI_Club_Checkout::context() || !WC()->cart) return;
        $items = array();
        foreach (WC()->cart->get_cart() as $item) {
            $items[] = array('id' => !empty($item['variation_id']) ? $item['variation_id'] : $item['product_id'], 'quantity' => $item['quantity']);
        }
        $exclude = WC()->session ? (int) WC()->session->get('order_awaiting_payment') : 0;
        if (self::unavailable($items, $exclude)) {
            $errors->add('hi_club_stock', 'Один из товаров только что закончился или доступен в меньшем количестве. Измени состав или количество бокса.');
        }
    }
    public static function validate_payment($order) {
        if (!self::applies($order)) return;
        $until = (int) $order->get_meta(self::DEADLINE);
        if (!$until || time() >= $until) {
            self::expire($order->get_id());
            throw new Exception('Время оплаты бокса истекло. Собери заказ заново.');
        }
        $items = array();
        foreach ($order->get_items('line_item') as $item) {
            $items[] = array('id' => $item->get_variation_id() ?: $item->get_product_id(), 'quantity' => $item->get_quantity());
        }
        if (self::unavailable($items, $order->get_id())) throw new Exception('Один из товаров только что закончился. Собери бокс заново.');
    }
}
