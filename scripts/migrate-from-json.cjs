// One-time migration: data/db.json → data/meat_delivery.db
// Run with: node scripts/migrate-from-json.cjs
//
// Idempotent — if products already exist in SQLite, this script exits without
// touching the DB. Safe to run multiple times.

process.chdir(__dirname + "/..");

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const DATA_DIR = path.join(process.cwd(), "data");
const JSON_FILE = path.join(DATA_DIR, "db.json");
const DB_FILE = path.join(DATA_DIR, "meat_delivery.db");

if (!fs.existsSync(JSON_FILE)) {
  console.log("No db.json to migrate from. Exiting.");
  process.exit(0);
}
if (!fs.existsSync(path.dirname(DB_FILE))) fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

const data = JSON.parse(fs.readFileSync(JSON_FILE, "utf-8"));

const db = new Database(DB_FILE);
db.pragma("journal_mode = WAL");

const SCHEMA = require("./schema.cjs");
db.exec(SCHEMA);

const productsCount = db.prepare("SELECT COUNT(*) AS n FROM products").get().n;
if (productsCount > 0) {
  console.log(`Database already has ${productsCount} products. Nothing to do.`);
  db.close();
  process.exit(0);
}

const tx = db.transaction(() => {
  // settings
  if (data.settings) {
    db.prepare("INSERT OR REPLACE INTO settings (id, data) VALUES (?, ?)").run(1, JSON.stringify(data.settings));
  }
  // products
  const insProduct = db.prepare(`INSERT INTO products (id, sku, name, nameBn, category, unit, costPrice, sellPrice, marketPrice, stockQty, reorderLevel, isActive, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const p of Object.values(data.products || {})) {
    insProduct.run(p.id, p.sku, p.name, p.nameBn || "", p.category, p.unit || "kg",
      p.costPrice || 0, p.sellPrice || 0, p.marketPrice || 0, p.stockQty || 0,
      p.reorderLevel || 0, p.isActive ? 1 : 0, p.updatedAt || new Date().toISOString());
  }
  // customers
  const insCustomer = db.prepare(`INSERT INTO customers (id, name, phone, area, address, notes, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  for (const c of Object.values(data.customers || {})) {
    insCustomer.run(c.id, c.name, c.phone || "", c.area || "", c.address || "",
      c.notes || "", c.createdAt || new Date().toISOString());
  }
  // riders
  const insRider = db.prepare(`INSERT INTO riders (id, name, phone, vehicle, status, createdAt) VALUES (?, ?, ?, ?, ?, ?)`);
  for (const r of Object.values(data.riders || {})) {
    insRider.run(r.id, r.name, r.phone || "", r.vehicle || "", r.status || "active",
      r.createdAt || new Date().toISOString());
  }
  // orders
  const insOrder = db.prepare(`INSERT INTO orders (id, orderNo, date, customerId, customerName, customerPhone, area, address, items, subtotal, deliveryFee, discount, total, paid, paymentMethod, status, source, deliveryMode, pathaoTrackingId, pathaoFare, riderId, riderCost, note, createdAt, confirmedAt, deliveredAt, cancelledAt, cancelReason, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const o of Object.values(data.orders || {})) {
    insOrder.run(o.id, o.orderNo, o.date || "", o.customerId || null, o.customerName || "",
      o.customerPhone || "", o.area || "", o.address || "", JSON.stringify(o.items || []),
      o.subtotal || 0, o.deliveryFee || 0, o.discount || 0, o.total || 0, o.paid || 0,
      o.paymentMethod || "cod", o.status || "new", o.source || "manual", o.deliveryMode || "own",
      o.pathaoTrackingId || "", o.pathaoFare || 0, o.riderId || null, o.riderCost || 0,
      o.note || "", o.createdAt || new Date().toISOString(),
      o.confirmedAt || "", o.deliveredAt || "", o.cancelledAt || "", o.cancelReason || "",
      o.updatedAt || o.createdAt || new Date().toISOString());
  }
  // stock movements
  const insMovement = db.prepare(`INSERT INTO stock_movements (id, productId, type, qty, note, createdAt) VALUES (?, ?, ?, ?, ?, ?)`);
  for (const m of Object.values(data.stockMovements || {})) {
    insMovement.run(m.id, m.productId, m.type, m.qty || 0, m.note || "",
      m.createdAt || new Date().toISOString());
  }
  // suppliers
  const insSupplier = db.prepare(`INSERT INTO suppliers (id, name, contact, phone, address, category, paymentTerms, notes, isActive, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const s of Object.values(data.suppliers || {})) {
    insSupplier.run(s.id, s.name, s.contact || "", s.phone || "", s.address || "",
      s.category || "", s.paymentTerms || "", s.notes || "", s.isActive ? 1 : 0,
      s.createdAt || new Date().toISOString());
  }
  // purchase orders
  const insPo = db.prepare(`INSERT INTO purchase_orders (id, poNumber, date, supplierId, items, subtotal, status, expectedDate, receivedDate, note, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const p of Object.values(data.purchaseOrders || {})) {
    insPo.run(p.id, p.poNumber, p.date || "", p.supplierId, JSON.stringify(p.items || []),
      p.subtotal || 0, p.status || "draft", p.expectedDate || "", p.receivedDate || "",
      p.note || "", p.createdAt || new Date().toISOString(),
      p.updatedAt || p.createdAt || new Date().toISOString());
  }
  // next_ids
  const insNext = db.prepare(`INSERT INTO next_ids (name, value) VALUES (?, ?)`);
  for (const [name, value] of Object.entries(data.nextIds || {})) {
    insNext.run(name, value);
  }
});

tx();
db.close();
console.log("Migration complete. data/meat_delivery.db is ready.");