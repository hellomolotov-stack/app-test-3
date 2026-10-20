<?php
/**
 * Plugin Name: ECO Delivery Slots
 * Description: Выбор даты/времени доставки (ASAP 1-2 часа + интервалы) + современный UI. Настройки в админке. Серверная валидация. Совместимо с Woodmart/Elementor.
 * Version: 1.3.4
 * Author: Upsight
 */

if (!defined('ABSPATH')) exit;

class ECO_Delivery_Slots {
    const OPT_KEY = 'eco_delivery_slots_settings';

    // Woo checkout field keys (billing group)
    const FIELD_DATE = 'billing_eco_delivery_date';
    const FIELD_TIME = 'billing_eco_delivery_time';

    const META_DELIVERY_DATE = '_eco_delivery_date';
    const META_DELIVERY_TIME = '_eco_delivery_time';
    const META_PICKUP_DATE   = '_eco_pickup_date';
    const META_PICKUP_TIME   = '_eco_pickup_time';
    const META_MODE          = '_eco_fulfillment_type';

    public static function init() {
        // Admin
        add_action('admin_menu', [__CLASS__, 'admin_menu']);
        add_action('admin_init', [__CLASS__, 'register_settings']);

        // Checkout fields (billing)
        add_filter('woocommerce_checkout_fields', [__CLASS__, 'inject_checkout_fields'], 20);

        // Validate & save
        add_action('woocommerce_checkout_process', [__CLASS__, 'validate_fields']);
        add_action('woocommerce_checkout_create_order', [__CLASS__, 'save_order_meta'], 10, 2);

        // Display in admin + emails (оставляем как есть)
        add_action('woocommerce_admin_order_data_after_shipping_address', [__CLASS__, 'render_admin_order_meta']);
        add_filter('woocommerce_email_order_meta_fields', [__CLASS__, 'render_email_meta'], 10, 3);

        // ✅ Checkout placement: inside shipping section
        add_action('woocommerce_checkout_shipping', [__CLASS__, 'render_checkout_delivery_block'], 5);

        // Totals table (добавляем строку, но НЕ на thankyou и НЕ на view-order)
        add_filter('woocommerce_get_order_item_totals', [__CLASS__, 'add_delivery_date_to_totals'], 20, 3);

        // ✅ Thankyou + View-order: вывод под адресом доставки (перед телефоном/email)
        add_action('woocommerce_order_details_after_customer_details', [__CLASS__, 'render_delivery_under_address'], 5);

        // Assets
        add_action('wp_enqueue_scripts', [__CLASS__, 'enqueue_checkout_assets'], 9999);

        // AJAX remember selection
        add_action('wc_ajax_eco_save_delivery_selection', [__CLASS__, 'ajax_save_delivery_selection']);
        add_action('wc_ajax_nopriv_eco_save_delivery_selection', [__CLASS__, 'ajax_save_delivery_selection']);
    }

    public static function defaults(): array {
        return [
            'work_start' => '10:00',
            'work_end'   => '20:00',
            'last_start' => '19:30',
            'prep_min'   => 30,
            'asap_hours' => '1,2',
            'slots'      => "10:00-12:00\n12:00-14:00\n14:00-16:00\n16:00-18:00\n18:00-20:00",
        ];
    }

    public static function get_settings(): array {
        $saved = get_option(self::OPT_KEY, []);
        return wp_parse_args(is_array($saved) ? $saved : [], self::defaults());
    }

    /* =========================
     * Admin settings
     * ========================= */
    public static function admin_menu() {
        add_menu_page(
            'Доставка: Слоты',
            'Доставка: Слоты',
            'manage_woocommerce',
            'eco-delivery-slots',
            [__CLASS__, 'admin_page'],
            'dashicons-clock',
            58
        );
    }

    public static function register_settings() {
        register_setting('eco_delivery_slots_group', self::OPT_KEY, [
            'type' => 'array',
            'sanitize_callback' => [__CLASS__, 'sanitize_settings'],
            'default' => self::defaults()
        ]);

        add_settings_section('eco_delivery_slots_main', 'Основные настройки', function () {
            echo '<div style="max-width:920px; line-height:1.55;">';
            echo '<p>На странице оформления заказа покупатель выбирает <strong>дату</strong> и <strong>время доставки</strong>. Дата/время сохраняются в заказ и показываются в админке и на странице успешно оформленного заказа.</p>';

            echo '<p><strong>Как работает логика выбора времени:</strong></p>';
            echo '<ul style="list-style:disc; padding-left:22px; margin-top:6px;">';
            echo '<li><strong>Интервалы</strong> берутся из поля “Интервалы”.</li>';
            echo '<li><strong>ASAP (через N часов)</strong> показывается <strong>только для “Сегодня”</strong> и строится от текущего времени сайта.</li>';
            echo '<li>Для <strong>“Сегодня”</strong> учитывается “Буфер подготовки” (время сборки заказа): нельзя выбрать время раньше чем <strong>сейчас + буфер</strong>.</li>';
            echo '<li>Ограничение “Последний старт доставки” запрещает выбирать интервалы, которые начинаются позже указанного времени.</li>';
            echo '</ul>';
            echo '</div>';
        }, 'eco-delivery-slots');

        add_settings_field('work_start', 'Начало работы', [__CLASS__, 'field_text'], 'eco-delivery-slots', 'eco_delivery_slots_main', [
            'key' => 'work_start',
            'placeholder' => '10:00',
            'help' => 'С какого времени в принципе можно начинать доставку. Всё, что раньше — недоступно.'
        ]);

        add_settings_field('work_end', 'Окончание работы', [__CLASS__, 'field_text'], 'eco-delivery-slots', 'eco_delivery_slots_main', [
            'key' => 'work_end',
            'placeholder' => '20:00',
            'help' => 'До какого времени можно доставлять. Интервалы, которые начинаются в это время или позже — недоступны.'
        ]);

        add_settings_field('last_start', 'Последний старт доставки', [__CLASS__, 'field_text'], 'eco-delivery-slots', 'eco_delivery_slots_main', [
            'key' => 'last_start',
            'placeholder' => '19:30',
            'help' => 'Самое позднее время, когда доставка может <strong>начаться</strong>. Например, если указано 19:30, то старт позже 19:30 запрещён.'
        ]);

        add_settings_field('prep_min', 'Буфер подготовки (мин)', [__CLASS__, 'field_number'], 'eco-delivery-slots', 'eco_delivery_slots_main', [
            'key' => 'prep_min',
            'min' => 0,
            'step' => 5,
            'help' => 'Минимальное время на сбор/подготовку, которое добавляется к текущему времени при выборе “Сегодня”. Пример: если сейчас 12:10 и буфер 30 мин — нельзя выбрать старт раньше 12:40.'
        ]);

        add_settings_field('asap_hours', 'ASAP (через N часов)', [__CLASS__, 'field_text'], 'eco-delivery-slots', 'eco_delivery_slots_main', [
            'key' => 'asap_hours',
            'placeholder' => '1,2',
            'help' => 'Варианты “В ближайшее время” (только для “Сегодня”). Укажите числа через запятую. Пример: <code>1,2</code> → покажет “Через 1 час” и “Через 2 часа”.'
        ]);

        add_settings_field('slots', 'Интервалы (по строке)', [__CLASS__, 'field_textarea'], 'eco-delivery-slots', 'eco_delivery_slots_main', [
            'key' => 'slots',
            'help' => "Список фиксированных интервалов доставки. Каждый интервал — с новой строки.\nФормат строго: HH:MM-HH:MM\nПример:\n10:00-12:00\n12:00-14:00\n14:00-16:00\n\nПодсказка: для “Сегодня” система скроет интервалы, которые уже не успеваем (с учётом буфера) или начинаются позже “Последнего старта”."
        ]);
    }

    public static function sanitize_settings($input) {
        $def = self::defaults();
        $out = [];

        $out['work_start'] = self::sanitize_hhmm($input['work_start'] ?? $def['work_start']) ?: $def['work_start'];
        $out['work_end']   = self::sanitize_hhmm($input['work_end'] ?? $def['work_end']) ?: $def['work_end'];
        $out['last_start'] = self::sanitize_hhmm($input['last_start'] ?? $def['last_start']) ?: $def['last_start'];

        $prep = isset($input['prep_min']) ? intval($input['prep_min']) : intval($def['prep_min']);
        $out['prep_min'] = max(0, $prep);

        $asap = sanitize_text_field($input['asap_hours'] ?? $def['asap_hours']);
        $asap = preg_replace('/[^0-9,]/', '', $asap);
        $asap = trim($asap, ',');
        $out['asap_hours'] = $asap ?: $def['asap_hours'];

        $slots_raw = isset($input['slots']) ? (string)$input['slots'] : $def['slots'];
        $slots_raw = str_replace(["\r\n", "\r"], "\n", $slots_raw);
        $lines = array_filter(array_map('trim', explode("\n", $slots_raw)));
        $valid = [];
        foreach ($lines as $line) {
            if (preg_match('/^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/', $line, $m)) {
                $s = self::sanitize_hhmm($m[1]);
                $e = self::sanitize_hhmm($m[2]);
                if ($s && $e) $valid[] = "{$s}-{$e}";
            }
        }
        $out['slots'] = $valid ? implode("\n", $valid) : $def['slots'];

        return $out;
    }

    private static function sanitize_hhmm($v) {
        $v = trim((string)$v);
        if (preg_match('/^([01]\d|2[0-3]):([0-5]\d)$/', $v)) return $v;
        return null;
    }

    public static function field_text($args) {
        $s = self::get_settings();
        $key = $args['key'];
        $ph  = $args['placeholder'] ?? '';
        $help = $args['help'] ?? '';
        printf(
            '<input type="text" name="%s[%s]" value="%s" placeholder="%s" class="regular-text" />',
            esc_attr(self::OPT_KEY),
            esc_attr($key),
            esc_attr($s[$key] ?? ''),
            esc_attr($ph)
        );
        if ($help) echo '<p class="description">'.wp_kses_post($help).'</p>';
    }

    public static function field_number($args) {
        $s = self::get_settings();
        $key = $args['key'];
        $min = $args['min'] ?? 0;
        $step = $args['step'] ?? 1;
        $help = $args['help'] ?? '';
        printf(
            '<input type="number" name="%s[%s]" value="%s" min="%d" step="%d" />',
            esc_attr(self::OPT_KEY),
            esc_attr($key),
            esc_attr($s[$key] ?? ''),
            intval($min),
            intval($step)
        );
        if ($help) echo '<p class="description">'.wp_kses_post($help).'</p>';
    }

    public static function field_textarea($args) {
        $s = self::get_settings();
        $key = $args['key'];
        $help = $args['help'] ?? '';
        printf(
            '<textarea name="%s[%s]" rows="7" class="large-text code">%s</textarea>',
            esc_attr(self::OPT_KEY),
            esc_attr($key),
            esc_textarea($s[$key] ?? '')
        );
        if ($help) echo '<p class="description">'.nl2br(esc_html($help)).'</p>';
    }

    public static function admin_page() {
        if (!current_user_can('manage_woocommerce')) {
            wp_die('Недостаточно прав.');
        }

        echo '<div class="wrap"><h1>Доставка: настройки слотов</h1>';
        echo '<p style="max-width:920px;">Здесь вы настраиваете правила, по которым покупателю показываются доступные варианты доставки на странице оформления заказа.</p>';
        echo '<form method="post" action="options.php">';
        settings_fields('eco_delivery_slots_group');
        do_settings_sections('eco-delivery-slots');
        submit_button('Сохранить');
        echo '</form></div>';
    }

    /* =========================
     * ✅ Our block inside shipping
     * ========================= */
    public static function render_checkout_delivery_block() {
        if (!is_checkout() || is_order_received_page()) return;

        // анти-дубль на случай особенностей темы
        static $printed = false;
        if ($printed) return;
        $printed = true;

        echo '<div class="eco-delivery-checkout-section">';
        echo '  <div id="eco-delivery-ui-mount"></div>';
        echo '</div>';
    }

    private static function get_fulfillment_mode_from_post(): string {
        $mode = isset($_POST['eco_fulfillment_type'])
            ? sanitize_text_field(wp_unslash($_POST['eco_fulfillment_type']))
            : '';

        return $mode === 'pickup' ? 'pickup' : 'delivery';
    }

    private static function get_fulfillment_mode_from_order($order): string {
        if (!$order instanceof WC_Order) return 'delivery';

        $mode = (string) $order->get_meta(self::META_MODE);
        return $mode === 'pickup' ? 'pickup' : 'delivery';
    }

    private static function get_label_set(string $mode): array {
        if ($mode === 'pickup') {
            return [
                'title'      => 'Самовывоз',
                'date_label' => 'Дата самовывоза',
                'time_label' => 'Время самовывоза',
            ];
        }

        return [
            'title'      => 'Доставка',
            'date_label' => 'Дата доставки',
            'time_label' => 'Время доставки',
        ];
    }

    /* =========================
     * Checkout fields
     * ========================= */
    public static function inject_checkout_fields($fields) {
        if (!isset($fields['billing']) || !is_array($fields['billing'])) return $fields;

        $mode = 'delivery';

        if (function_exists('WC') && WC()->session) {
            $session_mode = WC()->session->get('eco_fulfillment_type');
            if ($session_mode === 'pickup') {
                $mode = 'pickup';
            }
        }

        if (function_exists('WC') && WC()->session) {
            if ($mode === 'pickup') {
                $session_date = WC()->session->get('eco_pickup_date');
                $session_time = WC()->session->get('eco_pickup_time');
            } else {
                $session_date = WC()->session->get('eco_delivery_date');
                $session_time = WC()->session->get('eco_delivery_time');
            }
        } else {
            $session_date = '';
            $session_time = '';
        }

        $labels = self::get_label_set($mode);

        $fields['billing'][self::FIELD_DATE] = [
            'type'     => 'date',
            'label'    => __($labels['date_label'], 'eco'),
            'required' => true,
            'class'    => ['form-row-wide'],
            'priority' => 75,
            'default'  => $session_date ?: '',
            'custom_attributes' => [
                'min' => date_i18n('Y-m-d', current_time('timestamp')),
            ],
        ];

        $fields['billing'][self::FIELD_TIME] = [
            'type'     => 'select',
            'label'    => __($labels['time_label'], 'eco'),
            'required' => true,
            'class'    => ['form-row-wide'],
            'priority' => 76,
            'options'  => ['' => __('Сначала выберите дату…', 'eco')],
            'default'  => $session_time ?: '',
        ];

        return $fields;
    }

    /* =========================
     * Server-side validation
     * ========================= */
    public static function validate_fields() {
        $mode = self::get_fulfillment_mode_from_post();
        $labels = self::get_label_set($mode);

        $date = isset($_POST[self::FIELD_DATE]) ? sanitize_text_field(wp_unslash($_POST[self::FIELD_DATE])) : '';
        $time = isset($_POST[self::FIELD_TIME]) ? sanitize_text_field(wp_unslash($_POST[self::FIELD_TIME])) : '';
        if ($mode === 'pickup' && $time === 'SLOT_19:00_20:00') {
            wc_add_notice(
                'Для самовывоза интервал 19:00–20:00 недоступен. Пожалуйста, выберите другое время.',
                'error'
            );
            return;
        }

        if ($mode === 'pickup' && strpos($time, 'ASAP_') === 0) {
            $nowH   = intval(date_i18n('G', current_time('timestamp')));
            $nowI   = intval(date_i18n('i', current_time('timestamp')));
            $nowMin = $nowH * 60 + $nowI;

            $pickupAsapCutoffMin = 18 * 60 + 1; // 18:01

            if ($nowMin >= $pickupAsapCutoffMin) {
                wc_add_notice(
                    'Для самовывоза быстрая сборка доступна только до 18:00. Пожалуйста, выберите обычное время самовывоза.',
                    'error'
                );
                return;
            }
        }

        if (empty($date)) {
            wc_add_notice(sprintf('Пожалуйста, выберите %s.', mb_strtolower($labels['date_label'])), 'error');
            return;
        }

        if (empty($time)) {
            wc_add_notice(sprintf('Пожалуйста, выберите %s.', mb_strtolower($labels['time_label'])), 'error');
            return;
        }

        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            wc_add_notice(sprintf('Некорректная %s.', mb_strtolower($labels['date_label'])), 'error');
            return;
        }

        $settings  = self::get_settings();
        $workStart = self::hhmm_to_minutes($settings['work_start']);
        $workEnd   = self::hhmm_to_minutes($settings['work_end']);
        $lastStart = self::hhmm_to_minutes($settings['last_start']);
        $prepMin   = max(0, intval($settings['prep_min']));

        if ($workStart === null || $workEnd === null || $lastStart === null) {
            wc_add_notice(__('Ошибка настроек слотов. Обратитесь к администратору.', 'eco'), 'error');
            return;
        }

        $startMin = self::extract_start_minutes_from_choice($time);
        if ($startMin === null) {
            wc_add_notice(sprintf('Некорректное %s.', mb_strtolower($labels['time_label'])), 'error');
            return;
        }

        if ($startMin < $workStart || $startMin >= $workEnd) {
            wc_add_notice(sprintf('Выбранное %s вне рабочих часов.', mb_strtolower($labels['time_label'])), 'error');
            return;
        }

        if ($startMin > $lastStart) {
            wc_add_notice(__('Слишком поздно: старт возможен только до последнего разрешенного времени.', 'eco'), 'error');
            return;
        }

        $todayYmd = date_i18n('Y-m-d', current_time('timestamp'));
        if ($date < $todayYmd) {
            wc_add_notice(__('Нельзя выбрать дату в прошлом.', 'eco'), 'error');
            return;
        }

        if ($date === $todayYmd) {
            $nowH   = intval(date_i18n('G', current_time('timestamp')));
            $nowI   = intval(date_i18n('i', current_time('timestamp')));
            $nowMin = $nowH * 60 + $nowI;

            $earliest = $nowMin + $prepMin;
            if ($startMin < $earliest) {
                wc_add_notice(sprintf(
                    __('Слишком рано. Минимально доступно после %d минут подготовки.', 'eco'),
                    $prepMin
                ), 'error');
                return;
            }
        }

        if (strpos($time, 'ASAP_') === 0) {
            $allowedHours = array_values(array_filter(array_map('intval', explode(',', $settings['asap_hours']))));
            if (!$allowedHours) $allowedHours = [1, 2];

            if (!preg_match('/^ASAP_(\d+)H_/', $time, $m)) {
                wc_add_notice(__('Некорректный ASAP-выбор.', 'eco'), 'error');
                return;
            }

            $h = intval($m[1]);
            if (!in_array($h, $allowedHours, true)) {
                wc_add_notice(__('Этот вариант ASAP недоступен.', 'eco'), 'error');
                return;
            }
        }
    }

    private static function hhmm_to_minutes($hhmm) {
        if (!preg_match('/^([01]\d|2[0-3]):([0-5]\d)$/', (string)$hhmm, $m)) return null;
        return intval($m[1]) * 60 + intval($m[2]);
    }

    private static function extract_start_minutes_from_choice($choice) {
        if (preg_match('/^SLOT_(\d{2}:\d{2})_(\d{2}:\d{2})$/', (string)$choice, $m)) {
            return self::hhmm_to_minutes($m[1]);
        }
        if (preg_match('/^ASAP_\d+H_(\d{2}:\d{2})$/', (string)$choice, $m)) {
            return self::hhmm_to_minutes($m[1]);
        }
        return null;
    }

    /* =========================
     * Save order meta
     * ========================= */
    public static function save_order_meta($order, $data) {
        $mode = self::get_fulfillment_mode_from_post();

        $date = isset($_POST[self::FIELD_DATE]) ? sanitize_text_field(wp_unslash($_POST[self::FIELD_DATE])) : '';
        $time = isset($_POST[self::FIELD_TIME]) ? sanitize_text_field(wp_unslash($_POST[self::FIELD_TIME])) : '';

        $order->update_meta_data(self::META_MODE, $mode);

        if ($mode === 'pickup') {
            if ($date) $order->update_meta_data(self::META_PICKUP_DATE, $date);
            if ($time) $order->update_meta_data(self::META_PICKUP_TIME, $time);

            $order->delete_meta_data(self::META_DELIVERY_DATE);
            $order->delete_meta_data(self::META_DELIVERY_TIME);
        } else {
            if ($date) $order->update_meta_data(self::META_DELIVERY_DATE, $date);
            if ($time) $order->update_meta_data(self::META_DELIVERY_TIME, $time);

            $order->delete_meta_data(self::META_PICKUP_DATE);
            $order->delete_meta_data(self::META_PICKUP_TIME);
        }
    }

    /* =========================
     * Formatting helpers
     * ========================= */
    private static function format_delivery_date_label(string $ymd): string {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $ymd)) return $ymd;

        $today    = date_i18n('Y-m-d', current_time('timestamp'));
        $tomorrow = date('Y-m-d', strtotime($today . ' +1 day'));

        $pretty = date_i18n('d.m.Y', strtotime($ymd . ' 00:00:00'));

        if ($ymd === $today) return 'Сегодня, ' . $pretty;
        if ($ymd === $tomorrow) return 'Завтра, ' . $pretty;

        return $pretty;
    }

    private static function format_delivery_time_label(string $raw): string {
        if (preg_match('/^SLOT_(\d{2}:\d{2})_(\d{2}:\d{2})$/', $raw, $m)) {
            return $m[1] . ' - ' . $m[2];
        }
        if (preg_match('/^ASAP_(\d+)H_(\d{2}:\d{2})$/', $raw, $m)) {
            $h = (int)$m[1];
            $start = $m[2];

            $dt = DateTime::createFromFormat('H:i', $start, wp_timezone());
            if ($dt) {
                $dt->modify('+60 minutes');
                $end = $dt->format('H:i');
                return sprintf('Через %d ч: %s - %s', $h, $start, $end);
            }
            return sprintf('Через %d ч: %s', $h, $start);
        }
        return $raw;
    }

    private static function format_delivery_datetime_label(?string $dateYmd, ?string $timeRaw): string {
        $dateYmd = (string) $dateYmd;
        $timeRaw = (string) $timeRaw;

        $dateLabel = $dateYmd ? self::format_delivery_date_label($dateYmd) : '';
        $timeLabel = $timeRaw ? self::format_delivery_time_label($timeRaw) : '';

        $parts = array_filter([$dateLabel, $timeLabel]);
        return implode(', ', $parts);
    }

    private static function get_order_slot_data(WC_Order $order): array {
        $mode = self::get_fulfillment_mode_from_order($order);

        if ($mode === 'pickup') {
            return [
                'mode' => 'pickup',
                'date' => (string) $order->get_meta(self::META_PICKUP_DATE),
                'time' => (string) $order->get_meta(self::META_PICKUP_TIME),
            ];
        }

        return [
            'mode' => 'delivery',
            'date' => (string) $order->get_meta(self::META_DELIVERY_DATE),
            'time' => (string) $order->get_meta(self::META_DELIVERY_TIME),
        ];
    }

    /* =========================
     * Display: admin / emails
     * ========================= */
    public static function render_admin_order_meta($order) {
        if (!$order instanceof WC_Order) return;

        $slot = self::get_order_slot_data($order);
        $labels = self::get_label_set($slot['mode']);

        if (!$slot['date'] && !$slot['time']) return;

        $dateLabel = $slot['date'] ? self::format_delivery_date_label($slot['date']) : '';
        $timeLabel = $slot['time'] ? self::format_delivery_time_label($slot['time']) : '';

        echo '<p><strong>' . esc_html($labels['title']) . ':</strong><br>';
        if ($dateLabel) echo esc_html($labels['date_label']) . ': ' . esc_html($dateLabel) . '<br>';
        if ($timeLabel) echo esc_html($labels['time_label']) . ': ' . esc_html($timeLabel);
        echo '</p>';
    }

    public static function render_email_meta($fields, $sent_to_admin, $order) {
        if (!$order instanceof WC_Order) return $fields;

        $slot = self::get_order_slot_data($order);
        $labels = self::get_label_set($slot['mode']);

        if ($slot['date']) {
            $fields['eco_slot_date'] = [
                'label' => $labels['date_label'],
                'value' => self::format_delivery_date_label($slot['date'])
            ];
        }

        if ($slot['time']) {
            $fields['eco_slot_time'] = [
                'label' => $labels['time_label'],
                'value' => self::format_delivery_time_label($slot['time'])
            ];
        }

        return $fields;
    }

    /* =========================
     * ✅ Thankyou + View order: under address (before phone/email)
     * ========================= */
    public static function render_delivery_under_address($order) {
        if (!$order instanceof WC_Order) return;

        $is_view_order = function_exists('is_wc_endpoint_url') ? is_wc_endpoint_url('view-order') : false;
        if (!(is_order_received_page() || $is_view_order)) return;

        $slot = self::get_order_slot_data($order);
        $labels = self::get_label_set($slot['mode']);

        if (!$slot['date'] && !$slot['time']) return;

        $value = self::format_delivery_datetime_label($slot['date'], $slot['time']);
        ?>
        <div class="eco-delivery-customer-details" style="margin-top:8px;">
            <strong><?php echo esc_html($labels['title']); ?>:</strong> <?php echo esc_html($value); ?>
        </div>

        <script>
          (function(){
            var box = document.querySelector('.eco-delivery-customer-details');
            if (!box) return;

            var address = document.querySelector('.woocommerce-customer-details address');
            if (!address) return;

            var phone = address.querySelector('.woocommerce-customer-details--phone');
            var email = address.querySelector('.woocommerce-customer-details--email');

            if (phone) {
              address.insertBefore(box, phone);
            } else if (email) {
              address.insertBefore(box, email);
            } else {
              address.appendChild(box);
            }
          })();
        </script>
        <?php
    }

    /* =========================
     * Add to totals table
     * ========================= */
public static function add_delivery_date_to_totals($total_rows, $order, $tax_display) {
    if (!$order instanceof WC_Order) return $total_rows;

    // ❌ НЕ показываем в email вообще
    if ( doing_action('woocommerce_email_order_details') ) {
        return $total_rows;
    }

    // ❌ НЕ показываем на thankyou / view-order
    $is_view_order = function_exists('is_wc_endpoint_url') ? is_wc_endpoint_url('view-order') : false;
    if (is_order_received_page() || $is_view_order) {
        return $total_rows;
    }

    $slot = self::get_order_slot_data($order);
    $labels = self::get_label_set($slot['mode']);

    if (!$slot['date'] && !$slot['time']) return $total_rows;

    $value = self::format_delivery_datetime_label($slot['date'], $slot['time']);

    $new_rows = [];
    $inserted = false;

    foreach ($total_rows as $key => $row) {
        $new_rows[$key] = $row;

        if ($key === 'shipping') {
            $new_rows['eco_slot_date'] = [
                'label' => $labels['title'] . ':',
                'value' => esc_html($value),
            ];
            $inserted = true;
        }
    }

    if (!$inserted) {
        $new_rows['eco_slot_date'] = [
            'label' => $labels['title'] . ':',
            'value' => esc_html($value),
        ];
    }

    return $new_rows;
}

    /* =========================
     * Assets
     * ========================= */
    public static function enqueue_checkout_assets() {
        if (!is_checkout() || is_order_received_page()) return;
        if (!function_exists('WC')) return;

        // CSS намеренно не подключаем (как вы просили)

        $settings = self::get_settings();

        $asap = array_values(array_filter(array_map('intval', explode(',', $settings['asap_hours']))));
        if (!$asap) $asap = [1, 2];

        $slots = [];
        $lines = array_filter(array_map('trim', explode("\n", str_replace(["\r\n", "\r"], "\n", $settings['slots']))));
        foreach ($lines as $line) {
            if (preg_match('/^(\d{2}:\d{2})-(\d{2}:\d{2})$/', $line, $m)) {
                $slots[] = [$m[1], $m[2]];
            }
        }
        if (!$slots) {
            $slots = [
                ['10:00','12:00'],['12:00','14:00'],['14:00','16:00'],['16:00','18:00'],['18:00','20:00']
            ];
        }

        wp_register_script(
            'eco-delivery-checkout',
            plugin_dir_url(__FILE__) . 'assets/checkout.js',
            ['jquery'],
            '1.3.9',
            true
        );

        wp_localize_script('eco-delivery-checkout', 'ECO_DeliveryRules', [
            'workStart' => $settings['work_start'],
            'workEnd'   => $settings['work_end'],
            'lastStart' => $settings['last_start'],
            'prepMin'   => intval($settings['prep_min']),
            'asapHours' => $asap,
            'slots'     => $slots,

            'nowTs'     => time(),
            'todayYmd'  => date_i18n('Y-m-d', current_time('timestamp')),

            'ajaxUrl'   => WC_AJAX::get_endpoint('eco_save_delivery_selection'),
            'fieldDateId' => self::FIELD_DATE,
            'fieldTimeId' => self::FIELD_TIME,
            'i18n' => [
                'noOptionsToday' => 'На сегодня доставки уже нет — выберите другую дату.',
                'asap' => 'В ближайшее время',
                'slots' => 'Интервалы',
                'chooseTime' => 'Выберите время…',
            ],
        ]);

        wp_enqueue_script('eco-delivery-checkout');
    }

    /* =========================
     * AJAX
     * ========================= */
    public static function ajax_save_delivery_selection() {
        if (!function_exists('WC') || !WC()->session) {
            wp_send_json_error(['message' => 'No session']);
        }

        $date = isset($_POST['date']) ? sanitize_text_field(wp_unslash($_POST['date'])) : '';
        $time = isset($_POST['time']) ? sanitize_text_field(wp_unslash($_POST['time'])) : '';
        $mode = isset($_POST['mode']) ? sanitize_text_field(wp_unslash($_POST['mode'])) : 'delivery';

        if ($date && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) $date = '';
        if ($time && strlen($time) > 120) $time = '';
        if ($mode !== 'pickup') $mode = 'delivery';

        WC()->session->set('eco_fulfillment_type', $mode);

        if ($mode === 'pickup') {
            WC()->session->set('eco_pickup_date', $date);
            WC()->session->set('eco_pickup_time', $time);

            WC()->session->set('eco_delivery_date', '');
            WC()->session->set('eco_delivery_time', '');
        } else {
            WC()->session->set('eco_delivery_date', $date);
            WC()->session->set('eco_delivery_time', $time);

            WC()->session->set('eco_pickup_date', '');
            WC()->session->set('eco_pickup_time', '');
        }

        wp_send_json_success([
            'saved' => true,
            'mode'  => $mode,
        ]);
    }
}

ECO_Delivery_Slots::init();