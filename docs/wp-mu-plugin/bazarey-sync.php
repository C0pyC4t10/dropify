<?php
/**
 * Plugin Name: Bazarey Meat Delivery — Auto Sync
 * Description: Forwards every WooCommerce order to the Bazarey Meat Delivery ops console.
 *              Also accepts status updates back from our app to flip WC order status.
 */

// === CONFIG ===
add_action('init', function () {
    if (!defined('BAZAREY_WEBHOOK_URL'))   define('BAZAREY_WEBHOOK_URL',   'https://gabriel-learn-technologies-strings.trycloudflare.com/api/webhooks/wordpress');
    if (!defined('BAZAREY_WEBHOOK_SECRET')) define('BAZAREY_WEBHOOK_SECRET', 'test-secret-xyz');
    if (!defined('BAZAREY_TIMEOUT'))       define('BAZAREY_TIMEOUT',       10);
    if (!defined('BAZAREY_DEBUG'))          define('BAZAREY_DEBUG',          false); // set true to enable [bazarey-sync] logs
}, 1);

function bazarey_log($msg) {
    if (defined('BAZAREY_DEBUG') && BAZAREY_DEBUG) {
        error_log('[bazarey-sync] ' . $msg);
    }
}

// === Order forwarding ===
function bazarey_forward_order($order_id) {
    if (get_post_meta($order_id, '_bazarey_forwarded', true)) return;
    if (!function_exists('wc_get_order')) return;
    $order = wc_get_order($order_id);
    if (!$order) return;
    bazarey_log('Forwarding order #' . $order_id);

    $items = array();
    foreach ($order->get_items() as $item) {
        $product = $item->get_product();
        $sku = $product ? $product->get_sku() : 'UNKNOWN';
        $qty = (float) $item->get_quantity();
        $items[] = array(
            'sku'       => $sku,
            'qty'       => $qty,
            'unitPrice' => $qty > 0 ? round((float) $item->get_subtotal() / $qty, 2) : 0,
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

    $r = wp_remote_post(BAZAREY_WEBHOOK_URL, array(
        'method'   => 'POST',
        'timeout'  => BAZAREY_TIMEOUT,
        'blocking' => false,
        'headers'  => array(
            'Content-Type'     => 'application/json',
            'X-Webhook-Secret' => BAZAREY_WEBHOOK_SECRET,
        ),
        'body'     => wp_json_encode($payload),
    ));
    if (is_wp_error($r)) {
        bazarey_log('Forward FAILED for #' . $order_id . ': ' . $r->get_error_message());
    } else {
        update_post_meta($order_id, '_bazarey_forwarded', time());
    }
}

// Hook on multiple events for reliability across payment gateways.
add_action('woocommerce_new_order',                'bazarey_forward_order', 10, 1);
add_action('woocommerce_thankyou',                 'bazarey_forward_order', 20, 1);
add_action('woocommerce_order_status_processing',  'bazarey_forward_order', 30, 1);

// === Outbound status receiver (from our console) ===
add_action('rest_api_init', function () {
    register_rest_route('bazarey-sync/v1', '/status', array(
        'methods'             => 'POST',
        'permission_callback' => '__return_true',
        'callback'            => 'bazarey_handle_status_update',
    ));
});

function bazarey_handle_status_update(WP_REST_Request $request) {
    $secret = $request->get_header('x_bazarey_secret');
    if ($secret !== BAZAREY_WEBHOOK_SECRET) {
        return new WP_Error('forbidden', 'Invalid secret', array('status' => 401));
    }
    $body = $request->get_json_params();
    if (empty($body['wpOrderId']) || empty($body['status'])) {
        return new WP_Error('bad_request', 'Missing fields', array('status' => 400));
    }
    $order = wc_get_order((int) $body['wpOrderId']);
    if (!$order) {
        return new WP_Error('not_found', 'Order not found', array('status' => 404));
    }
    $map = array(
        'pending-approval' => 'on-hold',
        'new'              => 'processing',
        'confirmed'        => 'processing',
        'preparing'        => 'processing',
        'out-for-delivery' => 'shipped',
        'delivered'        => 'completed',
        'cancelled'        => 'cancelled',
    );
    $wcStatus = isset($map[$body['status']]) ? $map[$body['status']] : 'processing';
    $order->set_status($wcStatus);
    $order->save();
    bazarey_log('WC status updated for #' . $body['wpOrderId'] . ' -> ' . $wcStatus);
    return array('ok' => true, 'wcStatus' => $wcStatus);
}
