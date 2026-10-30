<?php
/**
 * Plugin Name: Хайкинг бокс – клуб «Интеллигенция»
 * Description: Заказы из приложения клуба: получение на хайке, скидка по карте интеллигента (10% до 15 000 ₽ в месяц, сверх 5%).
 * Version: 0.5.0
 * Requires PHP: 7.4
 * Requires Plugins: woocommerce
 * License: GPL-2.0-or-later
 */
defined('ABSPATH') || exit;
require_once __DIR__ . '/stock-policy.php';

final class HI_Club_Checkout {
    const OPTION = 'hi_club_checkout_mode';
    const SESSION = 'hi_club_checkout_context';
    const PICKUP = 'local_pickup:8';
    const COUPON = 'intelligent';
    const FEE = 'Скидка за самовывоз';
    const SBP = 'yookassa_sbp';
    const SLOT_DATE = 'billing_eco_delivery_date';
    const SLOT_TIME = 'billing_eco_delivery_time';
    // Скидка по карте интеллигента: расчёт и учёт месячного лимита – на сервере клуба (общий журнал с кассой магазина).
    const LOYALTY = 'hi_club_loyalty';          // 'off' | 'on'; по умолчанию выключено
    const LOYALTY_KEY = 'hi_club_loyalty_key';  // ключ магазина для API клуба; вводит владелец в настройках
    const LOYALTY_API = 'https://app-test-3-delta.vercel.app/api/dc-loyalty';
    // Адрес API можно сменить в настройках: сервер магазина не всегда достаёт до Vercel напрямую (посредник клуба).
    const LOYALTY_API_URL = 'hi_club_api_url';
    const CARD_FEE = 'Скидка по карте интеллигента';
    const QUOTE = 'hi_club_card_quote';
    // Карта из ссылки каталога (приложение → любая страница магазина): отдельно от клубного контекста хайка
    const CATALOG = 'hi_club_catalog_card';
    private static $adding_box = false;
    // Сроки заказа «на хайк»: магазин доставляет 10–20 (последний выезд 19:30); готовую еду готовит за 2 дня.
    const READY_FOOD = 'Готовая еда';
    const CUTOFF_REGULAR = '17:00'; // накануне хайка
    const CUTOFF_READY = '20:00';   // за два дня до хайка

    // Конструктор бокса: на странице стоит <script src> с Vercel; по умолчанию отдаём ту же копию из плагина (с самого dietcakes),
    // чтобы покупатели не зависели от доступности Vercel. В настройках можно вернуть Vercel.
    const FRONTEND = 'hi_club_frontend';  // 'local' (по умолчанию) | 'vercel'
    const VERCEL_SCRIPT = 'https://app-test-3-delta.vercel.app/assets/dc/hiking-box.js';

    public static function local_frontend($content) {
        if (!is_string($content) || strpos($content, self::VERCEL_SCRIPT) === false || get_option(self::FRONTEND, 'local') === 'vercel') return $content;
        $file = __DIR__ . '/assets/hiking-box.js';
        if (!is_readable($file)) return $content;
        return str_replace(self::VERCEL_SCRIPT, plugins_url('assets/hiking-box.js', __FILE__) . '?ver=' . filemtime($file), $content);
    }

    public static function boot() {
        HI_Club_Stock_Policy::boot();
        add_action('admin_menu', array(__CLASS__, 'admin_menu'));
        add_action('wp_footer', array(__CLASS__, 'catalog_script'), 99);
        add_filter('the_content', array(__CLASS__, 'local_frontend'), 99);
        // Сводка заказов «на хайк» в бот клуба: оплачен / отменён (ключ магазина тот же, что для скидки).
        if (strlen((string) get_option(self::LOYALTY_KEY, '')) >= 32) {
            add_action('woocommerce_order_status_processing', array(__CLASS__, 'notify_paid'), 20);
            add_action('woocommerce_order_status_completed', array(__CLASS__, 'notify_paid'), 20);
            add_action('woocommerce_order_status_cancelled', array(__CLASS__, 'notify_cancelled'), 20);
            add_action('woocommerce_order_status_refunded', array(__CLASS__, 'notify_cancelled'), 20);
        }
        if (self::loyalty_enabled()) {
            add_action('woocommerce_order_status_processing', array(__CLASS__, 'ledger_confirm'));
            add_action('woocommerce_order_status_completed', array(__CLASS__, 'ledger_confirm'));
            add_action('woocommerce_order_status_cancelled', array(__CLASS__, 'ledger_refund'));
            add_action('woocommerce_order_status_refunded', array(__CLASS__, 'ledger_refund'));
        }
        // Installation and activation alone do not change the checkout or any options.
        if (get_option(self::OPTION, 'off') !== 'pilot') return;
        add_action('woocommerce_checkout_process', array(__CLASS__, 'prepare_checkout'), 5);
        add_filter('woocommerce_checkout_fields', array(__CLASS__, 'slot_fields'), 40);
        add_filter('woocommerce_checkout_posted_data', array(__CLASS__, 'posted_data'), 40);
        add_filter('woocommerce_available_payment_gateways', array(__CLASS__, 'payment_gateways'), 9999);
        add_filter('woocommerce_update_order_review_fragments', array(__CLASS__, 'fragments'), 40);
        add_action('woocommerce_blocks_loaded', array(__CLASS__, 'register_store_api'));
        add_action('woocommerce_checkout_update_order_review', array(__CLASS__, 'review'), 25);
        add_action('woocommerce_cart_calculate_fees', array(__CLASS__, 'card_discount'), 30);
        add_action('woocommerce_cart_calculate_fees', array(__CLASS__, 'filter_fees'), 40);
        add_action('woocommerce_after_checkout_validation', array(__CLASS__, 'validate'), 30, 2);
        add_action('woocommerce_checkout_create_order', array(__CLASS__, 'stamp_order'), 30, 2);
        add_action('woocommerce_checkout_billing', array(__CLASS__, 'render'), 6);
        add_action('wp_enqueue_scripts', array(__CLASS__, 'enqueue'));
        add_filter('woocommerce_checkout_cart_item_quantity', array(__CLASS__, 'checkout_quantity'), 40, 3);
        add_action('woocommerce_checkout_update_order_review', array(__CLASS__, 'update_quantities'), 10);
        add_action('woocommerce_review_order_before_order_total', array(__CLASS__, 'card_notice'));
        add_filter('woocommerce_cart_item_subtotal', array(__CLASS__, 'checkout_item_price'), 40, 3);
        add_filter('woocommerce_shipping_package_name', array(__CLASS__, 'package_name'), 30, 3);
        add_filter('woocommerce_get_order_item_totals', array(__CLASS__, 'order_totals'), 40, 3);
        add_action('woocommerce_admin_order_data_after_billing_address', array(__CLASS__, 'admin_order'));
        add_action('woocommerce_cart_emptied', array(__CLASS__, 'clear'));
    }

    private static function session() {
        return function_exists('WC') && WC()->session ? WC()->session : null;
    }

    private static function scalar($data, $key, $default = '') {
        return isset($data[$key]) && is_scalar($data[$key]) ? (string) $data[$key] : $default;
    }

    public static function context() {
        $session = self::session();
        $context = $session ? $session->get(self::SESSION) : null;
        return is_array($context) && ($context['source'] ?? '') === 'intelligentsia'
            && ($context['pilot'] ?? false) === true
            && ($context['expires'] ?? 0) > time() ? $context : null;
    }

    // Подписанный ID карты, пришедший по ссылке каталога из приложения (2 часа). Подлинность и активность проверяет сервер клуба.
    public static function catalog_card() {
        $session = self::session();
        $c = $session ? $session->get(self::CATALOG) : null;
        return is_array($c) && ($c['expires'] ?? 0) > time() && preg_match('/^dc1_\d{1,16}_[A-Za-z0-9_-]{28}$/D', (string) ($c['card'] ?? '')) ? $c['card'] : '';
    }

    // Карта текущего покупателя: из клубного контекста (хайк) или из ссылки каталога
    public static function card_token() {
        $context = self::context();
        return $context && !empty($context['card']) ? $context['card'] : self::catalog_card();
    }

    public static function valid_date($date) {
        if (!is_string($date) || !preg_match('/^\d{4}-\d{2}-\d{2}$/D', $date)) return false;
        $d = DateTimeImmutable::createFromFormat('!Y-m-d', $date, new DateTimeZone('Europe/Moscow'));
        $today = new DateTimeImmutable('today', new DateTimeZone('Europe/Moscow'));
        return $d && $d->format('Y-m-d') === $date && $d >= $today;
    }

    // Есть ли в корзине готовая еда (категория «Готовая еда» или любая её подкатегория).
    public static function cart_has_ready_food() {
        if (!WC()->cart || !function_exists('get_the_terms')) return false;
        foreach (WC()->cart->get_cart() as $item) {
            $pid = !empty($item['product_id']) ? (int) $item['product_id'] : 0;
            $terms = $pid ? get_the_terms($pid, 'product_cat') : array();
            foreach (is_array($terms) ? $terms : array() as $term) {
                $ids = array_merge(array($term->term_id), function_exists('get_ancestors') ? get_ancestors($term->term_id, 'product_cat') : array());
                foreach ($ids as $id) { $t = get_term($id, 'product_cat'); if ($t && !is_wp_error($t) && $t->name === self::READY_FOOD) return true; }
            }
        }
        return false;
    }

    // Крайний срок заказа на хайк в дату $date (МСК). Возвращает DateTimeImmutable.
    public static function hike_deadline($date, $ready) {
        $tz = new DateTimeZone('Europe/Moscow');
        $d = DateTimeImmutable::createFromFormat('!Y-m-d', $date, $tz);
        if (!$d) return null;
        list($h, $m) = explode(':', $ready ? self::CUTOFF_READY : self::CUTOFF_REGULAR);
        return $d->modify($ready ? '-2 days' : '-1 day')->setTime((int) $h, (int) $m);
    }

    public static function hike_open($date, $ready, $now = null) {
        $deadline = self::hike_deadline($date, $ready);
        $now = $now ?: new DateTimeImmutable('now', new DateTimeZone('Europe/Moscow'));
        return $deadline && $now < $deadline;
    }

    public static function closed_message($ready) {
        return $ready
            ? 'Заказ с готовой едой на этот хайк закрыт – её готовят за 2 дня (до 20:00 за два дня до хайка). Выбери самовывоз или доставку домой, или убери готовую еду из бокса.'
            : 'Заказ на этот хайк закрыт – боксы принимаем до 17:00 накануне. Выбери самовывоз или доставку домой.';
    }

    public static function register_store_api() {
        if (!function_exists('woocommerce_store_api_register_update_callback')) return;
        // Store API supplies cart-session isolation and its standard nonce/cart-token check.
        woocommerce_store_api_register_update_callback(array(
            'namespace' => 'hiking-club', 'callback' => array(__CLASS__, 'set_context'),
        ));
        woocommerce_store_api_register_update_callback(array('namespace' => 'hiking-club-box', 'callback' => array(__CLASS__, 'set_box')));
    }

    // One Store API request adds the box; native Woo validation remains authoritative.
    public static function set_box($data) {
        $cart = function_exists('WC') ? WC()->cart : null;
        $class = '\\Automattic\\WooCommerce\\StoreApi\\Utilities\\CartController';
        if (!$cart || !class_exists($class) || !is_array($data) || !isset($data['items']) || !is_array($data['items']) || !count($data['items']) || count($data['items']) > 24) throw new Exception('Не удалось проверить состав бокса.');
        $items = array();
        foreach ($data['items'] as $item) {
            if (!is_array($item) || !isset($item['id'], $item['quantity']) || !is_int($item['id']) || $item['id'] < 1 || !is_int($item['quantity']) || $item['quantity'] < 1 || $item['quantity'] > 10000 || isset($items[$item['id']])) throw new Exception('Некорректное количество товара.');
            $product = wc_get_product($item['id']);
            if (!$product || !$product->is_type('simple') || !$product->is_purchasable() || !$product->is_in_stock() || $product->backorders_allowed()) throw new Exception('Состав изменился. Проверь наличие товаров.');
            $items[$item['id']] = $item['quantity'];
        }
        $session = self::session();
        if (!$session) throw new Exception('Корзина недоступна.');
        $request = self::scalar($data, 'request_id');
        if (!preg_match('/^[a-zA-Z0-9-]{16,80}$/D', $request)) throw new Exception('Обнови страницу бокса.');
        $fingerprint = hash('sha256', wp_json_encode($data));
        $done = $session ? $session->get('hi_club_box_request') : null;
        if (is_array($done) && ($done['id'] ?? '') === $request) {
            if (($done['fingerprint'] ?? '') !== $fingerprint) throw new Exception('Состав запроса изменился. Проверь корзину.');
            return; // No duplicate quantities for an already accepted request.
        }
        $before = $cart->get_cart_contents();
        $removed = $cart->get_removed_cart_contents();
        $prior = array();
        foreach (array(self::SESSION, self::QUOTE, 'eco_fulfillment_type', 'chosen_shipping_methods') as $key) $prior[$key] = $session->get($key);
        $controller = new $class();
        // Defer only Woo's native per-item totals, for this request, and restore in finally.
        $deferred = remove_action('woocommerce_add_to_cart', array($cart, 'calculate_totals'), 20);
        self::$adding_box = true;
        try {
            self::set_context($data);
            foreach ($items as $id => $quantity) $controller->add_to_cart(array('id' => $id, 'quantity' => $quantity));
            $session->set('hi_club_box_request', array('id' => $request, 'fingerprint' => $fingerprint));
        } catch (Throwable $error) {
            $cart->set_cart_contents($before);
            $cart->set_removed_cart_contents($removed);
            foreach ($prior as $key => $value) { if ($value === null) $session->__unset($key); else $session->set($key, $value); }
            throw $error;
        } finally {
            self::$adding_box = false;
            if ($deferred) add_action('woocommerce_add_to_cart', array($cart, 'calculate_totals'), 20, 0);
        }
        // The Store API extensions route recalculates and persists the completed cart.
    }

    public static function checkout_quantity($html, $item, $key) {
        if (!self::context() || !is_checkout() || !isset($item['data'], $item['quantity']) || !preg_match('/^[a-zA-Z0-9_-]{1,64}$/D', (string) $key)) return $html;
        $qty = (int) $item['quantity'];
        return '<span class="hi-club-quantity" data-hi-key="' . esc_attr($key) . '"><button type="button" data-hi-step="-1" aria-label="Уменьшить количество">−</button><input type="number" name="hi_club_qty[' . esc_attr($key) . ']" value="' . $qty . '" min="0" step="1" inputmode="numeric" aria-label="Количество"><button type="button" data-hi-step="1" aria-label="Увеличить количество">+</button><button type="button" data-hi-remove="1" aria-label="Удалить товар">×</button></span>';
    }

    public static function checkout_item_price($html, $item, $key) {
        if (!self::context() || !is_checkout() || !isset($item['data'], $item['quantity']) || !method_exists(WC()->cart, 'get_product_price')) return $html;
        return '<span class="hi-club-line-price"><span class="hi-club-line-count">' . (int) $item['quantity'] . ' × </span>' . WC()->cart->get_product_price($item['data']) . '</span>';
    }

    public static function update_quantities($posted) {
        if (!self::context() || !is_string($posted)) return;
        parse_str($posted, $data);
        if (empty($data['hi_club_qty']) || !is_array($data['hi_club_qty'])) return;
        $cart = WC()->cart;
        $controller = new \Automattic\WooCommerce\StoreApi\Utilities\CartController();
        foreach ($data['hi_club_qty'] as $key => $raw) {
            $contents = $cart->get_cart();
            if (!isset($contents[$key]) || !is_scalar($raw) || !preg_match('/^\d{1,5}$/D', (string) $raw)) continue;
            $qty = (int) $raw;
            if ($qty === (int) $contents[$key]['quantity']) continue;
            try {
                // Native Store API validates quantity limits, stock and cart item identity.
                if ($qty === 0) $cart->remove_cart_item($key);
                else $controller->set_cart_item_quantity($key, $qty);
            } catch (Exception $error) {
                wc_add_notice('Не удалось изменить количество: проверь доступный остаток товара.', 'error');
            }
        }
    }

    public static function card_notice() {
        $card = self::card_token();
        if ($card === '' || !WC()->cart) return;
        $quote = self::session()->get(self::QUOTE);
        if (!is_array($quote) || ($quote['card'] ?? '') !== $card || ($quote['gross'] ?? -1) !== self::gross_kopecks(WC()->cart)) return;
        $applied = 0;
        foreach (WC()->cart->fees_api()->get_fees() as $fee) { if ($fee->name === self::CARD_FEE && (float) $fee->amount < 0) $applied -= (float) $fee->amount; }
        // Сама скидка уже есть отдельной строкой в итогах – повторную строку не выводим, только предупреждение при сбое.
        if ($applied <= 0) echo '<tr class="hi-club-card-summary"><td colspan="2">Не удалось рассчитать скидку по карте. Не оплачивай заказ без проверки скидки.</td></tr>';
    }

    public static function set_context($data) {
        $session = self::session();
        if (!$session || !is_array($data)) throw new Exception('Корзина недоступна. Обнови страницу бокса.');
        if (self::scalar($data, 'source') !== 'intelligentsia'
            || self::scalar($data, 'pilot') !== '1') {
            throw new Exception('Пилот доступен только по тестовой клубной ссылке.');
        }
        if (self::scalar($data, 'kind') === 'catalog') {
            // Обычные покупки из каталога: запоминаем только карту; доставку, способ получения и корзину не трогаем.
            $token = self::scalar($data, 'card');
            if (!preg_match('/^dc1_\d{1,16}_[A-Za-z0-9_-]{28}$/D', $token)) throw new Exception('Карта не распознана. Открой магазин из приложения ещё раз.');
            $session->set(self::CATALOG, array('card' => $token, 'expires' => time() + 7200));
            $session->__unset(self::QUOTE);
            if (method_exists($session, 'set_customer_session_cookie')) $session->set_customer_session_cookie(true);
            return;
        }
        $way = self::scalar($data, 'way');
        if (!in_array($way, array('home', 'pickup', 'hike'), true)) throw new Exception('Выбери способ получения.');
        $date = self::scalar($data, 'date');
        if (($date !== '' && !self::valid_date($date)) || ($way === 'hike' && !self::valid_date($date))) {
            throw new Exception('Укажи сегодняшнюю или будущую дату хайка.');
        }
        $card = self::scalar($data, 'card');
        $context = array(
            'source' => 'intelligentsia', 'pilot' => true, 'expires' => time() + 7200,
            'way' => $way, 'date' => $date,
            // Подписанный ID карты из приложения; подлинность и активность проверяет сервер клуба.
            'card' => preg_match('/^dc1_\d{1,16}_[A-Za-z0-9_-]{28}$/D', $card) ? $card : '',
            // подписанный Telegram ID покупателя: клуб напишет ему о заказе (подпись проверяет сервер клуба)
            'tg' => preg_match('/^tg1_\d{1,16}_[A-Za-z0-9_-]{28}$/D', self::scalar($data, 'tg')) ? self::scalar($data, 'tg') : '',
            'route' => mb_substr(sanitize_text_field(self::scalar($data, 'route')), 0, 120),
        );
        $session->set(self::SESSION, $context);
        $session->set('eco_fulfillment_type', $way === 'home' ? 'delivery' : 'pickup');
        $session->set('chosen_shipping_methods', array($way === 'home' ? 'flat_rate:5' : self::PICKUP));
        self::invalidate_shipping();
        if (method_exists($session, 'set_customer_session_cookie')) $session->set_customer_session_cookie(true);
    }

    private static function invalidate_shipping() {
        $session = self::session();
        if (!$session || !WC()->cart) return;
        foreach (array_keys(WC()->cart->get_shipping_packages()) as $key) {
            $session->__unset('shipping_for_package_' . $key);
        }
    }

    public static function review($posted) {
        $session = self::session();
        $context = self::context();
        if (!$session || !$context || !is_string($posted)) return;
        parse_str($posted, $data);
        $mode = self::scalar($data, 'eco_fulfillment_type');
        if (!in_array($mode, array('delivery', 'pickup'), true)) return;
        $choice = self::scalar($data, 'hi_club_way');
        $context['way'] = $mode === 'delivery' ? 'home' : ($choice === 'hike' ? 'hike' : 'pickup');
        if (array_key_exists('hi_club_date', $data)) $context['date'] = self::scalar($data, 'hi_club_date');
        $session->set(self::SESSION, $context);
        // Existing theme remains responsible for selecting local_pickup:8 / flat_rate:5.
    }

    public static function pickup_selected() {
        $session = self::session();
        if (!$session || $session->get('eco_fulfillment_type', 'delivery') !== 'pickup') return false;
        $methods = $session->get('chosen_shipping_methods', array());
        return is_array($methods) && count($methods) === 1 && reset($methods) === self::PICKUP;
    }

    public static function is_hike() {
        $context = self::context();
        return $context && $context['way'] === 'hike' && self::pickup_selected();
    }

    public static function prepare_checkout() {
        if (!self::context()) return;
        // Run before the native slot validator and WooCommerce's gateway validation.
        self::review(http_build_query(array_intersect_key(wp_unslash($_POST), array_flip(array('eco_fulfillment_type', 'hi_club_way', 'hi_club_date')))));
        if (!self::is_hike()) return;
        // This affects this request only; never edit the existing plugin or its settings.
        remove_action('woocommerce_checkout_process', array('ECO_Delivery_Slots', 'validate_fields'), 10);
        remove_action('woocommerce_checkout_create_order', array('ECO_Delivery_Slots', 'save_order_meta'), 10);
        // Checkout fields may have been initialized earlier in the same PHP request.
        if (method_exists(WC(), 'checkout')) {
            $checkout = WC()->checkout();
            $checkout->checkout_fields = self::slot_fields($checkout->get_checkout_fields());
        }
    }

    public static function slot_fields($fields) {
        if (!self::is_hike()) return $fields;
        foreach (array(self::SLOT_DATE, self::SLOT_TIME) as $key) {
            if (isset($fields['billing'][$key])) $fields['billing'][$key]['required'] = false;
        }
        return $fields;
    }

    public static function posted_data($data) {
        if (self::is_hike()) {
            // Do not persist a hidden, obsolete pickup-today choice into the order.
            unset($data[self::SLOT_DATE], $data[self::SLOT_TIME]);
        }
        return $data;
    }

    public static function payment_gateways($gateways) {
        if (!self::is_hike()) return $gateways;
        // No cash/card fallback when SBP is unavailable.
        return isset($gateways[self::SBP]) ? array(self::SBP => $gateways[self::SBP]) : array();
    }

    public static function discount_state() {
        return '<span id="hi-club-discount-state" hidden data-card="'
            . (self::card_active() || (WC()->cart && WC()->cart->has_discount(self::COUPON)) ? '1' : '0') . '"></span>';
    }

    public static function fragments($fragments) {
        if (self::context()) $fragments['#hi-club-discount-state'] = self::discount_state();
        return $fragments;
    }

    public static function should_skip_pickup_discount($cart) {
        $context = self::context();
        // обычная покупка из каталога с картой: 3% за самовывоз не складываем с картой (общий потолок 10%)
        if (!$context) return self::card_active() && self::pickup_selected();
        return self::pickup_selected() && ($context['way'] === 'hike' || $cart->has_discount(self::COUPON) || self::card_active());
    }

    // ---- скидка по карте интеллигента ----
    public static function loyalty_enabled() {
        return get_option(self::LOYALTY, 'off') === 'on' && strlen((string) get_option(self::LOYALTY_KEY, '')) >= 32;
    }

    public static function card_active() {
        return self::loyalty_enabled() && self::card_token() !== '';
    }

    // Только https-адрес, оканчивающийся на /api/dc-loyalty; иначе – адрес по умолчанию.
    public static function api_url() {
        $url = trim((string) get_option(self::LOYALTY_API_URL, ''));
        return preg_match('#^https://[a-z0-9.-]+(:\d{2,5})?/api/dc-loyalty$#Di', $url) ? $url : self::LOYALTY_API;
    }

    // Один запрос к серверу клуба; без повторов. Ответ – массив или null.
    public static function api($payload) {
        if (!function_exists('wp_remote_post')) return null;
        $response = wp_remote_post(self::api_url(), array(
            'timeout' => ($payload['action'] ?? '') === 'health' ? 20 : 6, 'redirection' => 0,
            'headers' => array('Content-Type' => 'application/json', 'x-dc-store-key' => (string) get_option(self::LOYALTY_KEY, '')),
            'body' => wp_json_encode(array_merge(array('actor' => '0'), $payload)),
        ));
        if (is_wp_error($response)) {
            $message = method_exists($response, 'get_error_message') ? $response->get_error_message() : '';
            preg_match('/cURL error (\d{1,3})\b/i', $message, $curl);
            return array('error' => isset($curl[1]) ? 'transport_curl_' . $curl[1] : 'transport_error');
        }
        $body = json_decode((string) wp_remote_retrieve_body($response), true);
        if ((int) wp_remote_retrieve_response_code($response) !== 200 || !is_array($body)) {
            return is_array($body) && isset($body['error']) ? array('error' => (string) $body['error']) : array('error' => 'http_' . (int) wp_remote_retrieve_response_code($response) . (is_array($body) ? '' : '_invalid_json'));
        }
        return $body;
    }

    // Сумма товаров в копейках – основа расчёта (до скидки по карте, после прочих купонов).
    private static function gross_kopecks($cart) {
        return (int) round((float) $cart->get_cart_contents_total() * 100);
    }

    public static function quote($cart) {
        $card = self::card_token();
        $gross = self::gross_kopecks($cart);
        if (!self::card_active() || $gross <= 0) return null;
        $session = self::session();
        $cached = $session ? $session->get(self::QUOTE) : null;
        // Корзина пересчитывается много раз – сервер спрашиваем не чаще раза в 5 минут для той же суммы.
        if (is_array($cached) && $cached['card'] === $card && $cached['gross'] === $gross && $cached['at'] > time() - 300 && (!empty($cached['ok']) || ($cached['error'] ?? '') !== 'unavailable')) return $cached;
        $result = self::api(array('action' => 'quote', 'card' => $card, 'gross' => $gross));
        $quote = $result && isset($result['discount']) && is_int($result['discount']) && $result['discount'] >= 0 && $result['discount'] <= $gross
            ? array('card' => $card, 'gross' => $gross, 'discount' => $result['discount'], 'at' => time(), 'ok' => true)
            : array('card' => $card, 'gross' => $gross, 'discount' => 0, 'at' => time(), 'ok' => false,
                'error' => $result['error'] ?? 'invalid_quote');
        if ($session) $session->set(self::QUOTE, $quote);
        return $quote;
    }

    public static function card_discount($cart) {
        if (!$cart || self::$adding_box || !self::card_active()) return;
        // Старый общий купон уже даёт 10% – не складываем две скидки.
        if ($cart->has_discount(self::COUPON)) return;
        $quote = self::quote($cart);
        if (!$quote || !$quote['ok'] || $quote['discount'] <= 0) return;
        $cart->fees_api()->add_fee(array('name' => self::CARD_FEE, 'amount' => -$quote['discount'] / 100, 'taxable' => false));
    }

    // ---- сводка заказов «на хайк» в бот клуба ----
    private static function order_payload($order, $status) {
        $items = array();
        foreach ($order->get_items('line_item') as $item) {
            if (!method_exists($item, 'get_quantity')) continue;
            $items[] = array('name' => mb_substr((string) $item->get_name(), 0, 80), 'qty' => (int) $item->get_quantity(), 'total' => (int) round((float) $item->get_total() * 100));
        }
        return array('action' => 'hike_order', 'order' => array(
            'number' => (string) $order->get_order_number(), 'status' => $status,
            'date' => (string) $order->get_meta('_hi_club_hike_date'), 'route' => mb_substr((string) $order->get_meta('_hi_club_hike_route'), 0, 120),
            'name' => mb_substr(trim($order->get_billing_first_name() . ' ' . $order->get_billing_last_name()), 0, 60),
            'phone' => mb_substr((string) $order->get_billing_phone(), 0, 30),
            'items' => array_slice($items, 0, 30), 'total' => (int) round((float) $order->get_total() * 100),
            'card_discount' => (int) $order->get_meta('_hi_club_card_discount'),
            'ready_food' => $order->get_meta('_hi_club_ready_food') === 'yes',
            'tg' => (string) $order->get_meta('_hi_club_tg'),
            'fulfillment' => (string) $order->get_meta('_hi_club_way'),
            'address' => self::notification_address($order),
        ));
    }

    private static function notification_address($order) {
        if ($order->get_meta('_hi_club_way') !== 'home') return '';
        $type = $order->get_shipping_address_1() !== '' ? 'shipping' : 'billing';
        $parts = array();
        foreach (array('city', 'address_1', 'address_2', 'postcode') as $field) {
            $getter = 'get_' . $type . '_' . $field;
            $value = trim((string) $order->$getter());
            if ($value !== '') $parts[] = $value;
        }
        return mb_substr(implode(', ', $parts), 0, 400);
    }

    private static function reportable_order($order) {
        return $order && ($order->get_meta('_hi_club_way') === 'hike' ||
            ($order->get_meta('_hi_club_source') === 'intelligentsia' &&
             in_array($order->get_meta('_hi_club_way'), array('home', 'pickup'), true) &&
             preg_match('/^\d{4}-\d{2}-\d{2}$/D', (string) $order->get_meta('_hi_club_hike_date'))));
    }

    public static function notify_paid($order_id) {
        $order = self::order_from($order_id);
        if (!self::reportable_order($order) || $order->get_meta('_hi_club_notified') === 'paid') return;
        $r = self::api(self::order_payload($order, 'paid'));
        if ($r && !isset($r['error'])) { $order->update_meta_data('_hi_club_notified', 'paid'); $order->save(); }
    }

    public static function notify_cancelled($order_id) {
        $order = self::order_from($order_id);
        if (!self::reportable_order($order) || $order->get_meta('_hi_club_notified') !== 'paid') return;
        $r = self::api(self::order_payload($order, 'cancelled'));
        if ($r && !isset($r['error'])) { $order->update_meta_data('_hi_club_notified', 'cancelled'); $order->save(); }
    }

    private static function order_from($order_id) {
        return is_object($order_id) ? $order_id : (function_exists('wc_get_order') ? wc_get_order($order_id) : null);
    }

    // Оплачено – записываем покупку в журнал клуба один раз (повтор с тем же номером заказа безопасен).
    public static function ledger_confirm($order_id) {
        $order = self::order_from($order_id);
        if (!$order || !$order->get_meta('_hi_club_card') || $order->get_meta('_hi_club_ledger') === 'confirmed') return;
        $card = $order->get_meta('_hi_club_card'); $gross = (int) $order->get_meta('_hi_club_gross');
        $reference = 'wc' . $order->get_id();
        $reserve = self::api(array('action' => 'reserve', 'card' => $card, 'reference' => $reference, 'gross' => $gross));
        $done = $reserve && !isset($reserve['error']) ? self::api(array('action' => 'confirm', 'card' => $card, 'reference' => $reference)) : null;
        if ($done && ($done['state'] ?? '') === 'confirmed') {
            $order->update_meta_data('_hi_club_ledger', 'confirmed');
            if ((int) ($done['discount'] ?? -1) !== (int) $order->get_meta('_hi_club_card_discount')) {
                $order->add_order_note('Карта интеллигента: в журнале клуба скидка пересчитана на момент оплаты – ' . ((int) $done['discount'] / 100) . ' ₽.');
            }
        } else {
            $order->update_meta_data('_hi_club_ledger', 'error');
            $order->add_order_note('Карта интеллигента: не удалось записать покупку в журнал клуба. Сообщите клубу номер заказа.');
        }
        $order->save();
    }

    // Отмена или полный возврат после учёта – возвращаем лимит месяца покупки.
    public static function ledger_refund($order_id) {
        $order = self::order_from($order_id);
        if (!$order || $order->get_meta('_hi_club_ledger') !== 'confirmed') return;
        $result = self::api(array('action' => 'refund', 'card' => $order->get_meta('_hi_club_card'), 'reference' => 'wc' . $order->get_id(),
            'refundReference' => 'wc' . $order->get_id() . 'full', 'gross' => (int) $order->get_meta('_hi_club_gross')));
        $ok = $result && !isset($result['error']);
        $order->update_meta_data('_hi_club_ledger', $ok ? 'refunded' : 'refund_error');
        if (!$ok) $order->add_order_note('Карта интеллигента: не удалось вернуть лимит в журнале клуба. Сообщите клубу номер заказа.');
        $order->save();
    }

    public static function filter_fees($cart) {
        if (!$cart || !self::should_skip_pickup_discount($cart)) return;
        $api = $cart->fees_api();
        $fees = $api->get_fees();
        $expected = round((float) $cart->get_cart_contents_total() * 0.03, wc_get_price_decimals());
        $changed = false;
        foreach ($fees as $id => $fee) {
            // Remove exactly the known theme's negative 3% line; preserve unrelated fees and tax properties.
            if ($expected > 0 && $fee->name === self::FEE && (float) $fee->amount < 0
                && abs((float) $fee->amount + $expected) < 0.005) {
                unset($fees[$id]);
                $changed = true;
            }
        }
        if ($changed) $api->set_fees($fees);
    }

    public static function validate($data, $errors) {
        $posted = is_array($_POST) ? wp_unslash($_POST) : array();
        $requested_hike = self::scalar($posted, 'hi_club_way') === 'hike';
        $context = self::context();
        if ($requested_hike && !$context) {
            $errors->add('hi_club_context', 'Клубный переход истёк. Открой бокс из приложения ещё раз.');
            return;
        }
        if (!$context) return;
        self::review(http_build_query(array_intersect_key($posted, array_flip(array('eco_fulfillment_type', 'hi_club_way', 'hi_club_date')))));
        $context = self::context();
        if ($context['way'] === 'hike') {
            if (!self::is_hike() || count(WC()->cart->get_shipping_packages()) !== 1) {
                $errors->add('hi_club_shipping', 'Для выдачи на хайке должен быть выбран самовывоз магазина. Обнови способ получения.');
            }
            if (self::scalar($posted, 'payment_method') !== self::SBP) {
                $errors->add('hi_club_payment', 'Получить на хайке можно только с оплатой через СБП. Выбери СБП и обнови заказ.');
            }
            if (!self::valid_date($context['date'])) $errors->add('hi_club_date', 'Выбери сегодняшнюю или будущую дату хайка.');
            else {
                $ready = self::cart_has_ready_food();
                if (!self::hike_open($context['date'], $ready)) $errors->add('hi_club_deadline', self::closed_message($ready));
            }
        }
        if (self::should_skip_pickup_discount(WC()->cart)) {
            foreach (WC()->cart->fees_api()->get_fees() as $fee) {
                if ($fee->name === self::FEE && (float) $fee->amount < 0) {
                    $errors->add('hi_club_discount', 'Не удалось пересчитать скидку за самовывоз. Не оплачивай заказ — обратись в поддержку.');
                }
            }
        }
    }

    public static function stamp_order($order, $data) {
        $context = self::context();
        if (!$context) { self::stamp_catalog_order($order); return; }
        $order->update_meta_data('_hi_club_source', 'intelligentsia');
        HI_Club_Stock_Policy::stamp($order);
        $order->update_meta_data('_hi_club_way', $context['way']);
        // Notification context only; delivery/pickup settings and stock rules are unchanged.
        $order->update_meta_data('_hi_club_hike_date', $context['date'] ?: current_time('Y-m-d'));
        $order->update_meta_data('_hi_club_hike_route', $context['route']);
        if (!empty($context['tg'])) $order->update_meta_data('_hi_club_tg', $context['tg']);
        if (self::card_active()) {
            $quote = self::quote(WC()->cart);
            if ($quote && $quote['ok'] && $quote['discount'] > 0) {
                $order->update_meta_data('_hi_club_card', $context['card']);
                $order->update_meta_data('_hi_club_gross', $quote['gross']);
                $order->update_meta_data('_hi_club_card_discount', $quote['discount']);
            }
        }
        if (self::is_hike()) {
            foreach (array('_eco_pickup_date', '_eco_pickup_time', '_eco_delivery_date', '_eco_delivery_time') as $key) $order->delete_meta_data($key);
            $order->update_meta_data('_hi_club_hike_date', $context['date']);
            $order->update_meta_data('_hi_club_hike_route', $context['route']);
            $order->update_meta_data('_hi_club_ready_food', self::cart_has_ready_food() ? 'yes' : 'no');
            foreach ($order->get_items('shipping') as $item) {
                if ($item->get_method_id() === 'local_pickup' && (int) $item->get_instance_id() === 8) {
                    $item->set_method_title('Получить на хайке');
                }
            }
        }
    }

    // Обычный заказ из каталога с картой из приложения: только метки для журнала скидок; остальное как у любого заказа магазина.
    public static function stamp_catalog_order($order) {
        if (!self::card_active() || !WC()->cart) return;
        $quote = self::quote(WC()->cart);
        if (!$quote || !$quote['ok'] || $quote['discount'] <= 0) return;
        $order->update_meta_data('_hi_club_source', 'intelligentsia_catalog');
        $order->update_meta_data('_hi_club_card', self::card_token());
        $order->update_meta_data('_hi_club_gross', $quote['gross']);
        $order->update_meta_data('_hi_club_card_discount', $quote['discount']);
    }

    // Ссылка из приложения несёт #card=…: на любой странице магазина один раз отправляем карту в сессию корзины (Store API).
    public static function catalog_script() {
        if (is_admin() || !self::loyalty_enabled()) return;
        echo "<script>(function(){var m=/[#&]card=(dc1_\\d{1,16}_[A-Za-z0-9_-]{28})/.exec(location.hash);if(!m||document.getElementById('hi-root'))return;"
            . "try{history.replaceState(null,'',location.pathname+location.search)}catch(e){}"
            . "try{if(sessionStorage.getItem('hiCard')===m[1])return}catch(e){}"
            . "fetch('/wp-json/wc/store/v1/cart',{credentials:'same-origin',cache:'no-store'}).then(function(r){var n=r.headers.get('Nonce');if(!n)throw 0;"
            . "return fetch('/wp-json/wc/store/v1/cart/extensions',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',Nonce:n},body:JSON.stringify({namespace:'hiking-club',data:{source:'intelligentsia',pilot:'1',kind:'catalog',card:m[1]}})})})"
            . ".then(function(r){if(r.ok){try{sessionStorage.setItem('hiCard',m[1])}catch(e){}}}).catch(function(){});})();</script>";
    }

    public static function package_name($name, $index, $package) {
        return self::is_hike() ? 'Получить на хайке' : $name;
    }

    public static function order_totals($totals, $order, $tax_display) {
        if ($order->get_meta('_hi_club_way') !== 'hike') return $totals;
        $totals['eco_fulfillment_type'] = array('label' => 'Способ получения:', 'value' => 'Получить на хайке');
        $totals['hi_club_hike'] = array('label' => 'Хайк:', 'value' => esc_html(trim($order->get_meta('_hi_club_hike_date') . ' · ' . $order->get_meta('_hi_club_hike_route'), ' ·')));
        return $totals;
    }

    public static function admin_order($order) {
        if ($order->get_meta('_hi_club_way') !== 'hike') return;
        echo '<p><strong>Выдать организатору на старте хайка</strong><br>'
            . esc_html($order->get_meta('_hi_club_hike_date')) . '<br>'
            . esc_html($order->get_meta('_hi_club_hike_route')) . '</p>';
    }

    public static function clear() {
        $session = self::session();
        if ($session) { $session->__unset(self::SESSION); $session->__unset(self::CATALOG); }
    }

    public static function enqueue() {
        if (!function_exists('is_checkout') || !is_checkout() || is_order_received_page() || !self::context()) return;
        wp_enqueue_script('hi-club-checkout', plugins_url('checkout.js', __FILE__), array('jquery'), '0.5.0', true);
        wp_enqueue_style('hi-club-checkout', plugins_url('checkout.css', __FILE__), array(), '0.5.0');
    }

    // Explicit support view: read existing session/cache only; never request a quote here.
    public static function diagnostic_html() {
        if (!isset($_GET['hi_card_debug']) || !is_scalar($_GET['hi_card_debug']) || (string) $_GET['hi_card_debug'] !== '1') return '';
        $context = self::context();
        $session = self::session();
        $cached = $session ? $session->get(self::QUOTE) : null;
        $parts = array('контекст=' . ($context ? 'есть' : 'нет'), 'карта=' . ($context && !empty($context['card']) ? 'есть' : 'нет'), 'скидка=' . (self::loyalty_enabled() ? 'включена' : 'выключена'));
        if (!is_array($cached)) $parts[] = 'расчёт=нет';
        else {
            $parts[] = 'расчёт=' . (!empty($cached['ok']) ? 'успешен' : 'ошибка');
            $parts[] = 'карта_расчёта=' . ($context && ($cached['card'] ?? '') === ($context['card'] ?? '') ? 'совпадает' : 'другая');
            $parts[] = 'сумма_расчёта=' . (WC()->cart && ($cached['gross'] ?? -1) === self::gross_kopecks(WC()->cart) ? 'актуальна' : 'изменилась');
            $parts[] = 'возраст_сек=' . max(0, time() - (int) ($cached['at'] ?? 0));
            $error = $cached['error'] ?? '';
            $known = array('transport_error', 'invalid_quote', 'unavailable', 'unauthorized', 'online_disabled', 'inactive_card', 'invalid_card', 'service_unavailable', 'storage_unavailable', 'not_configured', 'loyalty_disabled', 'pilot_card_only');
            if (empty($cached['ok'])) $parts[] = 'код=' . (in_array($error, $known, true) || preg_match('/^(?:transport_curl_\d{1,3}|http_\d{1,3}(?:_invalid_json)?)$/D', (string) $error) ? $error : 'other');
        }
        return '<p id="hi-card-diagnostic" role="status" style="padding:12px;border:1px solid #ddd;overflow-wrap:anywhere">Диагностика карты: ' . esc_html(implode('; ', $parts)) . '</p>';
    }

    public static function render() {
        echo self::diagnostic_html();
        $context = self::context();
        if (!$context) return;
        echo self::discount_state();
        echo '<div id="hi-club-checkout" data-initial-way="' . esc_attr($context['way']) . '">';
        echo '<button type="button" id="hi-club-hike-button" class="eco-fulfillment-btn" data-mode="hi-hike">⛰️ Получить на хайке</button>';
        echo '<input type="hidden" name="hi_club_way" id="hi_club_way" value="' . esc_attr($context['way']) . '">';
        echo '<div id="hi-club-hike-details"><label for="hi_club_date">Дата хайка</label>';
        echo '<input type="date" name="hi_club_date" id="hi_club_date" min="' . esc_attr(wp_date('Y-m-d', null, new DateTimeZone('Europe/Moscow'))) . '" value="' . esc_attr($context['date']) . '">';
        echo '<p>' . esc_html($context['route']) . '</p><p>Бокс передадут организатору для выдачи на старте маршрута.</p></div></div>';
    }

    public static function admin_menu() {
        add_submenu_page('woocommerce', 'Хайкинг бокс клуба', 'Хайкинг бокс клуба', 'manage_options', 'hi-club-checkout', array(__CLASS__, 'settings'));
    }

    public static function settings() {
        if (!current_user_can('manage_options')) return;
        if (isset($_POST['hi_club_probe'])) {
            check_admin_referer('hi_club_checkout_settings');
            $started = microtime(true);
            $probe = self::api(array('action' => 'health'));
            $code = !empty($probe['ok']) ? 'ok' : ($probe['error'] ?? 'unavailable');
            $safe = preg_match('/^[a-z0-9_]{1,60}$/D', (string) $code) ? $code : 'other';
            echo '<div class="notice notice-info"><p id="hi-club-probe-result">Связь с API: ' . esc_html($safe) . '; время=' . (int) round((microtime(true) - $started) * 1000) . ' мс</p></div>';
        }
        if (isset($_POST['hi_club_save'])) {
            check_admin_referer('hi_club_checkout_settings');
            $mode = self::scalar($_POST, 'hi_club_mode') === 'pilot' ? 'pilot' : 'off';
            update_option(self::OPTION, $mode, false);
            update_option(self::LOYALTY, self::scalar($_POST, 'hi_club_loyalty') === 'on' ? 'on' : 'off', false);
            $key = trim(self::scalar($_POST, 'hi_club_loyalty_key'));
            if ($key !== '') update_option(self::LOYALTY_KEY, $key, false); // пустое поле – ключ не меняем
            update_option(self::FRONTEND, self::scalar($_POST, 'hi_club_frontend') === 'vercel' ? 'vercel' : 'local', false);
            $url = trim(self::scalar($_POST, 'hi_club_api_url'));
            update_option(self::LOYALTY_API_URL, preg_match('#^https://[a-z0-9.-]+(:\d{2,5})?/api/dc-loyalty$#Di', $url) ? $url : '', false);
            echo '<div class="notice notice-success"><p>Режим сохранён.</p></div>';
        }
        $mode = get_option(self::OPTION, 'off');
        echo '<div class="wrap"><h1>Хайкинг бокс клуба</h1><p>Заказы, пришедшие из приложения клуба: способ «Получить на хайке» и скидка по карте. Обычные покупатели магазина этого не видят.</p><form method="post">';
        wp_nonce_field('hi_club_checkout_settings');
        echo '<label>Режим <select name="hi_club_mode"><option value="off" ' . selected($mode, 'off', false) . '>Выключен</option><option value="pilot" ' . selected($mode, 'pilot', false) . '>Включён</option></select></label>';
        $loyalty = get_option(self::LOYALTY, 'off');
        echo '<h2>Скидка по карте интеллигента</h2><p>10% на покупки до 15 000 ₽ в месяц, сверх – 5%. Лимит общий с кассой магазина и считается на сервере клуба.</p>';
        echo '<p><label>Скидка <select name="hi_club_loyalty"><option value="off" ' . selected($loyalty, 'off', false) . '>Выключена</option><option value="on" ' . selected($loyalty, 'on', false) . '>Включена</option></select></label></p>';
        echo '<p><label>Ключ магазина <input type="password" name="hi_club_loyalty_key" autocomplete="off" placeholder="' . (get_option(self::LOYALTY_KEY, '') ? 'задан – оставьте пустым' : 'не задан') . '"></label></p>';
        echo '<p><label>Адрес API клуба <input type="url" name="hi_club_api_url" size="55" value="' . esc_attr((string) get_option(self::LOYALTY_API_URL, '')) . '" placeholder="' . esc_attr(self::LOYALTY_API) . '"></label><br><small>Пусто – прямой адрес Vercel. Сейчас используется: ' . esc_html(self::api_url()) . '</small></p>';
        $front = get_option(self::FRONTEND, 'local');
        echo '<h2>Конструктор бокса</h2><p><label>Откуда грузить страницу бокса <select name="hi_club_frontend"><option value="local" ' . selected($front, 'local', false) . '>Из плагина (с dietcakes)</option><option value="vercel" ' . selected($front, 'vercel', false) . '>С Vercel клуба</option></select></label></p>';
        submit_button('Сохранить режим', 'primary', 'hi_club_save');
        submit_button('Проверить связь с API (без заказов)', 'secondary', 'hi_club_probe');
        echo '</form></div>';
    }
}
add_action('plugins_loaded', array('HI_Club_Checkout', 'boot'));
