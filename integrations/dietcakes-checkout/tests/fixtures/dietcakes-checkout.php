<?php
// Exact relevant checkout callbacks read from the active child theme on 2026-10-20.
if (!function_exists('eco_get_checkout_fulfillment_mode')) {
function eco_get_checkout_fulfillment_mode() {
    if ( function_exists('WC') && WC()->session ) {
        $mode = WC()->session->get('eco_fulfillment_type');
        if ( in_array($mode, ['delivery', 'pickup'], true) ) {
            return $mode;
        }
    }
    return 'delivery';
}

}

/**
 * Выводим переключатель перед данными покупателя
 */
add_action('woocommerce_checkout_billing', function () {
    if ( ! function_exists('is_checkout') || ! is_checkout() || is_order_received_page() ) {
        return;
    }

    $mode = eco_get_checkout_fulfillment_mode();
    ?>
    <div class="eco-fulfillment-wrap">
        <div class="eco-fulfillment-switch" id="eco-fulfillment-switch">
            <button type="button"
                    class="eco-fulfillment-btn <?php echo $mode === 'delivery' ? 'is-active' : ''; ?>"
                    data-mode="delivery">
                <span class="eco-fulfillment-btn__icon">🚚</span>
                <span class="eco-fulfillment-btn__text">Доставка</span>
            </button>

            <button type="button"
                    class="eco-fulfillment-btn <?php echo $mode === 'pickup' ? 'is-active' : ''; ?>"
                    data-mode="pickup">
                <span class="eco-fulfillment-btn__icon">🛒</span>
                <span class="eco-fulfillment-btn__text">Самовывоз</span>
            </button>
        </div>

        <input type="hidden"
               id="eco_fulfillment_type"
               name="eco_fulfillment_type"
               value="<?php echo esc_attr($mode); ?>">
    </div>
    <?php
}, 5);

/**
 * Сохраняем режим в сессию при обновлении checkout
 */
add_action('woocommerce_checkout_update_order_review', function ($posted_data) {
    parse_str($posted_data, $data);

    if ( isset($data['eco_fulfillment_type']) && function_exists('WC') && WC()->session ) {
        $mode = sanitize_text_field($data['eco_fulfillment_type']);
        if ( in_array($mode, ['delivery', 'pickup'], true) ) {
            WC()->session->set('eco_fulfillment_type', $mode);
        }
    }
});


/**
 * Снимаем обязательность адресных полей при самовывозе
 */
add_filter('woocommerce_checkout_fields', function ($fields) {
    $mode = eco_get_checkout_fulfillment_mode();

    if ( $mode !== 'pickup' ) {
        return $fields;
    }

    $billing_optional = [
        'billing_address_1',
        'billing_address_2',
        'billing_city',
        'billing_state',
        'billing_postcode',
    ];

    foreach ( $billing_optional as $key ) {
        if ( isset($fields['billing'][$key]) ) {
            $fields['billing'][$key]['required'] = false;
        }
    }

    if ( isset($fields['shipping']) && is_array($fields['shipping']) ) {
        foreach ( $fields['shipping'] as $key => $field ) {
            $fields['shipping'][$key]['required'] = false;
        }
    }

    return $fields;
}, 9999);

/**
 * Сохраняем способ получения в заказ
 */
add_action('woocommerce_checkout_create_order', function ($order, $data) {
    $mode = isset($_POST['eco_fulfillment_type'])
        ? sanitize_text_field(wp_unslash($_POST['eco_fulfillment_type']))
        : eco_get_checkout_fulfillment_mode();

    if ( ! in_array($mode, ['delivery', 'pickup'], true) ) {
        $mode = 'delivery';
    }

    $order->update_meta_data('_eco_fulfillment_type', $mode);
}, 20, 2);


/**
 * Выводим способ получения в totals
 * и убираем стандартную строку доставки в email при самовывозе
 */
add_filter('woocommerce_get_order_item_totals', function ($totals, $order, $tax_display) {
    if ( ! $order instanceof WC_Order ) {
        return $totals;
    }

    $mode = (string) $order->get_meta('_eco_fulfillment_type');
    if ( ! $mode ) {
        return $totals;
    }

    $is_email_pickup = doing_action('woocommerce_email_order_details') && $mode === 'pickup';

    $new_totals = [];

    foreach ( $totals as $key => $row ) {

        // В email при самовывозе убираем только стандартную строку shipping
        if ( $is_email_pickup && $key === 'shipping' ) {
            continue;
        }

        $new_totals[$key] = $row;

        // Вставляем "Способ получения" после shipping или payment_method
        if ( $key === 'payment_method' || $key === 'shipping' ) {
            $new_totals['eco_fulfillment_type'] = [
                'label' => 'Способ получения:',
                'value' => $mode === 'pickup' ? 'Самовывоз' : 'Доставка',
            ];
        }
    }

    if ( ! isset($new_totals['eco_fulfillment_type']) ) {
        $new_totals['eco_fulfillment_type'] = [
            'label' => 'Способ получения:',
            'value' => $mode === 'pickup' ? 'Самовывоз' : 'Доставка',
        ];
    }

    return $new_totals;
}, 25, 3);

add_action('wp_footer', function () {
    if ( ! function_exists('is_checkout') || ! is_checkout() || is_order_received_page() ) {
        return;
    }
    ?>
<script>
jQuery(function($){

    function togglePickupFields(mode){
        const hide = mode === 'pickup';

        const selectors = [
            '#billing_address_1_field',
            '#billing_address_2_field',
            '#billing_city_field',
            '#billing_state_field',
            '#billing_postcode_field',
            '#billing_yl_flat_field',
            '#billing_yl_doorcode_field',
            '#billing_yl_entrance_field',
            '#billing_yl_floor_field',
            '.woocommerce-shipping-fields',
			'#ymdz-map'
        ];

        selectors.forEach(function(selector){
            $(selector).toggle(!hide);
        });
    }

    function updateOrderCommentByMode(mode){
        const $field = $('#order_comments_field');
        const $label = $field.find('label');
        const $textarea = $('#order_comments');

        if (!$field.length || !$label.length || !$textarea.length) return;

        if (mode === 'pickup') {
            $label.html('Комментарий сборщику&nbsp;<span class="optional">(необязательно)</span>');
            $textarea.attr('placeholder', 'Комментарий сборщику');
        } else {
            $label.html('Комментарий курьеру&nbsp;<span class="optional">(необязательно)</span>');
            $textarea.attr('placeholder', 'Комментарий курьеру');
        }
    }

    function applyFulfillmentVisual(mode){
        $('body').toggleClass('eco-mode-pickup', mode === 'pickup');
        $('#eco-pickup-badge').toggle(mode === 'pickup');

        $('#eco-fulfillment-switch .eco-fulfillment-btn').each(function(){
            $(this).toggleClass('is-active', $(this).data('mode') === mode);
        });

        togglePickupFields(mode);
        updateOrderCommentByMode(mode);
    }

    const $input = $('#eco_fulfillment_type');

    if ($input.length) {
        applyFulfillmentVisual($input.val() || 'delivery');
    }

    $(document).on('click', '#eco-fulfillment-switch .eco-fulfillment-btn', function(e){
        e.preventDefault();

        const mode = $(this).data('mode');
        if (mode !== 'delivery' && mode !== 'pickup') return;

        $input.val(mode);
        applyFulfillmentVisual(mode);

        $(document.body).trigger('update_checkout');
    });

    $(document.body).on('updated_checkout', function(){
        const mode = $('#eco_fulfillment_type').val() || 'delivery';
        applyFulfillmentVisual(mode);
    });
});
</script>
    <?php
}, 9999);
/**
 * Привязка eco_fulfillment_type к WooCommerce shipping method
 * delivery => flat_rate:5
 * pickup   => local_pickup:8
 */
add_action('woocommerce_checkout_update_order_review', function ($post_data) {
    if ( ! function_exists('WC') || ! WC()->session ) {
        return;
    }

    parse_str($post_data, $data);

    $mode = isset($data['eco_fulfillment_type'])
        ? sanitize_text_field(wp_unslash($data['eco_fulfillment_type']))
        : 'delivery';

    if ( ! in_array($mode, ['delivery', 'pickup'], true) ) {
        $mode = 'delivery';
    }

    WC()->session->set('eco_fulfillment_type', $mode);

    $chosen_method = ($mode === 'pickup') ? 'local_pickup:8' : 'flat_rate:5';

    $packages = WC()->cart ? WC()->cart->get_shipping_packages() : [];

    if (!empty($packages)) {
        $chosen_methods = [];

        foreach (array_keys($packages) as $package_key) {
            $chosen_methods[$package_key] = $chosen_method;
            WC()->session->__unset('shipping_for_package_' . $package_key);
        }

        WC()->session->set('chosen_shipping_methods', $chosen_methods);
    }
}, 20);
/**
 * Показываем только нужный shipping method
 * pickup   => только local_pickup
 * delivery => без local_pickup
 */
add_filter('woocommerce_package_rates', function ($rates, $package) {
    if ( ! function_exists('WC') || ! WC()->session || ! is_array($rates) ) {
        return $rates;
    }

    $mode = WC()->session->get('eco_fulfillment_type', 'delivery');

    foreach ($rates as $rate_id => $rate) {
        if ($mode === 'pickup') {
            if (strpos($rate_id, 'local_pickup:') !== 0) {
                unset($rates[$rate_id]);
            }
        } else {
            if (strpos($rate_id, 'local_pickup:') === 0) {
                unset($rates[$rate_id]);
            }
        }
    }

    return $rates;
}, 999, 2);
/**
 * Для самовывоза меняем заголовок строки "Доставка" -> "Самовывоз"
 */
add_filter('woocommerce_shipping_package_name', function ($package_name, $package_index, $package) {
    if ( ! function_exists('WC') || ! WC()->session ) {
        return $package_name;
    }

    $mode = WC()->session->get('eco_fulfillment_type', 'delivery');

    if ( $mode === 'pickup' ) {
        return 'Самовывоз';
    }

    return $package_name;
}, 20, 3);

/**
 * Для local_pickup:8 справа показываем "0 ₽" вместо "Самовывоз"
 */
add_filter('woocommerce_cart_shipping_method_full_label', function ($label, $method) {
    if ( ! function_exists('WC') || ! WC()->session ) {
        return $label;
    }

    $mode = WC()->session->get('eco_fulfillment_type', 'delivery');

    if ( $mode !== 'pickup' ) {
        return $label;
    }

    if ( ! is_object($method) ) {
        return $label;
    }

    $method_id   = method_exists($method, 'get_method_id') ? $method->get_method_id() : ($method->method_id ?? '');
    $instance_id = method_exists($method, 'get_instance_id') ? (int) $method->get_instance_id() : (int) ($method->instance_id ?? 0);

    if ( $method_id === 'local_pickup' && $instance_id === 8 ) {
return wc_price(0);
    }

    return $label;
}, 999, 2);
/**
 * Скидка 3% при самовывозе
 */
add_action('woocommerce_cart_calculate_fees', function ($cart) {
    if ( is_admin() && ! wp_doing_ajax() ) {
        return;
    }

    if ( ! $cart || ! function_exists('WC') || ! WC()->session ) {
        return;
    }

    $mode = WC()->session->get('eco_fulfillment_type', 'delivery');
    if ( $mode !== 'pickup' ) {
        return;
    }

    // Доп. защита: скидку даём только если реально выбран local_pickup:8
    $chosen_methods = WC()->session->get('chosen_shipping_methods', []);
    $chosen_method  = is_array($chosen_methods) && ! empty($chosen_methods[0]) ? $chosen_methods[0] : '';

    if ( $chosen_method !== 'local_pickup:8' ) {
        return;
    }

    // База для скидки: только товары, уже с учетом скидок и купонов
    $base_amount = (float) $cart->get_cart_contents_total();

    if ( $base_amount <= 0 ) {
        return;
    }

    $discount = round($base_amount * 0.03, wc_get_price_decimals());

    if ( $discount <= 0 ) {
        return;
    }

    // negative fee = скидка
    $cart->add_fee('Скидка за самовывоз', -$discount, false);
}, 30);
