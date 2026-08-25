# Meat Delivery — Implementation Roadmap

Three integrated features, designed to ship together so each one's data shapes the others:

1. **WordPress → Meat Delivery auto-order sync** (webhook bridge)
2. **Order approval queue** (WP orders gate before becoming live)
3. **Customer auto-save + manual entry** (every WP order = a customer row)

---

## 1. WordPress → Meat Delivery Auto-Order Sync

### Goal

WordPress (WooCommerce) orders automatically appear in the meat delivery operations console.

### Architecture

```
┌──────────────┐  POST + shared-secret header ┌──────────────────────┐
│  WordPress   │  ───────────────────────────► │  /api/webhooks/      │
│  (WooCommerce│                                │   wordpress          │
│   checkout)  │                                │  (this app)          │
└──────┬───────┘                                └──────────┬───────────┘
       │                                                  │
       │   REST /wp-json/bazarey-sync/v1/status           ▼
       │  ◄──────────────────────────────────────  createOrder()
       │   X-Bazarey-Secret header               source="wordpress"
       │                                          wpOrderId=…
       │                                          status="pending-approval"
       │                                          (no stock deducted yet)
       ▼
   woocommerce_order
   status updated
```

### 1.1 Type changes — `src/lib/types.ts`

- `Order`: add `wpOrderId: string` (empty for non-WP orders), `stockDeducted: boolean`
- `Settings`: add `wpWebhookSecret: string`, `wpSiteUrl: string`, `wpOutboundEnabled: boolean`

### 1.2 DB layer — `src/lib/db.ts`

- Backfill in `loadData()`:
  - For every existing order without `stockDeducted`, set `true` (legacy orders had stock deducted on creation)
  - For every existing order without `wpOrderId`, set `""`
- `createOrder()` accepts `skipStockDeduction: boolean` (default `false`)
  - When `true`, skip `applyOrderToStock(order, 1)` and set `stockDeducted = false`
- New `approveOrder(id)`:
  - If `order.stockDeducted === false`, call `applyOrderToStock(order, 1)` and flip the flag
  - Set `status: "new"`, persist, return updated order
  - Fire-and-forget `pushStatusToWoo(order)` for outbound sync

### 1.3 New webhook route — `src/app/api/webhooks/wordpress/route.ts`

- POST only
- Validates `X-Webhook-Secret` against `Settings.wpWebhookSecret`
- Receives payload:
  ```
  {
    wpOrderId, customerName, customerPhone, area, address,
    items: [{ sku, qty, unitPrice }],
    subtotal, deliveryFee, discount, total, paid, paymentMethod, note, date
  }
  ```
- Maps items by SKU → productId. If any SKU unmatched → 422 with offending SKU
- Maps payment method (`cod`, `bkash`, `nagad`, `card`, `advance`); defaults to `cod` if unknown
- Calls `createOrder()` with:
  - `source: "wordpress"`
  - `wpOrderId: <from payload>`
  - `status: "pending-approval"`
  - `skipStockDeduction: true`
- Logs each request to `webhookLog`
- Returns `{ ok: true, orderId, orderNo }` or clear error

### 1.4 WP sync helper — `src/lib/wp-sync.ts` (NEW)

- `pushStatusToWoo(order)` — POST to `<wpSiteUrl>/wp-json/bazarey-sync/v1/status` with status update; logs failures to `webhookLog`
- Status map:

  | Meat Delivery status   | WooCommerce status |
  |------------------------|--------------------|
  | `pending-approval`     | `on-hold`          |
  | `new`                  | `processing`       |
  | `confirmed`            | `processing`       |
  | `preparing`            | `processing`       |
  | `out-for-delivery`     | `shipped`          |
  | `delivered`            | `completed`        |
  | `cancelled`            | `cancelled`        |

- Fire-and-forget from `setOrderStatus` and `approveOrder` after successful state change

### 1.5 Settings UI — `src/app/settings/page.tsx`

New **WordPress Integration** section:
- Webhook URL (read-only with Copy button): `…/api/webhooks/wordpress`
- WP Site URL input (default `http://localhost`)
- Secret input with Show/Hide + Regenerate button
- "Send test ping" button → fires dummy payload to webhook
- Outbound sync toggle (default on)
- Auto-approve WP orders toggle (default off) — when on, WP orders skip the queue and go straight to `new` with stock deducted
- Last 10 webhook attempts log (timestamp, direction, status, message)

### 1.6 Header — `src/components/header.tsx`

- New API endpoint: `/api/orders/counts` returns `{ pendingApproval, today, ... }`
- When `pendingApproval > 0`, show a small pulsing badge on the **Orders** nav link: `Orders (5)` in accent-amber
- Refresh every 30s via `setInterval`

### 1.7 Orders list — `src/app/orders/page.tsx`

- Small `WP` badge next to order no. for `source === "wordpress"`, with tooltip showing `wpOrderId`
- Filter chip "WordPress" added to filter row
- Default status filters exclude `pending-approval` (it lives on its own page)

### 1.8 Dashboard — `src/app/page.tsx`

- New tile: **Pending Approval** with count + ৳-total of pending orders
- Tile links to `/orders/approval`

### 1.9 WordPress mu-plugin — `docs/wp-mu-plugin/bazarey-sync.php` (NEW, drops in `wp-content/mu-plugins/`)

- Config constants at top: `BAZAREY_WEBHOOK_URL`, `BAZAREY_SECRET`
- Hooks `woocommerce_new_order` → sends order payload to meat delivery webhook
- Stores `_bazarey_order_no` meta on the WP order for cross-reference
- Registers custom REST route `POST /wp-json/bazarey-sync/v1/status`
  - Validates `X-Bazarey-Secret` header
  - Maps meat delivery status → WC status (see table above)
  - Updates WP order status accordingly
- `docs/wp-mu-plugin/README.md` — install + configure instructions for the user

### 1.10 Edge cases

- **WP retry / duplicate fire** → duplicate check via `wpOrderId` returns existing order
- **WP site offline on outbound** → log to `webhookLog`, do not block the state change
- **Bogus SKU in payload** → 422, nothing saved; ops sees the failure in settings log
- **Outbound disabled** → no outbound calls (settings toggle)

---

## 2. Order Approval Queue

### Goal

WP orders (only) must be approved before becoming live orders. Manual orders bypass the queue.

### Flow

```
┌────────────────┐
│  WooCommerce   │
└───────┬────────┘
        │ webhook
        ▼
┌────────────────────────────────────────────────────┐
│  status="pending-approval"                          │
│  source="wordpress"                                 │
│  stockDeducted=false                                 │
└───────┬────────────────────────────────────────────┘
        ▼
┌────────────────────┐
│ /orders/approval  │
└────┬───────────────┘
     │
     ├─ Approve → status="new", stock deducted, WP status → "processing"
     │
     └─ Cancel  → modal (reason) → status="cancelled", no stock change,
                                   WP status → "cancelled"
```

### 2.1 Types — `src/lib/types.ts`

- Add `"pending-approval"` to `OrderStatus` union

### 2.2 DB — `src/lib/db.ts`

- `createOrder()` accepts optional `initialStatus: OrderStatus` (default `"new"`)
  - Webhook passes `"pending-approval"`
- New `approveOrder(id)` (see 1.2)
- New `cancelPendingOrder(id, reason)` → just sets status and reason, no stock movement (since `stockDeducted === false`)
- Backfill `loadData()`: no legacy rows need this

### 2.3 New page — `src/app/orders/approval/page.tsx` (NEW)

- Header: breadcrumb + count badge (`5 pending`)
- Filters: source, date range (today / yesterday / 7d / 30d / all)
- Table columns:
  - Order No (+ `WP` badge if WordPress)
  - Date
  - Customer (name + phone)
  - Area
  - Items (count + summary, e.g. `2 items · 1.5kg Deshi Mutton`)
  - Total
  - WP Order ID
  - Actions: **Approve** / **Cancel**
- Row clickable → opens full order detail in new tab (`/orders/{id}`) for inspection before deciding
- Bulk actions: select multiple → **Approve all** / **Cancel all**
- Empty state: "No orders waiting for approval 🎉"
- Approve/Cancel via existing `/api/orders/{id}` PUT with status payload
- Each successful action removes the row with a fade animation

### 2.4 New API — `src/app/api/orders/[id]/approve/route.ts` (NEW)

- POST → calls `approveOrder(id)` → returns updated order

### 2.5 Orders list — `src/app/orders/page.tsx`

- New filter chip: "Pending Approval (N)" — clicking routes to `/orders/approval`
- Default filter excludes `pending-approval`

### 2.6 Auto-approve toggle (settings — see 1.5)

- When enabled in settings, WP orders skip the queue entirely

---

## 3. Customer Auto-Save + Manual Entry

### Goal

- Every WP order (always carries phone) → row in `/customers`
- Existing customers get updated when a new order comes in with newer/different info
- Manual "Add Customer" page for walk-ins

### 3.1 Phone normalization — `src/lib/phone.ts` (NEW)

```
normalizePhone(input) → canonical
  "01711234567"             → "01711234567"
  "+880 1711-234567"        → "01711234567"
  "880 171 123 4567"        → "01711234567"
  " +88-01711-234567 "      → "01711234567"
  ""                        → ""
```

Rules: trim, strip `+`, strip leading `88` or `880`, strip spaces and dashes.

### 3.2 DB — `src/lib/db.ts`

- Enhance `createOrder()` customer logic:
  - Try matching by normalized phone
  - If no phone match, try `(name + area)` match (catches typos in phone)
  - On match: **update** existing record's `area`, `address`, `name` (only if new value is non-empty and either empty existing or newer-looking)
  - Always preserve `notes`
  - Return `{ customerSaved: boolean, customerUpdated: boolean, customerId }`
- Enhance `createCustomer(data)`:
  - Normalize phone before save
  - Detect duplicate phone; return `{ ok: false, duplicate: { id, name } }` unless `linkExisting: true` flag is passed
- New `updateCustomer(id, data)` already exists; no logic change

### 3.3 OrderForm toast — `src/components/order-form.tsx`

- On `customerUpdated: true`, show toast: "Updated customer: <Name>"
- On `customerSaved: true`, show existing toast: "New customer saved: <Name>"
- OrderForm is the only place that already shows this; one-line addition

### 3.4 New POST endpoint — `src/app/api/customers/route.ts`

- Currently GET only
- POST accepts `{ name, phone, area, address, notes, linkExisting? }`
- Normalizes phone, detects duplicates
- Returns `{ ok: true, customer }` or `{ ok: false, duplicate: { id, name } }`

### 3.5 New manual-add page — `src/app/customers/new/page.tsx` (NEW)

- Pattern: matches `/stock/new` and `/orders/new` (breadcrumb + sectioned cards + sticky summary + Ctrl+S)
- Fields:
  - **Name** (required)
  - **Phone** (required) — live uniqueness check; if matched, inline warning "Phone belongs to <Name>. Link anyway?" with checkbox to confirm
  - **Area** (Dhaka Metro dropdown + Other)
  - **Address**
  - **Notes** (multi-line)
- Sticky right-side summary panel: Name, Phone, Area, Order Count (live fetch), Lifetime Spend (live fetch)

### 3.6 Edit customer page — `src/app/customers/[id]/page.tsx` (NEW)

- Same layout as `/customers/new`, pre-filled
- Save → PUT `/api/customers/{id}`

### 3.7 Customers list — `src/app/customers/page.tsx`

- Top-right: **Add Customer** button → navigates to `/customers/new`
- Each row clickable → navigates to `/customers/{id}` for editing

### 3.8 Schema

Customer record stays:
```
{ id, name, phone, area, address, notes, createdAt }
```

No `source`, `lastSeen`, or `tags` field (per "keep simple").

### 3.9 Edge cases

- **WP order, phone already in system** → update area/address on existing customer, link order to them
- **WP order, phone new** → create new customer
- **WP order, phone missing** → not saved as customer (defensive; user said WP always has phone)
- **Manual add, duplicate phone** → inline warning, user can confirm link or change phone
- **Manual add, no phone** → allowed, flagged as "incomplete"
- **Edit existing customer, phone change collides with another** → inline warning
- **Order for existing customer but name is different** → update name (assume WP/name spelling correction)

---

## Files to create / change

| File | Action |
|------|--------|
| `src/lib/types.ts` | add `wpOrderId`, `stockDeducted`, `"pending-approval"` status, WP settings fields |
| `src/lib/db.ts` | backfill, `createOrder` flags, `createCustomer` enhancement, `approveOrder`, `cancelPendingOrder` |
| `src/lib/wp-sync.ts` | NEW — outbound status pusher |
| `src/lib/phone.ts` | NEW — `normalizePhone` |
| `src/app/api/webhooks/wordpress/route.ts` | NEW — inbound WP webhook |
| `src/app/api/orders/[id]/approve/route.ts` | NEW |
| `src/app/api/orders/counts/route.ts` | NEW — pending counts for header badge |
| `src/app/api/customers/route.ts` | add POST |
| `src/app/orders/approval/page.tsx` | NEW |
| `src/app/orders/page.tsx` | filter chip, WP badge |
| `src/app/orders/new/page.tsx` | (already exists from earlier work) |
| `src/app/customers/new/page.tsx` | NEW |
| `src/app/customers/[id]/page.tsx` | NEW |
| `src/app/customers/page.tsx` | Add button + clickable rows |
| `src/app/settings/page.tsx` | WP integration section |
| `src/app/page.tsx` (dashboard) | pending approval tile |
| `src/components/header.tsx` | pending count badge on Orders nav |
| `src/components/order-form.tsx` | toast on `customerUpdated` |
| `docs/wp-mu-plugin/bazarey-sync.php` | NEW — drops in WP mu-plugins folder |
| `docs/wp-mu-plugin/README.md` | NEW — install + configure instructions |
| `data/db.json` | backfill `wpOrderId: ""` and `stockDeducted: true` on existing orders |

---

## Out of scope (v1)

- Notification sound / browser push on new WP order
- WhatsApp / SMS to ops when a WP order arrives
- Multi-user: who approved what (audit log)
- Auto-approve based on rules (trusted phones, time-of-day, etc.)
- Customer lifetime spend auto-recalc on every order
- Customer merge UI
- Customer tags / segments

---

## Suggested execution order

1. **Customer page manual add + phone normalization** (foundation; used by everything else)
2. **WordPress webhook inbound + auto-save customers** (brings in real orders)
3. **Approval queue** (gates those WP orders)
4. **Outbound status sync to WP** (closes the loop)
5. **Header pending badge + dashboard tile** (visibility)
6. **mu-plugin + README for the user** (last; depends on webhook secret being set)

---

## Test plan

- **Manual add customer** → appears in `/customers` list, then `/customers/{id}` shows the row
- **Duplicate phone warning** → entering existing customer's phone shows warning
- **WP webhook with valid SKU** → order appears at `/orders/approval`, customer at `/customers`
- **WP webhook with bogus SKU** → 422, log entry, no order created
- **WP webhook duplicate fire** → second call returns existing order ID, no duplicate
- **Approve WP order** → status flips to `new`, stock decremented, appears in main orders list
- **Cancel WP order (approval)** → status flips to `cancelled`, no stock change, WP order set to `cancelled`
- **Mark approved WP order as delivered** → WP order set to `completed`
- **Settings: regenerate secret** → old secret rejected, new secret accepted
- **Settings: auto-approve on** → WP orders skip queue