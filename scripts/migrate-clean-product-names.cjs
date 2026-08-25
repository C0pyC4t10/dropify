// One-shot migration: cleanup the products table and all orders.items JSON
// blobs so Bengali never sits in the English `name` field.
//
// Detection: if `name` contains any Bengali chars, move it into nameBn and
// leave `name` blank (or set a short English placeholder when possible).

const Database = require("C:/Bazarey2.0/Meat Delivery/node_modules/better-sqlite3");
const db = new Database("C:/Bazarey2.0/Meat Delivery/data/meat_delivery.db");
db.pragma("journal_mode = WAL");

const isBengali = (s) => /[\u0980-\u09FF]/.test(String(s || ""));

let productsFixed = 0;
let orderItemsFixed = 0;

// 1) Fix products table.
const products = db.prepare("SELECT id, name, nameBn, sku FROM products").all();
for (const p of products) {
  const newEn = isBengali(p.name) ? "" : p.name;
  const newBn = isBengali(p.name) ? p.name : (p.nameBn || "");
  if (newEn !== p.name || newBn !== (p.nameBn || "")) {
    db.prepare("UPDATE products SET name = ?, nameBn = ? WHERE id = ?").run(newEn, newBn, p.id);
    productsFixed++;
    console.log("product #" + p.id + " sku=" + p.sku + "  en='" + newEn + "'  bn='" + newBn + "'");
  }
}

// 2) Fix orders.items JSON for every WP-source order.
const orders = db.prepare("SELECT id, items FROM orders").all();
const stmt = db.prepare("UPDATE orders SET items = ? WHERE id = ?");

for (const o of orders) {
  let items;
  try { items = JSON.parse(o.items); } catch { continue; }
  if (!Array.isArray(items)) continue;
  let changed = false;
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const oldName = String(it.name || "");
    const oldBn = String(it.nameBn || "");
    if (isBengali(oldName)) {
      // Dump Bengali out of name and into nameBn (merging if nameBn also has data).
      const mergedBn = [oldBn, oldName].filter(Boolean).join(" ");
      it.name = "";
      it.nameBn = oldBn && oldBn !== oldName ? mergedBn : oldName || oldBn;
      changed = true;
    }
  }
  if (changed) {
    stmt.run(JSON.stringify(items), o.id);
    orderItemsFixed++;
  }
}

console.log("\nDone.");
console.log("Products fixed:    " + productsFixed);
console.log("Orders fixed:      " + orderItemsFixed);
db.close();
