<?php
/**
 * Plugin Name: Bazarey Meat Delivery — DEBUG (safe mode)
 * Description: Logs every plugin event to /wp-content/uploads/bazarey-debug.log. No wp-config changes.
 */

function bazarey_log_path() {
    $upload = wp_upload_dir();
    return rtrim($upload['basedir'], '/\\') . '/bazarey-debug.log';
}

function bazarey_log($msg) {
    $line = '[' . date('Y-m-d H:i:s') . '] ' . $msg . "\n";
    @file_put_contents(bazarey_log_path(), $line, FILE_APPEND);
}

// Rotation: keep log under 1MB.
add_action('plugins_loaded', function () {
    $f = bazarey_log_path();
    if (file_exists($f) && filesize($f) > 1024 * 1024) {
        @rename($f, $f . '.old');
    }
}, 1);

// Heartbeat once per request — proves plugin is loaded.
add_action('plugins_loaded', function () {
    static $loaded = false;
    if ($loaded) return;
    $loaded = true;
    bazarey_log('plugin loaded at ' . home_url() . ' WP=' . get_bloginfo('version') . ' WC=' . (defined('WC_VERSION') ? WC_VERSION : '?'));
}, 5);

// === CONFIG ===
add_action('init', function () {
    if (!defined('BAZAREY_WEBHOOK_URL'))   define('BAZAREY_WEBHOOK_URL',   'https://gabriel-learn-technologies-strings.trycloudflare.com/api/webhooks/wordpress');
    if (!defined('BAZAREY_WEBHOOK_SECRET')) define('BAZAREY_WEBHOOK_SECRET', 'test-secret-xyz');
    if (!defined('BAZAREY_TIMEOUT'))       define('BAZAREY_TIMEOUT',       10);
}, 1);

// === Order forwarding ===
// WooCommerce passes ($order_id, $order) — accept the pre-populated $order so
// line items are already loaded (avoids the wc_get_order()->get_items() returning
// empty mid-creation issue).
function bazarey_forward_order($order_id, $order = null) {
    bazarey_log("hook fired for order #$order_id");
    if (get_post_meta($order_id, '_bazarey_forwarded', true)) return;
    if (!function_exists('wc_get_order')) { bazarey_log('FAIL: wc_get_order missing'); return; }
    if (!$order) $order = wc_get_order($order_id);
    if (!$order) { bazarey_log('FAIL: order not found'); return; }
    // Force items to load fully.
    $items_raw = $order->get_items(apply_filters('woocommerce_purchase_order_item_types', array('line_item')));
    bazarey_log("forwarding id=" . $order->get_id() . " total=" . $order->get_total() . " items=" . count($items_raw));

    $items = array();
    foreach ($items_raw as $item) {
        $product = $item->get_product();
        $sku = $product ? $product->get_sku() : '';
        // Try multiple sources for the product name (WP line-item name can be
        // empty in some flows — fall back to the product object).
        $name = trim((string) $item->get_name());
        if ($name === '' && $product) {
            $name = trim((string) $product->get_name());
        }
        if ($name === '') {
            $name = 'WP Item (id ' . (int) $item->get_product_id() . ')';
        }
        $qty = (float) $item->get_quantity();
        $items[] = array(
            'sku'       => $sku,
            'name'      => $name,
            'qty'       => $qty,
            'unitPrice' => $qty > 0 ? round((float)$item->get_subtotal()/$qty, 2) : 0,
        );
    }
    $payload = array(
        'wpOrderId'     => (string) $order->get_id(),
        'customerName'  => trim($order->get_billing_first_name() . ' ' . $order->get_billing_last_name()),
        'customerPhone' => $order->get_billing_phone(),
        'area'          => $order->get_billing_city(),
        'address'       => trim($order->get_billing_address_1() . ' ' . $order->get_billing_address_2()),
        'items'         => $items,
        'subtotal'      => (float) $order->get_subtotal(),
        'deliveryFee'   => (float) $order->get_shipping_total(),
        'discount'      => (float) $order->get_total_discount(),
        'total'         => (float) $order->get_total(),
        'paid'          => (float) $order->get_total(),
        'paymentMethod' => $order->get_payment_method(),
        'note'          => $order->get_customer_note(),
        'date'          => $order->get_date_created() ? $order->get_date_created()->date('Y-m-d') : date('Y-m-d'),
    );

    bazarey_log('POSTing to ' . BAZAREY_WEBHOOK_URL);
    $r = wp_remote_post(BAZAREY_WEBHOOK_URL, array(
        'method' => 'POST', 'timeout' => BAZAREY_TIMEOUT, 'blocking' => true,
        'headers' => array('Content-Type' => 'application/json', 'X-Webhook-Secret' => BAZAREY_WEBHOOK_SECRET),
        'body' => wp_json_encode($payload),
    ));
    if (is_wp_error($r)) {
        bazarey_log('FAIL wp_remote_post: ' . $r->get_error_message());
    } else {
        $code = wp_remote_retrieve_response_code($r);
        bazarey_log('OK HTTP ' . $code);
        update_post_meta($order_id, '_bazarey_forwarded', time());
    }
}

add_action('woocommerce_new_order',                'bazarey_forward_order', 10, 2);
add_action('woocommerce_thankyou',                 'bazarey_forward_order', 20, 2);
add_action('woocommerce_order_status_processing',  'bazarey_forward_order', 30, 2);

// === REST endpoints ===
add_action('rest_api_init', function () {
    register_rest_route('bazarey-sync/v1', '/status', array(
        'methods' => 'POST', 'permission_callback' => '__return_true',
        'callback' => 'bazarey_handle_status_update',
    ));
    register_rest_route('bazarey-sync/v1', '/log', array(
        'methods' => 'GET', 'permission_callback' => '__return_true',
        'callback' => 'bazarey_handle_log_read',
    ));
});

function bazarey_handle_status_update(WP_REST_Request $request) {
    $secret = $request->get_header('x_bazarey_secret');
    if ($secret !== BAZAREY_WEBHOOK_SECRET) return new WP_Error('forbidden', 'Invalid secret', array('status' => 401));
    $body = $request->get_json_params();
    if (empty($body['wpOrderId']) || empty($body['status'])) return new WP_Error('bad_request', 'Missing fields', array('status' => 400));
    $order = wc_get_order((int) $body['wpOrderId']);
    if (!$order) return new WP_Error('not_found', 'Order not found', array('status' => 404));
    $map = array(
        'pending-approval' => 'on-hold', 'new' => 'processing', 'confirmed' => 'processing',
        'preparing' => 'processing', 'out-for-delivery' => 'shipped',
        'delivered' => 'completed', 'cancelled' => 'cancelled',
    );
    $wcStatus = isset($map[$body['status']]) ? $map[$body['status']] : 'processing';
    $order->set_status($wcStatus);
    $order->save();
    bazarey_log('WC status updated #' . $body['wpOrderId'] . ' -> ' . $wcStatus);
    return array('ok' => true, 'wcStatus' => $wcStatus);
}

function bazarey_handle_log_read(WP_REST_Request $request) {
    $secret = $request->get_header('x_bazarey_secret');
    if ($secret !== BAZAREY_WEBHOOK_SECRET) return new WP_Error('forbidden', 'Invalid secret', array('status' => 401));
    $f = bazarey_log_path();
    if (!file_exists($f)) return new WP_Error('not_found', 'Log file not created yet. Visit any WP page first.', array('status' => 404));
    $content = file_get_contents($f);
    $lines = explode("\n", trim($content));
    return array(
        'path' => $f,
        'size' => filesize($f),
        'tail' => implode("\n", array_slice($lines, -40)),
        'all' => $content,
    );
}
