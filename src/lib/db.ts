import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { normalizePhone, phonesMatch } from "./phone";
import { getAreaCentroid, listAreaCentroids } from "./area-centroids";
import { getLocationForArea } from "./locations";
import { haversineMeters } from "./geo";
import { geocodeAddress } from "./geocode";
import type {
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
  ProductCategory,
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
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY,
  data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  nameBn TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'kg',
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
  // Riders: homeCluster / subClusters / maxStops for the 4-cluster dispatch grid.
  const riderCols = (db.prepare("PRAGMA table_info(riders)").all() as Array<{ name: string }>).map(
    (c) => c.name
  );
  if (!riderCols.includes("homeCluster")) {
    db.exec("ALTER TABLE riders ADD COLUMN homeCluster TEXT");
    db.exec("ALTER TABLE riders ADD COLUMN subClusters TEXT NOT NULL DEFAULT '[]'");
    db.exec("ALTER TABLE riders ADD COLUMN maxStops INTEGER");
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
  const settingsRow = db.prepare("SELECT data FROM settings WHERE id = 1").get() as
    | { data: string }
    | undefined;
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
      db.prepare("UPDATE settings SET data = ? WHERE id = 1").run(JSON.stringify(parsed));
    }
  }
  // Seed default settings if empty
  const settingsCount = (db.prepare("SELECT COUNT(*) AS n FROM settings").get() as { n: number }).n;
  if (settingsCount === 0) {
    const defaults: Settings = {
      id: 1,
      businessName: "Bazarey Ltd",
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
    db.prepare("INSERT INTO settings (id, data) VALUES (?, ?)").run(1, JSON.stringify(defaults));
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
}

// --- Migration helper (kept for reference; primary migration done by scripts/migrate-from-json.cjs) ---
function migrateFromJson(): void {
  // No-op: one-time data/db.json → meat_delivery.db migration has already
  // been performed. db.json is retained as a fallback if the .db file is
  // ever deleted. See scripts/migrate-from-json.cjs.
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
    category: r.category as ProductCategory,
    unit: (r.unit as Unit) ?? "kg",
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
  };
}

function rowToSupplier(r: Record<string, unknown>): Supplier {
  return {
    id: r.id as number,
    name: r.name as string,
    contact: (r.contact as string) ?? "",
    phone: (r.phone as string) ?? "",
    address: (r.address as string) ?? "",
    category: (r.category as string) ?? "",
    paymentTerms: (r.paymentTerms as string) ?? "",
    notes: (r.notes as string) ?? "",
    isActive: (r.isActive as number) === 1,
    createdAt: r.createdAt as string,
  };
}

function rowToOrder(r: Record<string, unknown>): Order {
  return {
    id: r.id as number,
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
  const now = new Date();
  const y = now.getFullYear();
  const seq = String(nextId(db, "orders")).padStart(4, "0");
  return `MD-${y}-${seq}`;
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

export function getSettings(): Settings {
  migrateFromJson();
  const db = getDb();
  const row = db.prepare("SELECT data FROM settings WHERE id = 1").get() as
    | { data: string }
    | undefined;
  if (!row) throw new Error("settings missing");
  return JSON.parse(row.data) as Settings;
}

export function updateSettings(data: Partial<Settings>): Settings {
  migrateFromJson();
  const db = getDb();
  const current = getSettings();
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
  db.prepare("UPDATE settings SET data = ? WHERE id = 1").run(JSON.stringify(merged));
  return merged;
}

// --- Public API: Products & Stock ---

export function getProducts(): Product[] {
  migrateFromJson();
  const db = getDb();
  return (db.prepare("SELECT * FROM products ORDER BY id ASC").all() as Record<string, unknown>[]).map(
    rowToProduct
  );
}

export function getProduct(id: number): Product | undefined {
  migrateFromJson();
  const db = getDb();
  const row = db.prepare("SELECT * FROM products WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToProduct(row) : undefined;
}

/**
 * Remove a product from the catalog. Orders keep their own line-item copies,
 * so historical orders still render correctly. Returns true on success.
 */
export function deleteProduct(id: number): boolean {
  const db = getDb();
  const r = db.prepare("DELETE FROM products WHERE id = ?").run(id);
  return r.changes > 0;
}

export function createProduct(data: {
  sku: string;
  name: string;
  nameBn: string;
  category: ProductCategory;
  unit: Unit;
  costPrice: number;
  sellPrice: number;
  marketPrice: number;
  stockQty: number;
  reorderLevel: number;
}): Product {
  const db = getDb();
  const id = nextId(db, "products");
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO products (id, sku, name, nameBn, category, unit, costPrice, sellPrice, marketPrice, stockQty, reorderLevel, isActive, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
  ).run(
    id,
    data.sku,
    data.name,
    data.nameBn,
    data.category,
    data.unit,
    data.costPrice,
    data.sellPrice,
    data.marketPrice,
    data.stockQty,
    data.reorderLevel,
    now
  );
  db.prepare(
    `INSERT INTO stock_movements (id, productId, type, qty, note, createdAt) VALUES (?, ?, 'purchase', ?, 'Initial stock', ?)`
  ).run(nextId(db, "stockMovements"), id, data.stockQty, now);
  return getProduct(id)!;
}

export function updateProduct(id: number, data: Partial<Product>): Product | null {
  const db = getDb();
  const existing = getProduct(id);
  if (!existing) return null;
  const merged: Product = {
    ...existing,
    ...data,
    id: existing.id, // never overwrite
    updatedAt: new Date().toISOString(),
  };
  db.prepare(
    `UPDATE products SET sku=?, name=?, nameBn=?, category=?, unit=?, costPrice=?, sellPrice=?, marketPrice=?, stockQty=?, reorderLevel=?, isActive=?, updatedAt=? WHERE id=?`
  ).run(
    merged.sku,
    merged.name,
    merged.nameBn,
    merged.category,
    merged.unit,
    merged.costPrice,
    merged.sellPrice,
    merged.marketPrice,
    merged.stockQty,
    merged.reorderLevel,
    merged.isActive ? 1 : 0,
    merged.updatedAt,
    id
  );
  return merged;
}

export function adjustStock(
  productId: number,
  type: StockMovementType,
  qty: number,
  note: string
): Product | null {
  const db = getDb();
  const product = getProduct(productId);
  if (!product) return null;
  const delta = type === "sale" || type === "wastage" ? -qty : qty;
  const newQty = Math.max(0, product.stockQty + delta);
  const now = new Date().toISOString();
  db.prepare("UPDATE products SET stockQty = ?, updatedAt = ? WHERE id = ?").run(
    newQty,
    now,
    productId
  );
  db.prepare(
    `INSERT INTO stock_movements (id, productId, type, qty, note, createdAt) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(nextId(db, "stockMovements"), productId, type, qty, note, now);
  return getProduct(productId) ?? null;
}

export function getStockMovements(productId?: number): StockMovement[] {
  const db = getDb();
  const rows = productId
    ? (db
        .prepare("SELECT * FROM stock_movements WHERE productId = ? ORDER BY id DESC")
        .all(productId) as Record<string, unknown>[])
    : (db
        .prepare("SELECT * FROM stock_movements ORDER BY id DESC")
        .all() as Record<string, unknown>[]);
  return rows.map(rowToStockMovement);
}

export function getLowStock(): Product[] {
  return getProducts().filter((p) => p.isActive && p.stockQty <= p.reorderLevel);
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
 * Compute order stats for a single customer. Matches by `customerId` first
 * (the stable join), then falls back to phone/name matching for legacy rows
 * where customerId was never set. Excludes soft-deleted rows if any.
 */
export function getOrderStatsForCustomer(customerId: number): CustomerOrderStats {
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
       WHERE customerId = ?`
    )
    .get(customerId) as
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
}): Rider {
  const db = getDb();
  const id = nextId(db, "riders");
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO riders (id, name, phone, vehicle, status, homeCluster, subClusters, maxStops, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
  );
  return getRiders().find((r) => r.id === id)!;
}

export function updateRider(id: number, data: Partial<Rider>): Rider | null {
  const db = getDb();
  const existing = getRiders().find((r) => r.id === id);
  if (!existing) return null;
  const merged: Rider = { ...existing, ...data, id: existing.id };
  db.prepare(
    `UPDATE riders SET name=?, phone=?, vehicle=?, status=?, homeCluster=?, subClusters=?, maxStops=? WHERE id=?`
  ).run(
    merged.name,
    merged.phone,
    merged.vehicle,
    merged.status,
    merged.homeCluster,
    JSON.stringify(merged.subClusters ?? []),
    merged.maxStops,
    id,
  );
  return merged;
}

// --- Public API: Orders ---

export function getOrders(): Order[] {
  const db = getDb();
  return (db
    .prepare("SELECT * FROM orders ORDER BY id DESC")
    .all() as Record<string, unknown>[]).map(rowToOrder);
}

export function getOrder(id: number): Order | undefined {
  const db = getDb();
  const row = db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
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
   *  stays at `stockDeducted=false` until it transitions to "delivered".
   *  Kept on the signature so existing callers (webhooks) keep compiling. */
  skipStockDeduction?: boolean;
  /** Override initial status. Default `"new"`. Webhook passes `"pending-approval"`. */
  initialStatus?: OrderStatus;
}

function applyOrderToStock(order: Order, factor: 1 | -1) {
  const db = getDb();
  const insMov = db.prepare(
    `INSERT INTO stock_movements (id, productId, type, qty, note, createdAt) VALUES (?, ?, 'sale', ?, ?, ?)`
  );
  for (const item of order.items) {
    const p = db
      .prepare("SELECT stockQty FROM products WHERE id = ?")
      .get(item.productId) as { stockQty: number } | undefined;
    if (!p) continue;
    const newQty = Math.max(0, p.stockQty - item.qty * factor);
    db.prepare("UPDATE products SET stockQty = ?, updatedAt = ? WHERE id = ?").run(
      newQty,
      new Date().toISOString(),
      item.productId
    );
    if (factor === 1) {
      insMov.run(
        nextId(db, "stockMovements"),
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

export function createOrder(input: NewOrderInput): CreateOrderResult {
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
      .prepare("SELECT id FROM orders WHERE orderNo = ?")
      .get(candidate) as { id: number } | undefined;
    if (clash) {
      throw new Error(`Order #${candidate} already exists (id=${clash.id})`);
    }
    resolvedOrderNo = candidate;
  } else {
    resolvedOrderNo = nextOrderNo(db);
  }
  const items = input.items.map((it) => {
    const p = getProduct(it.productId);
    const lineTotal = Math.round(it.qty * it.unitPrice * 100) / 100;
    return {
      productId: it.productId,
      name: p?.name || "Item",
      nameBn: p?.nameBn || "",
      unit: p?.unit || ("kg" as Unit),
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
  // guaranteed to match. 36 columns → 36 ? placeholders → 36 .run() args.
  const cols: Array<string> = [
    "id", "orderNo", "date", "customerId", "customerName", "customerPhone",
    "area", "address", "items", "subtotal", "deliveryFee", "discount",
    "total", "paid", "paymentMethod", "status", "source", "deliveryMode",
    "pathaoTrackingId", "pathaoFare", "riderId", "riderCost", "note",
    "createdAt", "confirmedAt", "deliveredAt", "cancelledAt", "cancelReason",
    "returnedAt", "returnReason",
    "stockDeducted", "wpOrderId", "updatedAt", "lat", "lng", "riderSeq",
    "cluster", "subCluster",
  ];
  if (cols.length !== 38) {
    throw new Error(`orders INSERT column list length is ${cols.length}, expected 38`);
  }
  const placeholders = cols.map(() => "?").join(", ");
  const sql = `INSERT INTO orders (${cols.join(", ")}) VALUES (${placeholders})`;
  const stmt = db.prepare(sql);
  // Build value array in the same column order. riderId + riderSeq get explicit null.
  const values: Array<string | number | null> = [
    id,                                                // id
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
    order: getOrder(id)!,
    customerSaved,
    customerUpdated,
    customer: savedCustomer,
  };
}

export function updateOrder(id: number, data: Partial<Order>): Order | null {
  const db = getDb();
  const existing = getOrder(id);
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
       cancelledAt=?, cancelReason=?, returnedAt=?, returnReason=?, updatedAt=?, lat=?, lng=?, riderSeq=?, cluster=?, subCluster=? WHERE id=?`
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
    id
  );
  return getOrder(id) ?? null;
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
export async function geocodeAndRefineOrder(orderId: number): Promise<{
  updated: boolean;
  reason: "no-signal" | "no-improvement" | "improved" | "no-photon-result";
  before?: { lat: number; lng: number };
  after?: { lat: number; lng: number; source: string; confidence: number };
}> {
  const db = getDb();
  const order = getOrder(orderId);
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

  db.prepare("UPDATE orders SET lat = ?, lng = ?, updatedAt = ? WHERE id = ?").run(
    result.lat,
    result.lng,
    new Date().toISOString(),
    orderId,
  );

  return { updated: true, reason: "improved", before, after: result };
}

/**
 * Bulk re-geocode all orders for a date (or all orders if no date given).
 * Used by the "Refresh locations" admin button and the bulk-geocode script.
 * Returns counts and a small list of improvements (capped).
 */
export async function bulkGeocodeOrders(opts: { date?: string; limit?: number } = {}): Promise<{
  total: number;
  improved: number;
  noResult: number;
  errors: number;
  samples: Array<{ id: number; orderNo: string; area: string; before?: { lat: number; lng: number }; after: { lat: number; lng: number } }>;
}> {
  const all = getOrders();
  const filtered = opts.date ? all.filter((o) => o.date === opts.date) : all;
  const slice = opts.limit ? filtered.slice(0, opts.limit) : filtered;
  let improved = 0;
  let noResult = 0;
  let errors = 0;
  const samples: Array<{ id: number; orderNo: string; area: string; before?: { lat: number; lng: number }; after: { lat: number; lng: number } }> = [];
  for (const o of slice) {
    try {
      const res = await geocodeAndRefineOrder(o.id);
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
  cancelReason?: string
): Order | null {
  const db = getDb();
  const order = getOrder(id);
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
  //   - createOrder never deducts stock (inventory is held until delivery).
  //   - the very first transition into "delivered" deducts stock and flips
  //     stockDeducted to true (idempotent — already-delivered orders won't
  //     double-deduct thanks to the canMove-backwards guard above).
  //   - cancellations only return stock that was previously deducted; orders
  //     cancelled before delivery (stockDeducted=false) leave inventory alone.
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
  const willDeductOnDelivery =
    status === "delivered" && order.status !== "delivered" && !order.stockDeducted;
  if (willDeductOnDelivery) {
    applyOrderToStock(order, 1);
  }
  const willRestoreOnReturn =
    status === "returned" && order.status === "delivered" && order.stockDeducted;
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
    `UPDATE orders SET status=?, date=?, confirmedAt=?, deliveredAt=?, cancelledAt=?, cancelReason=?, returnedAt=?, returnReason=?, paid=?, stockDeducted=?, updatedAt=? WHERE id=?`
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
    willDeductOnDelivery ? 1 : (willRestoreOnReturn ? 0 : (order.stockDeducted ? 1 : 0)),
    now,
    id
  );

  return getOrder(id) ?? null;
}

/**
 * Approve a WordPress order: deducts stock (if it wasn't already) and flips
 * the status from "pending-approval" to "new". Returns the updated order or
 * null if not found / not in a pending state.
 */
export function approveOrder(id: number): Order | null {
  const db = getDb();
  const order = getOrder(id);
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
    `UPDATE orders SET status=?, updatedAt=? WHERE id=?`
  ).run("new", now, id);
  return getOrder(id) ?? null;
}

/**
 * Reject a WordPress order: leaves stock untouched (since it was never
 * deducted) and flips status to "cancelled" with the supplied reason.
 */
export function cancelPendingOrder(id: number, reason: string): Order | null {
  const db = getDb();
  const order = getOrder(id);
  if (!order) return null;
  if (order.status !== "pending-approval") {
    throw new Error(
      `Order #${id} is "${order.status}", not "pending-approval" — use setOrderStatus instead.`
    );
  }
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE orders SET status='cancelled', cancelledAt=?, cancelReason=?, stockDeducted=0, updatedAt=? WHERE id=?`
  ).run(now, (reason || "").trim(), now, id);
  return getOrder(id) ?? null;
}

/**
 * Find an existing pending-approval order for a given WooCommerce order id.
 * Used to dedupe retries on the inbound webhook.
 */
export function findPendingOrderByWpId(wpOrderId: string): Order | undefined {
  const db = getDb();
  if (!wpOrderId) return undefined;
  const row = db
    .prepare("SELECT * FROM orders WHERE wpOrderId = ? AND status = 'pending-approval'")
    .get(wpOrderId) as Record<string, unknown> | undefined;
  return row ? rowToOrder(row) : undefined;
}

export function assignRider(orderId: number, riderId: number | null): Order | null {
  const db = getDb();
  const order = getOrder(orderId);
  if (!order) return null;
  // Assigning without a sequence means "this rider has the order but no plan yet".
  // We do NOT auto-clear riderSeq on unassign — the caller is responsible.
  db.prepare("UPDATE orders SET riderId = ?, updatedAt = ? WHERE id = ?").run(
    riderId,
    new Date().toISOString(),
    orderId
  );
  return getOrder(orderId) ?? null;
}

// --- Route planning ---

/** Returns the shop's lat/lng for route planning. Falls back to Aftabnagar
 *  centroid if settings have no shop coords set yet. */
export function getShopLocation(): { lat: number; lng: number } {
  try {
    const s = getSettings();
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
export function setRiderPlan(riderId: number, plan: RiderPlanEntry[]): { updated: number; unassigned: number } {
  const db = getDb();
  const now = new Date().toISOString();
  const setSeq = db.prepare(
    "UPDATE orders SET riderId = ?, riderSeq = ?, updatedAt = ? WHERE id = ?"
  );
  const keepOrphanUnassigned = db.prepare(
    "UPDATE orders SET riderId = NULL, riderSeq = NULL, updatedAt = ? WHERE id = ?"
  );

  const inPlanIds = new Set(plan.map((p) => p.orderId));
  let updated = 0;
  const tx = db.transaction(() => {
    for (const p of plan) {
      setSeq.run(riderId, p.seq, now, p.orderId);
      updated += 1;
    }
    // Find orders currently assigned to this rider that are no longer in the
    // new plan and unassign them so the plan is the source of truth.
    const previous = db
      .prepare("SELECT id FROM orders WHERE riderId = ?")
      .all(riderId) as Array<{ id: number }>;
    let unassigned = 0;
    for (const r of previous) {
      if (!inPlanIds.has(r.id)) {
        keepOrphanUnassigned.run(now, r.id);
        unassigned += 1;
      }
    }
    return { updated, unassigned };
  });
  const result = tx();
  return result;
}

/** Clear a rider's plan (unassign all orders currently assigned to them). */
export function clearRiderPlan(riderId: number): number {
  const db = getDb();
  const now = new Date().toISOString();
  const r = db
    .prepare("UPDATE orders SET riderId = NULL, riderSeq = NULL, updatedAt = ? WHERE riderId = ?")
    .run(now, riderId);
  return r.changes;
}

/** Get all orders for a rider on a given BD date, ordered by riderSeq (NULLS LAST). */
export function getRiderPlanOrders(riderId: number, date: string): Order[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM orders
       WHERE riderId = ? AND date = ? AND deliveryMode != 'pathao'
       ORDER BY CASE WHEN riderSeq IS NULL THEN 1 ELSE 0 END, riderSeq ASC, id ASC`
    )
    .all(riderId, date) as Record<string, unknown>[];
  return rows.map(rowToOrder);
}

/** Get all unassigned own-rider orders for a date, eligible for planning. */
export function getUnassignedOrders(date: string): Order[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM orders
       WHERE riderId IS NULL AND date = ? AND deliveryMode != 'pathao' AND status != 'cancelled' AND status != 'delivered' AND status != 'pending-approval'
       ORDER BY id ASC`
    )
    .all(date) as Record<string, unknown>[];
  return rows.map(rowToOrder);
}

/** Get all currently-planned (assigned + sequenced) own-rider orders for a date,
 *  grouped by rider. Useful for the /routes landing page. */
export function getRidersWithPlans(date: string): Array<{ rider: Rider; orders: Order[]; totalDistanceMeters: number }> {
  const db = getDb();
  const riders = getActiveRiders();
  const result: Array<{ rider: Rider; orders: Order[]; totalDistanceMeters: number }> = [];
  for (const rider of riders) {
    const orders = getRiderPlanOrders(rider.id, date);
    if (orders.length === 0) continue;
    // Total distance is the sum of haversine distances from shop → first stop → ... → last stop.
    let total = 0;
    const shop = getShopLocation();
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

export function autoAssignOrdersByCluster(date: string): AutoAssignResult {
  const db = getDb();
  const unassigned = getUnassignedOrders(date);
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
        WHERE date = ? AND riderId IS NOT NULL AND deliveryMode != 'pathao'
        GROUP BY riderId`
    )
    .all(date) as Array<{ riderId: number; n: number }>;
  for (const r of loadRows) loadByRider.set(r.riderId, r.n);

  // Round-robin pointer per cluster
  const cursor: Record<string, number> = {};
  const byCluster: Record<string, number> = {};
  const unassignedByCluster: Record<string, number> = {};
  const byRider: Record<number, number> = {};
  const assignedIds: number[] = [];

  const setAssign = db.prepare(
    "UPDATE orders SET riderId = ?, updatedAt = ? WHERE id = ?"
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
      setAssign.run(picked.id, now, order.id);
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

export function deleteOrder(id: number): boolean {
  const db = getDb();
  const order = getOrder(id);
  if (!order) return false;
  // Only re-add stock if we actually deducted it. Pending-approval orders
  // never touched inventory, so deleting them is a pure no-op for stock.
  if (order.status !== "cancelled" && order.stockDeducted) applyOrderToStock(order, -1);
  const r = db.prepare("DELETE FROM orders WHERE id = ?").run(id);
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

export function getExpenses(q: ExpenseQuery = {}): Expense[] {
  const db = getDb();
  const where: string[] = [];
  const params: Array<string | number> = [];
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
    (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
    " ORDER BY date DESC, id DESC" +
    (q.limit ? ` LIMIT ${Math.max(1, Math.min(500, q.limit | 0))}` : "");
  return (db.prepare(sql).all(...params) as Record<string, unknown>[]).map(rowToExpense);
}

export function getExpense(id: number): Expense | undefined {
  const db = getDb();
  const row = db.prepare("SELECT * FROM expenses WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
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

export function createExpense(input: NewExpenseInput): Expense {
  const db = getDb();
  if (!Number.isFinite(input.amount) || input.amount < 0) {
    throw new Error("Expense amount must be a non-negative number.");
  }
  const id = nextId(db, "expenses");
  const now = new Date().toISOString();
  const date = (input.date || todayStr()).trim();
  db.prepare(
    `INSERT INTO expenses (id, date, category, amount, vendor, paymentMethod, note, createdAt, updatedAt, createdBy)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
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
  return getExpense(id)!;
}

export function updateExpense(id: number, data: Partial<NewExpenseInput>): Expense | null {
  const db = getDb();
  const existing = getExpense(id);
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
    `UPDATE expenses SET date=?, category=?, amount=?, vendor=?, paymentMethod=?, note=?, updatedAt=? WHERE id=?`
  ).run(
    merged.date,
    merged.category,
    merged.amount,
    merged.vendor,
    merged.paymentMethod,
    merged.note,
    merged.updatedAt,
    id
  );
  return getExpense(id) ?? null;
}

export function deleteExpense(id: number): boolean {
  const db = getDb();
  const r = db.prepare("DELETE FROM expenses WHERE id = ?").run(id);
  return r.changes > 0;
}

export interface ExpenseSummary {
  total: number;
  count: number;
  byCategory: Array<{ category: ExpenseCategory; total: number; count: number }>;
  byDay: Array<{ date: string; total: number; count: number }>;
}

export function getExpenseSummary(q: ExpenseQuery = {}): ExpenseSummary {
  const list = getExpenses(q);
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

export function getDashboard(): DashboardStats {
  const db = getDb();
  const allOrders = getOrders();

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
  const todayExpensesList = getExpenses({ from: todayKey, to: todayKey });
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
    lowStock: getLowStock(),
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

export function getSuppliers(): Supplier[] {
  const db = getDb();
  return (db
    .prepare("SELECT * FROM suppliers ORDER BY id ASC")
    .all() as Record<string, unknown>[]).map(rowToSupplier);
}

export function getSupplier(id: number): Supplier | undefined {
  const db = getDb();
  const row = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToSupplier(row) : undefined;
}

export function createSupplier(data: Omit<Supplier, "id" | "createdAt" | "isActive">): Supplier {
  const db = getDb();
  const id = nextId(db, "suppliers");
  db.prepare(
    `INSERT INTO suppliers (id, name, contact, phone, address, category, paymentTerms, notes, isActive, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
  ).run(
    id,
    data.name,
    data.contact,
    data.phone,
    data.address,
    data.category,
    data.paymentTerms,
    data.notes,
    new Date().toISOString()
  );
  return getSupplier(id)!;
}

export function updateSupplier(id: number, data: Partial<Supplier>): Supplier | null {
  const db = getDb();
  const existing = getSupplier(id);
  if (!existing) return null;
  const merged: Supplier = { ...existing, ...data, id: existing.id };
  db.prepare(
    `UPDATE suppliers SET name=?, contact=?, phone=?, address=?, category=?, paymentTerms=?, notes=?, isActive=? WHERE id=?`
  ).run(
    merged.name,
    merged.contact,
    merged.phone,
    merged.address,
    merged.category,
    merged.paymentTerms,
    merged.notes,
    merged.isActive ? 1 : 0,
    id
  );
  return merged;
}

// --- Public API: Purchase Orders ---

function nextPoNumber(db: Database.Database): string {
  const now = new Date();
  const y = now.getFullYear();
  const seq = String(nextId(db, "purchaseOrders")).padStart(4, "0");
  return `PO-${y}-${seq}`;
}

export function getPurchaseOrders(): PurchaseOrder[] {
  const db = getDb();
  return (db
    .prepare("SELECT * FROM purchase_orders ORDER BY id DESC")
    .all() as Record<string, unknown>[]).map(rowToPurchaseOrder);
}

export function getPurchaseOrder(id: number): PurchaseOrder | undefined {
  const db = getDb();
  const row = db.prepare("SELECT * FROM purchase_orders WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToPurchaseOrder(row) : undefined;
}

export interface NewPurchaseOrderInput {
  date: string;
  supplierId: number;
  items: Array<{ productId: number; qty: number; unitCost: number }>;
  expectedDate: string;
  note: string;
}

export function createPurchaseOrder(input: NewPurchaseOrderInput): PurchaseOrder {
  const db = getDb();
  const id = nextId(db, "purchaseOrders");
  const now = new Date().toISOString();
  const items: PurchaseOrderItem[] = input.items.map((it) => {
    const p = getProduct(it.productId);
    return {
      productId: it.productId,
      name: p?.name || "Item",
      nameBn: p?.nameBn || "",
      unit: p?.unit || ("kg" as Unit),
      qty: it.qty,
      unitCost: it.unitCost,
      lineTotal: Math.round(it.qty * it.unitCost * 100) / 100,
    };
  });
  const subtotal = Math.round(items.reduce((s, it) => s + it.lineTotal, 0) * 100) / 100;
  db.prepare(
    `INSERT INTO purchase_orders (id, poNumber, date, supplierId, items, subtotal, status, expectedDate, receivedDate, note, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, '', ?, ?, ?)`
  ).run(
    id,
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
  return getPurchaseOrder(id)!;
}

export function updatePurchaseOrder(id: number, data: Partial<PurchaseOrder>): PurchaseOrder | null {
  const db = getDb();
  const existing = getPurchaseOrder(id);
  if (!existing) return null;
  const merged: PurchaseOrder = { ...existing, ...data, id: existing.id, updatedAt: new Date().toISOString() };
  db.prepare(
    `UPDATE purchase_orders SET poNumber=?, date=?, supplierId=?, items=?, subtotal=?, status=?, expectedDate=?, receivedDate=?, note=?, updatedAt=? WHERE id=?`
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
    id
  );
  return merged;
}

export function setPurchaseOrderStatus(
  id: number,
  status: PurchaseOrderStatus
): PurchaseOrder | null {
  const db = getDb();
  const po = getPurchaseOrder(id);
  if (!po) return null;
  const now = new Date().toISOString();
  const receivedDate = status === "received" && !po.receivedDate ? todayStr() : po.receivedDate;

  const insMov = db.prepare(
    `INSERT INTO stock_movements (id, productId, type, qty, note, createdAt) VALUES (?, ?, ?, ?, ?, ?)`
  );
  if (status === "received" && !po.receivedDate) {
    for (const item of po.items) {
      const p = db
        .prepare("SELECT stockQty, costPrice FROM products WHERE id = ?")
        .get(item.productId) as { stockQty: number; costPrice: number } | undefined;
      if (!p) continue;
      const newQty = Math.round((p.stockQty + item.qty) * 100) / 100;
      db.prepare(
        "UPDATE products SET stockQty = ?, costPrice = ?, updatedAt = ? WHERE id = ?"
      ).run(newQty, item.unitCost, now, item.productId);
      insMov.run(
        nextId(db, "stockMovements"),
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
        .prepare("SELECT stockQty FROM products WHERE id = ?")
        .get(item.productId) as { stockQty: number } | undefined;
      if (!p) continue;
      const newQty = Math.max(0, Math.round((p.stockQty - item.qty) * 100) / 100);
      db.prepare("UPDATE products SET stockQty = ?, updatedAt = ? WHERE id = ?").run(
        newQty,
        now,
        item.productId
      );
      insMov.run(
        nextId(db, "stockMovements"),
        item.productId,
        "wastage",
        item.qty,
        `Cancelled PO ${po.poNumber}`,
        now
      );
    }
  }
  db.prepare(
    `UPDATE purchase_orders SET status=?, receivedDate=?, updatedAt=? WHERE id=?`
  ).run(status, status === "cancelled" ? "" : receivedDate, now, id);
  return getPurchaseOrder(id) ?? null;
}