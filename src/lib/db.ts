import fs from "fs";
import path from "path";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import Database from "better-sqlite3";
import { normalizePhone, phonesMatch } from "./phone";
import { generateTrackingCode } from "./tracking-code";
import { getAreaCentroid, listAreaCentroids } from "./area-centroids";
import { getLocationForArea } from "./locations";
import { haversineMeters } from "./geo";
import { geocodeAddress } from "./geocode";
import { otpLast4FromHash } from "./otp-hint";
import type {
  Category,
  Company,
  Customer,
  DeliveryMode,
  Expense,
  ExpenseCategory,
  ExpensePaymentMethod,
  Order,
  OrderSource,
  OrderStatus,
  PaymentMethod,
  Product,
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderStatus,
  Rider,
  Settings,
  StockMovement,
  StockMovementType,
  Supplier,
  Unit,
} from "./types";

const DB_DIR = path.join(process.cwd(), "data");
const JSON_FILE = path.join(DB_DIR, "db.json");
const DB_FILE = path.join(DB_DIR, "meat_delivery.db");

// --- Singleton Database instance (one process = one connection) ---
const globalForDb = globalThis as unknown as {
  __mdSqlite?: Database.Database;
  __mdMigrated?: boolean;
};

function getDb(): Database.Database {
  if (!globalForDb.__mdSqlite) {
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
    const db = new Database(DB_FILE);
    // WAL = concurrent readers + a single writer; survives crashes mid-write
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.pragma("synchronous = NORMAL");
    initSchema(db);
    globalForDb.__mdSqlite = db;
  }
  return globalForDb.__mdSqlite;
}

// --- Schema ---
const SCHEMA = `
CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  tagline TEXT NOT NULL DEFAULT '',
  logoUrl TEXT NOT NULL DEFAULT '',
  accentColor TEXT NOT NULL DEFAULT '',
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY,
  companyId INTEGER NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sortOrder INTEGER NOT NULL DEFAULT 0,
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL,
  UNIQUE(companyId, slug)
);

CREATE TABLE IF NOT EXISTS units (
  id INTEGER PRIMARY KEY,
  companyId INTEGER NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL,
  UNIQUE(companyId, code)
);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY,
  data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  nameBn TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT 'pcs',
  costPrice REAL NOT NULL DEFAULT 0,
  sellPrice REAL NOT NULL DEFAULT 0,
  marketPrice REAL NOT NULL DEFAULT 0,
  stockQty REAL NOT NULL DEFAULT 0,
  reorderLevel REAL NOT NULL DEFAULT 0,
  isActive INTEGER NOT NULL DEFAULT 1,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  area TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  lat REAL,
  lng REAL,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS riders (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  vehicle TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  homeCluster TEXT,
  subClusters TEXT NOT NULL DEFAULT '[]',
  maxStops INTEGER,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  orderNo TEXT NOT NULL UNIQUE,
  date TEXT NOT NULL,
  customerId INTEGER,
  customerName TEXT NOT NULL DEFAULT '',
  customerPhone TEXT NOT NULL DEFAULT '',
  area TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  items TEXT NOT NULL DEFAULT '[]',
  subtotal REAL NOT NULL DEFAULT 0,
  deliveryFee REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  paid REAL NOT NULL DEFAULT 0,
  paymentMethod TEXT NOT NULL DEFAULT 'cod',
  status TEXT NOT NULL DEFAULT 'new',
  source TEXT NOT NULL DEFAULT 'manual',
  deliveryMode TEXT NOT NULL DEFAULT 'own',
  pathaoTrackingId TEXT NOT NULL DEFAULT '',
  pathaoFare REAL NOT NULL DEFAULT 0,
  riderId INTEGER,
  riderCost REAL NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL,
  confirmedAt TEXT NOT NULL DEFAULT '',
  deliveredAt TEXT NOT NULL DEFAULT '',
  cancelledAt TEXT NOT NULL DEFAULT '',
  cancelReason TEXT NOT NULL DEFAULT '',
  stockDeducted INTEGER NOT NULL DEFAULT 1,
  wpOrderId TEXT NOT NULL DEFAULT '',
  updatedAt TEXT NOT NULL,
  lat REAL,
  lng REAL,
  riderSeq INTEGER,
  cluster TEXT,
  subCluster TEXT
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY,
  productId INTEGER NOT NULL,
  type TEXT NOT NULL,
  qty REAL NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY,
  companyId INTEGER NOT NULL,
  name TEXT NOT NULL,
  contact TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  paymentTerms TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS supplier_categories (
  supplierId INTEGER NOT NULL,
  categoryId INTEGER NOT NULL,
  companyId INTEGER NOT NULL,
  PRIMARY KEY (supplierId, categoryId)
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id INTEGER PRIMARY KEY,
  poNumber TEXT NOT NULL UNIQUE,
  date TEXT NOT NULL,
  supplierId INTEGER NOT NULL,
  items TEXT NOT NULL DEFAULT '[]',
  subtotal REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  expectedDate TEXT NOT NULL DEFAULT '',
  receivedDate TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL,
  category TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  vendor TEXT NOT NULL DEFAULT '',
  paymentMethod TEXT NOT NULL DEFAULT 'cash',
  note TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  createdBy TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS next_ids (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);

-- ── Rider delivery tracking (Phase 1) ──────────────────────────────────────
-- Auth + audit + POD storage for the rider-facing delivery flow.
-- All tables are additive; existing rows are unaffected.

-- Append-only audit of every status change on an order.
CREATE TABLE IF NOT EXISTS delivery_status_history (
  id          INTEGER PRIMARY KEY,
  orderId     INTEGER NOT NULL,
  fromStatus  TEXT NOT NULL DEFAULT '',
  toStatus    TEXT NOT NULL,
  actorType   TEXT NOT NULL, -- 'rider' | 'admin' | 'system'
  actorId     INTEGER NOT NULL DEFAULT 0,
  actorName   TEXT NOT NULL DEFAULT '',
  reason      TEXT NOT NULL DEFAULT '',
  lat         REAL,
  lng         REAL,
  createdAt   TEXT NOT NULL
);

-- One row per Delivered status. amountCollected/expectedAmount are NULL until
-- the deliver flow runs; expectedAmount is stamped at row create time, never
-- re-derived afterwards.
CREATE TABLE IF NOT EXISTS proof_of_delivery (
  id              INTEGER PRIMARY KEY,
  orderId         INTEGER NOT NULL UNIQUE,
  photoPath       TEXT NOT NULL DEFAULT '',
  photoSizeBytes  INTEGER NOT NULL DEFAULT 0,
  otpVerified     INTEGER NOT NULL DEFAULT 0,
  otpId           INTEGER,
  amountCollected REAL,
  expectedAmount  REAL,
  lat             REAL,
  lng             REAL,
  capturedAt      TEXT NOT NULL DEFAULT '',
  uploadedAt      TEXT NOT NULL
);

-- One active OTP per order. Rotated every time rider re-requests.
CREATE TABLE IF NOT EXISTS delivery_otps (
  id            INTEGER PRIMARY KEY,
  orderId       INTEGER NOT NULL,
  codeHash      TEXT NOT NULL,
  phone         TEXT NOT NULL,
  expiresAt     TEXT NOT NULL,
  attempts      INTEGER NOT NULL DEFAULT 0,
  deliveredSms  INTEGER NOT NULL DEFAULT 0,
  createdAt     TEXT NOT NULL
);

-- JWT refresh-token store + per-device revocation.
CREATE TABLE IF NOT EXISTS rider_sessions (
  id                  INTEGER PRIMARY KEY,
  riderId             INTEGER NOT NULL,
  refreshTokenHash    TEXT NOT NULL UNIQUE,
  deviceFingerprint   TEXT NOT NULL DEFAULT '',
  createdAt           TEXT NOT NULL,
  expiresAt           TEXT NOT NULL,
  revokedAt           TEXT NOT NULL DEFAULT ''
);

-- Login audit. eventType values: login_success | login_fail | pin_lockout |
-- logout | pin_change | session_revoked.
CREATE TABLE IF NOT EXISTS rider_login_audit (
  id          INTEGER PRIMARY KEY,
  riderId     INTEGER NOT NULL DEFAULT 0,
  eventType   TEXT NOT NULL,
  ipAddress   TEXT NOT NULL DEFAULT '',
  userAgent   TEXT NOT NULL DEFAULT '',
  success     INTEGER NOT NULL DEFAULT 0,
  createdAt   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS area_centroids (
  area TEXT PRIMARY KEY,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  zone TEXT,
  district TEXT,
  postcode TEXT
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customerId);
CREATE INDEX IF NOT EXISTS idx_orders_rider ON orders(riderId);
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(date);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(isActive);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_stock_product ON stock_movements(productId);
CREATE INDEX IF NOT EXISTS idx_po_supplier ON purchase_orders(supplierId);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);

CREATE INDEX IF NOT EXISTS idx_dsh_order ON delivery_status_history(orderId, createdAt);
CREATE INDEX IF NOT EXISTS idx_dsh_actor ON delivery_status_history(actorType, actorId);
CREATE INDEX IF NOT EXISTS idx_dotp_order_active ON delivery_otps(orderId, expiresAt);
CREATE INDEX IF NOT EXISTS idx_rs_rider ON rider_sessions(riderId, revokedAt);
CREATE INDEX IF NOT EXISTS idx_rla_rider_time ON rider_login_audit(riderId, createdAt);
`;

function initSchema(db: Database.Database): void {
  db.exec(SCHEMA);
  // Idempotent migration for databases created before the WP columns existed.
  // SQLite's `ADD COLUMN` errors if the column already exists, so we check
  // pragma_table_info first to keep this safe across restarts.
  const orderCols = (db.prepare("PRAGMA table_info(orders)").all() as Array<{ name: string }>).map(
    (c) => c.name
  );
  if (!orderCols.includes("stockDeducted")) {
    db.exec("ALTER TABLE orders ADD COLUMN stockDeducted INTEGER NOT NULL DEFAULT 1");
    // Backfill: every legacy order already had stock deducted at createOrder time.
    db.exec("UPDATE orders SET stockDeducted = 1 WHERE stockDeducted IS NULL OR stockDeducted = ''");
  }
  if (!orderCols.includes("wpOrderId")) {
    db.exec("ALTER TABLE orders ADD COLUMN wpOrderId TEXT NOT NULL DEFAULT ''");
  }
  if (!orderCols.includes("lat")) {
    db.exec("ALTER TABLE orders ADD COLUMN lat REAL");
  }
  if (!orderCols.includes("lng")) {
    db.exec("ALTER TABLE orders ADD COLUMN lng REAL");
  }
  if (!orderCols.includes("riderSeq")) {
    db.exec("ALTER TABLE orders ADD COLUMN riderSeq INTEGER");
  }
  if (!orderCols.includes("cluster")) {
    db.exec("ALTER TABLE orders ADD COLUMN cluster TEXT");
    db.exec("ALTER TABLE orders ADD COLUMN subCluster TEXT");
  }
  if (!orderCols.includes("returnedAt")) {
    db.exec("ALTER TABLE orders ADD COLUMN returnedAt TEXT NOT NULL DEFAULT ''");
    db.exec("ALTER TABLE orders ADD COLUMN returnReason TEXT NOT NULL DEFAULT ''");
  }
  // ── Rider tracking: orders.trackingCode is the public customer-facing
  // tracking id (DRO-XXXX-XXXX). Lazily populated on first transition into
  // out-for-delivery; uniqueness enforced by a partial index that ignores
  // empty strings so existing orders with the default '' don't collide.
  if (!orderCols.includes("trackingCode")) {
    db.exec("ALTER TABLE orders ADD COLUMN trackingCode TEXT NOT NULL DEFAULT ''");
    db.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_trackingcode ON orders(trackingCode) WHERE trackingCode <> ''"
    );
  }
  // Riders: homeCluster / subClusters / maxStops for the 4-cluster dispatch grid.
  const riderCols = (db.prepare("PRAGMA table_info(riders)").all() as Array<{ name: string }>).map(
    (c) => c.name
  );
  if (!riderCols.includes("homeCluster")) {
    db.exec("ALTER TABLE riders ADD COLUMN homeCluster TEXT");
    db.exec("ALTER TABLE riders ADD COLUMN subClusters TEXT NOT NULL DEFAULT '[]'");
    db.exec("ALTER TABLE riders ADD COLUMN maxStops INTEGER");
  }
  // ── Rider auth + lifecycle columns (Phase 1) ──
  // pinHash is a bcrypt $2a$10$… string; empty until setRiderPinHash runs.
  if (!riderCols.includes("pinHash")) {
    db.exec("ALTER TABLE riders ADD COLUMN pinHash TEXT NOT NULL DEFAULT ''");
  }
  if (!riderCols.includes("tempPin")) {
    db.exec("ALTER TABLE riders ADD COLUMN tempPin INTEGER NOT NULL DEFAULT 0");
  }
  if (!riderCols.includes("accountStatus")) {
    db.exec(
      "ALTER TABLE riders ADD COLUMN accountStatus TEXT NOT NULL DEFAULT 'active'"
    );
  }
  if (!riderCols.includes("lastLoginAt")) {
    db.exec("ALTER TABLE riders ADD COLUMN lastLoginAt TEXT NOT NULL DEFAULT ''");
  }
  if (!riderCols.includes("avatarPath")) {
    db.exec("ALTER TABLE riders ADD COLUMN avatarPath TEXT NOT NULL DEFAULT ''");
  }
  // ── orders.riderName (denormalized snapshot) ──
  // UI sites resolve riderId → name by joining the live riders table. After
  // a rider row is hard-deleted that lookup returns undefined and the UI
  // falls back to "Rider #N". To keep print, history, and the public /track
  // page showing the rider's real name after the rider is gone, we copy
  // the name onto the order itself at delete-time. Existing rows are
  // backfilled in the same migration so the column is non-empty for every
  // order whose rider still exists at upgrade time.
  const orderHasRiderName = (db
    .prepare("PRAGMA table_info(orders)")
    .all() as Array<{ name: string }>)
    .some((c) => c.name === "riderName");
  if (!orderHasRiderName) {
    db.exec("ALTER TABLE orders ADD COLUMN riderName TEXT NOT NULL DEFAULT ''");
    // Backfill: copy name forward from the live rider row. Orders whose
    // riderId no longer resolves (orphaned) stay empty — UI falls through
    // to `#${riderId}` as before, so no regression.
    db.exec(
      "UPDATE orders SET riderName = (SELECT name FROM riders WHERE riders.id = orders.riderId) WHERE riderId IS NOT NULL"
    );
  }
  // ── Riders backfill (Phase 2 fix) ──
  // Existing riders imported before Phase 1 had no pinHash. Defaulting them
  // to accountStatus='active' is dishonest — "active" should mean "can log
  // in with a valid PIN", not "not explicitly blocked". Flip any active
  // rider with an empty pinHash to pending_verification so they go through
  // the admin PIN reset endpoint before they can authenticate. Idempotent:
  // after the first run, either pinHash is non-empty (admin reset) or the
  // status was deliberately set to suspended/deactivated by an operator
  // (so the WHERE clause skips them).
  const backfilled = db
    .prepare(
      `UPDATE riders
          SET accountStatus = 'pending_verification'
        WHERE pinHash = ''
          AND accountStatus = 'active'`
    )
    .run().changes;
  if (backfilled > 0) {
    console.log(`[rider-backfill] flipped ${backfilled} rider(s) with no PIN to pending_verification`);
  }
  // Customers: lat / lng for routing (set from area centroid at create time)
  const customerCols = (db.prepare("PRAGMA table_info(customers)").all() as Array<{ name: string }>).map(
    (c) => c.name
  );
  // Area centroids: add district / postcode columns (added in v2 expansion)
  const centroidCols = (db.prepare("PRAGMA table_info(area_centroids)").all() as Array<{ name: string }>).map(
    (c) => c.name,
  );
  if (!centroidCols.includes("district")) {
    db.exec("ALTER TABLE area_centroids ADD COLUMN district TEXT");
  }
  if (!centroidCols.includes("postcode")) {
    db.exec("ALTER TABLE area_centroids ADD COLUMN postcode TEXT");
  }
  if (!customerCols.includes("lat")) {
    db.exec("ALTER TABLE customers ADD COLUMN lat REAL");
  }
  if (!customerCols.includes("lng")) {
    db.exec("ALTER TABLE customers ADD COLUMN lng REAL");
  }
  // Seed area_centroids table. We use ON CONFLICT DO UPDATE so the schema
  // migration (district/postcode added in v2) and any added entries get
  // applied to existing rows on the next boot. Lat/lng are also refreshed
  // — the dataset is curated + OSM-verified and is safe to overwrite.
  const seedCentroid = db.prepare(
    `INSERT INTO area_centroids (area, lat, lng, zone, district, postcode)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(area) DO UPDATE SET
       lat = excluded.lat,
       lng = excluded.lng,
       zone = excluded.zone,
       district = excluded.district,
       postcode = excluded.postcode`
  );
  for (const c of listAreaCentroids()) {
    seedCentroid.run(c.area, c.lat, c.lng, c.zone, c.district, c.postcode);
  }
  // Index on (riderId, riderSeq) — created after the column migrations so the
  // column is guaranteed to exist on legacy DBs.
  db.exec("CREATE INDEX IF NOT EXISTS idx_orders_rider_seq ON orders(riderId, riderSeq)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category)");

  // ── Multi-tenant migration (PR 1: additive, no behavior change) ──
  // Runs BEFORE the legacy settings backfill so that backfill sees the new
  // `(companyId PK, data)` shape and queries with WHERE companyId = 1.
  ensureCompaniesTable(db);
  ensureCompanyIdColumns(db);
  ensureCompanyIdIndexes(db);
  ensureSettingsReshape(db);
  ensureSeedCompaniesAndSettings(db);

  // ── Categories + Units (Dropify multi-tenant upgrade) ──
  // First-class per-tenant catalog taxonomies. After this block:
  //   - categories table exists with rows seeded for every active company
  //     (meat gets the 5 standard meat categories; non-meat tenants start
  //      with a blank slate they populate via /admin/categories)
  //   - units table exists with rows for every active company (kg / pcs)
  //   - products.category TEXT → products.categoryId INTEGER (FK)
  //   - products.unit TEXT → products.unitId INTEGER (FK)
  ensureCategoriesTable(db);
  ensureUnitsTable(db);
  ensureCategoriesIndex(db);
  ensureUnitsIndex(db);
  ensureProductCategoryAndUnitFKs(db);
  seedCategoriesAndUnitsForActiveCompanies(db);
  ensureSupplierCategoriesTable(db);
  backfillSupplierCategories(db);

  // One-time backfill of lat/lng for legacy orders + customers whose rows
  // predate the routing columns. We pull the centroid from the seeded
  // area_centroids table; orders/customers with an unrecognized area get the
  // Aftabnagar fallback (which is the same one getAreaCentroid() uses).
  const backfillOrder = db.prepare(`
    UPDATE orders
       SET lat = COALESCE(
             (SELECT lat FROM area_centroids
                WHERE LOWER(area_centroids.area) = LOWER(orders.area) LIMIT 1),
             (SELECT lat FROM area_centroids WHERE area = 'Aftabnagar' LIMIT 1)
           ),
           lng = COALESCE(
             (SELECT lng FROM area_centroids
                WHERE LOWER(area_centroids.area) = LOWER(orders.area) LIMIT 1),
             (SELECT lng FROM area_centroids WHERE area = 'Aftabnagar' LIMIT 1)
           )
     WHERE lat IS NULL OR lng IS NULL
  `);
  backfillOrder.run();

  const backfillCustomer = db.prepare(`
    UPDATE customers
       SET lat = COALESCE(
             (SELECT lat FROM area_centroids
                WHERE LOWER(area_centroids.area) = LOWER(customers.area) LIMIT 1),
             (SELECT lat FROM area_centroids WHERE area = 'Aftabnagar' LIMIT 1)
           ),
           lng = COALESCE(
             (SELECT lng FROM area_centroids
                WHERE LOWER(area_centroids.area) = LOWER(customers.area) LIMIT 1),
             (SELECT lng FROM area_centroids WHERE area = 'Aftabnagar' LIMIT 1)
           )
     WHERE lat IS NULL OR lng IS NULL
  `);
  backfillCustomer.run();

  // Backfill cluster / subCluster on legacy orders that predate the cluster
  // columns. We resolve them from the order's area string via getLocationForArea
  // (which falls back to the centroid's quadrant if the area isn't in the
  // master table).
  const ordersToCluster = db
    .prepare("SELECT id, area FROM orders WHERE cluster IS NULL")
    .all() as Array<{ id: number; area: string }>;
  if (ordersToCluster.length > 0) {
    const updCluster = db.prepare(
      "UPDATE orders SET cluster = ?, subCluster = ? WHERE id = ?"
    );
    const tx = db.transaction(() => {
      for (const o of ordersToCluster) {
        const loc = getLocationForArea(o.area);
        updCluster.run(loc.cluster, loc.subCluster, o.id);
      }
    });
    tx();
  }

  // Settings: ensure the JSON blob has all the fields we expect. If missing,
  // backfill from defaults so legacy settings rows don't crash callers.
  // (Multi-tenant migration above has already reshaped settings to
  // `(companyId PK, data)`, so the meat company's row lives at companyId=1.)
  const settingsRow = db
    .prepare("SELECT data FROM settings WHERE companyId = 1")
    .get() as { data: string } | undefined;
  if (settingsRow) {
    const parsed = JSON.parse(settingsRow.data) as Record<string, unknown>;
    let dirty = false;
    if (parsed.shopLat === undefined || parsed.shopLng === undefined) {
      const c = getAreaCentroid("Aftabnagar");
      parsed.shopLat = c.lat;
      parsed.shopLng = c.lng;
      dirty = true;
    }
    if (parsed.bkashPaymentQr === undefined) {
      parsed.bkashPaymentQr = "";
      dirty = true;
    }
    if (!Array.isArray(parsed.deliveryPartners)) {
      parsed.deliveryPartners = [];
      dirty = true;
    }
    if (typeof parsed.defaultDeliveryPartnerId !== "string") {
      parsed.defaultDeliveryPartnerId = "";
      dirty = true;
    }
    if (dirty) {
      parsed.updatedAt = new Date().toISOString();
      db.prepare("UPDATE settings SET data = ? WHERE companyId = 1").run(JSON.stringify(parsed));
    }
  }
  // Seed default settings if empty (only relevant for fresh DBs; on upgrade
  // the multi-tenant migration above has already inserted the meat row).
  const settingsCount = (db.prepare("SELECT COUNT(*) AS n FROM settings").get() as { n: number }).n;
  if (settingsCount === 0) {
    const defaults: Settings = {
      id: 1,
      businessName: "",
      tagline: "Fresh meat, doorstep delivery",
      phone: "01XXXXXXXXX",
      address: "Aftabnagar, Dhaka, Bangladesh",
      freeDeliveryThreshold: 1000,
      deliveryCharge: 40,
      invoiceNote: "Thank you for ordering. Fresh meat delivered daily.",
      posPrinterName: "Xprinter XP-350BM",
      wpWebhookSecret: "",
      wpSiteUrl: "",
      wpOutboundEnabled: true,
      wpAutoApprove: false,
      shopLat: getAreaCentroid("Aftabnagar").lat,
      shopLng: getAreaCentroid("Aftabnagar").lng,
      bkashPaymentQr: "",
      deliveryPartners: [],
      defaultDeliveryPartnerId: "",
      updatedAt: new Date().toISOString(),
    };
    db.prepare("INSERT INTO settings (companyId, data) VALUES (?, ?)").run(1, JSON.stringify(defaults));
  }
  // Seed default suppliers if empty (preserved from JSON)
  const supplierCount = (db.prepare("SELECT COUNT(*) AS n FROM suppliers").get() as { n: number }).n;
  if (supplierCount === 0) {
    const insSup = db.prepare(
      `INSERT INTO suppliers (id, name, contact, phone, address, category, paymentTerms, notes, isActive, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
    );
    const now = new Date().toISOString();
    insSup.run(
      1,
      "Karwan Bazar Wholesale",
      "Rahim",
      "01700000001",
      "Karwan Bazar, Dhaka",
      "beef,mutton",
      "Cash on delivery",
      "",
      now
    );
    insSup.run(
      2,
      "Kazi Farms",
      "Sales Desk",
      "02XXXXXXXXX",
      "Kazi Tower, Dhaka",
      "chicken",
      "7-day credit",
      "Frozen & processed",
      now
    );
    insSup.run(
      3,
      "Local Poultry Farm",
      "Jahangir",
      "01600000003",
      "Gazipur",
      "chicken",
      "Cash on delivery",
      "Live broiler & Sonali",
      now
    );
  }

  // Seed sample riders if empty (Phase 1: rider auth + tracking). PINs are
  // hashed with bcrypt (cost 10) at boot; the plaintext sample PINs are
  // intentionally simple — they're documented in the README and meant to be
  // changed on first login. Three riders cover the account-status states
  // Phase 2's login flow needs to exercise:
  //   id=1 Rahim  active,        tempPin=1  → first-login forced change
  //   id=2 Karim  suspended,     tempPin=0  → login hard-blocked
  //   id=3 Jamal  pending_verification,     → admin approval gate
  const riderCount = (db.prepare("SELECT COUNT(*) AS n FROM riders").get() as { n: number }).n;
  if (riderCount === 0) {
    const insRider = db.prepare(
      `INSERT INTO riders (
         id, name, phone, vehicle, status,
         homeCluster, subClusters, maxStops, createdAt,
         pinHash, tempPin, accountStatus
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const now = new Date().toISOString();
    insRider.run(
      1,
      "Rahim",
      "01700000001",
      "Bike",
      "active",
      "DHK-E",
      JSON.stringify(["DHK-CW"]),
      12,
      now,
      bcrypt.hashSync("1111", RIDER_BCRYPT_COST),
      1,
      "active"
    );
    insRider.run(
      2,
      "Karim",
      "01700000002",
      "Bike",
      "active",
      "DHK-NW",
      JSON.stringify([]),
      10,
      now,
      bcrypt.hashSync("2222", RIDER_BCRYPT_COST),
      0,
      "suspended"
    );
    insRider.run(
      3,
      "Jamal",
      "01700000003",
      "Bike",
      "active",
      "DHK-SE",
      JSON.stringify([]),
      null,
      now,
      bcrypt.hashSync("3333", RIDER_BCRYPT_COST),
      0,
      "pending_verification"
    );
  }
}

function tableHasColumn(db: Database.Database, table: string, column: string): boolean {
  const cols = (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
    (c) => c.name
  );
  return cols.includes(column);
}

/** `companies` table is already in the SCHEMA constant; this helper exists
 *  for symmetry and so future schema edits live next to the migration code. */
function ensureCompaniesTable(_db: Database.Database): void {
  /* no-op — table is created in SCHEMA above */
}

/** Add nullable companyId to each per-company table if not already present.
 *  PR 2 will tighten these to NOT NULL DEFAULT 1 once every read/write is
 *  company-aware. */
function ensureCompanyIdColumns(db: Database.Database): void {
  const tables = ["products", "orders", "stock_movements", "suppliers", "purchase_orders", "expenses"];
  for (const t of tables) {
    if (!tableHasColumn(db, t, "companyId")) {
      db.exec(`ALTER TABLE ${t} ADD COLUMN companyId INTEGER`);
    }
    // Backfill NULLs to 1 (the meat company). Idempotent — re-running on a
    // populated DB is a no-op because rows won't be NULL after the first run.
    db.exec(`UPDATE ${t} SET companyId = 1 WHERE companyId IS NULL`);
  }
}

/** Composite indexes per per-company table to keep per-tenant reads fast once
 *  PR 2 adds WHERE companyId = ? to every query. Idempotent via IF NOT EXISTS. */
function ensureCompanyIdIndexes(db: Database.Database): void {
  db.exec("CREATE INDEX IF NOT EXISTS idx_products_company ON products(companyId, id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_orders_company ON orders(companyId, id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_stock_company ON stock_movements(companyId, id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_suppliers_company ON suppliers(companyId, id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_purchase_orders_company ON purchase_orders(companyId, id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_expenses_company ON expenses(companyId, id)");
}

/** Reshape `settings` from `(id PK, data)` → `(companyId PK, data)`. The old
 *  shape is incompatible with multi-tenancy because there was only one row.
 *  Strategy: rebuild the table once, copy data over, drop the legacy table.
 *  Idempotent: detects the new shape via PRAGMA table_info and skips. */
function ensureSettingsReshape(db: Database.Database): void {
  const cols = (db.prepare("PRAGMA table_info(settings)").all() as Array<{ name: string }>).map(
    (c) => c.name
  );
  if (cols.includes("companyId")) return; // already on the new shape

  // Old shape had `id` and `data`. Rebuild.
  if (!cols.includes("id") || !cols.includes("data")) {
    throw new Error(`settings table has unexpected columns: ${cols.join(",")}`);
  }

  const tx = db.transaction(() => {
    db.exec(`
      CREATE TABLE settings_new (
        companyId INTEGER PRIMARY KEY,
        data TEXT NOT NULL
      )
    `);
    // Preserve any existing row by mapping id=1 → companyId=1.
    db.exec(`INSERT INTO settings_new (companyId, data) SELECT id, data FROM settings`);
    db.exec(`DROP TABLE settings`);
    db.exec(`ALTER TABLE settings_new RENAME TO settings`);
  });
  tx();
}

/** Seed the meat company as id=1 and backfill its settings row. Other
 *  companies are created via the admin UI in PR 2, not seeded here. */
function ensureSeedCompaniesAndSettings(db: Database.Database): void {
  const now = new Date().toISOString();

  // Companies: seed only if empty. The meat company always uses id=1 so the
  // existing rows we just backfilled (companyId=1) point to a valid row.
  const companyCount = (db.prepare("SELECT COUNT(*) AS n FROM companies").get() as { n: number }).n;
  if (companyCount === 0) {
    db.prepare(
      `INSERT INTO companies (id, slug, name, tagline, logoUrl, accentColor, isActive, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`
    ).run(
      1,
      "meat",
      "Bazarey Meat Delivery",
      "Fresh meat, doorstep delivery",
      "",
      "",
      now
    );
  }

  // Settings: ensure every active company has a settings row. The meat
  // company (id=1) inherits its data from the legacy singleton we just
  // reshaped; other companies get a blank Settings seeded from defaults.
  const companies = db
    .prepare("SELECT id, slug, name, tagline FROM companies WHERE isActive = 1")
    .all() as Array<{ id: number; slug: string; name: string; tagline: string }>;
  for (const c of companies) {
    const existing = db.prepare("SELECT companyId FROM settings WHERE companyId = ?").get(c.id);
    if (existing) continue;
    const defaults: Settings = makeCompanyDefaults(c.name, c.tagline);
    db.prepare("INSERT INTO settings (companyId, data) VALUES (?, ?)").run(
      c.id,
      JSON.stringify(defaults)
    );
  }
}

/** Per-company default Settings blob. Meat company (slug='meat') inherits
 *  the meat-flavoured defaults; everyone else gets a blank slate with the
 *  Aftabnagar hub coords as a placeholder origin. */
function makeCompanyDefaults(name: string, tagline: string): Settings {
  const isMeat = tagline.toLowerCase().includes("meat") || tagline.toLowerCase().includes("fresh meat");
  const hub = getAreaCentroid("Aftabnagar");
  return {
    id: 1,
    businessName: name,
    tagline,
    phone: "01XXXXXXXXX",
    address: "Aftabnagar, Dhaka, Bangladesh",
    freeDeliveryThreshold: 1000,
    deliveryCharge: isMeat ? 40 : 60,
    invoiceNote: isMeat
      ? "Thank you for ordering. Fresh meat delivered daily."
      : "Thank you for your order.",
    posPrinterName: "Xprinter XP-350BM",
    wpWebhookSecret: "",
    wpSiteUrl: "",
    wpOutboundEnabled: true,
    wpAutoApprove: false,
    shopLat: hub.lat,
    shopLng: hub.lng,
    bkashPaymentQr: "",
    deliveryPartners: [],
    defaultDeliveryPartnerId: "",
    updatedAt: new Date().toISOString(),
  };
}


// ── Categories + Units migrations ─────────────────────────────────────────
//
// Dropify promotes `products.category TEXT` (a meat-shaped enum) and
// `products.unit TEXT` (kg/pcs enum) into first-class per-tenant tables.
// This is the meat-aware data → category-aware data upgrade. After these
// migrations run, every active tenant has:
//   - a `categories` table populated with sensible defaults
//   - a `units` table with kg / pcs
//   - products linked to those via integer FK columns
//
// Non-meat tenants start with empty categories — they populate via
// /admin/categories. The meat company keeps its 5 meat categories as
// backward-compat.

const MEAT_CATEGORY_SEED: Array<{ slug: string; name: string; sortOrder: number }> = [
  { slug: "beef",    name: "Beef",    sortOrder: 1 },
  { slug: "chicken", name: "Chicken", sortOrder: 2 },
  { slug: "mutton",  name: "Mutton",  sortOrder: 3 },
  { slug: "offal",   name: "Offal",   sortOrder: 4 },
  { slug: "fish",    name: "Fish",    sortOrder: 5 },
];

const DEFAULT_UNIT_SEED: Array<{ code: string; name: string; sortOrder: number }> = [
  { code: "kg",  name: "Kilogram", sortOrder: 1 },
  { code: "pcs", name: "Piece",    sortOrder: 2 },
];

function ensureCategoriesTable(_db: Database.Database): void {
  /* created in SCHEMA above; this is a placeholder for future DDL changes */
}

function ensureUnitsTable(_db: Database.Database): void {
  /* created in SCHEMA above */
}

function ensureCategoriesIndex(db: Database.Database): void {
  db.exec("CREATE INDEX IF NOT EXISTS idx_categories_company ON categories(companyId, isActive, sortOrder)");
}

function ensureUnitsIndex(db: Database.Database): void {
  db.exec("CREATE INDEX IF NOT EXISTS idx_units_company ON units(companyId, isActive)");
}

/**
 * Add `categoryId` / `unitId` integer FK columns to products if missing,
 * then backfill them from the legacy TEXT columns. The TEXT columns are
 * kept for read-path fallback (legacy code paths can still see them);
 * new writes populate both.
 */
function ensureProductCategoryAndUnitFKs(db: Database.Database): void {
  const cols = (db.prepare("PRAGMA table_info(products)").all() as Array<{ name: string }>).map(
    (c) => c.name
  );
  if (!cols.includes("categoryId")) {
    db.exec("ALTER TABLE products ADD COLUMN categoryId INTEGER");
  }
  if (!cols.includes("unitId")) {
    db.exec("ALTER TABLE products ADD COLUMN unitId INTEGER");
  }

  // Seed default categories + units for any tenant that doesn't yet have
  // them — needed before we can backfill products.categoryId / unitId.
  const companiesWithoutCats = db
    .prepare("SELECT id FROM companies WHERE isActive = 1 AND id NOT IN (SELECT DISTINCT companyId FROM categories)")
    .all() as Array<{ id: number }>;
  if (companiesWithoutCats.length > 0) {
    const insertCat = db.prepare(
      `INSERT INTO categories (id, companyId, slug, name, description, sortOrder, isActive, createdAt)
       VALUES (?, ?, ?, ?, '', ?, 1, ?)`
    );
    const insertUnit = db.prepare(
      `INSERT INTO units (id, companyId, code, name, isActive, createdAt)
       VALUES (?, ?, ?, ?, 1, ?)`
    );
    const now = new Date().toISOString();
    for (const { id: companyId } of companiesWithoutCats) {
      const cats = companyId === 1 ? MEAT_CATEGORY_SEED : []; // meat only
      for (const c of cats) {
        insertCat.run(nextId(db, "categories"), companyId, c.slug, c.name, c.sortOrder, now);
      }
      for (const u of DEFAULT_UNIT_SEED) {
        insertUnit.run(nextId(db, "units"), companyId, u.code, u.name, now);
      }
    }
  }

  // Backfill products.categoryId from products.category (string) — for any
  // row where categoryId is null, find or create a category with the slug
  // matching the legacy string for that tenant, then link it.
  const productsNeedingCategory = db
    .prepare(
      `SELECT id, companyId, category FROM products WHERE categoryId IS NULL AND category <> ''`
    )
    .all() as Array<{ id: number; companyId: number; category: string }>;
  if (productsNeedingCategory.length > 0) {
    const findCat = db.prepare(
      "SELECT id FROM categories WHERE companyId = ? AND slug = ?"
    );
    const insertCat = db.prepare(
      `INSERT INTO categories (id, companyId, slug, name, description, sortOrder, isActive, createdAt)
       VALUES (?, ?, ?, ?, '', 999, 1, ?)`
    );
    const updateProdCat = db.prepare(
      "UPDATE products SET categoryId = ? WHERE id = ? AND companyId = ?"
    );
    const cache = new Map<string, number>();
    const now = new Date().toISOString();
    for (const row of productsNeedingCategory) {
      const key = `${row.companyId}:${row.category}`;
      let catId = cache.get(key);
      if (!catId) {
        const existing = findCat.get(row.companyId, row.category) as { id: number } | undefined;
        catId = existing?.id ?? nextId(db, "categories");
        if (!existing) {
          insertCat.run(catId, row.companyId, row.category, row.category, now);
        }
        cache.set(key, catId);
      }
      updateProdCat.run(catId, row.id, row.companyId);
    }
  }

  // Same idea for products.unitId from products.unit (string).
  const productsNeedingUnit = db
    .prepare(
      `SELECT id, companyId, unit FROM products WHERE unitId IS NULL`
    )
    .all() as Array<{ id: number; companyId: number; unit: string }>;
  if (productsNeedingUnit.length > 0) {
    const findUnit = db.prepare(
      "SELECT id FROM units WHERE companyId = ? AND code = ?"
    );
    const insertUnit = db.prepare(
      `INSERT INTO units (id, companyId, code, name, isActive, createdAt)
       VALUES (?, ?, ?, ?, 1, ?)`
    );
    const updateProdUnit = db.prepare(
      "UPDATE products SET unitId = ?, unit = ? WHERE id = ? AND companyId = ?"
    );
    const cache = new Map<string, number>();
    const now = new Date().toISOString();
    for (const row of productsNeedingUnit) {
      const code = row.unit || "pcs";
      const key = `${row.companyId}:${code}`;
      let unitId = cache.get(key);
      if (!unitId) {
        const existing = findUnit.get(row.companyId, code) as { id: number } | undefined;
        unitId = existing?.id ?? nextId(db, "units");
        if (!existing) {
          insertUnit.run(unitId, row.companyId, code, code, now);
        }
        cache.set(key, unitId);
      }
      updateProdUnit.run(unitId, code, row.id, row.companyId);
    }
  }

  // After backfill, any product still missing categoryId/unitId (shouldn't
  // happen since we seeded units above) gets the first available fallback
  // for its tenant.
  const orphan = db
    .prepare(
      `SELECT id, companyId FROM products WHERE categoryId IS NULL OR unitId IS NULL`
    )
    .all() as Array<{ id: number; companyId: number }>;
  if (orphan.length > 0) {
    const fallbackCatByCompany = new Map<number, number>();
    const fallbackUnitByCompany = new Map<number, number>();
    for (const { id, companyId } of orphan) {
      let catId = fallbackCatByCompany.get(companyId);
      if (!catId) {
        const row = db
          .prepare("SELECT id FROM categories WHERE companyId = ? ORDER BY sortOrder LIMIT 1")
          .get(companyId) as { id: number } | undefined;
        catId = row?.id;
        if (catId) fallbackCatByCompany.set(companyId, catId);
      }
      let unitId = fallbackUnitByCompany.get(companyId);
      if (!unitId) {
        const row = db
          .prepare("SELECT id FROM units WHERE companyId = ? ORDER BY id LIMIT 1")
          .get(companyId) as { id: number } | undefined;
        unitId = row?.id;
        if (unitId) fallbackUnitByCompany.set(companyId, unitId);
      }
      db.prepare(
        "UPDATE products SET categoryId = COALESCE(categoryId, ?), unitId = COALESCE(unitId, ?) WHERE id = ? AND companyId = ?"
      ).run(catId ?? null, unitId ?? null, id, companyId);
    }
  }

  // Helpful indexes for the new FK columns.
  db.exec("CREATE INDEX IF NOT EXISTS idx_products_category ON products(companyId, categoryId)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_products_unit ON products(companyId, unitId)");
}

/**
 * For any active company that lacks the default unit set, seed kg + pcs.
 * The seed for categories is meat-only and is handled inside
 * ensureProductCategoryAndUnitFKs (where the backfill needs them first).
 */
function seedCategoriesAndUnitsForActiveCompanies(db: Database.Database): void {
  const needUnits = db
    .prepare("SELECT id FROM companies WHERE isActive = 1 AND id NOT IN (SELECT DISTINCT companyId FROM units)")
    .all() as Array<{ id: number }>;
  if (needUnits.length === 0) return;
  const insertUnit = db.prepare(
    `INSERT INTO units (id, companyId, code, name, isActive, createdAt)
     VALUES (?, ?, ?, ?, 1, ?)`
  );
  const now = new Date().toISOString();
  for (const { id: companyId } of needUnits) {
    for (const u of DEFAULT_UNIT_SEED) {
      insertUnit.run(nextId(db, "units"), companyId, u.code, u.name, now);
    }
  }
}

/**
 * Add the per-tenant supplier↔category join table. suppliers.category
 * (legacy CSV) stays in place so old reads keep working; new writes
 * populate supplier_categories and leave the CSV blank.
 */
function ensureSupplierCategoriesTable(_db: Database.Database): void {
  /* created in SCHEMA above */
}

/**
 * Backfill: for every supplier that has a non-empty `category` CSV but no
 * join-table rows yet, split the CSV into slugs and either find or create
 * a matching category per tenant. Idempotent — re-running is a no-op.
 */
function backfillSupplierCategories(db: Database.Database): void {
  const hasRows = (
    db.prepare("SELECT COUNT(*) AS n FROM supplier_categories").get() as { n: number }
  ).n;
  if (hasRows > 0) return; // already backfilled in some prior boot

  const findCat = db.prepare(
    "SELECT id FROM categories WHERE companyId = ? AND slug = ?"
  );
  const insertCat = db.prepare(
    `INSERT INTO categories (id, companyId, slug, name, description, sortOrder, isActive, createdAt)
     VALUES (?, ?, ?, ?, '', 999, 1, ?)`
  );
  const insertLink = db.prepare(
    "INSERT OR IGNORE INTO supplier_categories (supplierId, categoryId, companyId) VALUES (?, ?, ?)"
  );
  const updateSupplierLegacyCsv = db.prepare(
    "UPDATE suppliers SET category = '' WHERE id = ?"
  );
  const now = new Date().toISOString();
  const cache = new Map<string, number>();
  const suppliers = db.prepare(
    "SELECT id, companyId, category FROM suppliers WHERE category <> ''"
  ).all() as Array<{ id: number; companyId: number; category: string }>;
  const tx = db.transaction(() => {
    for (const s of suppliers) {
      const slugs = s.category
        .split(",")
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean);
      for (const slug of slugs) {
        const key = `${s.companyId}:${slug}`;
        let catId = cache.get(key);
        if (!catId) {
          const found = findCat.get(s.companyId, slug) as { id: number } | undefined;
          catId = found?.id ?? nextId(db, "categories");
          if (!found) {
            insertCat.run(catId, s.companyId, slug, slug, now);
          }
          cache.set(key, catId);
        }
        insertLink.run(s.id, catId, s.companyId);
      }
      updateSupplierLegacyCsv.run(s.id);
    }
  });
  tx();
}

interface StoredData {
  settings: Settings;
  products: Record<number, Product>;
  customers: Record<number, Customer>;
  riders: Record<number, Rider>;
  orders: Record<number, Order>;
  stockMovements: Record<number, StockMovement>;
  suppliers: Record<number, Supplier>;
  purchaseOrders: Record<number, PurchaseOrder>;
  nextIds: {
    products: number;
    customers: number;
    riders: number;
    orders: number;
    stockMovements: number;
    suppliers: number;
    purchaseOrders: number;
    expenses: number;
  };
}

// --- Row → TS object mappers ---
function rowToProduct(r: Record<string, unknown>): Product {
  return {
    id: r.id as number,
    sku: r.sku as string,
    name: r.name as string,
    nameBn: (r.nameBn as string) ?? "",
    categoryId: (r.categoryId as number | null) ?? 0,
    categoryName: (r.categoryName as string) ?? "",
    unitId: (r.unitId as number | null) ?? 0,
    unitCode: (r.unitCode as string) ?? "pcs",
    costPrice: (r.costPrice as number) ?? 0,
    sellPrice: (r.sellPrice as number) ?? 0,
    marketPrice: (r.marketPrice as number) ?? 0,
    stockQty: (r.stockQty as number) ?? 0,
    reorderLevel: (r.reorderLevel as number) ?? 0,
    isActive: (r.isActive as number) === 1,
    updatedAt: r.updatedAt as string,
  };
}

function rowToCustomer(r: Record<string, unknown>): Customer {
  return {
    id: r.id as number,
    name: r.name as string,
    phone: (r.phone as string) ?? "",
    area: (r.area as string) ?? "",
    address: (r.address as string) ?? "",
    notes: (r.notes as string) ?? "",
    lat: (r.lat as number | null) ?? null,
    lng: (r.lng as number | null) ?? null,
    createdAt: r.createdAt as string,
  };
}

function rowToRider(r: Record<string, unknown>): Rider {
  // Parse the JSON-encoded subClusters list defensively — old rows might have
  // anything in there.
  let subClusters: Rider["subClusters"] = [];
  const raw = r.subClusters;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        subClusters = parsed.filter(
          (v): v is NonNullable<Rider["homeCluster"]> =>
            v === "DHK-E" || v === "DHK-NW" || v === "DHK-CW" || v === "DHK-SE"
        );
      }
    } catch {
      /* ignore — empty array is fine */
    }
  }
  return {
    id: r.id as number,
    name: r.name as string,
    phone: (r.phone as string) ?? "",
    vehicle: (r.vehicle as string) ?? "",
    status: (r.status as "active" | "inactive") ?? "active",
    homeCluster:
      (r.homeCluster as Rider["homeCluster"]) ?? null,
    subClusters,
    maxStops:
      typeof r.maxStops === "number" && Number.isFinite(r.maxStops)
        ? r.maxStops
        : null,
    createdAt: r.createdAt as string,
    pinHash: (r.pinHash as string) ?? "",
    tempPin: ((r.tempPin as number) ?? 0) === 1,
    accountStatus:
      ((r.accountStatus as Rider["accountStatus"]) ?? "active"),
    lastLoginAt: (r.lastLoginAt as string) ?? "",
    avatarPath: (r.avatarPath as string) ?? "",
  };
}

function rowToSupplier(r: Record<string, unknown>, companyId?: number): Supplier {
  const id = r.id as number;
  let categoryIds: number[] = [];
  let categoryNames: string[] = [];
  if (companyId != null) {
    const db = getDb();
    const joins = db
      .prepare(
        `SELECT sc.categoryId, c.name
           FROM supplier_categories sc
           LEFT JOIN categories c ON c.id = sc.categoryId AND c.companyId = sc.companyId
          WHERE sc.supplierId = ? AND sc.companyId = ?
          ORDER BY sc.categoryId ASC`
      )
      .all(id, companyId) as Array<{ categoryId: number; name: string | null }>;
    categoryIds = joins.map((j) => j.categoryId);
    categoryNames = joins.map((j) => j.name ?? "");
  }
  return {
    id,
    name: r.name as string,
    contact: (r.contact as string) ?? "",
    phone: (r.phone as string) ?? "",
    address: (r.address as string) ?? "",
    category: (r.category as string) ?? "",
    categoryIds,
    categoryNames,
    paymentTerms: (r.paymentTerms as string) ?? "",
    notes: (r.notes as string) ?? "",
    isActive: (r.isActive as number) === 1,
    createdAt: r.createdAt as string,
  };
}

function rowToOrder(r: Record<string, unknown>): Order {
  return {
    id: r.id as number,
    companyId: (r.companyId as number) ?? DEFAULT_COMPANY_ID,
    orderNo: r.orderNo as string,
    date: r.date as string,
    customerId: (r.customerId as number | null) ?? null,
    customerName: (r.customerName as string) ?? "",
    customerPhone: (r.customerPhone as string) ?? "",
    area: (r.area as string) ?? "",
    address: (r.address as string) ?? "",
    items: JSON.parse((r.items as string) ?? "[]"),
    subtotal: (r.subtotal as number) ?? 0,
    deliveryFee: (r.deliveryFee as number) ?? 0,
    discount: (r.discount as number) ?? 0,
    total: (r.total as number) ?? 0,
    paid: (r.paid as number) ?? 0,
    paymentMethod: (r.paymentMethod as PaymentMethod) ?? "cod",
    status: (r.status as OrderStatus) ?? "new",
    source: (r.source as OrderSource) ?? "manual",
    deliveryMode: (r.deliveryMode as DeliveryMode) ?? "own",
    pathaoTrackingId: (r.pathaoTrackingId as string) ?? "",
    pathaoFare: (r.pathaoFare as number) ?? 0,
    riderId: (r.riderId as number | null) ?? null,
    riderName: (r.riderName as string) ?? "",
    riderCost: (r.riderCost as number) ?? 0,
    lat: (r.lat as number | null) ?? null,
    lng: (r.lng as number | null) ?? null,
    riderSeq: (r.riderSeq as number | null) ?? null,
    note: (r.note as string) ?? "",
    createdAt: r.createdAt as string,
    confirmedAt: (r.confirmedAt as string) ?? "",
    deliveredAt: (r.deliveredAt as string) ?? "",
    cancelledAt: (r.cancelledAt as string) ?? "",
    cancelReason: (r.cancelReason as string) ?? "",
    returnedAt: (r.returnedAt as string) ?? "",
    returnReason: (r.returnReason as string) ?? "",
    stockDeducted: ((r.stockDeducted as number) ?? 1) === 1,
    wpOrderId: (r.wpOrderId as string) ?? "",
    cluster: (r.cluster as Order["cluster"]) ?? null,
    subCluster: (r.subCluster as string) ?? null,
    trackingCode: (r.trackingCode as string) ?? "",
    updatedAt: r.updatedAt as string,
  };
}

function rowToStockMovement(r: Record<string, unknown>): StockMovement {
  return {
    id: r.id as number,
    productId: r.productId as number,
    type: r.type as StockMovementType,
    qty: (r.qty as number) ?? 0,
    note: (r.note as string) ?? "",
    createdAt: r.createdAt as string,
  };
}

function rowToPurchaseOrder(r: Record<string, unknown>): PurchaseOrder {
  return {
    id: r.id as number,
    poNumber: r.poNumber as string,
    date: r.date as string,
    supplierId: r.supplierId as number,
    items: JSON.parse((r.items as string) ?? "[]") as PurchaseOrderItem[],
    subtotal: (r.subtotal as number) ?? 0,
    status: (r.status as PurchaseOrderStatus) ?? "draft",
    expectedDate: (r.expectedDate as string) ?? "",
    receivedDate: (r.receivedDate as string) ?? "",
    note: (r.note as string) ?? "",
    createdAt: r.createdAt as string,
    updatedAt: r.updatedAt as string,
  };
}

// --- Migration helper (kept for reference; primary migration done by scripts/migrate-from-json.cjs) ---
function migrateFromJson(): void {
  // No-op: one-time data/db.json → meat_delivery.db migration has already
  // been performed. db.json is retained as a fallback if the .db file is
  // ever deleted. See scripts/migrate-from-json.cjs.
}


// --- Helpers ---

export function todayStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isToday(dateStr: string): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const t = new Date();
  return (
    d.getFullYear() === t.getFullYear() &&
    d.getMonth() === t.getMonth() &&
    d.getDate() === t.getDate()
  );
}

function nextOrderNo(db: Database.Database): string {
  // Order number format: MD-{BD-date}-{seq}. BD date so the prefix matches
  // the operator's local day even when the server clock is UTC. Seq is the
  // global order id (4-digit, zero-padded) so legacy MD-2026-NNNN orders
  // are still ordered correctly.
  const now = new Date();
  const bd = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  const datePart = bd.toISOString().slice(0, 10);
  const seq = String(nextId(db, "orders")).padStart(4, "0");
  return `MD-${datePart}-${seq}`;
}

function nextId(db: Database.Database, name: string): number {
  const row = db
    .prepare("SELECT value FROM next_ids WHERE name = ?")
    .get(name) as { value: number } | undefined;
  let next: number;
  if (row) {
    next = row.value;
    db.prepare("UPDATE next_ids SET value = value + 1 WHERE name = ?").run(name);
  } else {
    next = 1;
    db.prepare("INSERT INTO next_ids (name, value) VALUES (?, 2)").run(name);
  }
  return next;
}

// --- Public API: Settings ---

/** Default company used by the legacy single-tenant code paths. After PR 2
 *  every caller must pass an explicit companyId; the default keeps PR 1
 *  backward-compatible with no behavior change. */
export const DEFAULT_COMPANY_ID = 1;

export function getSettings(companyId: number = DEFAULT_COMPANY_ID): Settings {
  migrateFromJson();
  const db = getDb();
  const row = db
    .prepare("SELECT data FROM settings WHERE companyId = ?")
    .get(companyId) as { data: string } | undefined;
  if (!row) throw new Error(`settings missing for companyId=${companyId}`);
  return JSON.parse(row.data) as Settings;
}

export function updateSettings(
  data: Partial<Settings>,
  companyId: number = DEFAULT_COMPANY_ID
): Settings {
  migrateFromJson();
  const db = getDb();
  const current = getSettings(companyId);
  const merged: Settings = {
    ...current,
    ...data,
    // WP fields: explicit coercion so JSON booleans survive partial updates.
    wpWebhookSecret:
      data.wpWebhookSecret !== undefined ? String(data.wpWebhookSecret) : current.wpWebhookSecret,
    wpSiteUrl: data.wpSiteUrl !== undefined ? String(data.wpSiteUrl) : current.wpSiteUrl,
    wpOutboundEnabled:
      data.wpOutboundEnabled !== undefined ? Boolean(data.wpOutboundEnabled) : current.wpOutboundEnabled,
    wpAutoApprove:
      data.wpAutoApprove !== undefined ? Boolean(data.wpAutoApprove) : current.wpAutoApprove,
    shopLat: data.shopLat !== undefined ? (data.shopLat as number | null) : current.shopLat,
    shopLng: data.shopLng !== undefined ? (data.shopLng as number | null) : current.shopLng,
    bkashPaymentQr:
      data.bkashPaymentQr !== undefined ? String(data.bkashPaymentQr) : current.bkashPaymentQr ?? "",
    deliveryPartners:
      Array.isArray(data.deliveryPartners) ? data.deliveryPartners : (current.deliveryPartners ?? []),
    defaultDeliveryPartnerId:
      typeof data.defaultDeliveryPartnerId === "string"
        ? data.defaultDeliveryPartnerId
        : current.defaultDeliveryPartnerId ?? "",
    updatedAt: new Date().toISOString(),
  };
  db.prepare("UPDATE settings SET data = ? WHERE companyId = ?").run(
    JSON.stringify(merged),
    companyId
  );
  return merged;
}

// --- Public API: Companies ---

function rowToCompany(r: Record<string, unknown>): Company {
  return {
    id: r.id as number,
    slug: r.slug as string,
    name: r.name as string,
    tagline: (r.tagline as string) ?? "",
    logoUrl: (r.logoUrl as string) ?? "",
    accentColor: (r.accentColor as string) ?? "",
    isActive: ((r.isActive as number) ?? 1) === 1,
    createdAt: r.createdAt as string,
  };
}

/** All active companies, ordered by id ASC. Inactive companies are hidden
 *  from the switcher but still resolvable via getCompany(id). */
export function getCompanies(): Company[] {
  const db = getDb();
  return (
    db
      .prepare("SELECT * FROM companies WHERE isActive = 1 ORDER BY id ASC")
      .all() as Record<string, unknown>[]
  ).map(rowToCompany);
}

export function getCompany(id: number): Company | undefined {
  const db = getDb();
  const row = db.prepare("SELECT * FROM companies WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToCompany(row) : undefined;
}

export function getCompanyBySlug(slug: string): Company | undefined {
  const db = getDb();
  const row = db.prepare("SELECT * FROM companies WHERE slug = ?").get(slug) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToCompany(row) : undefined;
}

export interface NewCompanyInput {
  slug: string;
  name: string;
  tagline: string;
  logoUrl?: string;
  accentColor?: string;
  /**
   * If set to a known vertical key (`"fashion"`, `"grocery"`, `"pharmacy"`,
   * `"electronics"`), seed the matching categories on creation. The seed
   * is non-destructive: it skips categories whose slug already exists.
   * Units (`kg`, `pcs`) are always seeded for every new company.
   */
  seedVertical?: "fashion" | "grocery" | "pharmacy" | "electronics" | "meat" | "none";
}

/** Vertical → default category seed list. Add a new vertical here and the
 *  create-company form will pick it up. */
const VERTICAL_CATEGORY_SEED: Record<
  Exclude<NewCompanyInput["seedVertical"], "none" | undefined>,
  Array<{ slug: string; name: string; sortOrder: number }>
> = {
  meat: [
    { slug: "beef", name: "Beef", sortOrder: 1 },
    { slug: "chicken", name: "Chicken", sortOrder: 2 },
    { slug: "mutton", name: "Mutton", sortOrder: 3 },
    { slug: "offal", name: "Offal", sortOrder: 4 },
    { slug: "fish", name: "Fish", sortOrder: 5 },
  ],
  fashion: [
    { slug: "tops",        name: "Tops",        sortOrder: 1 },
    { slug: "bottoms",     name: "Bottoms",     sortOrder: 2 },
    { slug: "dresses",     name: "Dresses",     sortOrder: 3 },
    { slug: "outerwear",   name: "Outerwear",   sortOrder: 4 },
    { slug: "footwear",    name: "Footwear",    sortOrder: 5 },
    { slug: "bags",        name: "Bags",        sortOrder: 6 },
    { slug: "accessories", name: "Accessories", sortOrder: 7 },
    { slug: "jewelry",     name: "Jewelry",     sortOrder: 8 },
  ],
  grocery: [
    { slug: "fruits",     name: "Fruits",     sortOrder: 1 },
    { slug: "vegetables", name: "Vegetables", sortOrder: 2 },
    { slug: "dairy",      name: "Dairy",      sortOrder: 3 },
    { slug: "bakery",     name: "Bakery",     sortOrder: 4 },
    { slug: "beverages",  name: "Beverages",  sortOrder: 5 },
    { slug: "snacks",     name: "Snacks",     sortOrder: 6 },
    { slug: "frozen",     name: "Frozen",     sortOrder: 7 },
    { slug: "pantry",     name: "Pantry",     sortOrder: 8 },
  ],
  pharmacy: [
    { slug: "otc",          name: "OTC Medicine",             sortOrder: 1 },
    { slug: "prescription", name: "Prescription",            sortOrder: 2 },
    { slug: "wellness",     name: "Wellness",                sortOrder: 3 },
    { slug: "skincare",     name: "Skincare",                sortOrder: 4 },
    { slug: "vitamins",     name: "Vitamins & Supplements",  sortOrder: 5 },
    { slug: "baby",         name: "Baby Care",               sortOrder: 6 },
  ],
  electronics: [
    { slug: "phones",      name: "Phones",     sortOrder: 1 },
    { slug: "laptops",     name: "Laptops",    sortOrder: 2 },
    { slug: "audio",       name: "Audio",      sortOrder: 3 },
    { slug: "wearables",   name: "Wearables",  sortOrder: 4 },
    { slug: "cameras",     name: "Cameras",    sortOrder: 5 },
    { slug: "accessories", name: "Accessories",sortOrder: 6 },
  ],
};

const VERTICAL_DEFAULT_UNITS: Array<{ code: string; name: string }> = [
  { code: "kg", name: "Kilogram" },
  { code: "pcs", name: "Piece" },
];

/** Create a new company + seed its Settings row + default units + (optional)
 *  vertical categories. Everything runs in one transaction so a failed
 *  company creation rolls back cleanly. */
export function createCompany(input: NewCompanyInput): Company {
  const db = getDb();
  const slug = input.slug.trim().toLowerCase();
  if (!/^[a-z0-9-]{1,32}$/.test(slug)) {
    throw new Error("Slug must be 1-32 chars, lowercase letters/digits/hyphens.");
  }
  const existing = getCompanyBySlug(slug);
  if (existing) throw new Error(`Company with slug "${slug}" already exists.`);

  const tx = db.transaction(() => {
    const id = nextId(db, "companies");
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO companies (id, slug, name, tagline, logoUrl, accentColor, isActive, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`
    ).run(
      id,
      slug,
      input.name.trim(),
      input.tagline.trim(),
      (input.logoUrl ?? "").trim(),
      (input.accentColor ?? "").trim(),
      now
    );

    // Settings row seeded from name + tagline (businessName etc.).
    const defaults = makeCompanyDefaults(input.name.trim(), input.tagline.trim());
    db.prepare("INSERT INTO settings (companyId, data) VALUES (?, ?)").run(
      id,
      JSON.stringify(defaults)
    );

    // Default units: every tenant gets kg + pcs.
    const insertUnit = db.prepare(
      `INSERT INTO units (id, companyId, code, name, isActive, createdAt)
       VALUES (?, ?, ?, ?, 1, ?)`
    );
    for (const u of VERTICAL_DEFAULT_UNITS) {
      insertUnit.run(nextId(db, "units"), id, u.code, u.name, now);
    }

    // Optional vertical category seed.
    if (input.seedVertical && input.seedVertical !== "none" && input.seedVertical !== "meat") {
      // Meat is auto-seeded by the migration; the explicit "meat" choice
      // here is also fine (idempotent) for brand-new installs that haven't
      // run the migration yet.
      const cats = VERTICAL_CATEGORY_SEED[input.seedVertical];
      if (cats) {
        const insertCat = db.prepare(
          `INSERT INTO categories (id, companyId, slug, name, description, sortOrder, isActive, createdAt)
           VALUES (?, ?, ?, ?, '', ?, 1, ?)`
        );
        for (const c of cats) {
          insertCat.run(nextId(db, "categories"), id, c.slug, c.name, c.sortOrder, now);
        }
      }
    }

    return id;
  });

  const id = tx();
  return getCompany(id)!;
}

/** Editable fields on a Company. Slug is intentionally immutable to avoid
 *  breaking deep links (although we don't use slugs in URLs today, it's the
 *  right future-proofing default). */
export function updateCompany(
  id: number,
  data: Partial<Pick<Company, "name" | "tagline" | "logoUrl" | "accentColor" | "isActive">>
): Company | null {
  const db = getDb();
  const existing = getCompany(id);
  if (!existing) return null;
  const merged: Company = {
    ...existing,
    name: data.name !== undefined ? data.name.trim() : existing.name,
    tagline: data.tagline !== undefined ? data.tagline.trim() : existing.tagline,
    logoUrl: data.logoUrl !== undefined ? data.logoUrl.trim() : existing.logoUrl,
    accentColor:
      data.accentColor !== undefined ? data.accentColor.trim() : existing.accentColor,
    isActive: data.isActive !== undefined ? data.isActive : existing.isActive,
  };
  db.prepare(
    `UPDATE companies SET name=?, tagline=?, logoUrl=?, accentColor=?, isActive=? WHERE id=?`
  ).run(
    merged.name,
    merged.tagline,
    merged.logoUrl,
    merged.accentColor,
    merged.isActive ? 1 : 0,
    id
  );
  return merged;
}

// --- Public API: Categories (per-tenant) ---

function rowToCategory(r: Record<string, unknown>): Category {
  return {
    id: r.id as number,
    companyId: r.companyId as number,
    slug: r.slug as string,
    name: r.name as string,
    description: (r.description as string) ?? "",
    sortOrder: (r.sortOrder as number) ?? 0,
    isActive: ((r.isActive as number) ?? 1) === 1,
    createdAt: r.createdAt as string,
  };
}

export function getCategories(companyId: number, opts: { includeInactive?: boolean } = {}): Category[] {
  const db = getDb();
  const rows = (opts.includeInactive
    ? db
        .prepare(
          "SELECT * FROM categories WHERE companyId = ? ORDER BY sortOrder ASC, name ASC"
        )
        .all(companyId)
    : db
        .prepare(
          "SELECT * FROM categories WHERE companyId = ? AND isActive = 1 ORDER BY sortOrder ASC, name ASC"
        )
        .all(companyId)) as Record<string, unknown>[];
  return rows.map(rowToCategory);
}

export function getCategory(id: number, companyId: number): Category | undefined {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM categories WHERE id = ? AND companyId = ?")
    .get(id, companyId) as Record<string, unknown> | undefined;
  return row ? rowToCategory(row) : undefined;
}

export interface NewCategoryInput {
  slug: string;
  name: string;
  description?: string;
  sortOrder?: number;
}

export function createCategory(input: NewCategoryInput, companyId: number): Category {
  const db = getDb();
  const slug = input.slug.trim().toLowerCase();
  if (!/^[a-z0-9-]{1,32}$/.test(slug)) {
    throw new Error("Slug must be 1-32 chars, lowercase letters/digits/hyphens.");
  }
  const existing = db
    .prepare("SELECT id FROM categories WHERE companyId = ? AND slug = ?")
    .get(companyId, slug) as { id: number } | undefined;
  if (existing) throw new Error(`Category "${slug}" already exists for this company.`);
  const id = nextId(db, "categories");
  db.prepare(
    `INSERT INTO categories (id, companyId, slug, name, description, sortOrder, isActive, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?)`
  ).run(
    id,
    companyId,
    slug,
    input.name.trim(),
    (input.description ?? "").trim(),
    input.sortOrder ?? 100,
    new Date().toISOString()
  );
  return getCategory(id, companyId)!;
}

export function updateCategory(
  id: number,
  data: Partial<Pick<Category, "name" | "description" | "sortOrder" | "isActive">>,
  companyId: number
): Category | null {
  const db = getDb();
  const existing = getCategory(id, companyId);
  if (!existing) return null;
  const merged: Category = {
    ...existing,
    name: data.name !== undefined ? data.name.trim() : existing.name,
    description: data.description !== undefined ? data.description.trim() : existing.description,
    sortOrder: data.sortOrder !== undefined ? data.sortOrder : existing.sortOrder,
    isActive: data.isActive !== undefined ? data.isActive : existing.isActive,
  };
  db.prepare(
    `UPDATE categories SET name=?, description=?, sortOrder=?, isActive=? WHERE id=? AND companyId=?`
  ).run(
    merged.name,
    merged.description,
    merged.sortOrder,
    merged.isActive ? 1 : 0,
    id,
    companyId
  );
  return merged;
}

/**
 * Soft-delete a category: products still pointing at it get auto-migrated to
 * the next active category in the same company (or NULL if none) so the
 * UI never breaks on a stale reference. Hard delete is rejected — admins
 * should soft-delete to preserve historical order detail.
 */
export function deleteCategory(id: number, companyId: number): boolean {
  const db = getDb();
  const existing = getCategory(id, companyId);
  if (!existing) return false;
  // Pick a replacement — the lowest-sortOrder active category that isn't
  // this one. If none, leave the products pointing at NULL (the UI shows
  // "Uncategorized" for those rows).
  const replacement = db
    .prepare(
      "SELECT id FROM categories WHERE companyId = ? AND id != ? AND isActive = 1 ORDER BY sortOrder ASC, id ASC LIMIT 1"
    )
    .get(companyId, id) as { id: number } | undefined;
  db.prepare(
    "UPDATE products SET categoryId = ? WHERE companyId = ? AND categoryId = ?"
  ).run(replacement?.id ?? null, companyId, id);
  db.prepare("DELETE FROM categories WHERE id = ? AND companyId = ?").run(id, companyId);
  return true;
}

// --- Public API: Units (per-tenant) ---

function rowToUnit(r: Record<string, unknown>): Unit {
  return {
    id: r.id as number,
    companyId: r.companyId as number,
    code: r.code as string,
    name: r.name as string,
    isActive: ((r.isActive as number) ?? 1) === 1,
    createdAt: r.createdAt as string,
  };
}

export function getUnits(companyId: number, opts: { includeInactive?: boolean } = {}): Unit[] {
  const db = getDb();
  const rows = (opts.includeInactive
    ? db
        .prepare(
          "SELECT * FROM units WHERE companyId = ? ORDER BY name ASC"
        )
        .all(companyId)
    : db
        .prepare(
          "SELECT * FROM units WHERE companyId = ? AND isActive = 1 ORDER BY name ASC"
        )
        .all(companyId)) as Record<string, unknown>[];
  return rows.map(rowToUnit);
}

export function getUnit(id: number, companyId: number): Unit | undefined {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM units WHERE id = ? AND companyId = ?")
    .get(id, companyId) as Record<string, unknown> | undefined;
  return row ? rowToUnit(row) : undefined;
}

export interface NewUnitInput {
  code: string;
  name: string;
}

export function createUnit(input: NewUnitInput, companyId: number): Unit {
  const db = getDb();
  const code = input.code.trim().toLowerCase();
  if (!/^[a-z0-9_-]{1,16}$/.test(code)) {
    throw new Error("Unit code must be 1-16 chars, lowercase letters/digits/hyphens/underscores.");
  }
  const existing = db
    .prepare("SELECT id FROM units WHERE companyId = ? AND code = ?")
    .get(companyId, code) as { id: number } | undefined;
  if (existing) throw new Error(`Unit "${code}" already exists for this company.`);
  const id = nextId(db, "units");
  db.prepare(
    `INSERT INTO units (id, companyId, code, name, isActive, createdAt)
     VALUES (?, ?, ?, ?, 1, ?)`
  ).run(id, companyId, code, input.name.trim(), new Date().toISOString());
  return getUnit(id, companyId)!;
}

export function updateUnit(
  id: number,
  data: Partial<Pick<Unit, "name" | "isActive">>,
  companyId: number
): Unit | null {
  const db = getDb();
  const existing = getUnit(id, companyId);
  if (!existing) return null;
  const merged: Unit = {
    ...existing,
    name: data.name !== undefined ? data.name.trim() : existing.name,
    isActive: data.isActive !== undefined ? data.isActive : existing.isActive,
  };
  db.prepare(
    "UPDATE units SET name=?, isActive=? WHERE id=? AND companyId=?"
  ).run(merged.name, merged.isActive ? 1 : 0, id, companyId);
  return merged;
}

/** Soft-delete a unit: products still on it auto-migrate to the next active
 *  unit in the same company (or the default kg if none). Hard delete is
 *  rejected to preserve historical order detail. */
export function deleteUnit(id: number, companyId: number): boolean {
  const db = getDb();
  const existing = getUnit(id, companyId);
  if (!existing) return false;
  const replacement = db
    .prepare(
      "SELECT id FROM units WHERE companyId = ? AND id != ? AND isActive = 1 ORDER BY id ASC LIMIT 1"
    )
    .get(companyId, id) as { id: number } | undefined;
  const fallback = replacement?.id ?? null;
  db.prepare(
    "UPDATE products SET unitId = COALESCE(?, unitId), unit = COALESCE((SELECT code FROM units WHERE id = ?), unit) WHERE companyId = ? AND unitId = ?"
  ).run(fallback, fallback, companyId, id);
  db.prepare("DELETE FROM units WHERE id = ? AND companyId = ?").run(id, companyId);
  return true;
}

// --- Public API: Products & Stock ---

export function getProducts(companyId: number): Product[] {
  migrateFromJson();
  const db = getDb();
  return (
    db
      .prepare(
        `SELECT p.*,
                c.name AS categoryName,
                u.code AS unitCode
           FROM products p
           LEFT JOIN categories c ON c.id = p.categoryId AND c.companyId = p.companyId
           LEFT JOIN units u ON u.id = p.unitId AND u.companyId = p.companyId
          WHERE p.companyId = ?
          ORDER BY p.id ASC`
      )
      .all(companyId) as Record<string, unknown>[]
  ).map(rowToProduct);
}

export function getProduct(id: number, companyId: number): Product | undefined {
  migrateFromJson();
  const db = getDb();
  const row = db
    .prepare(
      `SELECT p.*,
              c.name AS categoryName,
              u.code AS unitCode
         FROM products p
         LEFT JOIN categories c ON c.id = p.categoryId AND c.companyId = p.companyId
         LEFT JOIN units u ON u.id = p.unitId AND u.companyId = p.companyId
        WHERE p.id = ? AND p.companyId = ?`
    )
    .get(id, companyId) as Record<string, unknown> | undefined;
  return row ? rowToProduct(row) : undefined;
}

/**
 * Remove a product from the catalog. Orders keep their own line-item copies,
 * so historical orders still render correctly. Returns true on success.
 */
export function deleteProduct(id: number, companyId: number): boolean {
  const db = getDb();
  const r = db
    .prepare("DELETE FROM products WHERE id = ? AND companyId = ?")
    .run(id, companyId);
  return r.changes > 0;
}

export function createProduct(
  data: {
    sku: string;
    name: string;
    nameBn: string;
    categoryId: number;
    unitId: number;
    costPrice: number;
    sellPrice: number;
    marketPrice: number;
    stockQty: number;
    reorderLevel: number;
  },
  companyId: number
): Product {
  const db = getDb();
  // Resolve FK values + keep legacy TEXT columns in sync (other modules
  // still display unit / category labels from those columns).
  const categoryRow = db
    .prepare("SELECT name, slug FROM categories WHERE id = ? AND companyId = ?")
    .get(data.categoryId, companyId) as { name: string; slug: string } | undefined;
  if (!categoryRow) {
    throw new Error(`Category ${data.categoryId} not found for company ${companyId}.`);
  }
  const unitRow = db
    .prepare("SELECT code, name FROM units WHERE id = ? AND companyId = ?")
    .get(data.unitId, companyId) as { code: string; name: string } | undefined;
  if (!unitRow) {
    throw new Error(`Unit ${data.unitId} not found for company ${companyId}.`);
  }
  const id = nextId(db, "products");
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO products (id, companyId, sku, name, nameBn, category, categoryId, unit, unitId, costPrice, sellPrice, marketPrice, stockQty, reorderLevel, isActive, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
  ).run(
    id,
    companyId,
    data.sku,
    data.name,
    data.nameBn,
    categoryRow.slug,
    data.categoryId,
    unitRow.code,
    data.unitId,
    data.costPrice,
    data.sellPrice,
    data.marketPrice,
    data.stockQty,
    data.reorderLevel,
    now
  );
  db.prepare(
    `INSERT INTO stock_movements (id, companyId, productId, type, qty, note, createdAt) VALUES (?, ?, ?, 'purchase', ?, 'Initial stock', ?)`
  ).run(nextId(db, "stockMovements"), companyId, id, data.stockQty, now);
  return getProduct(id, companyId)!;
}

export function updateProduct(
  id: number,
  data: Partial<Product>,
  companyId: number
): Product | null {
  const db = getDb();
  const existing = getProduct(id, companyId);
  if (!existing) return null;
  const merged: Product = {
    ...existing,
    ...data,
    id: existing.id, // never overwrite
    updatedAt: new Date().toISOString(),
  };
  // If the categoryId or unitId changed, refresh the legacy TEXT mirror
  // columns so older read paths still see the right label.
  let legacyCategory = existing.categoryName || existing.categoryName;
  let legacyUnit = existing.unitCode || existing.unitCode;
  if (data.categoryId !== undefined && data.categoryId !== existing.categoryId) {
    const catRow = db
      .prepare("SELECT name, slug FROM categories WHERE id = ? AND companyId = ?")
      .get(merged.categoryId, companyId) as { name: string; slug: string } | undefined;
    if (!catRow) throw new Error(`Category ${merged.categoryId} not found for company ${companyId}.`);
    legacyCategory = catRow.slug;
  }
  if (data.unitId !== undefined && data.unitId !== existing.unitId) {
    const unitRow = db
      .prepare("SELECT code FROM units WHERE id = ? AND companyId = ?")
      .get(merged.unitId, companyId) as { code: string } | undefined;
    if (!unitRow) throw new Error(`Unit ${merged.unitId} not found for company ${companyId}.`);
    legacyUnit = unitRow.code;
  }
  db.prepare(
    `UPDATE products
        SET sku=?, name=?, nameBn=?,
            category=?, categoryId=?,
            unit=?, unitId=?,
            costPrice=?, sellPrice=?, marketPrice=?, stockQty=?, reorderLevel=?, isActive=?, updatedAt=?
      WHERE id=? AND companyId=?`
  ).run(
    merged.sku,
    merged.name,
    merged.nameBn,
    legacyCategory,
    merged.categoryId,
    legacyUnit,
    merged.unitId,
    merged.costPrice,
    merged.sellPrice,
    merged.marketPrice,
    merged.stockQty,
    merged.reorderLevel,
    merged.isActive ? 1 : 0,
    merged.updatedAt,
    id,
    companyId
  );
  return getProduct(id, companyId) ?? null;
}

export function adjustStock(
  productId: number,
  type: StockMovementType,
  qty: number,
  note: string,
  companyId: number
): Product | null {
  const db = getDb();
  const product = getProduct(productId, companyId);
  if (!product) return null;
  const delta = type === "sale" || type === "wastage" ? -qty : qty;
  const newQty = Math.max(0, product.stockQty + delta);
  const now = new Date().toISOString();
  db.prepare("UPDATE products SET stockQty = ?, updatedAt = ? WHERE id = ? AND companyId = ?").run(
    newQty,
    now,
    productId,
    companyId
  );
  db.prepare(
    `INSERT INTO stock_movements (id, companyId, productId, type, qty, note, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(nextId(db, "stockMovements"), companyId, productId, type, qty, note, now);
  return getProduct(productId, companyId) ?? null;
}

export function getStockMovements(
  companyId: number,
  productId?: number
): StockMovement[] {
  const db = getDb();
  const rows = productId
    ? (db
        .prepare(
          "SELECT * FROM stock_movements WHERE companyId = ? AND productId = ? ORDER BY id DESC"
        )
        .all(companyId, productId) as Record<string, unknown>[])
    : (db
        .prepare(
          "SELECT * FROM stock_movements WHERE companyId = ? ORDER BY id DESC"
        )
        .all(companyId) as Record<string, unknown>[]);
  return rows.map(rowToStockMovement);
}

export function getLowStock(companyId: number): Product[] {
  return getProducts(companyId).filter(
    (p) => p.isActive && p.stockQty <= p.reorderLevel
  );
}

// --- Public API: Customers ---

export function getCustomers(): Customer[] {
  const db = getDb();
  // Newest first so the most recently added customer is at the top of the
  // list. id DESC == createdAt DESC for this table since `id` is autoincrement.
  return (db
    .prepare("SELECT * FROM customers ORDER BY id DESC")
    .all() as Record<string, unknown>[]).map(rowToCustomer);
}

export function getCustomer(id: number): Customer | undefined {
  const db = getDb();
  const row = db.prepare("SELECT * FROM customers WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToCustomer(row) : undefined;
}

export interface CustomerOrderStats {
  total: number;
  delivered: number;
  cancelled: number;
  inProgress: number;
  lifetimeSpend: number;
}

/**
 * Compute order stats for a single customer within a single company. Matches
 * by `customerId` (the stable join). Excludes soft-deleted rows if any.
 */
export function getOrderStatsForCustomer(
  customerId: number,
  companyId: number
): CustomerOrderStats {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         COALESCE(SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END), 0) AS delivered,
         COALESCE(SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END), 0) AS cancelled,
         COALESCE(SUM(CASE WHEN status NOT IN ('delivered','cancelled','returned') THEN 1 ELSE 0 END), 0) AS inProgress,
         COALESCE(SUM(CASE WHEN status = 'delivered' THEN total ELSE 0 END), 0) AS lifetimeSpend
       FROM orders
       WHERE customerId = ? AND companyId = ?`
    )
    .get(customerId, companyId) as
    | {
        total: number;
        delivered: number;
        cancelled: number;
        inProgress: number;
        lifetimeSpend: number;
      }
    | undefined;
  return {
    total: row?.total ?? 0,
    delivered: row?.delivered ?? 0,
    cancelled: row?.cancelled ?? 0,
    inProgress: row?.inProgress ?? 0,
    lifetimeSpend: Math.round(row?.lifetimeSpend ?? 0),
  };
}

// Result type for createOrUpdateCustomer — used by order creation flows
// (manual + WordPress webhook) so callers can show toasts about what changed.
export interface CustomerWriteResult {
  customer: Customer;
  /** True when a new row was inserted. */
  customerSaved: boolean;
  /** True when an existing row had fields updated from newer info. */
  customerUpdated: boolean;
}

/**
 * Idempotent customer write:
 *  - normalize the incoming phone
 *  - if a row matches by normalized phone OR (name + area), update it
 *    with the freshest non-empty values; otherwise insert a new row.
 *  - if `linkExisting` is true and a duplicate is found, return the existing
 *    row instead of refusing.
 *  - if `linkExisting` is false (default) and a duplicate is found, returns
 *    `{ duplicate: { id, name } }` so callers can prompt the user.
 */
export function createOrUpdateCustomer(input: {
  name: string;
  phone: string;
  area?: string;
  address?: string;
  notes?: string;
  linkExisting?: boolean;
}): { ok: true; result: CustomerWriteResult } | { ok: false; duplicate: { id: number; name: string } } {
  const db = getDb();
  const name = (input.name || "").trim();
  const rawPhone = (input.phone || "").trim();
  const phone = normalizePhone(rawPhone);
  const area = (input.area || "").trim();
  const address = (input.address || "").trim();
  const notes = (input.notes || "").trim();

  if (!name) {
    throw new Error("Customer name is required");
  }

  // Try to find an existing customer to update.
  let existing: Customer | undefined;
  if (phone) {
    // Match by normalized phone across all rows (cheap; no index needed at this scale).
    const rows = db.prepare("SELECT * FROM customers").all() as Array<Record<string, unknown>>;
    for (const r of rows) {
      if (phonesMatch(String(r.phone || ""), rawPhone)) {
        existing = rowToCustomer(r);
        break;
      }
    }
  }
  if (!existing && area) {
    // Fallback: name + area match (catches typos in phone).
    const row = db
      .prepare("SELECT * FROM customers WHERE name = ? AND area = ? LIMIT 1")
      .get(name, area) as Record<string, unknown> | undefined;
    if (row) existing = rowToCustomer(row);
  }

  if (existing && !input.linkExisting) {
    return {
      ok: false,
      duplicate: { id: existing.id, name: existing.name },
    };
  }

  const now = new Date().toISOString();

  if (existing) {
    // Merge: prefer newer non-empty values, keep notes untouched unless caller supplied one.
    const merged: Customer = {
      ...existing,
      name: name || existing.name,
      phone: phone || existing.phone,
      area: area || existing.area,
      address: address || existing.address,
      notes: notes || existing.notes,
    };
    db.prepare(
      `UPDATE customers SET name=?, phone=?, area=?, address=?, notes=? WHERE id=?`
    ).run(merged.name, merged.phone, merged.area, merged.address, merged.notes, existing.id);
    const updated = getCustomer(existing.id)!;
    return {
      ok: true,
      result: { customer: updated, customerSaved: false, customerUpdated: true },
    };
  }

  const id = nextId(db, "customers");
  const cc = getAreaCentroid(area);
  db.prepare(
    `INSERT INTO customers (id, name, phone, area, address, notes, lat, lng, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, name, phone, area, address, notes, cc.lat, cc.lng, now);
  const inserted = getCustomer(id)!;
  return {
    ok: true,
    result: { customer: inserted, customerSaved: true, customerUpdated: false },
  };
}

export function createCustomer(data: {
  name: string;
  phone: string;
  area: string;
  address: string;
  notes: string;
  linkExisting?: boolean;
}): { ok: true; customer: Customer } | { ok: false; duplicate: { id: number; name: string } } {
  // Thin wrapper that exposes the legacy `customer` field to API callers.
  const res = createOrUpdateCustomer({ ...data, linkExisting: data.linkExisting });
  if (!res.ok) return res;
  return { ok: true, customer: res.result.customer };
}

/**
 * Look up the canonical stored phone for a normalized input — used by the
 * customers POST handler for live "this phone already exists" feedback.
 */
export function findCustomerByPhone(phone: string): Customer | undefined {
  const db = getDb();
  if (!phone) return undefined;
  const rows = db.prepare("SELECT * FROM customers").all() as Array<Record<string, unknown>>;
  for (const r of rows) {
    if (phonesMatch(String(r.phone || ""), phone)) return rowToCustomer(r);
  }
  return undefined;
}

export function updateCustomer(id: number, data: Partial<Customer>): Customer | null {
  const db = getDb();
  const existing = getCustomer(id);
  if (!existing) return null;
  // Refresh routing coords when the area changes; preserve otherwise.
  let nextLat: number | null = existing.lat;
  let nextLng: number | null = existing.lng;
  if (data.area !== undefined && data.area !== existing.area) {
    const c = getAreaCentroid(data.area);
    nextLat = c.lat;
    nextLng = c.lng;
  }
  if (data.lat !== undefined) nextLat = (data.lat as number | null) ?? null;
  if (data.lng !== undefined) nextLng = (data.lng as number | null) ?? null;

  const merged: Customer = {
    ...existing,
    ...data,
    id: existing.id,
    lat: nextLat,
    lng: nextLng,
  };
  db.prepare(
    `UPDATE customers SET name=?, phone=?, area=?, address=?, notes=?, lat=?, lng=? WHERE id=?`
  ).run(
    merged.name,
    merged.phone,
    merged.area,
    merged.address,
    merged.notes,
    merged.lat,
    merged.lng,
    id
  );
  return merged;
}

export function deleteCustomer(id: number): boolean {
  const db = getDb();
  const r = db.prepare("DELETE FROM customers WHERE id = ?").run(id);
  return r.changes > 0;
}

// --- Public API: Riders ---

export function getRiders(): Rider[] {
  const db = getDb();
  return (db
    .prepare("SELECT * FROM riders ORDER BY id ASC")
    .all() as Record<string, unknown>[]).map(rowToRider);
}

export function getActiveRiders(): Rider[] {
  return getRiders().filter((r) => r.status === "active");
}

export function createRider(data: {
  name: string;
  phone: string;
  vehicle: string;
  status: "active" | "inactive";
  homeCluster?: Rider["homeCluster"];
  subClusters?: Rider["subClusters"];
  maxStops?: Rider["maxStops"];
  pinHash?: string;
  tempPin?: boolean;
  accountStatus?: Rider["accountStatus"];
}): Rider {
  const db = getDb();
  const id = nextId(db, "riders");
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO riders (
       id, name, phone, vehicle, status,
       homeCluster, subClusters, maxStops, createdAt,
       pinHash, tempPin, accountStatus
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    data.name,
    data.phone,
    data.vehicle,
    data.status,
    data.homeCluster ?? null,
    JSON.stringify(data.subClusters ?? []),
    data.maxStops ?? null,
    now,
    data.pinHash ?? "",
    data.tempPin ? 1 : 0,
    data.accountStatus ?? "active",
  );
  return getRiders().find((r) => r.id === id)!;
}

export function updateRider(id: number, data: Partial<Rider>): Rider | null {
  const db = getDb();
  const existing = getRiders().find((r) => r.id === id);
  if (!existing) return null;
  const merged: Rider = { ...existing, ...data, id: existing.id };
  db.prepare(
    `UPDATE riders SET
       name=?, phone=?, vehicle=?, status=?,
       homeCluster=?, subClusters=?, maxStops=?,
       pinHash=?, tempPin=?, accountStatus=?, lastLoginAt=?, avatarPath=?
     WHERE id=?`
  ).run(
    merged.name,
    merged.phone,
    merged.vehicle,
    merged.status,
    merged.homeCluster,
    JSON.stringify(merged.subClusters ?? []),
    merged.maxStops,
    merged.pinHash,
    merged.tempPin ? 1 : 0,
    merged.accountStatus,
    merged.lastLoginAt,
    merged.avatarPath ?? "",
    id,
  );
  return merged;
}

/** Set or clear a rider's avatar image path. Caller is responsible for
 *  writing/clearing the file on disk before calling. */
export function setRiderAvatarPath(riderId: number, avatarPath: string): Rider | null {
  const db = getDb();
  const existing = getRiders().find((r) => r.id === riderId);
  if (!existing) return null;
  db.prepare("UPDATE riders SET avatarPath = ? WHERE id = ?").run(avatarPath, riderId);
  return { ...existing, avatarPath };
}

/**
 * Count a rider's open orders (anything not delivered, cancelled, or
 * returned). Used as the safety guard before hard-deleting a rider — if the
 * count is non-zero, the API returns 409 and the operator must reassign or
 * close those orders first.
 */
export function countActiveRiderOrders(riderId: number): number {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT COUNT(*) AS n FROM orders WHERE riderId = ? AND status NOT IN ('delivered', 'cancelled', 'returned')"
    )
    .get(riderId) as { n: number } | undefined;
  return row?.n ?? 0;
}

/**
 * List the open orders that block a rider delete. Used by the API + the
 * confirm modal to render "Reassign or close these first:…" with deep links
 * to each order's detail page.
 */
export function getActiveRiderOrderIds(riderId: number): Array<{ id: number; orderNo: string }> {
  const db = getDb();
  return db
    .prepare(
      "SELECT id, orderNo FROM orders WHERE riderId = ? AND status NOT IN ('delivered', 'cancelled', 'returned') ORDER BY id ASC"
    )
    .all(riderId) as Array<{ id: number; orderNo: string }>;
}

/**
 * Hard-delete a rider. The riderName snapshot on every order owned by this
 * rider is renewed with the rider's current name right before the row goes
 * away, so print, history, and the public /track page keep showing the
 * real name forever. Sessions for the rider are revoked (live devices get
 * bumped) but rider_sessions and rider_login_audit rows are kept intact for
 * security forensics.
 *
 * Caller MUST call countActiveRiderOrders first — this function does not
 * refuse on active orders itself; that's enforced at the API layer so the
 * caller can surface the conflicting order IDs.
 */
export function deleteRider(riderId: number): { deletedName: string; ordersArchived: number } {
  const db = getDb();
  const riders = getRiders();
  const existing = riders.find((r) => r.id === riderId);
  if (!existing) return { deletedName: "", ordersArchived: 0 };

  // Snapshot the rider's name onto every order they own, including the ones
  // we'll refuse to delete. Net effect: orders that referenced the rider at
  // delete-time keep showing the right name in print + history.
  const name = existing.name;
  const tx = db.transaction(() => {
    const stamp = db.prepare(
      "UPDATE orders SET riderName = ? WHERE riderId = ? AND (riderName = '' OR riderName IS NULL)"
    );
    const stampAll = stamp.run(name, riderId);
    // Sessions — revoke live ones so any device hits 401 on the next refresh.
    db.prepare("UPDATE rider_sessions SET revokedAt = ? WHERE riderId = ? AND revokedAt = ''")
      .run(new Date().toISOString(), riderId);
    const del = db.prepare("DELETE FROM riders WHERE id = ?").run(riderId);
    return { stampAll: stampAll.changes, deleted: del.changes };
  });
  const result = tx();
  return { deletedName: name, ordersArchived: result.stampAll };
}

// ─────────────────────────────────────────────────────────────────────────
// Rider tracking public API (Phase 1: schema + auth foundation, no UI yet)
//
// Functions are grouped:
//   - Rider auth columns (PIN, lifecycle, login audit)
//   - Rider sessions (refresh-token store + per-device revocation)
//   - Delivery status history (append-only audit log)
//   - Proof of delivery (one row per delivered order)
//   - Delivery OTPs (per-order 4-digit code, attempt-limited)
//
// All writers use parameterized statements; all reads return strongly typed
// rows. UUIDs / IDs come from nextId() so the same id namespace is shared
// across tables (no collision risk between, say, an order id and a session
// id, because callers type-narrow before passing them around).
// ─────────────────────────────────────────────────────────────────────────

/** Bcrypt cost factor used for all rider PINs. Cost 10 ≈ 100ms per verify on
 *  commodity hardware — fast enough to feel instant to a rider, slow enough
 *  that an offline brute-force of a 4-digit PIN over 10,000 candidates takes
 *  ~17 minutes per stolen DB row. Bump to 12 if hardware gets faster. */
export const RIDER_BCRYPT_COST = 10;

/** Login-audit window used by the PIN brute-force lockout. The 5th failed
 *  attempt within this window flips the rider to `suspended`. */
export const RIDER_PIN_LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 min
export const RIDER_PIN_LOCKOUT_THRESHOLD = 5;

/** Rider-session TTL. Access tokens live 15 min; refresh tokens live this
 *  long. The auth layer (Phase 2) reads both values. */
export const RIDER_REFRESH_TOKEN_TTL_DAYS = 30;

/** Per-order delivery-OTP TTL and attempt cap before the OTP is invalidated
 *  and a new one must be requested. */
export const DELIVERY_OTP_TTL_MINUTES = 10;
export const DELIVERY_OTP_MAX_ATTEMPTS = 5;

// ── Types returned to callers ──

export type RiderLoginEvent =
  | "login_success"
  | "login_fail"
  | "pin_lockout"
  | "logout"
  | "pin_change"
  | "session_revoked";

export interface RiderSession {
  id: number;
  riderId: number;
  refreshTokenHash: string;
  deviceFingerprint: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string;
}

export interface RiderLoginAuditRow {
  id: number;
  riderId: number;
  eventType: RiderLoginEvent;
  ipAddress: string;
  userAgent: string;
  success: boolean;
  createdAt: string;
}

export type DeliveryActorType = "rider" | "admin" | "system";

export interface DeliveryStatusHistoryRow {
  id: number;
  orderId: number;
  fromStatus: string;
  toStatus: string;
  actorType: DeliveryActorType;
  actorId: number;
  actorName: string;
  reason: string;
  lat: number | null;
  lng: number | null;
  createdAt: string;
}

export interface ProofOfDelivery {
  id: number;
  orderId: number;
  photoPath: string;
  photoSizeBytes: number;
  otpVerified: boolean;
  otpId: number | null;
  amountCollected: number | null;
  expectedAmount: number | null;
  lat: number | null;
  lng: number | null;
  capturedAt: string;
  uploadedAt: string;
}

export interface DeliveryOtp {
  id: number;
  orderId: number;
  codeHash: string;
  phone: string;
  expiresAt: string;
  attempts: number;
  deliveredSms: boolean;
  createdAt: string;
}

// ── Row mappers for the new tables ──

function rowToRiderSession(r: Record<string, unknown>): RiderSession {
  return {
    id: r.id as number,
    riderId: r.riderId as number,
    refreshTokenHash: r.refreshTokenHash as string,
    deviceFingerprint: (r.deviceFingerprint as string) ?? "",
    createdAt: r.createdAt as string,
    expiresAt: r.expiresAt as string,
    revokedAt: (r.revokedAt as string) ?? "",
  };
}

function rowToLoginAudit(r: Record<string, unknown>): RiderLoginAuditRow {
  return {
    id: r.id as number,
    riderId: (r.riderId as number) ?? 0,
    eventType: r.eventType as RiderLoginEvent,
    ipAddress: (r.ipAddress as string) ?? "",
    userAgent: (r.userAgent as string) ?? "",
    success: ((r.success as number) ?? 0) === 1,
    createdAt: r.createdAt as string,
  };
}

function rowToStatusHistory(r: Record<string, unknown>): DeliveryStatusHistoryRow {
  return {
    id: r.id as number,
    orderId: r.orderId as number,
    fromStatus: (r.fromStatus as string) ?? "",
    toStatus: r.toStatus as string,
    actorType: r.actorType as DeliveryActorType,
    actorId: (r.actorId as number) ?? 0,
    actorName: (r.actorName as string) ?? "",
    reason: (r.reason as string) ?? "",
    lat: (r.lat as number | null) ?? null,
    lng: (r.lng as number | null) ?? null,
    createdAt: r.createdAt as string,
  };
}

function rowToProofOfDelivery(r: Record<string, unknown>): ProofOfDelivery {
  return {
    id: r.id as number,
    orderId: r.orderId as number,
    photoPath: (r.photoPath as string) ?? "",
    photoSizeBytes: (r.photoSizeBytes as number) ?? 0,
    otpVerified: ((r.otpVerified as number) ?? 0) === 1,
    otpId: (r.otpId as number | null) ?? null,
    amountCollected: (r.amountCollected as number | null) ?? null,
    expectedAmount: (r.expectedAmount as number | null) ?? null,
    lat: (r.lat as number | null) ?? null,
    lng: (r.lng as number | null) ?? null,
    capturedAt: (r.capturedAt as string) ?? "",
    uploadedAt: r.uploadedAt as string,
  };
}

function rowToDeliveryOtp(r: Record<string, unknown>): DeliveryOtp {
  return {
    id: r.id as number,
    orderId: r.orderId as number,
    codeHash: r.codeHash as string,
    phone: r.phone as string,
    expiresAt: r.expiresAt as string,
    attempts: (r.attempts as number) ?? 0,
    deliveredSms: ((r.deliveredSms as number) ?? 0) === 1,
    createdAt: r.createdAt as string,
  };
}

// ── Hash helpers ──

/** Bcrypt-hash a plaintext PIN using RIDER_BCRYPT_COST. The returned string
 *  already embeds the salt, so callers must store it verbatim. */
export function hashRiderPin(plaintext: string): string {
  return bcrypt.hashSync(plaintext, RIDER_BCRYPT_COST);
}

/** Verify a plaintext PIN against a stored bcrypt hash. Returns false on any
 *  mismatch, missing rider, or un-hashed pinHash — never throws.
 *  The empty-pinHash branch is deliberate: a rider with no PIN set yet must
 *  not authenticate as if a successful comparison happened. Bcrypt would
 *  incidentally throw on an empty hash string, but that throw is not a
 *  security decision — this explicit check is. */
export function verifyRiderPin(riderId: number, plaintext: string): boolean {
  const rider = getRiders().find((r) => r.id === riderId);
  if (!rider) return false;
  if (!rider.pinHash || rider.pinHash.trim().length === 0) return false;
  try {
    return bcrypt.compareSync(plaintext, rider.pinHash);
  } catch {
    return false;
  }
}

/** SHA-256 hash of a refresh token (or any opaque string). Used to store
 *  refresh tokens at rest — we keep the hash, not the plaintext. The raw
 *  token only ever lives in the client's localStorage / httpOnly cookie. */
export function sha256(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

// ── PIN + lifecycle writers ──

/** Replace a rider's stored PIN hash and toggle the tempPin flag in one shot.
 *  Used by /admin PIN reset (isTemp=true) and by /api/rider/change-pin
 *  (isTemp=false). The plaintext PIN is never stored. */
export function setRiderPinHash(
  riderId: number,
  plaintext: string,
  isTemp: boolean
): Rider | null {
  const rider = getRiders().find((r) => r.id === riderId);
  if (!rider) return null;
  return updateRider(riderId, {
    pinHash: hashRiderPin(plaintext),
    tempPin: isTemp,
    lastLoginAt: rider.lastLoginAt, // unchanged
  });
}

/** Set the rider's lifecycle status. `pin_lockout` from the login flow calls
 *  this with "suspended"; admin endpoints use the same primitive. */
export function setRiderAccountStatus(
  riderId: number,
  status: Rider["accountStatus"]
): Rider | null {
  return updateRider(riderId, { accountStatus: status });
}

/** Stamp the rider's lastLoginAt to "now". Called on every successful login. */
export function setRiderLastLoginAt(riderId: number): Rider | null {
  return updateRider(riderId, { lastLoginAt: new Date().toISOString() });
}

/** Look up a rider by phone (used by the login flow). Returns null if the
 *  phone doesn't match any rider — login error messages must not leak
 *  whether the phone exists vs. the PIN was wrong, so callers should always
 *  return the same 401. */
export function getRiderByPhone(phone: string): Rider | null {
  const normalized = normalizePhone(phone);
  return getRiders().find((r) => phonesMatch(r.phone, normalized)) ?? null;
}

// ── Login audit ──

export interface RecordLoginAuditInput {
  riderId: number; // 0 for unknown-phone attempts
  eventType: RiderLoginEvent;
  ipAddress: string;
  userAgent: string;
  success: boolean;
}

/** Append a row to rider_login_audit. Never throws — audit write failure must
 *  not block the login flow that triggered it. */
export function recordRiderLoginAudit(input: RecordLoginAuditInput): void {
  try {
    const db = getDb();
    db.prepare(
      `INSERT INTO rider_login_audit
         (id, riderId, eventType, ipAddress, userAgent, success, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      nextId(db, "rider_login_audit"),
      input.riderId,
      input.eventType,
      input.ipAddress,
      input.userAgent,
      input.success ? 1 : 0,
      new Date().toISOString(),
    );
  } catch (err) {
    // Audit failures should be loud in the log but never block auth.
    console.error("[rider-login-audit] write failed", err);
  }
}

/** Most recent N audit rows for a rider, newest first. */
export function getRiderLoginAudit(
  riderId: number,
  limit = 50
): RiderLoginAuditRow[] {
  const db = getDb();
  return (
    db
      .prepare(
        `SELECT * FROM rider_login_audit
          WHERE riderId = ?
          ORDER BY createdAt DESC, id DESC
          LIMIT ?`
      )
      .all(riderId, limit) as Record<string, unknown>[]
  ).map(rowToLoginAudit);
}

/** Count failed PIN attempts for this rider within the rolling lockout
 *  window, but ignore fails that happened *before* the most recent successful
 *  login or admin PIN reset. This way an admin who clears a rider's lockout
 *  (via /api/riders/[id]/pin/reset or /reactivate) doesn't have to wait 15
 *  min for the audit log to roll over — the counter implicitly clears.
 *  Backed by rider_login_audit so the lockout itself is auditable. */
export function countRecentRiderPinFailures(riderId: number): number {
  const db = getDb();
  const since = new Date(Date.now() - RIDER_PIN_LOCKOUT_WINDOW_MS).toISOString();
  const clearedAt = db
    .prepare(
      `SELECT MAX(createdAt) AS m FROM rider_login_audit
        WHERE riderId = ?
          AND eventType IN ('login_success', 'pin_change')`
    )
    .get(riderId) as { m: string | null };
  const cutoff = clearedAt.m && clearedAt.m > since ? clearedAt.m : since;
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM rider_login_audit
        WHERE riderId = ?
          AND eventType = 'login_fail'
          AND createdAt >= ?`
    )
    .get(riderId, cutoff) as { n: number };
  return row.n;
}

/** Convenience wrapper for the lockout rule. Returns true if the rider is
 *  already at or beyond the threshold (i.e. login should be hard-rejected
 *  without attempting bcrypt). */
export function isRiderPinLockedOut(riderId: number): boolean {
  return countRecentRiderPinFailures(riderId) >= RIDER_PIN_LOCKOUT_THRESHOLD;
}

// ── Rider sessions (refresh-token store) ──

/** Mint a new session row. The refresh token JWT (signed upstream) is hashed
 *  before storage — the plaintext JWT is never written to disk. */
export function createRiderSession(
  riderId: number,
  refreshTokenJwt: string,
  deviceFingerprint: string
): RiderSession {
  const db = getDb();
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + RIDER_REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000
  );
  const id = nextId(db, "rider_sessions");
  db.prepare(
    `INSERT INTO rider_sessions
       (id, riderId, refreshTokenHash, deviceFingerprint, createdAt, expiresAt)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    riderId,
    sha256(refreshTokenJwt),
    deviceFingerprint,
    now.toISOString(),
    expiresAt.toISOString(),
  );
  return {
    id,
    riderId,
    refreshTokenHash: sha256(refreshTokenJwt),
    deviceFingerprint,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    revokedAt: "",
  };
}

/** Look up a session by its refresh-token hash. Used by /api/rider/refresh.
 *  Returns null if the session is revoked or expired. */
export function getRiderSessionByRefreshHash(
  refreshTokenJwt: string
): RiderSession | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT * FROM rider_sessions
        WHERE refreshTokenHash = ?
          AND revokedAt = ''
          AND expiresAt > ?`
    )
    .get(sha256(refreshTokenJwt), new Date().toISOString()) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToRiderSession(row) : null;
}

/** Patch a freshly-created session row's refreshTokenHash to match the signed
 *  refresh JWT. Used after createRiderSession + signRiderToken so the JWT
 *  carries the actual session id and the row stores sha256(JWT). */
export function bindRiderSessionRefreshToken(
  sessionId: number,
  refreshTokenJwt: string
): void {
  const db = getDb();
  db.prepare("UPDATE rider_sessions SET refreshTokenHash = ? WHERE id = ?").run(
    sha256(refreshTokenJwt),
    sessionId
  );
}

/** Revoke a single session by id. Idempotent. */
export function revokeRiderSession(id: number): void {
  const db = getDb();
  db.prepare(
    `UPDATE rider_sessions SET revokedAt = ?
      WHERE id = ? AND revokedAt = ''`
  ).run(new Date().toISOString(), id);
}

/** Revoke every active session for a rider. Called on:
 *  - successful login (single-device-per-account policy)
 *  - PIN lockout
 *  - admin suspend / deactivate
 *  Returns the count of rows revoked. */
export function revokeAllRiderSessions(riderId: number): number {
  const db = getDb();
  const r = db
    .prepare(
      `UPDATE rider_sessions SET revokedAt = ?
        WHERE riderId = ? AND revokedAt = ''`
    )
    .run(new Date().toISOString(), riderId);
  return r.changes;
}

// ── Delivery status history ──

export interface InsertStatusHistoryInput {
  orderId: number;
  fromStatus: string;
  toStatus: OrderStatus;
  actorType: DeliveryActorType;
  actorId: number;
  actorName: string;
  reason?: string;
  lat?: number | null;
  lng?: number | null;
}

/** Append a row to delivery_status_history. Never throws on the happy path;
 *  history writes must not roll back a status change the user just saw. */
export function insertDeliveryStatusHistory(
  input: InsertStatusHistoryInput
): DeliveryStatusHistoryRow | null {
  try {
    const db = getDb();
    const id = nextId(db, "delivery_status_history");
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO delivery_status_history
         (id, orderId, fromStatus, toStatus, actorType, actorId, actorName,
          reason, lat, lng, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      input.orderId,
      input.fromStatus,
      input.toStatus,
      input.actorType,
      input.actorId,
      input.actorName,
      input.reason ?? "",
      input.lat ?? null,
      input.lng ?? null,
      now,
    );
    return {
      id,
      orderId: input.orderId,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      actorType: input.actorType,
      actorId: input.actorId,
      actorName: input.actorName,
      reason: input.reason ?? "",
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      createdAt: now,
    };
  } catch (err) {
    console.error("[delivery-status-history] insert failed", err);
    return null;
  }
}

/** Newest-first audit log for an order. Capped at `limit` rows. */
export function getDeliveryStatusHistory(
  orderId: number,
  limit = 100
): DeliveryStatusHistoryRow[] {
  const db = getDb();
  return (
    db
      .prepare(
        `SELECT * FROM delivery_status_history
          WHERE orderId = ?
          ORDER BY createdAt DESC, id DESC
          LIMIT ?`
      )
      .all(orderId, limit) as Record<string, unknown>[]
  ).map(rowToStatusHistory);
}

// ── Proof of delivery ──

export interface InsertProofOfDeliveryInput {
  orderId: number;
  photoPath: string;
  photoSizeBytes: number;
  otpVerified: boolean;
  otpId: number | null;
  amountCollected: number | null;
  expectedAmount: number;
  lat: number | null;
  lng: number | null;
  capturedAt: string;
}

/** Insert the POD row. UNIQUE(orderId) guarantees one POD per delivery, so a
 *  duplicate call returns the existing row instead of erroring. */
export function insertProofOfDelivery(
  input: InsertProofOfDeliveryInput
): ProofOfDelivery {
  const db = getDb();
  // Idempotent: if a POD already exists for this order, return it without
  // trying to insert. The override endpoint relies on this to capture an
  // admin-supplied COD amount into the existing row without overwriting any
  // photo / OTP state.
  const existing = db
    .prepare("SELECT id FROM proof_of_delivery WHERE orderId = ?")
    .get(input.orderId) as { id: number } | undefined;
  if (existing) return getProofOfDelivery(input.orderId)!;
  const id = nextId(db, "proof_of_delivery");
  const now = new Date().toISOString();
  // Use INSERT OR IGNORE so that a stale `next_id` counter (the dev-mode hot
  // reload sometimes leaves the counter ahead of the actual rows) doesn't
  // surface as a 500 to the caller. The existing-row path is the source of
  // truth; if it appears, fall through to the return-below.
  db.prepare(
    `INSERT OR IGNORE INTO proof_of_delivery
       (id, orderId, photoPath, photoSizeBytes, otpVerified, otpId,
        amountCollected, expectedAmount, lat, lng, capturedAt, uploadedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.orderId,
    input.photoPath,
    input.photoSizeBytes,
    input.otpVerified ? 1 : 0,
    input.otpId,
    input.amountCollected,
    input.expectedAmount,
    input.lat,
    input.lng,
    input.capturedAt,
    now,
  );
  const after = getProofOfDelivery(input.orderId);
  if (after) return after;
  return {
    id,
    orderId: input.orderId,
    photoPath: input.photoPath,
    photoSizeBytes: input.photoSizeBytes,
    otpVerified: input.otpVerified,
    otpId: input.otpId,
    amountCollected: input.amountCollected,
    expectedAmount: input.expectedAmount,
    lat: input.lat,
    lng: input.lng,
    capturedAt: input.capturedAt,
    uploadedAt: now,
  };
}

export function getProofOfDelivery(orderId: number): ProofOfDelivery | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM proof_of_delivery WHERE orderId = ?")
    .get(orderId) as Record<string, unknown> | undefined;
  return row ? rowToProofOfDelivery(row) : null;
}

/** Patch specific fields on an existing POD row. Used by the rider endpoints
 *  as the POD comes together in pieces: first photo, then OTP, then COD.
 *  Returns the updated row, or null if no POD exists for this order yet. */
export function updateProofOfDelivery(
  orderId: number,
  patch: Partial<Omit<ProofOfDelivery, "id" | "orderId" | "uploadedAt">>
): ProofOfDelivery | null {
  const db = getDb();
  const existing = db
    .prepare("SELECT id FROM proof_of_delivery WHERE orderId = ?")
    .get(orderId) as { id: number } | undefined;
  if (!existing) return null;
  const fields: string[] = [];
  const values: unknown[] = [];
  if (patch.photoPath !== undefined)         { fields.push("photoPath = ?");       values.push(patch.photoPath); }
  if (patch.photoSizeBytes !== undefined)     { fields.push("photoSizeBytes = ?");  values.push(patch.photoSizeBytes); }
  if (patch.otpVerified !== undefined)        { fields.push("otpVerified = ?");      values.push(patch.otpVerified ? 1 : 0); }
  if (patch.otpId !== undefined)              { fields.push("otpId = ?");            values.push(patch.otpId); }
  if (patch.amountCollected !== undefined)    { fields.push("amountCollected = ?");  values.push(patch.amountCollected); }
  if (patch.expectedAmount !== undefined)     { fields.push("expectedAmount = ?");   values.push(patch.expectedAmount); }
  if (patch.lat !== undefined)                { fields.push("lat = ?");              values.push(patch.lat); }
  if (patch.lng !== undefined)                { fields.push("lng = ?");              values.push(patch.lng); }
  if (patch.capturedAt !== undefined)         { fields.push("capturedAt = ?");       values.push(patch.capturedAt); }
  if (fields.length === 0) return getProofOfDelivery(orderId);
  db.prepare(
    `UPDATE proof_of_delivery SET ${fields.join(", ")} WHERE orderId = ?`
  ).run(...values, orderId);
  return getProofOfDelivery(orderId);
}

/** Compute the expected COD amount for an order. Mirrors the logic used at
 *  POD insert time so admin reconciliation can recompute on the fly without
 *  re-reading every POD row. */
export function expectedCodAmount(orderId: number, companyId: number): number {
  const o = getOrder(orderId, companyId);
  if (!o) return 0;
  return o.paymentMethod === "cod" ? o.total : 0;
}

// ── Delivery OTP ──

export interface CreateDeliveryOtpInput {
  orderId: number;
  phone: string;
  /** Override the default TTL (mostly for tests). */
  ttlMinutes?: number;
}

/** Generate a 4-digit code, hash it (sha256 + per-row salt baked into the
 *  stored value), persist it, and return both the id and the plaintext code
 *  so the caller can hand the code to the SMS adapter. The plaintext is NOT
 *  returned from any read path — only this function knows it.
 *  Storage format: `<saltHex>:<sha256Hex>` so the verifier can recover the
 *  salt without a separate column. */
export function createDeliveryOtp(
  input: CreateDeliveryOtpInput
): { id: number; code: string; expiresAt: string } {
  const db = getDb();
  const code = String(Math.floor(1000 + Math.random() * 9000)); // 4 digits, leading-zero safe via range
  const salt = crypto.randomBytes(8).toString("hex");
  const codeHash = `${salt}:${sha256(`${salt}:${code}`)}`;
  const ttlMs = (input.ttlMinutes ?? DELIVERY_OTP_TTL_MINUTES) * 60 * 1000;
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  const id = nextId(db, "delivery_otps");
  db.prepare(
    `INSERT INTO delivery_otps
       (id, orderId, codeHash, phone, expiresAt, attempts, deliveredSms, createdAt)
     VALUES (?, ?, ?, ?, ?, 0, 0, ?)`
  ).run(id, input.orderId, codeHash, input.phone, expiresAt, new Date().toISOString());
  return { id, code, expiresAt };
}

/** Most recent un-expired, non-exhausted OTP for an order. Returns null if
 *  none exists; caller should generate a new one. */
export function getActiveDeliveryOtp(orderId: number): DeliveryOtp | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT * FROM delivery_otps
        WHERE orderId = ?
          AND expiresAt > ?
          AND attempts < ?
        ORDER BY createdAt DESC, id DESC
        LIMIT 1`
    )
    .get(orderId, new Date().toISOString(), DELIVERY_OTP_MAX_ATTEMPTS) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToDeliveryOtp(row) : null;
}

/** Verify a 4-digit OTP against the active row. On success, marks it used
 *  and returns true. On wrong code, increments attempts and returns false.
 *  Caller is responsible for checking the lockout threshold (5 attempts)
 *  after this returns false. */
export function verifyDeliveryOtp(orderId: number, code: string): boolean {
  const db = getDb();
  const otp = getActiveDeliveryOtp(orderId);
  if (!otp) return false;
  // Stored codeHash format: `<saltHex>:<sha256Hex>`. Parse and re-hash.
  const colonAt = otp.codeHash.indexOf(":");
  if (colonAt < 1) return false;
  const salt = otp.codeHash.slice(0, colonAt);
  const storedHash = otp.codeHash.slice(colonAt + 1);
  const candidateHash = sha256(`${salt}:${code}`);
  if (candidateHash !== storedHash) {
    db.prepare("UPDATE delivery_otps SET attempts = attempts + 1 WHERE id = ?").run(otp.id);
    return false;
  }
  markDeliveryOtpUsed(otp.id);
  return true;
}

/** Mark an OTP as used by setting attempts to MAX so getActiveDeliveryOtp
 *  no longer returns it. We don't have a separate `usedAt` column to keep
 *  the schema small — the attempts column is the source of truth. */
export function markDeliveryOtpUsed(otpId: number): void {
  const db = getDb();
  db.prepare("UPDATE delivery_otps SET attempts = ? WHERE id = ?").run(
    DELIVERY_OTP_MAX_ATTEMPTS,
    otpId
  );
}

/** Stamp that the SMS adapter successfully sent the OTP. Used by Phase 3's
 *  delivery flow to surface "OTP not delivered" warnings in the rider UI. */
export function markDeliveryOtpSmsSent(otpId: number): void {
  const db = getDb();
  db.prepare("UPDATE delivery_otps SET deliveredSms = 1 WHERE id = ?").run(otpId);
}

/** Return the order's current expectedAmount given its payment method.
 *  Used at POD insert time so the value is stamped once and immutable. */
export function expectedAmountForOrder(order: Order): number {
  return order.paymentMethod === "cod" ? order.total : 0;
}

// --- Public API: Orders ---

export function getOrders(companyId: number): Order[] {
  const db = getDb();
  return (
    db
      .prepare("SELECT * FROM orders WHERE companyId = ? ORDER BY id DESC")
      .all(companyId) as Record<string, unknown>[]
  ).map(rowToOrder);
}

export function getOrder(id: number, companyId: number): Order | undefined {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM orders WHERE id = ? AND companyId = ?")
    .get(id, companyId) as Record<string, unknown> | undefined;
  return row ? rowToOrder(row) : undefined;
}

/** Cross-tenant lookup for the customer tracking page (no tenant cookie on
 *  the public site). Returns null if the code doesn't match any order. The
 *  partial unique index `idx_orders_trackingcode` makes this a fast single-
 *  index scan. */
export function getOrderByTrackingCode(code: string): Order | undefined {
  if (!code || typeof code !== "string") return undefined;
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM orders WHERE trackingCode = ?")
    .get(code) as Record<string, unknown> | undefined;
  return row ? rowToOrder(row) : undefined;
}

export interface NewOrderInput {
  date: string;
  customerId: number | null;
  customerName: string;
  customerPhone: string;
  area: string;
  address: string;
  items: Array<{
    productId: number;
    qty: number;
    unitPrice: number;
  }>;
  deliveryFee: number;
  discount: number;
  paid: number;
  paymentMethod: PaymentMethod;
  source?: OrderSource;
  deliveryMode?: DeliveryMode;
  pathaoTrackingId?: string;
  pathaoFare?: number;
  riderCost?: number;
  note: string;
  /** WP order id (WooCommerce integer or "wc-X"). Optional. */
  wpOrderId?: string;
  /**
   * Override the auto-generated order number. When provided, must be unique
   * across the `orders` table — duplicates throw so callers can surface a
   * clean error to the operator. Quick-Add passes the WooCommerce order id
   * here for `source === "wordpress"` orders so the WP # shows up as the
   * primary order ID on the list, detail page, and invoice.
   */
  orderNo?: string;
  /** Reserved. Stock is no longer deducted at create time — every order
* stays at `stockDeducted=false` until it transitions to "out-for-delivery".
   * Kept on the signature so existing callers (webhooks) keep compiling. */
  skipStockDeduction?: boolean;
  /** Override initial status. Default `"new"`. Webhook passes `"pending-approval"`. */
  initialStatus?: OrderStatus;
}

function applyOrderToStock(order: Order, factor: 1 | -1) {
  const db = getDb();
  const insMov = db.prepare(
    `INSERT INTO stock_movements (id, companyId, productId, type, qty, note, createdAt) VALUES (?, ?, ?, 'sale', ?, ?, ?)`
  );
  for (const item of order.items) {
    const p = db
      .prepare("SELECT stockQty FROM products WHERE id = ? AND companyId = ?")
      .get(item.productId, order.companyId) as { stockQty: number } | undefined;
    if (!p) continue;
    const newQty = Math.max(0, p.stockQty - item.qty * factor);
    db.prepare(
      "UPDATE products SET stockQty = ?, updatedAt = ? WHERE id = ? AND companyId = ?"
    ).run(newQty, new Date().toISOString(), item.productId, order.companyId);
    if (factor === 1) {
      insMov.run(
        nextId(db, "stockMovements"),
        order.companyId,
        item.productId,
        item.qty,
        `Order ${order.orderNo}`,
        new Date().toISOString()
      );
    }
  }
}

export interface CreateOrderResult {
  order: Order;
  customerSaved: boolean;
  customerUpdated: boolean;
  customer: Customer | null;
}

export function createOrder(input: NewOrderInput, companyId: number): CreateOrderResult {
  const db = getDb();
  // Auto-save customer by phone (preserved from JSON implementation)
  let resolvedCustomerId: number | null = input.customerId ?? null;
  let customerSaved = false;
  let customerUpdated = false;
  let savedCustomer: Customer | null = null;

  if (!resolvedCustomerId && input.customerName.trim()) {
    const phone = input.customerPhone.trim();
    if (phone) {
      const res = createOrUpdateCustomer({
        name: input.customerName.trim(),
        phone,
        area: input.area.trim(),
        address: input.address.trim(),
        linkExisting: true, // orders always link to existing rows when phone matches
      });
      if (res.ok) {
        resolvedCustomerId = res.result.customer.id;
        customerSaved = res.result.customerSaved;
        customerUpdated = res.result.customerUpdated;
        savedCustomer = res.result.customer;
      }
    } else {
      // Phone missing: WP says every order has phone, but manual orders
      // may not. Skip auto-save silently so manual flow still works.
    }
  } else if (resolvedCustomerId) {
    // Caller picked an existing customer from the dropdown — track it for
    // the post-save notice so the UI can show "Linked to: <Name>".
    savedCustomer = getCustomer(resolvedCustomerId) ?? null;
  }

  // Stamp routing coordinates from the area centroid at create time.
  // Callers can override per-order via the same field in updateOrder.
  const c = getAreaCentroid(input.area);
  const orderLat: number = c.lat;
  const orderLng: number = c.lng;

  // Resolve delivery cluster + sub-cluster from the area. Aftabnagar (hub)
  // resolves to DHK-E/E1 by default; any unknown / "Other" area falls back
  // to the quadrant-based heuristic inside getLocationForArea().
  const loc = getLocationForArea(input.area);

  const id = nextId(db, "orders");
  const now = new Date().toISOString();

  // Resolve orderNo: caller-provided (e.g. WP quick-add) takes priority over
  // the auto-generated MD-{year}-{seq}. Empty / whitespace strings fall
  // through to auto-gen. Caller-provided values must be unique — duplicates
  // throw so the API can return a 400 with a useful message.
  let resolvedOrderNo: string;
  if (input.orderNo && input.orderNo.trim()) {
    const candidate = input.orderNo.trim();
    const clash = db
      .prepare("SELECT id FROM orders WHERE orderNo = ? AND companyId = ?")
      .get(candidate, companyId) as { id: number } | undefined;
    if (clash) {
      throw new Error(`Order #${candidate} already exists (id=${clash.id})`);
    }
    resolvedOrderNo = candidate;
  } else {
    resolvedOrderNo = nextOrderNo(db);
  }
  const items = input.items.map((it) => {
    const p = getProduct(it.productId, companyId);
    const lineTotal = Math.round(it.qty * it.unitPrice * 100) / 100;
    return {
      productId: it.productId,
      name: p?.name || "Item",
      nameBn: p?.nameBn || "",
      unit: p?.unitCode || "kg",
      qty: it.qty,
      unitPrice: it.unitPrice,
      lineTotal,
    };
  });
  const subtotal = Math.round(items.reduce((s, it) => s + it.lineTotal, 0) * 100) / 100;
  const total = Math.max(0, subtotal + input.deliveryFee - input.discount);
  const status: OrderStatus = input.initialStatus ?? "new";
  // Stock deduction happens ONLY on the "delivered" status transition
  // (handled in setOrderStatus). We never deduct at order-creation time, no
  // matter where the order comes from (manual, bulk, WordPress webhook). This
  // matches real-world meat delivery: until a courier hands the parcel over,
  // it's not a fulfilled sale — cancellations / never-confirmed orders must
  // not have eaten inventory.
  const stockDeductedAtCreate = false;
  // Build with explicit arrays so placeholder count and value count are
  // guaranteed to match. 40 columns → 40 ? placeholders → 40 .run() args.
  const cols: Array<string> = [
    "id", "companyId", "orderNo", "date", "customerId", "customerName", "customerPhone",
    "area", "address", "items", "subtotal", "deliveryFee", "discount",
    "total", "paid", "paymentMethod", "status", "source", "deliveryMode",
    "pathaoTrackingId", "pathaoFare", "riderId", "riderName", "riderCost", "note",
    "createdAt", "confirmedAt", "deliveredAt", "cancelledAt", "cancelReason",
    "returnedAt", "returnReason",
    "stockDeducted", "wpOrderId", "updatedAt", "lat", "lng", "riderSeq",
    "cluster", "subCluster",
  ];
  if (cols.length !== 40) {
    throw new Error(`orders INSERT column list length is ${cols.length}, expected 40`);
  }
  const placeholders = cols.map(() => "?").join(", ");
  const sql = `INSERT INTO orders (${cols.join(", ")}) VALUES (${placeholders})`;
  const stmt = db.prepare(sql);
  // Build value array in the same column order. riderId + riderSeq get explicit null.
  const values: Array<string | number | null> = [
    id,                                                // id
    companyId,                                         // companyId
    resolvedOrderNo,                                   // orderNo
    input.date || todayStr(),                          // date
    resolvedCustomerId,                                // customerId
    input.customerName,                                // customerName
    input.customerPhone,                               // customerPhone
    input.area,                                        // area
    input.address,                                     // address
    JSON.stringify(items),                             // items
    subtotal,                                          // subtotal
    input.deliveryFee,                                 // deliveryFee
    input.discount,                                    // discount
    total,                                             // total
    input.paid,                                        // paid
    input.paymentMethod,                               // paymentMethod
    status,                                            // status
    input.source ?? "manual",                          // source
    input.deliveryMode ?? "own",                       // deliveryMode
    input.pathaoTrackingId ?? "",                      // pathaoTrackingId
    input.pathaoFare ?? 0,                             // pathaoFare
    null,                                              // riderId
    "",                                                // riderName — snapshot, populated later (on rider delete or via the loadRiderNames helper). Empty at create because no rider is assigned yet.
    input.riderCost ?? 0,                              // riderCost
    input.note,                                        // note
    now,                                               // createdAt
    "",                                                // confirmedAt — stamped by setOrderStatus() the first time the user confirms the order; the dashboard counts orders as "today's" only once this is set.
    "",                                                // deliveredAt
    "",                                                // cancelledAt
    "",                                                // cancelReason
    "",                                                // returnedAt
    "",                                                // returnReason
    stockDeductedAtCreate ? 1 : 0,                     // stockDeducted
    input.wpOrderId ?? "",                             // wpOrderId
    now,                                               // updatedAt
    orderLat,                                          // lat
    orderLng,                                          // lng
    null,                                              // riderSeq
    loc.cluster,                                       // cluster
    loc.subCluster,                                    // subCluster
  ];
  if (values.length !== cols.length) {
    throw new Error(`values array length ${values.length} != cols length ${cols.length}`);
  }
  stmt.run(...values);
  // Note: stock deduction is intentionally NOT performed here. It happens in
  // setOrderStatus() the first time an order transitions to "delivered".
  return {
    order: getOrder(id, companyId)!,
    customerSaved,
    customerUpdated,
    customer: savedCustomer,
  };
}

export function updateOrder(
  id: number,
  data: Partial<Order>,
  companyId: number
): Order | null {
  const db = getDb();
  const existing = getOrder(id, companyId);
  if (!existing) return null;

  // Stock reconciliation on items change — skip for orders that have not yet
  // deducted stock (pending-approval / cancelled-from-pending). Editing them
  // before approval must not move inventory.
  if (data.items && existing.status !== "cancelled" && existing.stockDeducted) {
    const oldQty = new Map<number, number>();
    for (const it of existing.items) oldQty.set(it.productId, (oldQty.get(it.productId) ?? 0) + it.qty);
    const newQty = new Map<number, number>();
    for (const it of data.items) newQty.set(it.productId, (newQty.get(it.productId) ?? 0) + it.qty);
    const ids = new Set<number>([...oldQty.keys(), ...newQty.keys()]);
    for (const pid of ids) {
      const p = db
        .prepare("SELECT stockQty FROM products WHERE id = ?")
        .get(pid) as { stockQty: number } | undefined;
      if (!p) continue;
      const diff = (newQty.get(pid) ?? 0) - (oldQty.get(pid) ?? 0);
      db.prepare("UPDATE products SET stockQty = ?, updatedAt = ? WHERE id = ?").run(
        Math.max(0, p.stockQty - diff),
        new Date().toISOString(),
        pid
      );
    }
  }
  // Stock reconciliation on status change — gated on stockDeducted.
  if (data.status && data.status !== existing.status && existing.stockDeducted) {
    if (data.status === "cancelled" && existing.status !== "cancelled") {
      for (const it of existing.items) {
        const p = db
          .prepare("SELECT stockQty FROM products WHERE id = ?")
          .get(it.productId) as { stockQty: number } | undefined;
        if (!p) continue;
        db.prepare("UPDATE products SET stockQty = ?, updatedAt = ? WHERE id = ?").run(
          Math.max(0, p.stockQty + it.qty),
          new Date().toISOString(),
          it.productId
        );
      }
    } else if (data.status !== "cancelled" && existing.status === "cancelled") {
      for (const it of existing.items) {
        const p = db
          .prepare("SELECT stockQty FROM products WHERE id = ?")
          .get(it.productId) as { stockQty: number } | undefined;
        if (!p) continue;
        db.prepare("UPDATE products SET stockQty = ?, updatedAt = ? WHERE id = ?").run(
          Math.max(0, p.stockQty - it.qty),
          new Date().toISOString(),
          it.productId
        );
      }
    }
  }

  // Routing coordinates: refresh from area centroid when the area changes;
  // preserve any manually-set coords if the area didn't change.
  let nextLat: number | null = existing.lat;
  let nextLng: number | null = existing.lng;
  let nextCluster: Order["cluster"] = existing.cluster;
  let nextSubCluster: Order["subCluster"] = existing.subCluster;
  if (data.area !== undefined && data.area !== existing.area) {
    const c = getAreaCentroid(data.area);
    nextLat = c.lat;
    nextLng = c.lng;
    const loc = getLocationForArea(data.area);
    nextCluster = loc.cluster;
    nextSubCluster = loc.subCluster;
  }
  if (data.cluster !== undefined) nextCluster = data.cluster as Order["cluster"];
  if (data.subCluster !== undefined) nextSubCluster = (data.subCluster as string) ?? null;
  if (data.lat !== undefined) nextLat = (data.lat as number | null) ?? null;
  if (data.lng !== undefined) nextLng = (data.lng as number | null) ?? null;
  const nextRiderSeq =
    data.riderSeq !== undefined ? (data.riderSeq as number | null) ?? null : existing.riderSeq;

  const merged: Order = {
    ...existing,
    ...data,
    id: existing.id,
    lat: nextLat,
    lng: nextLng,
    cluster: nextCluster,
    subCluster: nextSubCluster,
    riderSeq: nextRiderSeq,
    updatedAt: new Date().toISOString(),
  };
  db.prepare(
    `UPDATE orders SET orderNo=?, date=?, customerId=?, customerName=?, customerPhone=?, area=?, address=?, items=?,
       subtotal=?, deliveryFee=?, discount=?, total=?, paid=?, paymentMethod=?, status=?, source=?, deliveryMode=?,
       pathaoTrackingId=?, pathaoFare=?, riderId=?, riderCost=?, note=?, createdAt=?, confirmedAt=?, deliveredAt=?,
       cancelledAt=?, cancelReason=?, returnedAt=?, returnReason=?, updatedAt=?, lat=?, lng=?, riderSeq=?, cluster=?, subCluster=? WHERE id=? AND companyId=?`
  ).run(
    merged.orderNo,
    merged.date,
    merged.customerId,
    merged.customerName,
    merged.customerPhone,
    merged.area,
    merged.address,
    JSON.stringify(merged.items),
    merged.subtotal,
    merged.deliveryFee,
    merged.discount,
    merged.total,
    merged.paid,
    merged.paymentMethod,
    merged.status,
    merged.source,
    merged.deliveryMode,
    merged.pathaoTrackingId,
    merged.pathaoFare,
    merged.riderId,
    merged.riderCost,
    merged.note,
    merged.createdAt,
    merged.confirmedAt,
    merged.deliveredAt,
    merged.cancelledAt,
    merged.cancelReason,
    merged.returnedAt,
    merged.returnReason,
    merged.updatedAt,
    merged.lat,
    merged.lng,
    merged.riderSeq,
    merged.cluster,
    merged.subCluster,
    id,
    companyId
  );
  return getOrder(id, companyId) ?? null;
}

/**
 * Look up the current best coords for an order, run Photon geocoding in the
 * background, and update the row if the geocoded result is meaningfully
 * better than what we have. Returns a promise — fire-and-forget from API
 * routes.
 *
 * "Meaningfully better" = at least 100m closer to the customer-area centroid
 * than what we have now, OR we have no coords at all.
 */
export async function geocodeAndRefineOrder(orderId: number, companyId: number): Promise<{
  updated: boolean;
  reason: "no-signal" | "no-improvement" | "improved" | "no-photon-result";
  before?: { lat: number; lng: number };
  after?: { lat: number; lng: number; source: string; confidence: number };
}> {
  const db = getDb();
  const order = getOrder(orderId, companyId);
  if (!order) return { updated: false, reason: "no-signal" };

  const result = await geocodeAddress({
    area: order.area,
    address: order.address,
    customerName: order.customerName,
  });

  if (!result) return { updated: false, reason: "no-photon-result" };

  const before =
    typeof order.lat === "number" && typeof order.lng === "number"
      ? { lat: order.lat, lng: order.lng }
      : undefined;

  // If we already have coords, only update if the new result is at least
  // 100m away from the current pin. This avoids pointless DB writes when
  // Photon returns ~the same point as the area centroid.
  if (before && haversineMeters(before.lat, before.lng, result.lat, result.lng) < 100) {
    return { updated: false, reason: "no-improvement", before, after: result };
  }

  db.prepare("UPDATE orders SET lat = ?, lng = ?, updatedAt = ? WHERE id = ? AND companyId = ?").run(
    result.lat,
    result.lng,
    new Date().toISOString(),
    orderId,
    companyId,
  );

  return { updated: true, reason: "improved", before, after: result };
}

/**
 * Bulk re-geocode all orders for a date (or all orders if no date given).
 * Used by the "Refresh locations" admin button and the bulk-geocode script.
 * Returns counts and a small list of improvements (capped).
 */
export async function bulkGeocodeOrders(
  companyId: number,
  opts: { date?: string; limit?: number } = {}
): Promise<{
  total: number;
  improved: number;
  noResult: number;
  errors: number;
  samples: Array<{ id: number; orderNo: string; area: string; before?: { lat: number; lng: number }; after: { lat: number; lng: number } }>;
}> {
  const all = getOrders(companyId);
  const filtered = opts.date ? all.filter((o) => o.date === opts.date) : all;
  const slice = opts.limit ? filtered.slice(0, opts.limit) : filtered;
  let improved = 0;
  let noResult = 0;
  let errors = 0;
  const samples: Array<{ id: number; orderNo: string; area: string; before?: { lat: number; lng: number }; after: { lat: number; lng: number } }> = [];
  for (const o of slice) {
    try {
      const res = await geocodeAndRefineOrder(o.id, companyId);
      if (res.updated) {
        improved += 1;
        if (samples.length < 5) {
          samples.push({
            id: o.id,
            orderNo: o.orderNo,
            area: o.area,
            before: res.before,
            after: { lat: res.after!.lat, lng: res.after!.lng },
          });
        }
      } else if (res.reason === "no-photon-result") {
        noResult += 1;
      }
    } catch {
      errors += 1;
    }
  }
  return { total: slice.length, improved, noResult, errors, samples };
}

export function setOrderStatus(
  id: number,
  status: OrderStatus,
  companyId: number,
  cancelReason?: string
): Order | null {
  const db = getDb();
  const order = getOrder(id, companyId);
  if (!order) return null;

  const flow = ["new", "confirmed", "preparing", "out-for-delivery", "delivered"] as const;
  const currentIdx = flow.indexOf(order.status as typeof flow[number]);
  // pending-approval and "terminal" statuses (cancelled, returned) are not in flow;
  // treat them as -1 so the backward-move guards don't fire on them.
  const targetIdx =
    status === "cancelled" || status === "returned" || status === "pending-approval"
      ? -1
      : flow.indexOf(status);
  // pending-approval must be resolved via approveOrder()/cancelPendingOrder() —
  // setOrderStatus bypasses stock-deduction logic.
  if (order.status === "pending-approval" || status === "pending-approval") {
    throw new Error(
      `Use /api/orders/${id}/approve to resolve a pending-approval order — setOrderStatus cannot.`
    );
  }
  const lockedFromHere = order.status === "out-for-delivery";
  if (lockedFromHere && targetIdx >= 0 && targetIdx < currentIdx) {
    throw new Error(
      `Cannot move order backwards from "${order.status}" to "${status}". Order is already out for delivery.`
    );
  }
  // Delivered is final except for a return. Returns are the only legal exit
  // from delivered; any other backward move still throws.
  if (order.status === "delivered" && status !== "delivered" && status !== "returned") {
    throw new Error(`Cannot move a delivered order backwards to "${status}".`);
  }
  if (order.status === "cancelled" && status !== "cancelled") {
    throw new Error(`Cannot un-cancel a cancelled order.`);
  }
  if (order.status === "returned" && status !== "returned") {
    throw new Error(`Cannot move a returned order back to "${status}". Returns are final.`);
  }

  // Stock moves are gated on `stockDeducted`. With the current model:
  //   - createOrder never deducts stock (inventory is held until dispatch).
  //   - the very first transition into "out-for-delivery" deducts stock
  //     and flips stockDeducted to true (idempotent — already-dispatched
  //     orders won't double-deduct thanks to the canMove-backwards guards).
  //   - cancellations only return stock that was previously deducted; orders
  //     cancelled before dispatch (stockDeducted=false) leave inventory alone.
  //   - un-cancelling a previously-cancelled order re-deducts only if stock
  //     had been taken away, then returned, before cancel.
  //   - returns (delivered → returned) restore stock since the goods came
  //     back. stockDeducted is flipped to false so the inventory is treated
  //     as resellable again.
  if (status === "cancelled" && order.status !== "cancelled" && order.stockDeducted) {
    applyOrderToStock(order, -1);
  }
  if (status !== "cancelled" && order.status === "cancelled" && order.stockDeducted) {
    applyOrderToStock(order, 1);
  }
  const willDeductOnDispatch =
    status === "out-for-delivery" &&
    order.status !== "out-for-delivery" &&
    !order.stockDeducted;
  if (willDeductOnDispatch) {
    applyOrderToStock(order, 1);
  }
  const willRestoreOnReturn =
    status === "returned" && order.stockDeducted;
  if (willRestoreOnReturn) {
    applyOrderToStock(order, -1);
  }

  const now = new Date().toISOString();
  const confirmedIdx = flow.indexOf("confirmed");
  const deliveredIdx = flow.indexOf("delivered");
  let confirmedAt = order.confirmedAt;
  let deliveredAt = order.deliveredAt;
  let cancelledAt = order.cancelledAt;
  let returnedAt = order.returnedAt;
  let returnReason = order.returnReason;
  // Track whether o.date needs to be re-written to the BD date of confirmedAt.
  // We do this whenever we first stamp confirmedAt = now so the displayed
  // "date" column reflects the confirmation time, not the create time.
  let dateOverride: string | null = null;
  if (targetIdx < currentIdx) {
    if (targetIdx < deliveredIdx) deliveredAt = "";
    if (targetIdx < confirmedIdx) confirmedAt = "";
  }
  if (status === "confirmed" && !confirmedAt) {
    confirmedAt = now;
    // Overwrite o.date with the BD local date of this confirmation so the
    // orders list, Today filter, and reports all reflect when the order was
    // actually locked in (not when it was created or scheduled).
    const bd = new Date(new Date(confirmedAt).getTime() + 6 * 60 * 60 * 1000);
    dateOverride = bd.toISOString().slice(0, 10);
  }
  if (status === "delivered" && !deliveredAt) deliveredAt = now;
  if (status === "cancelled" && !cancelledAt) cancelledAt = now;
  if (status === "returned" && !returnedAt) {
    returnedAt = now;
    returnReason = (cancelReason || "").trim();
  }
  // clear returned fields if moving AWAY from returned (shouldn't happen given
  // the guard above, but keep state clean if the caller bypasses)
  if (status !== "returned") {
    returnReason = "";
  }
  const finalReason =
    status === "cancelled" ? (cancelReason || "").trim() : "";

  let paid = order.paid;
  if (status === "delivered" && paid < order.total) paid = order.total;
  // Returns leave `paid` alone — refund handling happens out of band
  // (cash return, bKash send-money back, etc.) and isn't tracked here.

  // When the user just confirmed the order for the first time, push the
  // BD-local confirmation date into the orders.date column so lists/reports
  // that filter by date reflect confirmation time, not create time.
  const dateToWrite = dateOverride ?? order.date;

  db.prepare(
    `UPDATE orders SET status=?, date=?, confirmedAt=?, deliveredAt=?, cancelledAt=?, cancelReason=?, returnedAt=?, returnReason=?, paid=?, stockDeducted=?, updatedAt=? WHERE id=? AND companyId=?`
  ).run(
    status,
    dateToWrite,
    confirmedAt,
    deliveredAt,
    cancelledAt,
    finalReason,
    returnedAt,
    returnReason,
    paid,
    willDeductOnDispatch ? 1 : (willRestoreOnReturn ? 0 : (order.stockDeducted ? 1 : 0)),
    now,
    id,
    companyId
  );

  return getOrder(id, companyId) ?? null;
}

/**
 * Approve a WordPress order: deducts stock (if it wasn't already) and flips
 * the status from "pending-approval" to "new". Returns the updated order or
 * null if not found / not in a pending state.
 */
export function approveOrder(id: number, companyId: number): Order | null {
  const db = getDb();
  const order = getOrder(id, companyId);
  if (!order) return null;
  if (order.status !== "pending-approval") {
    throw new Error(
      `Order #${id} is "${order.status}", not "pending-approval" — cannot approve.`
    );
  }
  const now = new Date().toISOString();
  // Approval only flips the status from "pending-approval" → "new".
  // Stock is no longer deducted at approval time — it moves only when the
  // order is later transitioned to "delivered" (see setOrderStatus).
  db.prepare(
    `UPDATE orders SET status=?, updatedAt=? WHERE id=? AND companyId=?`
  ).run("new", now, id, companyId);
  return getOrder(id, companyId) ?? null;
}

/**
 * Reject a WordPress order: leaves stock untouched (since it was never
 * deducted) and flips status to "cancelled" with the supplied reason.
 */
export function cancelPendingOrder(
  id: number,
  reason: string,
  companyId: number
): Order | null {
  const db = getDb();
  const order = getOrder(id, companyId);
  if (!order) return null;
  if (order.status !== "pending-approval") {
    throw new Error(
      `Order #${id} is "${order.status}", not "pending-approval" — use setOrderStatus instead.`
    );
  }
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE orders SET status='cancelled', cancelledAt=?, cancelReason=?, stockDeducted=0, updatedAt=? WHERE id=? AND companyId=?`
  ).run(now, (reason || "").trim(), now, id, companyId);
  return getOrder(id, companyId) ?? null;
}

/**
 * Find an existing pending-approval order for a given WooCommerce order id.
 * Used to dedupe retries on the inbound webhook. Per-company so two companies
 * can reuse the same WP order ids without colliding.
 */
export function findPendingOrderByWpId(
  wpOrderId: string,
  companyId: number
): Order | undefined {
  const db = getDb();
  if (!wpOrderId) return undefined;
  const row = db
    .prepare(
      "SELECT * FROM orders WHERE wpOrderId = ? AND companyId = ? AND status = 'pending-approval'"
    )
    .get(wpOrderId, companyId) as Record<string, unknown> | undefined;
  return row ? rowToOrder(row) : undefined;
}

export function assignRider(
  orderId: number,
  riderId: number | null,
  companyId: number
): Order | null {
  const db = getDb();
  const order = getOrder(orderId, companyId);
  if (!order) return null;
  // Assigning without a sequence means "this rider has the order but no plan yet".
  // We do NOT auto-clear riderSeq on unassign — the caller is responsible.
  // riderName is also stamped on every assign so that, if the rider is later
  // hard-deleted, the snapshot on the order stays accurate.
  db.prepare(
    "UPDATE orders SET riderId = ?, riderName = COALESCE((SELECT name FROM riders WHERE id = ?), riderName), updatedAt = ? WHERE id = ? AND companyId = ?"
  ).run(riderId, riderId, new Date().toISOString(), orderId, companyId);
  return getOrder(orderId, companyId) ?? null;
}

// --- Route planning ---

/** Returns the shop's lat/lng for route planning. Falls back to Aftabnagar
 *  centroid if settings have no shop coords set yet. */
export function getShopLocation(companyId: number = DEFAULT_COMPANY_ID): { lat: number; lng: number } {
  try {
    const s = getSettings(companyId);
    if (typeof s.shopLat === "number" && typeof s.shopLng === "number") {
      return { lat: s.shopLat, lng: s.shopLng };
    }
  } catch {
    /* settings row may not exist yet during boot */
  }
  const c = getAreaCentroid("Aftabnagar");
  return { lat: c.lat, lng: c.lng };
}

/** Plan entry passed to setRiderPlan. Order IDs must be eligible (own-rider
 *  delivery mode, not delivered/cancelled, currently or about-to-be assigned
 *  to this rider). */
export interface RiderPlanEntry {
  orderId: number;
  /** 1-based visit sequence. */
  seq: number;
}

/**
 * Save a route plan for a rider: assign each order to the rider with the
 * given sequence, and unassign any of the rider's previously-planned orders
 * that are not in the new plan. Returns the count of orders saved.
 */
export function setRiderPlan(
  riderId: number,
  plan: RiderPlanEntry[],
  companyId: number
): { updated: number; unassigned: number } {
  const db = getDb();
  const now = new Date().toISOString();
  const setSeq = db.prepare(
    "UPDATE orders SET riderId = ?, riderName = COALESCE((SELECT name FROM riders WHERE id = ?), riderName), riderSeq = ?, updatedAt = ? WHERE id = ? AND companyId = ?"
  );
  const keepOrphanUnassigned = db.prepare(
    "UPDATE orders SET riderId = NULL, riderSeq = NULL, updatedAt = ? WHERE id = ? AND companyId = ?"
  );

  const inPlanIds = new Set(plan.map((p) => p.orderId));
  let updated = 0;
  const tx = db.transaction(() => {
    for (const p of plan) {
      setSeq.run(riderId, riderId, p.seq, now, p.orderId, companyId);
      updated += 1;
    }
    // Find orders currently assigned to this rider that are no longer in the
    // new plan and unassign them so the plan is the source of truth.
    const previous = db
      .prepare("SELECT id FROM orders WHERE riderId = ? AND companyId = ?")
      .all(riderId, companyId) as Array<{ id: number }>;
    let unassigned = 0;
    for (const r of previous) {
      if (!inPlanIds.has(r.id)) {
        keepOrphanUnassigned.run(now, r.id, companyId);
        unassigned += 1;
      }
    }
    return { updated, unassigned };
  });
  const result = tx();
  return result;
}

/** Clear a rider's plan (unassign all orders currently assigned to them). */
export function clearRiderPlan(riderId: number, companyId: number): number {
  const db = getDb();
  const now = new Date().toISOString();
  const r = db
    .prepare(
      "UPDATE orders SET riderId = NULL, riderSeq = NULL, updatedAt = ? WHERE riderId = ? AND companyId = ?"
    )
    .run(now, riderId, companyId);
  return r.changes;
}

/** Get all orders for a rider on a given BD date, ordered by riderSeq (NULLS LAST). */
export function getRiderPlanOrders(riderId: number, date: string, companyId: number): Order[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM orders
       WHERE riderId = ? AND date = ? AND companyId = ? AND deliveryMode != 'pathao'
       ORDER BY CASE WHEN riderSeq IS NULL THEN 1 ELSE 0 END, riderSeq ASC, id ASC`
    )
    .all(riderId, date, companyId) as Record<string, unknown>[];
  return rows.map(rowToOrder);
}

/** Cross-tenant variant of getRiderPlanOrders for the rider app: riders are
 *  shared across companies (per README), so the rider's job list is the
 *  union of their assignments on every tenant. The dispatcher dashboard
 *  (which is tenant-scoped) should keep using getRiderPlanOrders with an
 *  explicit companyId. */
export function getRiderAssignedOrdersAcrossTenants(
  riderId: number,
  date: string
): Order[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM orders
        WHERE riderId = ?
          AND date = ?
          AND deliveryMode != 'pathao'
        ORDER BY CASE WHEN riderSeq IS NULL THEN 1 ELSE 0 END,
                 riderSeq ASC,
                  id ASC`
    )
    .all(riderId, date) as Record<string, unknown>[];
  return rows.map(rowToOrder);
}

/** Lifetime aggregation for a rider: total deliveries, total COD collected,
 *  total rider payout, days worked, and a per-month breakdown for the last
 *  12 months. Aggregates over every tenant the rider is shared across, so
 *  the rider's number is the same number the dispatcher sees on every board. */
export interface RiderLifetimeStats {
  /** Day they first delivered (or null if never delivered). */
  firstDelivery: string | null;
  totalDelivered: number;
  totalFailed: number;
  totalCodCollected: number;
  totalPayout: number;
  /** Distinct calendar days the rider closed at least one delivery. */
  daysWorked: number;
  /** Last 12 calendar months, oldest → newest, ISO month key e.g. "2026-09". */
  monthly: Array<{
    month: string;
    delivered: number;
    failed: number;
    cod: number;
    payout: number;
  }>;
}

export function getRiderLifetimeStats(riderId: number): RiderLifetimeStats {
  const db = getDb();
  const overall = db
    .prepare(
      `SELECT
         SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS totalDelivered,
         SUM(CASE WHEN status IN ('cancelled', 'returned') THEN 1 ELSE 0 END) AS totalFailed,
         SUM(CASE WHEN status = 'delivered' AND paymentMethod = 'cod'
                  THEN MAX(0, total - COALESCE(paid, 0)) ELSE 0 END) AS totalCod,
         SUM(CASE WHEN status = 'delivered' THEN COALESCE(riderCost, 0) ELSE 0 END) AS totalPayout,
         MIN(CASE WHEN status = 'delivered' THEN date END) AS firstDelivery,
         COUNT(DISTINCT CASE WHEN status = 'delivered' THEN date END) AS daysWorked
       FROM orders
       WHERE riderId = ? AND deliveryMode != 'pathao'`,
    )
    .get(riderId) as
    | {
        totalDelivered: number | null;
        totalFailed: number | null;
        totalCod: number | null;
        totalPayout: number | null;
        firstDelivery: string | null;
        daysWorked: number | null;
      }
    | undefined;

  const now = new Date();
  const months: RiderLifetimeStats["monthly"] = [];
  for (let i = 11; i >= 0; i--) {
    const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    months.push({
      month: `${y}-${m}`,
      delivered: 0,
      failed: 0,
      cod: 0,
      payout: 0,
    });
  }
  const monthIndex = new Map(months.map((m, i) => [m.month, i]));
  const all = db
    .prepare(
      `SELECT status, date, paymentMethod, total, paid, riderCost
         FROM orders
         WHERE riderId = ?
           AND deliveryMode != 'pathao'
           AND date >= ?`,
    )
    .all(
      riderId,
      months[0].month + "-01",
    ) as Array<{
      status: string;
      date: string;
      paymentMethod: string;
      total: number;
      paid: number | null;
      riderCost: number | null;
    }>;

  for (const row of all) {
    const ym = row.date.slice(0, 7);
    const idx = monthIndex.get(ym);
    if (idx === undefined) continue;
    const bucket = months[idx];
    if (row.status === "delivered") {
      bucket.delivered += 1;
      if (row.paymentMethod === "cod") {
        bucket.cod += Math.max(0, row.total - (row.paid ?? 0));
      }
      bucket.payout += row.riderCost ?? 0;
    } else if (row.status === "cancelled" || row.status === "returned") {
      bucket.failed += 1;
    }
  }

  return {
    firstDelivery: overall?.firstDelivery ?? null,
    totalDelivered: overall?.totalDelivered ?? 0,
    totalFailed: overall?.totalFailed ?? 0,
    totalCodCollected: Math.round((overall?.totalCod ?? 0) * 100) / 100,
    totalPayout: Math.round((overall?.totalPayout ?? 0) * 100) / 100,
    daysWorked: overall?.daysWorked ?? 0,
    monthly: months,
  };
}

/** Single-order lookup that enforces the rider ↔ order ownership rule at
 *  the query level. Returns the order only if `riderId` is the rider whose
 *  id was passed in — the rider app never sees another rider's load.
 *  Tenant-agnostic on purpose (riders are shared across tenants). */
export function getRiderOrder(riderId: number, orderId: number): Order | undefined {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM orders WHERE id = ? AND riderId = ?")
    .get(orderId, riderId) as Record<string, unknown> | undefined;
  return row ? rowToOrder(row) : undefined;
}

/** Assign a freshly-generated tracking code to an order. Lazily populated on
 *  first transition into `out-for-delivery` so orders that never go out
 *  (cancelled before dispatch, etc.) don't burn a tracking code. Idempotent:
 *  if the order already has a tracking code, it's returned as-is. */
export function ensureOrderTrackingCode(orderId: number): string {
  const db = getDb();
  const row = db
    .prepare("SELECT trackingCode FROM orders WHERE id = ?")
    .get(orderId) as { trackingCode: string } | undefined;
  if (!row) return "";
  if (row.trackingCode) return row.trackingCode;
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateTrackingCode();
    try {
      db.prepare("UPDATE orders SET trackingCode = ? WHERE id = ? AND trackingCode = ''").run(code, orderId);
      return code;
    } catch (err) {
      if (attempt === 7) throw err;
    }
  }
  return row.trackingCode;
}

/** Get all unassigned own-rider orders for a date, eligible for planning. */
export function getUnassignedOrders(date: string, companyId: number): Order[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM orders
       WHERE riderId IS NULL AND date = ? AND companyId = ? AND deliveryMode != 'pathao' AND status != 'cancelled' AND status != 'delivered' AND status != 'pending-approval'
       ORDER BY id ASC`
    )
    .all(date, companyId) as Record<string, unknown>[];
  return rows.map(rowToOrder);
}

/** Get all currently-planned (assigned + sequenced) own-rider orders for a date,
 *  grouped by rider. Useful for the /routes landing page. */
export function getRidersWithPlans(date: string, companyId: number): Array<{ rider: Rider; orders: Order[]; totalDistanceMeters: number }> {
  const db = getDb();
  const riders = getActiveRiders();
  const result: Array<{ rider: Rider; orders: Order[]; totalDistanceMeters: number }> = [];
  for (const rider of riders) {
    const orders = getRiderPlanOrders(rider.id, date, companyId);
    if (orders.length === 0) continue;
    // Total distance is the sum of haversine distances from shop → first stop → ... → last stop.
    let total = 0;
    const shop = getShopLocation(companyId);
    let prev: { lat: number; lng: number } | null = shop;
    for (const o of orders) {
      if (typeof o.lat === "number" && typeof o.lng === "number" && prev) {
        total += haversineMeters(prev.lat, prev.lng, o.lat, o.lng);
        prev = { lat: o.lat, lng: o.lng };
      }
    }
    result.push({ rider, orders, totalDistanceMeters: total });
  }
  // Sort: most orders first, then by distance.
  result.sort((a, b) => b.orders.length - a.orders.length || a.totalDistanceMeters - b.totalDistanceMeters);
  return result;
}

export interface DispatchRow {
  rider: Rider;
  orders: Order[];
  podByOrderId: Record<number, {
    photoUploaded: boolean;
    otpVerified: boolean;
    amountCollected: number | null;
    expectedAmount: number | null;
    otpDispatchedAt: string | null;
    otpLast4: string | null;
    otpAttempts: number;
    otpExpired: boolean;
    /** True when the SMS adapter reported `ok: true` for the most recent
     *  send. False when BulksmsBD / other provider rejected the request
     *  (IP not whitelisted, bad key, sender ID unapproved, etc.). Lets the
     *  dispatch board surface 'OTP generated but SMS not delivered' instead
     *  of silently showing 'OTP sent' when no SMS actually went out. */
    otpSmsDelivered: boolean;
    otpSmsError: string | null;
    lastTransitionReason: string;
    lastTransitionActor: string;
  }>;
  totalDistanceMeters: number;
  pending: number;
  delivered: number;
  failed: number;
  totalCodDue: number;
  totalCodCollected: number;
}

/**
 * Tenant-scoped dispatch board: per-rider + per-order delivery snapshot for a
 * single date. Joins orders with their POD state and last status-history row
 * so the UI can show photo / OTP / COD state + the bypass/override flag
 * without N+1 queries.
 */
export function getDispatchBoard(
  date: string,
  companyId: number
): DispatchRow[] {
  const db = getDb();
  const riders = getActiveRiders();
  const result: DispatchRow[] = [];
  for (const rider of riders) {
    const orders = getRiderPlanOrders(rider.id, date, companyId);
    if (orders.length === 0) continue;
    const podByOrderId: DispatchRow["podByOrderId"] = {};
    let pending = 0;
    let delivered = 0;
    let failed = 0;
    let totalCodDue = 0;
    let totalCodCollected = 0;
    for (const o of orders) {
      if (o.status === "delivered") delivered += 1;
      else if (o.status === "cancelled" || o.status === "returned") failed += 1;
      else pending += 1;
      const pod = db
        .prepare(
          "SELECT photoPath, otpVerified, amountCollected, expectedAmount FROM proof_of_delivery WHERE orderId = ?"
        )
        .get(o.id) as
        | {
            photoPath: string | null;
            otpVerified: number | null;
            amountCollected: number | null;
            expectedAmount: number | null;
          }
        | undefined;
      const lastHistory = db
        .prepare(
          `SELECT reason, actorType, actorName FROM delivery_status_history
            WHERE orderId = ? ORDER BY createdAt DESC, id DESC LIMIT 1`
        )
        .get(o.id) as
        | { reason: string; actorType: string; actorName: string }
        | undefined;
      // Most recent OTP request — surfaces whether the dispatcher (or rider)
      // has already triggered a code for the customer. Returned even when
      // not yet verified, so the UI can show "OTP sent at HH:MM, waiting on
      // customer" vs. "no code sent yet".
      const lastOtp = db
        .prepare(
          `SELECT codeHash, createdAt, expiresAt, attempts, deliveredSms
             FROM delivery_otps
            WHERE orderId = ?
            ORDER BY createdAt DESC, id DESC
            LIMIT 1`
        )
        .get(o.id) as
        | { codeHash: string; createdAt: string; expiresAt: string; attempts: number; deliveredSms: number }
        | undefined;
        const otpLast4 = lastOtp ? otpLast4FromHash(lastOtp.codeHash) : null;
        // Pull the SMS error message (if any) from the most recent
        // otp_dispatched audit row. The reason format is
        // `otp_dispatched:last4=••XX:by=...:sms=ok` or `:sms=fail:err=<msg>`.
        const otpSmsError = (() => {
          if (!lastHistory?.reason) return null;
          if (!/otp_dispatched/.test(lastHistory.reason)) return null;
          if (!/:sms=fail/.test(lastHistory.reason)) return null;
          const m = lastHistory.reason.match(/:sms=fail:err=([^:]+)/);
          return m ? m[1] : "fail";
        })();
        podByOrderId[o.id] = {
          photoUploaded: !!pod?.photoPath,
          otpVerified: !!pod?.otpVerified,
          amountCollected: pod?.amountCollected ?? null,
          expectedAmount: pod?.expectedAmount ?? null,
          otpDispatchedAt: lastOtp?.createdAt ?? null,
          otpLast4: otpLast4 != null ? String(otpLast4).padStart(4, "0") : null,
          otpAttempts: lastOtp?.attempts ?? 0,
          otpExpired: lastOtp ? new Date(lastOtp.expiresAt).getTime() < Date.now() : false,
          otpSmsDelivered: lastOtp ? (lastOtp.deliveredSms ?? 0) === 1 : false,
          otpSmsError,
          lastTransitionReason: lastHistory?.reason ?? "",
          lastTransitionActor: lastHistory
            ? `${lastHistory.actorType}:${lastHistory.actorName}`
            : "",
        };
      if (o.status === "delivered" && o.paymentMethod === "cod") {
        totalCodDue += o.total - (o.paid || 0);
        if (pod?.amountCollected != null) totalCodCollected += pod.amountCollected;
      }
    }
    let total = 0;
    const shop = getShopLocation(companyId);
    let prev: { lat: number; lng: number } | null = shop;
    for (const o of orders) {
      if (typeof o.lat === "number" && typeof o.lng === "number" && prev) {
        total += haversineMeters(prev.lat, prev.lng, o.lat, o.lng);
        prev = { lat: o.lat, lng: o.lng };
      }
    }
    result.push({
      rider,
      orders,
      podByOrderId,
      totalDistanceMeters: total,
      pending,
      delivered,
      failed,
      totalCodDue,
      totalCodCollected,
    });
  }
  result.sort((a, b) => b.orders.length - a.orders.length || a.totalDistanceMeters - b.totalDistanceMeters);
  return result;
}

export interface CodReconciliationRow {
  riderId: number;
  riderName: string;
  totalDeliveredCodOrders: number;
  expectedAmount: number;
  collectedAmount: number;
  discrepancy: number;
  /** Count of orders where expected != collected (within rounding) — surface these for follow-up. */
  mismatchedOrders: number;
}

/**
 * Tenant-scoped daily COD reconciliation. For each rider who delivered at
 * least one COD order today, returns:
 *   - expectedAmount  = SUM of (order.total - order.paid) for delivered COD orders
 *   - collectedAmount = SUM of proof_of_delivery.amountCollected (which the
 *                        rider typed, may differ from expected — that's the
 *                        whole point of reconciliation)
 *   - discrepancy     = expectedAmount - collectedAmount (negative = rider
 *                        under-collected; positive = over-collected, which
 *                        usually means customer overpaid)
 *   - mismatchedOrders = count of orders where |expected − collected| > ৳0.5
 */
export function getCodReconciliation(
  date: string,
  companyId: number
): CodReconciliationRow[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT o.riderId AS riderId,
              COUNT(*)      AS n,
              SUM(CASE WHEN o.paid IS NULL OR o.paid = 0
                       THEN o.total
                       ELSE o.total - o.paid END) AS expectedAmount,
              SUM(CASE WHEN p.amountCollected IS NULL
                       THEN 0
                       ELSE p.amountCollected END) AS collectedAmount,
              SUM(CASE WHEN p.amountCollected IS NULL
                       THEN 1
                       WHEN ABS(p.amountCollected - (CASE WHEN o.paid IS NULL OR o.paid = 0
                                                          THEN o.total
                                                          ELSE o.total - o.paid END)) > 0.5
                       THEN 1
                       ELSE 0 END) AS mismatchedOrders
         FROM orders o
LEFT JOIN proof_of_delivery p ON p.orderId = o.id
         WHERE o.companyId = ?
           AND o.date = ?
           AND o.deliveryMode != 'pathao'
           AND o.status = 'delivered'
           AND o.paymentMethod = 'cod'
           AND o.riderId IS NOT NULL
         GROUP BY o.riderId`
    )
    .all(companyId, date) as Array<{
      riderId: number;
      n: number;
      expectedAmount: number;
      collectedAmount: number;
      mismatchedOrders: number;
    }>;
  const riders = getRiders();
  const riderNameById = new Map(riders.map((r) => [r.id, r.name]));
  return rows.map((r) => {
    const expected = Number(r.expectedAmount ?? 0);
    const collected = Number(r.collectedAmount ?? 0);
    return {
      riderId: r.riderId,
      riderName: riderNameById.get(r.riderId) ?? `#${r.riderId}`,
      totalDeliveredCodOrders: r.n,
      expectedAmount: expected,
      collectedAmount: collected,
      discrepancy: +(expected - collected).toFixed(2),
      mismatchedOrders: r.mismatchedOrders,
    };
  }).sort((a, b) => Math.abs(b.discrepancy) - Math.abs(a.discrepancy));
}

export interface OverrideFlaggedOrder {
  orderId: number;
  orderNo: string;
  customerName: string;
  customerPhone: string;
  area: string;
  total: number;
  paymentMethod: string;
  deliveredAt: string;
  overrideReason: string;
  overrideActor: string;
  /** Whether the POD gate was bypassed without a photo + otp verified (i.e.
   *  admin marked delivered despite incomplete POD, e.g. offline-rider
   *  recovery). These need manual customer follow-up. */
  podIncomplete: boolean;
}

/**
 * Tenant-scoped list of orders delivered today where the dispatch audit
 * trail shows admin override (e.g. from /api/orders/[id] PUT status
 * delivered without a complete POD). Used by the dispatch board to
 * highlight deliveries that need manual customer verification.
 */
export function getOverrideFlaggedOrders(
  date: string,
  companyId: number
): OverrideFlaggedOrder[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT o.id AS orderId,
              o.orderNo,
              o.customerName,
              o.customerPhone,
              o.area,
              o.total,
              o.paymentMethod,
              o.deliveredAt,
              h.reason AS overrideReason,
              h.actorName AS overrideActor,
              h.actorType,
              p.photoPath,
              p.otpVerified,
              p.amountCollected,
              p.expectedAmount
         FROM orders o
         JOIN delivery_status_history h
              ON h.orderId = o.id
             AND h.toStatus = 'delivered'
             AND h.reason LIKE 'admin_override_pod_bypass%'
         LEFT JOIN proof_of_delivery p ON p.orderId = o.id
        WHERE o.companyId = ?
          AND o.date = ?
          AND o.status = 'delivered'
          AND h.actorType = 'admin'
        GROUP BY o.id, h.id
        ORDER BY h.createdAt DESC`
    )
    .all(companyId, date) as Array<{
      orderId: number;
      orderNo: string;
      customerName: string;
      customerPhone: string;
      area: string;
      total: number;
      paymentMethod: string;
      deliveredAt: string;
      overrideReason: string;
      overrideActor: string;
      photoPath: string | null;
      otpVerified: number | null;
      amountCollected: number | null;
      expectedAmount: number | null;
    }>;
  return rows.map((r) => ({
    orderId: r.orderId,
    orderNo: r.orderNo,
    customerName: r.customerName,
    customerPhone: r.customerPhone,
    area: r.area,
    total: r.total,
    paymentMethod: r.paymentMethod,
    deliveredAt: r.deliveredAt,
    overrideReason: r.overrideReason,
    overrideActor: r.overrideActor,
    podIncomplete:
      !r.photoPath ||
      !r.otpVerified ||
      (r.paymentMethod === "cod" && r.amountCollected == null),
  }));
}

export interface OfflineQueuedSummary {
  /** Number of deliveries waiting in the offline queue (per-rider count from
   *  delivery_status_history where actorType='rider' and the order is still
   *  not at 'delivered'). This is a server-side approximation; the
   *  ground-truth IndexedDB queue lives on the device. */
  riderId: number;
  riderName: string;
  pending: number;
}

/**
 * Tenant-scoped approximation of "orders awaiting sync from a rider's
 * offline queue". We count orders in this tenant that have a recent rider
 * status-history entry but whose server-side status hasn't yet reached
 * 'delivered'. This is the dispatcher's view; the rider's own queue is the
 * source of truth.
 */
export function getOfflineQueuedSummary(
  date: string,
  companyId: number
): OfflineQueuedSummary[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT o.riderId AS riderId,
              COUNT(DISTINCT o.id) AS pending
         FROM orders o
         JOIN delivery_status_history h
              ON h.orderId = o.id
             AND h.actorType = 'rider'
             AND h.toStatus IN ('preparing', 'out-for-delivery')
        WHERE o.companyId = ?
          AND o.date = ?
          AND o.status NOT IN ('delivered', 'cancelled', 'returned')
        GROUP BY o.riderId`
    )
    .all(companyId, date) as Array<{ riderId: number; pending: number }>;
  const riders = getRiders();
  const nameById = new Map(riders.map((r) => [r.id, r.name]));
  return rows.map((r) => ({
    riderId: r.riderId,
    riderName: nameById.get(r.riderId) ?? `#${r.riderId}`,
    pending: r.pending,
  }));
}

// --- Auto-assign by cluster (v1 grid) ---
// Used by POST /api/routes/auto-assign. Round-robins unassigned, eligible
// (own-rider, non-cancelled, non-delivered, non-pending-approval) orders to
// the active riders who serve each cluster, respecting the rider's maxStops
// cap. Returns a per-rider + per-cluster summary so the UI can show what
// happened.

export interface AutoAssignResult {
  date: string;
  /** Cluster → how many orders were assigned in this cluster. */
  byCluster: Record<string, number>;
  /** Cluster → how many orders remained unassigned (e.g. no eligible rider). */
  unassignedByCluster: Record<string, number>;
  /** Rider id → count of orders just assigned to them in this call. */
  byRider: Record<number, number>;
  /** List of order ids that remained unassigned at the end. */
  unassignedOrderIds: number[];
}

export function autoAssignOrdersByCluster(date: string, companyId: number): AutoAssignResult {
  const db = getDb();
  const unassigned = getUnassignedOrders(date, companyId);
  const riders = getActiveRiders();

  // Build a map: cluster → [riders serving that cluster]
  const ridersByCluster: Record<string, Rider[]> = {};
  for (const r of riders) {
    const served = new Set<Rider["homeCluster"]>();
    if (r.homeCluster) served.add(r.homeCluster);
    for (const c of r.subClusters) served.add(c);
    for (const c of served) {
      if (!c) continue;
      const arr = (ridersByCluster[c] = ridersByCluster[c] ?? []);
      arr.push(r);
    }
  }

  // Count how many orders each rider is ALREADY carrying today (any status,
  // own-rider) so we don't blow past maxStops when adding more.
  const loadByRider = new Map<number, number>();
  const loadRows = db
    .prepare(
      `SELECT riderId, COUNT(*) AS n FROM orders
        WHERE date = ? AND companyId = ? AND riderId IS NOT NULL AND deliveryMode != 'pathao'
        GROUP BY riderId`
    )
    .all(date, companyId) as Array<{ riderId: number; n: number }>;
  for (const r of loadRows) loadByRider.set(r.riderId, r.n);

  // Round-robin pointer per cluster
  const cursor: Record<string, number> = {};
  const byCluster: Record<string, number> = {};
  const unassignedByCluster: Record<string, number> = {};
  const byRider: Record<number, number> = {};
  const assignedIds: number[] = [];

  const setAssign = db.prepare(
    "UPDATE orders SET riderId = ?, riderName = COALESCE((SELECT name FROM riders WHERE id = ?), riderName), updatedAt = ? WHERE id = ? AND companyId = ?"
  );
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    for (const order of unassigned) {
      const cluster = order.cluster ?? "DHK-E";
      const pool = ridersByCluster[cluster] ?? [];
      if (pool.length === 0) {
        unassignedByCluster[cluster] = (unassignedByCluster[cluster] ?? 0) + 1;
        continue;
      }
      // Walk the pool from the cursor until we find a rider that still has
      // capacity (load < maxStops, or no cap). This is a deterministic
      // round-robin weighted by available headroom.
      let picked: Rider | null = null;
      for (let i = 0; i < pool.length; i += 1) {
        const idx = ((cursor[cluster] ?? 0) + i) % pool.length;
        const candidate = pool[idx];
        const cur = loadByRider.get(candidate.id) ?? 0;
        if (candidate.maxStops == null || cur < candidate.maxStops) {
          picked = candidate;
          // Advance the cursor past this rider for the next order.
          cursor[cluster] = (idx + 1) % pool.length;
          break;
        }
      }
      if (!picked) {
        // All riders in this cluster have hit maxStops — leave unassigned.
        unassignedByCluster[cluster] = (unassignedByCluster[cluster] ?? 0) + 1;
        continue;
      }
      setAssign.run(picked.id, picked.id, now, order.id, companyId);
      assignedIds.push(order.id);
      byCluster[cluster] = (byCluster[cluster] ?? 0) + 1;
      byRider[picked.id] = (byRider[picked.id] ?? 0) + 1;
      loadByRider.set(picked.id, (loadByRider.get(picked.id) ?? 0) + 1);
    }
  });
  tx();

  return {
    date,
    byCluster,
    unassignedByCluster,
    byRider,
    unassignedOrderIds: unassigned
      .filter((o) => !assignedIds.includes(o.id))
      .map((o) => o.id),
  };
}

// --- Geo helpers (used by route-planner; kept here so db.ts is the only
//     place that needs to know about routing math for now). ---

/** Re-exported for callers that already import from db.ts. The implementation
 *  lives in `geo.ts` so the math stays in one place. */
// (haversineMeters is imported from "./geo" above)

export function deleteOrder(id: number, companyId: number): boolean {
  const db = getDb();
  const order = getOrder(id, companyId);
  if (!order) return false;
  // Only re-add stock if we actually deducted it. Pending-approval orders
  // never touched inventory, so deleting them is a pure no-op for stock.
  if (order.status !== "cancelled" && order.stockDeducted) applyOrderToStock(order, -1);
  const r = db.prepare("DELETE FROM orders WHERE id = ? AND companyId = ?").run(id, companyId);
  return r.changes > 0;
}

// --- Public API: Expenses ---

const ALLOWED_EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "utilities",
  "salary",
  "rent",
  "fuel",
  "packaging",
  "marketing",
  "maintenance",
  "office",
  "other",
];

const ALLOWED_EXPENSE_PAYMENT_METHODS: ExpensePaymentMethod[] = [
  "cash",
  "bkash",
  "bank",
  "other",
];

function normalizeExpenseCategory(s: unknown): ExpenseCategory {
  const v = String(s ?? "").toLowerCase().trim();
  return (ALLOWED_EXPENSE_CATEGORIES as string[]).includes(v)
    ? (v as ExpenseCategory)
    : "other";
}

function normalizeExpensePaymentMethod(s: unknown): ExpensePaymentMethod {
  const v = String(s ?? "").toLowerCase().trim();
  return (ALLOWED_EXPENSE_PAYMENT_METHODS as string[]).includes(v)
    ? (v as ExpensePaymentMethod)
    : "cash";
}

function rowToExpense(r: Record<string, unknown>): Expense {
  return {
    id: r.id as number,
    date: (r.date as string) ?? "",
    category: normalizeExpenseCategory(r.category),
    amount: (r.amount as number) ?? 0,
    vendor: (r.vendor as string) ?? "",
    paymentMethod: normalizeExpensePaymentMethod(r.paymentMethod),
    note: (r.note as string) ?? "",
    createdAt: (r.createdAt as string) ?? "",
    updatedAt: (r.updatedAt as string) ?? "",
    createdBy: (r.createdBy as string) ?? "",
  };
}

export interface ExpenseQuery {
  from?: string;
  to?: string;
  category?: ExpenseCategory | "all";
  limit?: number;
}

export function getExpenses(companyId: number, q: ExpenseQuery = {}): Expense[] {
  const db = getDb();
  const where: string[] = ["companyId = ?"];
  const params: Array<string | number> = [companyId];
  if (q.from) {
    where.push("date >= ?");
    params.push(q.from);
  }
  if (q.to) {
    where.push("date <= ?");
    params.push(q.to);
  }
  if (q.category && q.category !== "all") {
    where.push("category = ?");
    params.push(q.category);
  }
  const sql =
    "SELECT * FROM expenses" +
    ` WHERE ${where.join(" AND ")}` +
    " ORDER BY date DESC, id DESC" +
    (q.limit ? ` LIMIT ${Math.max(1, Math.min(500, q.limit | 0))}` : "");
  return (db.prepare(sql).all(...params) as Record<string, unknown>[]).map(rowToExpense);
}

export function getExpense(id: number, companyId: number): Expense | undefined {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM expenses WHERE id = ? AND companyId = ?")
    .get(id, companyId) as Record<string, unknown> | undefined;
  return row ? rowToExpense(row) : undefined;
}

export interface NewExpenseInput {
  date?: string;
  category?: ExpenseCategory;
  amount: number;
  vendor?: string;
  paymentMethod?: ExpensePaymentMethod;
  note?: string;
  createdBy?: string;
}

export function createExpense(input: NewExpenseInput, companyId: number): Expense {
  const db = getDb();
  if (!Number.isFinite(input.amount) || input.amount < 0) {
    throw new Error("Expense amount must be a non-negative number.");
  }
  const id = nextId(db, "expenses");
  const now = new Date().toISOString();
  const date = (input.date || todayStr()).trim();
  db.prepare(
    `INSERT INTO expenses (id, companyId, date, category, amount, vendor, paymentMethod, note, createdAt, updatedAt, createdBy)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    companyId,
    date,
    normalizeExpenseCategory(input.category),
    Math.round(input.amount * 100) / 100,
    String(input.vendor ?? "").trim(),
    normalizeExpensePaymentMethod(input.paymentMethod),
    String(input.note ?? "").trim(),
    now,
    now,
    String(input.createdBy ?? "").trim()
  );
  return getExpense(id, companyId)!;
}

export function updateExpense(
  id: number,
  data: Partial<NewExpenseInput>,
  companyId: number
): Expense | null {
  const db = getDb();
  const existing = getExpense(id, companyId);
  if (!existing) return null;
  if (data.amount !== undefined && (!Number.isFinite(data.amount) || data.amount < 0)) {
    throw new Error("Expense amount must be a non-negative number.");
  }
  const merged: Expense = {
    ...existing,
    date: data.date !== undefined ? String(data.date).trim() || existing.date : existing.date,
    category: data.category !== undefined ? normalizeExpenseCategory(data.category) : existing.category,
    amount: data.amount !== undefined ? Math.round(data.amount * 100) / 100 : existing.amount,
    vendor: data.vendor !== undefined ? String(data.vendor).trim() : existing.vendor,
    paymentMethod:
      data.paymentMethod !== undefined
        ? normalizeExpensePaymentMethod(data.paymentMethod)
        : existing.paymentMethod,
    note: data.note !== undefined ? String(data.note).trim() : existing.note,
    updatedAt: new Date().toISOString(),
  };
  db.prepare(
    `UPDATE expenses SET date=?, category=?, amount=?, vendor=?, paymentMethod=?, note=?, updatedAt=? WHERE id=? AND companyId=?`
  ).run(
    merged.date,
    merged.category,
    merged.amount,
    merged.vendor,
    merged.paymentMethod,
    merged.note,
    merged.updatedAt,
    id,
    companyId
  );
  return getExpense(id, companyId) ?? null;
}

export function deleteExpense(id: number, companyId: number): boolean {
  const db = getDb();
  const r = db
    .prepare("DELETE FROM expenses WHERE id = ? AND companyId = ?")
    .run(id, companyId);
  return r.changes > 0;
}

export interface ExpenseSummary {
  total: number;
  count: number;
  byCategory: Array<{ category: ExpenseCategory; total: number; count: number }>;
  byDay: Array<{ date: string; total: number; count: number }>;
}

export function getExpenseSummary(
  companyId: number,
  q: ExpenseQuery = {}
): ExpenseSummary {
  const list = getExpenses(companyId, q);
  const total = list.reduce((s, e) => s + e.amount, 0);
  const byCat = new Map<ExpenseCategory, { total: number; count: number }>();
  const byDay = new Map<string, { total: number; count: number }>();
  for (const e of list) {
    const c = byCat.get(e.category) ?? { total: 0, count: 0 };
    c.total += e.amount;
    c.count += 1;
    byCat.set(e.category, c);
    const d = byDay.get(e.date) ?? { total: 0, count: 0 };
    d.total += e.amount;
    d.count += 1;
    byDay.set(e.date, d);
  }
  return {
    total: Math.round(total * 100) / 100,
    count: list.length,
    byCategory: Array.from(byCat.entries())
      .map(([category, v]) => ({ category, total: Math.round(v.total * 100) / 100, count: v.count }))
      .sort((a, b) => b.total - a.total),
    byDay: Array.from(byDay.entries())
      .map(([date, v]) => ({ date, total: Math.round(v.total * 100) / 100, count: v.count }))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
  };
}

// --- Dashboard ---

export interface DashboardStats {
  today: {
    orders: number;
    revenue: number;
    delivered: number;
    pending: number;
    newCount: number;
    expenses: number;
    net: number;
  };
  monthlyRevenue: number;
  lowStock: Product[];
  activeRiders: Rider[];
  openOrders: Order[];
  newOrders: Order[];
}

export function getDashboard(companyId: number): DashboardStats {
  const db = getDb();
  const allOrders = getOrders(companyId);

  const todayOrders = allOrders.filter((o) => o.confirmedAt && isToday(o.confirmedAt));
  // Exclude returned orders from revenue — goods came back so the sale
  // didn't actually close. (paid stays in the column for accounting; just
  // don't add it to totals here.)
  const todayDelivered = allOrders.filter((o) => o.deliveredAt && isToday(o.deliveredAt) && o.status !== "returned");
  const todayRevenue = todayDelivered.reduce((s, o) => s + o.total, 0);

  const month = new Date().getMonth();
  const year = new Date().getFullYear();
  const monthlyRevenue = allOrders
    .filter((o) => {
      if (!o.deliveredAt) return false;
      if (o.status === "returned") return false;
      const d = new Date(o.deliveredAt);
      return d.getMonth() === month && d.getFullYear() === year;
    })
    .reduce((s, o) => s + o.total, 0);

  // Today's expenses (operational costs paid out today)
  const todayKey = todayStr();
  const todayExpensesList = getExpenses(companyId, { from: todayKey, to: todayKey });
  const todayExpenses = Math.round(
    todayExpensesList.reduce((s, e) => s + e.amount, 0) * 100
  ) / 100;
  const todayRevenueRounded = Math.round(todayRevenue * 100) / 100;

  return {
    today: {
      orders: todayOrders.length,
      revenue: todayRevenueRounded,
      delivered: todayDelivered.length,
      pending: todayOrders.filter((o) => !["delivered", "cancelled", "returned"].includes(o.status)).length,
      newCount: todayOrders.filter((o) => o.status === "new").length,
      expenses: todayExpenses,
      net: Math.round((todayRevenueRounded - todayExpenses) * 100) / 100,
    },
    monthlyRevenue: Math.round(monthlyRevenue),
    lowStock: getLowStock(companyId),
    activeRiders: getActiveRiders(),
    openOrders: allOrders
      .filter((o) => !["delivered", "cancelled", "returned", "new", "pending-approval"].includes(o.status))
      .sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : a.id - b.id))
      .slice(0, 20),
    newOrders: allOrders
      .filter((o) => o.status === "new")
      .sort((a, b) => (a.createdAt > b.createdAt ? -1 : a.createdAt < b.createdAt ? 1 : b.id - a.id)),
  };
}

// --- Public API: Suppliers ---

export function getSuppliers(companyId: number): Supplier[] {
  const db = getDb();
  return (
    db
      .prepare("SELECT * FROM suppliers WHERE companyId = ? ORDER BY id ASC")
      .all(companyId) as Record<string, unknown>[]
  ).map((r) => rowToSupplier(r, companyId));
}

export function getSupplier(id: number, companyId: number): Supplier | undefined {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM suppliers WHERE id = ? AND companyId = ?")
    .get(id, companyId) as Record<string, unknown> | undefined;
  return row ? rowToSupplier(row, companyId) : undefined;
}

/** What the API accepts on POST/PUT for a supplier. The legacy
 *  `category` CSV column is computed server-side from categoryIds. */
export interface NewSupplierInput {
  name: string;
  contact: string;
  phone: string;
  address: string;
  paymentTerms: string;
  notes: string;
  categoryIds: number[];
}

export function createSupplier(data: NewSupplierInput, companyId: number): Supplier {
  const db = getDb();
  const id = nextId(db, "suppliers");
  // Build a CSV from categoryIds for the legacy column so old code paths
  // that read `supplier.category` keep showing something.
  const legacyCsv = data.categoryIds
    .map((cid) => getCategory(cid, companyId)?.slug ?? "")
    .filter(Boolean)
    .join(",");
  db.prepare(
    `INSERT INTO suppliers (id, companyId, name, contact, phone, address, category, paymentTerms, notes, isActive, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
  ).run(
    id,
    companyId,
    data.name,
    data.contact,
    data.phone,
    data.address,
    legacyCsv,
    data.paymentTerms,
    data.notes,
    new Date().toISOString()
  );
  // Insert join-table rows in one transaction.
  replaceSupplierCategories(id, data.categoryIds, companyId);
  return getSupplier(id, companyId)!;
}

export function updateSupplier(
  id: number,
  data: Partial<NewSupplierInput>,
  companyId: number
): Supplier | null {
  const db = getDb();
  const existing = getSupplier(id, companyId);
  if (!existing) return null;
  const merged: Supplier = { ...existing, ...data, id: existing.id };
  const csvFromIds = (merged.categoryIds ?? [])
    .map((cid: number) => getCategory(cid, companyId)?.slug ?? "")
    .filter(Boolean)
    .join(",");
  db.prepare(
    `UPDATE suppliers SET name=?, contact=?, phone=?, address=?, category=?, paymentTerms=?, notes=?, isActive=? WHERE id=? AND companyId=?`
  ).run(
    merged.name,
    merged.contact,
    merged.phone,
    merged.address,
    csvFromIds,
    merged.paymentTerms,
    merged.notes,
    merged.isActive ? 1 : 0,
    id,
    companyId
  );
  if (data.categoryIds !== undefined) {
    replaceSupplierCategories(id, data.categoryIds, companyId);
  }
  return getSupplier(id, companyId) ?? null;
}

/** Replace the supplier↔category links for a given supplier. */
function replaceSupplierCategories(
  supplierId: number,
  categoryIds: number[],
  companyId: number
): void {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM supplier_categories WHERE supplierId = ? AND companyId = ?").run(
      supplierId,
      companyId
    );
    const insert = db.prepare(
      "INSERT INTO supplier_categories (supplierId, categoryId, companyId) VALUES (?, ?, ?)"
    );
    for (const cid of categoryIds) {
      insert.run(supplierId, cid, companyId);
    }
  });
  tx();
}

// --- Public API: Purchase Orders ---

function nextPoNumber(db: Database.Database): string {
  const now = new Date();
  const y = now.getFullYear();
  const seq = String(nextId(db, "purchaseOrders")).padStart(4, "0");
  return `PO-${y}-${seq}`;
}

export function getPurchaseOrders(companyId: number): PurchaseOrder[] {
  const db = getDb();
  return (
    db
      .prepare("SELECT * FROM purchase_orders WHERE companyId = ? ORDER BY id DESC")
      .all(companyId) as Record<string, unknown>[]
  ).map(rowToPurchaseOrder);
}

export function getPurchaseOrder(id: number, companyId: number): PurchaseOrder | undefined {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM purchase_orders WHERE id = ? AND companyId = ?")
    .get(id, companyId) as Record<string, unknown> | undefined;
  return row ? rowToPurchaseOrder(row) : undefined;
}

export interface NewPurchaseOrderInput {
  date: string;
  supplierId: number;
  items: Array<{ productId: number; qty: number; unitCost: number }>;
  expectedDate: string;
  note: string;
}

export function createPurchaseOrder(
  input: NewPurchaseOrderInput,
  companyId: number
): PurchaseOrder {
  const db = getDb();
  const id = nextId(db, "purchaseOrders");
  const now = new Date().toISOString();
  const items: PurchaseOrderItem[] = input.items.map((it) => {
    const p = getProduct(it.productId, companyId);
    return {
      productId: it.productId,
      name: p?.name || "Item",
      nameBn: p?.nameBn || "",
      unit: p?.unitCode || "kg",
      qty: it.qty,
      unitCost: it.unitCost,
      lineTotal: Math.round(it.qty * it.unitCost * 100) / 100,
    };
  });
  const subtotal = Math.round(items.reduce((s, it) => s + it.lineTotal, 0) * 100) / 100;
  db.prepare(
    `INSERT INTO purchase_orders (id, companyId, poNumber, date, supplierId, items, subtotal, status, expectedDate, receivedDate, note, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, '', ?, ?, ?)`
  ).run(
    id,
    companyId,
    nextPoNumber(db),
    input.date || todayStr(),
    input.supplierId,
    JSON.stringify(items),
    subtotal,
    input.expectedDate,
    input.note,
    now,
    now
  );
  return getPurchaseOrder(id, companyId)!;
}

export function updatePurchaseOrder(
  id: number,
  data: Partial<PurchaseOrder>,
  companyId: number
): PurchaseOrder | null {
  const db = getDb();
  const existing = getPurchaseOrder(id, companyId);
  if (!existing) return null;
  const merged: PurchaseOrder = { ...existing, ...data, id: existing.id, updatedAt: new Date().toISOString() };
  db.prepare(
    `UPDATE purchase_orders SET poNumber=?, date=?, supplierId=?, items=?, subtotal=?, status=?, expectedDate=?, receivedDate=?, note=?, updatedAt=? WHERE id=? AND companyId=?`
  ).run(
    merged.poNumber,
    merged.date,
    merged.supplierId,
    JSON.stringify(merged.items),
    merged.subtotal,
    merged.status,
    merged.expectedDate,
    merged.receivedDate,
    merged.note,
    merged.updatedAt,
    id,
    companyId
  );
  return getPurchaseOrder(id, companyId) ?? null;
}

export function setPurchaseOrderStatus(
  id: number,
  status: PurchaseOrderStatus,
  companyId: number
): PurchaseOrder | null {
  const db = getDb();
  const po = getPurchaseOrder(id, companyId);
  if (!po) return null;
  const now = new Date().toISOString();
  const receivedDate = status === "received" && !po.receivedDate ? todayStr() : po.receivedDate;

  const insMov = db.prepare(
    `INSERT INTO stock_movements (id, companyId, productId, type, qty, note, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  if (status === "received" && !po.receivedDate) {
    for (const item of po.items) {
      const p = db
        .prepare("SELECT stockQty, costPrice FROM products WHERE id = ? AND companyId = ?")
        .get(item.productId, companyId) as { stockQty: number; costPrice: number } | undefined;
      if (!p) continue;
      const newQty = Math.round((p.stockQty + item.qty) * 100) / 100;
      db.prepare(
        "UPDATE products SET stockQty = ?, costPrice = ?, updatedAt = ? WHERE id = ? AND companyId = ?"
      ).run(newQty, item.unitCost, now, item.productId, companyId);
      insMov.run(
        nextId(db, "stockMovements"),
        companyId,
        item.productId,
        "purchase",
        item.qty,
        `PO ${po.poNumber}`,
        now
      );
    }
  }
  if (status === "cancelled" && po.receivedDate) {
    for (const item of po.items) {
      const p = db
        .prepare("SELECT stockQty FROM products WHERE id = ? AND companyId = ?")
        .get(item.productId, companyId) as { stockQty: number } | undefined;
      if (!p) continue;
      const newQty = Math.max(0, Math.round((p.stockQty - item.qty) * 100) / 100);
      db.prepare(
        "UPDATE products SET stockQty = ?, updatedAt = ? WHERE id = ? AND companyId = ?"
      ).run(newQty, now, item.productId, companyId);
      insMov.run(
        nextId(db, "stockMovements"),
        companyId,
        item.productId,
        "wastage",
        item.qty,
        `Cancelled PO ${po.poNumber}`,
        now
      );
    }
  }
  db.prepare(
    `UPDATE purchase_orders SET status=?, receivedDate=?, updatedAt=? WHERE id=? AND companyId=?`
  ).run(status, status === "cancelled" ? "" : receivedDate, now, id, companyId);
  return getPurchaseOrder(id, companyId) ?? null;
}