import "fake-indexeddb/auto";
import sharp from "sharp";
import bcrypt from "bcryptjs";
import fs from "fs/promises";
import path from "path";
import Database from "better-sqlite3";
import {
  enqueueAction,
  flushQueue,
} from "../src/lib/rider-offline-queue.ts";

const BASE = "http://localhost:3000";
const RIDER_ID = 11;
const TODAY = new Date().toISOString().slice(0, 10);
const OLD_PIN = "5555";
const NEW_PIN = "7777";
const PHONE = "01900000077";

const db = new Database(path.join(process.cwd(), "data", "meat_delivery.db"));

function hr(title) {
  console.log(`\n${"─".repeat(70)}\n  ${title}\n${"─".repeat(70)}`);
}

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}
function fail(msg) {
  console.log(`  ✗ ${msg}`);
  process.exitCode = 1;
}

// ─── Setup ───────────────────────────────────────────────────────────────
hr("SETUP · reset rider 11 (active + tempPin=1 to force PIN change)");
db.prepare(
  "UPDATE riders SET accountStatus = 'active', pinHash = ?, tempPin = 1 WHERE id = ?"
).run(bcrypt.hashSync(OLD_PIN, 10), RIDER_ID);
db.prepare("DELETE FROM rider_login_audit WHERE riderId = ?").run(RIDER_ID);
db.prepare("DELETE FROM rider_sessions WHERE riderId = ?").run(RIDER_ID);
ok(`rider 11: status=active, tempPin=1, PIN=${OLD_PIN}, audit+session cleared`);

db.prepare("DELETE FROM proof_of_delivery WHERE orderId IN (SELECT id FROM orders WHERE note LIKE 'walkthrough%')").run();
db.prepare("DELETE FROM delivery_status_history WHERE orderId IN (SELECT id FROM orders WHERE note LIKE 'walkthrough%')").run();
db.prepare("DELETE FROM delivery_otps WHERE orderId IN (SELECT id FROM orders WHERE note LIKE 'walkthrough%')").run();
db.prepare("DELETE FROM orders WHERE note LIKE 'walkthrough%'").run();

const now = new Date().toISOString();
const onlineId = db.prepare(`
  INSERT INTO orders (
    orderNo, date, customerId, customerName, customerPhone, area, address,
    items, subtotal, deliveryFee, discount, total, paid, paymentMethod,
    status, source, deliveryMode, riderId, riderCost, note,
    createdAt, confirmedAt, stockDeducted, updatedAt, companyId, trackingCode
  ) VALUES (?, ?, NULL, 'Walkthrough Online Customer', '01700000001', 'Banani', 'House 1',
    '[{"productId":1,"name":"Beef 1kg","nameBn":"","unit":"kg","qty":1,"unitPrice":1500,"lineTotal":1500}]',
    1500, 0, 0, 1500, 0, 'cod', 'confirmed', 'manual', 'own', ?, 50, 'walkthrough-online', ?, ?, 1, ?, 1, '')
`).run(`MD-WO-${Date.now()}`, TODAY, RIDER_ID, now, now, now).lastInsertRowid;

const offlineId = db.prepare(`
  INSERT INTO orders (
    orderNo, date, customerId, customerName, customerPhone, area, address,
    items, subtotal, deliveryFee, discount, total, paid, paymentMethod,
    status, source, deliveryMode, riderId, riderCost, note,
    createdAt, confirmedAt, stockDeducted, updatedAt, companyId, trackingCode
  ) VALUES (?, ?, NULL, 'Walkthrough Offline Customer', '01700000002', 'Dhanmondi', 'House 2',
    '[{"productId":1,"name":"Mutton 1kg","nameBn":"","unit":"kg","qty":1,"unitPrice":2000,"lineTotal":2000}]',
    2000, 0, 0, 2000, 0, 'cod', 'confirmed', 'manual', 'own', ?, 50, 'walkthrough-offline', ?, ?, 1, ?, 1, '')
`).run(`MD-WF-${Date.now()}`, TODAY, RIDER_ID, now, now, now).lastInsertRowid;

ok(`created online order id=${onlineId} (COD ৳1,500) at status=confirmed`);
ok(`created offline order id=${offlineId} (COD ৳2,000) at status=confirmed`);

let cookieJar = "";
async function api(method, path, body, opts = {}) {
  const headers = { "Content-Type": "application/json" };
  if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;
  if (cookieJar) headers["Cookie"] = cookieJar;
  if (opts.form) {
    delete headers["Content-Type"];
    return fetch(`${BASE}${path}`, { method, headers, body: opts.form });
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined && method !== "GET" && method !== "HEAD" ? JSON.stringify(body) : undefined,
  });
  const sc = res.headers.get("set-cookie");
  if (sc) {
    const m = sc.match(/rider_refresh_token=[^;]+/);
    if (m) cookieJar = m[0];
  }
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

async function riderGet(path, token) { return api("GET", path, null, { token }); }
async function riderPost(path, body, token) { return api("POST", path, body, { token }); }

// ─── Phase B: Login + forced PIN change ────────────────────────────────────
hr("PHASE B · login → forced PIN change → login with new PIN");

let r = await api("POST", "/api/rider/login", { phone: PHONE, pin: OLD_PIN });
ok(`login with old PIN ${OLD_PIN} → ${r.status}, mustChangePin=${r.json?.mustChangePin}`);
if (r.status !== 200 || r.json?.mustChangePin !== true) {
  fail(`expected mustChangePin=true, got ${r.json?.mustChangePin}`);
  process.exit(1);
}

r = await api("POST", "/api/rider/change-pin", { oldPin: OLD_PIN, newPin: NEW_PIN }, { token: r.json.accessToken });
ok(`change-pin → ${r.status}`);
if (r.status !== 200) { fail("change-pin failed"); process.exit(1); }

r = await api("POST", "/api/rider/login", { phone: PHONE, pin: OLD_PIN });
ok(`login with old PIN after change → ${r.status} (must be 401)`);
if (r.status !== 401) fail("old PIN should be rejected");

r = await api("POST", "/api/rider/login", { phone: PHONE, pin: NEW_PIN });
const sessionToken = r.json.accessToken;
ok(`login with new PIN ${NEW_PIN} → ${r.status}, mustChangePin=${r.json?.mustChangePin}`);

// ─── Phase C: Today's orders list ──────────────────────────────────────────
hr("PHASE C · /api/rider/orders/today");
r = await riderGet(`/api/rider/orders/today?date=${TODAY}`, sessionToken);
const todayOrders = r.json?.orders ?? [];
const onlineOrder = todayOrders.find((o) => o.id === onlineId);
const offlineOrder = todayOrders.find((o) => o.id === offlineId);
ok(`/today returns ${todayOrders.length} orders`);
if (onlineOrder) ok(`online order ${onlineId} visible (status=${onlineOrder.status})`); else fail(`online order ${onlineId} missing`);
if (offlineOrder) ok(`offline order ${offlineId} visible (status=${offlineOrder.status})`); else fail(`offline order ${offlineId} missing`);

// ─── Phase D: Online deliver flow ──────────────────────────────────────────
hr("PHASE D · online deliver flow for order " + onlineId);

r = await riderGet(`/api/rider/orders/${onlineId}`, sessionToken);
ok(`GET /api/rider/orders/${onlineId} → ${r.status}, status=${r.json?.order?.status}`);

r = await riderPost(`/api/rider/orders/${onlineId}/transition`, { toStatus: "preparing" }, sessionToken);
ok(`→ preparing: ${r.status}`);

r = await riderPost(`/api/rider/orders/${onlineId}/transition`, { toStatus: "out-for-delivery" }, sessionToken);
const trackingCode = r.json?.order?.trackingCode;
ok(`→ out-for-delivery: ${r.status}, trackingCode=${trackingCode}`);

// Upload photo
const tinyJpeg = await sharp({
  create: { width: 200, height: 150, channels: 3, background: { r: 80, g: 120, b: 60 } },
}).jpeg({ quality: 80 }).toBuffer();
const form = new FormData();
form.append("photo", new Blob([tinyJpeg], { type: "image/jpeg" }), "walk.jpg");
const uploadRes = await fetch(`${BASE}/api/rider/orders/${onlineId}/pod/photo`, {
  method: "POST",
  headers: { Authorization: `Bearer ${sessionToken}` },
  body: form,
});
const uploadJson = await uploadRes.json();
ok(`photo upload: ${uploadRes.status}, path=${uploadJson.photoPath?.split("/").slice(-2).join("/")}`);

// Request + verify OTP
const otpRes = await riderPost(`/api/rider/orders/${onlineId}/pod/otp/request`, {}, sessionToken);
ok(`OTP request: ${otpRes.status}, smsSent=${otpRes.json?.smsSent}`);

const outbox = (await fs.readFile(path.join(process.cwd(), "data", "outbox", "sms.jsonl"), "utf8"))
  .trim().split("\n").map((l) => JSON.parse(l)).filter((r) => r.to === "01700000001");
const lastOtp = outbox[outbox.length - 1];
const codeMatch = lastOtp.body.match(/code is (\d{4})/);
const code = codeMatch[1];
ok(`OTP code from outbox: ${code}`);

const verifyRes = await riderPost(`/api/rider/orders/${onlineId}/pod/otp/verify`, { code }, sessionToken);
ok(`OTP verify: ${verifyRes.status}, otpVerified=${verifyRes.json?.otpVerified}`);

// Submit COD
const codRes = await riderPost(`/api/rider/orders/${onlineId}/pod/cod`, { amount: 1500 }, sessionToken);
ok(`COD capture: ${codRes.status}, hasMismatch=${codRes.json?.hasMismatch}`);

// Final transition
r = await riderPost(`/api/rider/orders/${onlineId}/transition`, { toStatus: "delivered" }, sessionToken);
ok(`→ delivered: ${r.status}, status=${r.json?.order?.status}`);

// Verify POD + history
r = await riderGet(`/api/rider/orders/${onlineId}`, sessionToken);
const onlineFinal = r.json;
ok(`final state: pod.otpVerified=${onlineFinal.pod?.otpVerified}, pod.amountCollected=${onlineFinal.pod?.amountCollected}`);
ok(`final history length: ${onlineFinal.history?.length} (3: pickup, on-way, delivered — photo upload doesn't log history)`);

// Public tracking check
r = await fetch(`${BASE}/api/track/${trackingCode}`);
const trackJson = await r.json();
ok(`public /track/${trackingCode} → ${r.status}, status=${trackJson.status}, podPhotoPath=${trackJson.podPhotoPath}`);
ok(`photo URL is authenticated route: ${trackJson.podPhotoPath?.startsWith("/api/track/")}`);

// Authenticated photo fetch
const photoRes = await fetch(`${BASE}${trackJson.podPhotoPath}`);
ok(`photo via authenticated route: ${photoRes.status}, content-type=${photoRes.headers.get("content-type")}`);

// ─── Phase E: Offline deliver flow (simulated via direct queue enqueue) ──
hr("PHASE E · offline deliver flow for order " + offlineId);

r = await riderPost(`/api/rider/orders/${offlineId}/transition`, { toStatus: "preparing" }, sessionToken);
ok(`→ preparing (online): ${r.status}`);
r = await riderPost(`/api/rider/orders/${offlineId}/transition`, { toStatus: "out-for-delivery" }, sessionToken);
const offlineTrackingCode = r.json?.order?.trackingCode;
ok(`→ out-for-delivery: ${r.status}, trackingCode=${offlineTrackingCode}`);

// Build a small JPEG for the offline photo
const offlineJpeg = await sharp({
  create: { width: 200, height: 150, channels: 3, background: { r: 180, g: 70, b: 90 } },
}).jpeg({ quality: 80 }).toBuffer();
const offlineBlob = new Blob([offlineJpeg], { type: "image/jpeg" });

// Enqueue offline action (rider was in basement, OTP couldn't be sent)
const enqueueRes = await enqueueAction({
  id: `wt-offline-${Date.now()}`,
  orderId: offlineId,
  toStatus: "delivered",
  reason: "",
  lat: 23.79,
  lng: 90.41,
  photoBlob: offlineBlob,
  photoMime: "image/jpeg",
  amountCollected: 1900, // customer short-paid
  otpSkippedOffline: true,
});
ok(`offline enqueue: ok=${enqueueRes.ok}, replaced=${enqueueRes.replaced ?? false}`);

// Simulate coming back online → flush. flushQueue uses fetch() with relative
// URLs which Node can't resolve — stub fetch with an absolute base URL.
const realFetch = globalThis.fetch;
globalThis.fetch = (url, opts) => {
  const u = typeof url === "string" ? url : url.url;
  const absolute = u.startsWith("http") ? u : `${BASE}${u}`;
  return realFetch(absolute, opts);
};
let flushRes;
try {
  flushRes = await flushQueue(sessionToken);
} finally {
  globalThis.fetch = realFetch;
}
ok(`flush: flushed=${flushRes.flushed}, errors=${flushRes.errors.length}`);
for (const e of flushRes.errors) console.log(`    error: ${e.message}`);

// Verify the offline order is now delivered
r = await riderGet(`/api/rider/orders/${offlineId}`, sessionToken);
const offlineFinal = r.json;
ok(`offline final state: status=${offlineFinal.order?.status}, pod.otpVerified=${offlineFinal.pod?.otpVerified}, pod.amountCollected=${offlineFinal.pod?.amountCollected}`);

r = await fetch(`${BASE}/api/track/${offlineTrackingCode}`);
const offlineTrack = await r.json();
ok(`offline /track: status=${offlineTrack.status}, codCollected=${offlineTrack.codCollected}`);

// Verify history has otpSkippedOffline marker via the audit trail
const historyMarker = db.prepare(`
  SELECT reason FROM delivery_status_history
   WHERE orderId = ? AND actorType = 'rider'
   ORDER BY id DESC LIMIT 1
`).get(offlineId);
ok(`rider's last transition reason: "${historyMarker?.reason}"`);

// ─── Phase F: Admin dispatch + COD ─────────────────────────────────────────
hr("PHASE F · admin /api/admin/dispatch + /api/admin/cod (tenant-scoped)");

const adminFetch = (path, opts = {}) => fetch(`${BASE}${path}`, {
  ...opts,
  headers: { "Content-Type": "application/json", "Cookie": "dropify_admin_mode=1", ...(opts.headers || {}) },
  body: opts.body ? JSON.stringify(opts.body) : undefined,
});

r = await adminFetch(`/api/admin/dispatch?date=${TODAY}`);
const dispatch = await r.json();
ok(`/admin/dispatch → ${r.status}, companyId=${dispatch.companyId}`);

const adminOnlineOrder = dispatch.board.flatMap((row) => row.orders).find((o) => o.id === onlineId);
const adminOfflineOrder = dispatch.board.flatMap((row) => row.orders).find((o) => o.id === offlineId);
if (adminOnlineOrder) ok(`online order ${onlineId} visible on dispatch (rider ${adminOnlineOrder.id})`);
if (adminOfflineOrder) ok(`offline order ${offlineId} visible on dispatch`);

const overrideCount = dispatch.overrides.length;
ok(`override banner count: ${overrideCount} (offline recovery should add 1)`);
const offlineOverride = dispatch.overrides.find((o) => o.orderId === offlineId);
if (offlineOverride) {
  ok(`override entry for offline order: actor=${offlineOverride.overrideActor}, podIncomplete=${offlineOverride.podIncomplete}`);
}

r = await adminFetch(`/api/admin/cod?date=${TODAY}`);
const cod = await r.json();
ok(`/admin/cod → ${r.status}, companyId=${cod.companyId}`);
ok(`COD totals: expected=৳${cod.totals.expected}, collected=৳${cod.totals.collected}, discrepancy=৳${cod.totals.discrepancy}`);
const codRows = cod.rows.map((r) => `${r.riderName}: ৳${r.discrepancy}`).join(", ");
ok(`per-rider COD: ${codRows}`);
const ourRiderCod = cod.rows.find((r) => r.riderId === RIDER_ID);
if (ourRiderCod) {
  ok(`walkthrough rider COD row: expected=৳${ourRiderCod.expectedAmount}, collected=৳${ourRiderCod.collectedAmount}, discrepancy=৳${ourRiderCod.discrepancy}, mismatched=${ourRiderCod.mismatchedOrders}`);
}

// ─── Phase G: Admin override with reason code ─────────────────────────────
hr("PHASE G · admin override a stuck order with reasonCode");

db.prepare("DELETE FROM proof_of_delivery WHERE orderId IN (SELECT id FROM orders WHERE note = 'walkthrough-override')").run();
db.prepare("DELETE FROM delivery_status_history WHERE orderId IN (SELECT id FROM orders WHERE note = 'walkthrough-override')").run();
db.prepare("DELETE FROM delivery_otps WHERE orderId IN (SELECT id FROM orders WHERE note = 'walkthrough-override')").run();
db.prepare("DELETE FROM orders WHERE note = 'walkthrough-override'").run();

const overrideOrderId = db.prepare(`
  INSERT INTO orders (
    orderNo, date, customerId, customerName, customerPhone, area, address,
    items, subtotal, deliveryFee, discount, total, paid, paymentMethod,
    status, source, deliveryMode, riderId, riderCost, note,
    createdAt, confirmedAt, stockDeducted, updatedAt, companyId, trackingCode
  ) VALUES (?, ?, NULL, 'Override Customer', '01700000003', 'Mirpur', 'House 3',
    '[{"productId":1,"name":"Chicken 1kg","nameBn":"","unit":"kg","qty":1,"unitPrice":800,"lineTotal":800}]',
    800, 0, 0, 800, 0, 'cod', 'out-for-delivery', 'manual', 'own', ?, 25, 'walkthrough-override', ?, ?, 1, ?, 1, '')
`).run(`MD-WO2-${Date.now()}`, TODAY, RIDER_ID, now, now, now).lastInsertRowid;
ok(`created stuck order ${overrideOrderId} at status=out-for-delivery`);

r = await adminFetch(`/api/admin/orders/${overrideOrderId}/override`, {
  method: "POST",
  body: {
    toStatus: "delivered",
    reasonCode: "rider_offline_otp_expired",
    reasonText: "rider was in basement, customer confirmed receipt by phone",
    notes: "called customer at 18:42, confirmed package + ৳800 received",
    actorName: "WalkthroughDispatchSupervisor",
    codAmount: 800,
  },
});
const overrideJson = await r.json();
ok(`override → ${r.status}, reasonCode=${overrideJson.override?.reasonCode}, actorName=${overrideJson.override?.actorName}`);

const overrideHistory = db.prepare(`
  SELECT reason, actorType, actorName FROM delivery_status_history WHERE orderId = ? ORDER BY id DESC LIMIT 1
`).get(overrideOrderId);
ok(`history row: actorType=${overrideHistory.actorType}, actorName=${overrideHistory.actorName}`);
ok(`history reason includes override marker: ${overrideHistory.reason.includes("admin_override_pod_bypass:rider_offline_otp_expired")}`);
ok(`history reason includes free text: ${overrideHistory.reason.includes("basement")}`);

r = await adminFetch(`/api/admin/dispatch?date=${TODAY}`);
const dispatchAfter = await r.json();
const overrideInBanner = dispatchAfter.overrides.find((o) => o.orderId === overrideOrderId);
if (overrideInBanner) {
  ok(`override banner now shows order ${overrideOrderId}, podIncomplete=${overrideInBanner.podIncomplete}`);
} else {
  fail(`override banner missing order ${overrideOrderId}`);
}

// ─── Cleanup ──────────────────────────────────────────────────────────────
hr("CLEANUP · remove walkthrough test data");
db.prepare("DELETE FROM proof_of_delivery WHERE orderId IN (SELECT id FROM orders WHERE note LIKE 'walkthrough%')").run();
db.prepare("DELETE FROM delivery_status_history WHERE orderId IN (SELECT id FROM orders WHERE note LIKE 'walkthrough%')").run();
db.prepare("DELETE FROM delivery_otps WHERE orderId IN (SELECT id FROM orders WHERE note LIKE 'walkthrough%')").run();
db.prepare("DELETE FROM orders WHERE note LIKE 'walkthrough%'").run();
ok("removed walkthrough orders + history + POD");

// Reset rider 11 PIN back to a known state for the next manual run
db.prepare(
  "UPDATE riders SET pinHash = ?, tempPin = 0 WHERE id = ?"
).run(bcrypt.hashSync(OLD_PIN, 10), RIDER_ID);
ok(`reset rider 11 PIN back to ${OLD_PIN}, tempPin=0`);

console.log(`\n${"=".repeat(70)}\n  Walkthrough complete${process.exitCode ? " (with errors)" : ""}\n${"=".repeat(70)}\n`);
process.exit(process.exitCode || 0);