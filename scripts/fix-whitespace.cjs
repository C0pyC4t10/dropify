const Database = require("C:/Bazarey2.0/Meat Delivery/node_modules/better-sqlite3");
const db = new Database("C:/Bazarey2.0/Meat Delivery/data/meat_delivery.db");
let fixed = 0;
const prods = db.prepare("SELECT id, sku, name, nameBn FROM products").all();
for (const p of prods) {
  const clean = {
    name: (p.name || "").replace(/\s+/g, " ").trim(),
    nameBn: (p.nameBn || "").replace(/\s+/g, " ").trim(),
  };
  if (clean.name !== p.name || clean.nameBn !== p.nameBn) {
    db.prepare("UPDATE products SET name = ?, nameBn = ? WHERE id = ?").run(clean.name, clean.nameBn, p.id);
    fixed++;
    console.log("product #" + p.id + " sku=" + p.sku);
    console.log("  name:  '" + p.name + "' -> '" + clean.name + "'");
    console.log("  nameBn:'" + p.nameBn + "' -> '" + clean.nameBn + "'");
  }
}

// Same for order items in the JSON blobs.
const orders = db.prepare("SELECT id, items FROM orders").all();
const stmt = db.prepare("UPDATE orders SET items = ? WHERE id = ?");
let orderFixes = 0;
for (const o of orders) {
  let items;
  try { items = JSON.parse(o.items); } catch { continue; }
  let changed = false;
  if (Array.isArray(items)) {
    for (const it of items) {
      if (!it || typeof it !== "object") continue;
      const n = (it.name || "").replace(/\s+/g, " ").trim();
      const b = (it.nameBn || "").replace(/\s+/g, " ").trim();
      if (n !== it.name) { it.name = n; changed = true; }
      if (b !== it.nameBn) { it.nameBn = b; changed = true; }
    }
  }
  if (changed) {
    stmt.run(JSON.stringify(items), o.id);
    orderFixes++;
  }
}
console.log("\nProducts fixed: " + fixed + ", orders with item fixes: " + orderFixes);
db.close();
