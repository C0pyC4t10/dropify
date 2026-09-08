"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Plus, ArrowDownCircle, ArrowUpCircle, Search, Edit3, Trash2 } from "lucide-react";
import type { Product, Category, Unit, StockMovement } from "@/lib/types";
import { formatMoney, formatDateTime } from "@/lib/ui";
import { ExportMenu, type ExportColumn } from "@/components/export-menu";

export default function StockPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  /** `0` means "all categories"; otherwise an actual categoryId. */
  const [filter, setFilter] = useState<number>(0);
  const [query, setQuery] = useState("");
  const [showAdjust, setShowAdjust] = useState<Product | null>(null);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [showMovements, setShowMovements] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, m, cats, us] = await Promise.all([
        fetch("/api/products").then((r) => r.json()),
        fetch("/api/stock").then((r) => r.json()),
        fetch("/api/categories").then((r) => r.json()),
        fetch("/api/units").then((r) => r.json()),
      ]);
      setProducts(p);
      setMovements(m);
      setCategories(cats);
      setUnits(us);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  const productById = (id: number) => products.find((p) => p.id === id);

  const confirmDelete = async (p: Product) => {
    // Soft-stop: warn the user that orders using this product will fail to
    // resolve a name (but won't break — line items carry their own copied name).
    const ok = confirm(
      `Delete product "${p.name || p.sku}" (#${p.id})?\n\n` +
        `Past orders still keep a snapshot of this product's name + price, so they will not break.\n\n` +
        `This cannot be undone.`
    );
    if (!ok) return;
    setDeleting(p.id);
    setBanner(null);
    try {
      const res = await fetch(`/api/products/${p.id}`, { method: "DELETE", cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        setBanner({ kind: "err", text: `Delete failed: ${data?.error || res.status}` });
      } else {
        setBanner({ kind: "ok", text: `Deleted "${p.name || p.sku}".` });
        await load();
      }
    } catch (e) {
      setBanner({ kind: "err", text: `Error: ${String(e)}` });
    } finally {
      setDeleting(null);
      setTimeout(() => setBanner(null), 3500);
    }
  };

  const filtered = products.filter((p) => {
    if (filter !== 0 && p.categoryId !== filter) return false;
    if (query) {
      const q = query.toLowerCase();
      if (!p.name.toLowerCase().includes(q) && !p.nameBn.includes(query)) return false;
    }
    return true;
  });

  if (loading) {
    return <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>Loading...</div>;
  }

  return (
    <div>
      {banner && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            background:
              banner.kind === "ok"
                ? "color-mix(in srgb, var(--color-brand) 10%, transparent)"
                : "var(--tint-danger-12)",
            border:
              banner.kind === "ok"
                ? "1px solid color-mix(in srgb, var(--color-brand) 35%, transparent)"
                : "1px solid color-mix(in srgb, var(--color-danger) 35%, transparent)",
            color: banner.kind === "ok" ? "var(--accent-green)" : "var(--accent-red)",
            fontSize: 13,
            marginBottom: 14,
          }}
        >
          {banner.text}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Stock & Inventory</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <ExportMenu
            rows={filtered}
            cols={[
              { header: "SKU", get: (p) => p.sku },
              { header: "Name", get: (p) => p.name },
              { header: "Name (Bn)", get: (p) => p.nameBn },
              { header: "Category", get: (p) => p.categoryName },
              { header: "Unit", get: (p) => p.unitCode },
              { header: "Stock", get: (p) => p.stockQty },
              { header: "Reorder Level", get: (p) => p.reorderLevel },
              { header: "Cost Price", get: (p) => p.costPrice },
              { header: "Sell Price", get: (p) => p.sellPrice },
              { header: "Market Price", get: (p) => p.marketPrice },
              { header: "Active", get: (p) => (p.isActive ? "Yes" : "No") },
            ] as ExportColumn<Product>[]}
            filename="stock"
            title="Stock & Inventory"
            subtitle={filter === 0 ? "all categories" : (categories.find((c) => c.id === filter)?.name || "")}
            orientation="landscape"
            label="Export Products"
          />
          <button className="btn btn-secondary" onClick={() => setShowMovements(true)}>Movements</button>
          <Link href="/stock/new" className="btn btn-primary" style={{ textDecoration: "none" }}>
            <Plus size={15} /> Add Product
          </Link>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            key="all"
            onClick={() => setFilter(0)}
            className="btn"
            style={{
              fontSize: 12,
              background: filter === 0 ? "var(--tint-brand-18)" : "var(--bg-card)",
              color: filter === 0 ? "var(--accent-green)" : "var(--text-secondary)",
              border: `1px solid ${filter === 0 ? "color-mix(in srgb, var(--color-brand) 40%, transparent)" : "var(--border)"}`,
            }}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setFilter(c.id)}
              className="btn"
              style={{
                fontSize: 12,
                background: filter === c.id ? "var(--tint-brand-18)" : "var(--bg-card)",
                color: filter === c.id ? "var(--accent-green)" : "var(--text-secondary)",
                border: `1px solid ${filter === c.id ? "color-mix(in srgb, var(--color-brand) 40%, transparent)" : "var(--border)"}`,
              }}
            >
              {c.name}
            </button>
          ))}
        </div>
        <div style={{ position: "relative", width: 240 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: 10, color: "var(--text-muted)" }} />
          <input placeholder="Search product" value={query} onChange={(e) => setQuery(e.target.value)} style={{ paddingLeft: 32 }} />
        </div>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Product</th>
                <th>Category</th>
                <th>Stock</th>
                <th>Reorder Lvl</th>
                <th>Cost</th>
                <th>Sell</th>
                <th>Market</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={9} style={{ color: "var(--text-muted)", padding: 28, textAlign: "center" }}>No products found.</td></tr>
              )}
              {filtered.map((p) => {
                const low = p.stockQty <= p.reorderLevel;
                const margin = p.sellPrice > 0 ? Math.round(((p.sellPrice - p.costPrice) / p.sellPrice) * 100) : 0;
                return (
                  <tr key={p.id}>
                    <td style={{ color: "var(--text-muted)", fontSize: 12 }}>{p.sku}</td>
                    <td>
                      <span style={{ fontWeight: 500 }}>{p.name}</span>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{p.nameBn}{!p.isActive && <span style={{ color: "var(--accent-red)", marginLeft: 6 }}>(inactive)</span>}</div>
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: 11,
                          padding: "2px 8px",
                          borderRadius: 20,
                          background: "color-mix(in srgb, var(--color-brand) 10%, transparent)",
                          color: "var(--accent-green)",
                          border: "1px solid color-mix(in srgb, var(--color-brand) 30%, transparent)",
                        }}
                      >
                        {p.categoryName}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 700, color: low ? "var(--accent-red)" : p.stockQty === 0 ? "var(--accent-red)" : "var(--text-primary)" }}>
                        {p.stockQty} {p.unitCode}
                      </span>
                      {low && <span style={{ fontSize: 11, color: "var(--accent-red)", marginLeft: 6 }}>LOW</span>}
                    </td>
                    <td style={{ color: "var(--text-muted)" }}>{p.reorderLevel} {p.unitCode}</td>
                    <td>{formatMoney(p.costPrice)}</td>
                    <td style={{ fontWeight: 600 }}>{formatMoney(p.sellPrice)}</td>
                    <td style={{ color: "var(--text-muted)" }}>{formatMoney(p.marketPrice)}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <span style={{ fontSize: 11, color: "var(--text-muted)", marginRight: 8 }}>Margin {margin}%</span>
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: 11, padding: "4px 10px", marginRight: 4 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditProduct(p);
                        }}
                      >
                        <Edit3 size={12} /> Edit
                      </button>
                      <button className="btn btn-secondary" style={{ fontSize: 11, padding: "4px 10px" }} onClick={(e) => { e.stopPropagation(); setShowAdjust(p); }}>
                        <ArrowDownCircle size={13} /> Adjust
                      </button>
                      <button
                        className="btn btn-danger"
                        style={{ fontSize: 11, padding: "4px 10px" }}
                        onClick={(e) => { e.stopPropagation(); confirmDelete(p); }}
                        disabled={deleting === p.id}
                        title="Delete product"
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showAdjust && <AdjustStockModal product={showAdjust} onClose={() => setShowAdjust(null)} onSaved={load} />}
      {editProduct && <EditProductModal product={editProduct} onClose={() => setEditProduct(null)} onSaved={load} />}
      {showMovements && (
        <MovementModal
          movements={movements}
          productById={productById}
          onClose={() => setShowMovements(false)}
        />
      )}
    </div>
  );
}

function AdjustStockModal({ product, onClose, onSaved }: { product: Product; onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState<"purchase" | "wastage">("purchase");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    const n = parseFloat(qty);
    if (!n || n <= 0) {
      setError("Enter a valid quantity.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, type, qty: n, note }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      onSaved();
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 4px" }}>Adjust Stock</h2>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--text-muted)" }}>
          {product.name} ({product.nameBn}) — current: <b>{product.stockQty} {product.unitCode}</b>
        </p>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          <button
            className="btn"
            onClick={() => setType("purchase")}
            style={{
              flex: 1,
              background: type === "purchase" ? "var(--tint-brand-18)" : "var(--bg-primary)",
              color: type === "purchase" ? "var(--accent-green)" : "var(--text-secondary)",
              border: `1px solid ${type === "purchase" ? "color-mix(in srgb, var(--color-brand) 40%, transparent)" : "var(--border)"}`,
            }}
          >
            <ArrowUpCircle size={15} /> Stock In (purchase)
          </button>
          <button
            className="btn"
            onClick={() => setType("wastage")}
            style={{
              flex: 1,
              background: type === "wastage" ? "var(--tint-danger-18)" : "var(--bg-primary)",
              color: type === "wastage" ? "var(--accent-red)" : "var(--text-secondary)",
              border: `1px solid ${type === "wastage" ? "color-mix(in srgb, var(--color-danger) 40%, transparent)" : "var(--border)"}`,
            }}
          >
            <ArrowDownCircle size={15} /> Stock Out (wastage)
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
          <div>
            <label>Quantity ({product.unitCode})</label>
            <input type="number" min="0" step="0.1" value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div>
            <label>Note</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={type === "purchase" ? "Supplier, batch no." : "Reason for wastage"} />
          </div>
        </div>
        {error && <p style={{ color: "var(--accent-red)", fontSize: 13, margin: "12px 0 0" }}>{error}</p>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? "Saving..." : "Apply"}</button>
        </div>
      </div>
    </div>
  );
}

function MovementModal({
  movements,
  productById,
  onClose,
}: {
  movements: StockMovement[];
  productById: (id: number) => Product | undefined;
  onClose: () => void;
}) {
  const typeColor = (t: string) =>
    t === "purchase" ? "var(--accent-green)" : t === "sale" ? "var(--accent-blue)" : t === "wastage" ? "var(--accent-red)" : "var(--accent-amber)";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 680 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Stock Movements</h2>
          <ExportMenu
            rows={movements}
            cols={[
              { header: "Date", get: (m) => (m.createdAt || "").slice(0, 16).replace("T", " ") },
              { header: "Product", get: (m) => productById(m.productId)?.name || `#${m.productId}` },
              { header: "Type", get: (m) => m.type },
              { header: "Qty", get: (m) => m.qty },
              { header: "Note", get: (m) => m.note },
            ] as ExportColumn<StockMovement>[]}
            filename="stock-movements"
            title="Stock Movements"
            subtitle="all movements"
            orientation="landscape"
            label="Export"
          />
        </div>
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Product</th>
                <th>Type</th>
                <th>Qty</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {movements.length === 0 && (
                <tr><td colSpan={5} style={{ color: "var(--text-muted)", padding: 24, textAlign: "center" }}>No movements recorded.</td></tr>
              )}
              {movements.slice(0, 50).map((m) => {
                const p = productById(m.productId);
                return (
                  <tr key={m.id}>
                    <td style={{ color: "var(--text-muted)", whiteSpace: "nowrap" }}>{formatDateTime(m.createdAt)}</td>
                    <td>{p?.name || `#${m.productId}`}</td>
                    <td><span style={{ color: typeColor(m.type), fontWeight: 600, textTransform: "capitalize" }}>{m.type}</span></td>
                    <td style={{ fontWeight: 600 }}>{m.qty}</td>
                    <td style={{ color: "var(--text-muted)" }}>{m.note}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function EditProductModal({
  product,
  onClose,
  onSaved,
}: {
  product: Product;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [form, setForm] = useState({
    sku: product.sku,
    name: product.name,
    nameBn: product.nameBn,
    categoryId: product.categoryId,
    unitId: product.unitId,
    costPrice: String(product.costPrice),
    sellPrice: String(product.sellPrice),
    marketPrice: String(product.marketPrice),
    reorderLevel: String(product.reorderLevel),
    isActive: product.isActive,
  });
  const [stockDelta, setStockDelta] = useState("");
  const [stockNote, setStockNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/categories").then((r) => r.json()),
      fetch("/api/units").then((r) => r.json()),
    ]).then(([cats, us]) => {
      setCategories(cats as Category[]);
      setUnits(us as Unit[]);
    });
  }, []);

  const set = (k: string, v: string | boolean | number) =>
    setForm({ ...form, [k]: v });

  const submit = async () => {
    setError("");
    setSuccess("");
    if (!form.name.trim() || !form.sku.trim()) {
      setError("SKU and product name are required.");
      return;
    }
    if (!form.categoryId || !form.unitId) {
      setError("Pick a category and a unit before saving.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        sku: form.sku,
        name: form.name,
        nameBn: form.nameBn,
        categoryId: form.categoryId,
        unitId: form.unitId,
        isActive: form.isActive,
        costPrice: parseFloat(form.costPrice) || 0,
        sellPrice: parseFloat(form.sellPrice) || 0,
        marketPrice: parseFloat(form.marketPrice) || 0,
        reorderLevel: parseFloat(form.reorderLevel) || 0,
      };
      const res = await fetch(`/api/products/${product.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error);

      // Optional: also adjust stock (purchase or wastage) in the same modal
      const delta = parseFloat(stockDelta);
      if (delta && delta !== 0) {
        const type = delta > 0 ? "purchase" : "wastage";
        const qty = Math.abs(delta);
        const sr = await fetch("/api/stock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId: product.id,
            type,
            qty,
            note: stockNote || `Stock adjustment from Edit Product`,
          }),
        });
        if (!sr.ok) throw new Error((await sr.json()).error);
      }

      setSuccess("Saved.");
      onSaved();
      setTimeout(onClose, 600);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 560 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Edit Product</h2>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>ID #{product.id}</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div><label>SKU *</label><input value={form.sku} onChange={(e) => set("sku", e.target.value)} /></div>
          <div><label>Name *</label><input value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
          <div><label>Name (Bangla)</label><input value={form.nameBn} onChange={(e) => set("nameBn", e.target.value)} /></div>
          <div><label>Category</label>
            <select
              value={form.categoryId}
              onChange={(e) => set("categoryId", Number(e.target.value))}
            >
              {categories.length === 0 && <option value={0}>—</option>}
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div><label>Unit</label>
            <select
              value={form.unitId}
              onChange={(e) => set("unitId", Number(e.target.value))}
            >
              {units.length === 0 && <option value={0}>—</option>}
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.code} ({u.name})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Status</label>
            <select value={form.isActive ? "active" : "inactive"} onChange={(e) => set("isActive", e.target.value === "active")}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div><label>Cost Price (৳)</label><input type="number" value={form.costPrice} onChange={(e) => set("costPrice", e.target.value)} /></div>
          <div><label>Sell Price (৳)</label><input type="number" value={form.sellPrice} onChange={(e) => set("sellPrice", e.target.value)} /></div>
          <div><label>Market Price (৳)</label><input type="number" value={form.marketPrice} onChange={(e) => set("marketPrice", e.target.value)} /></div>
          <div><label>Reorder Level</label><input type="number" value={form.reorderLevel} onChange={(e) => set("reorderLevel", e.target.value)} /></div>
        </div>

        {/* Stock adjustment — optional, in the same modal */}
        <div
          style={{
            marginTop: 14,
            paddingTop: 14,
            borderTop: "1px solid var(--border)",
          }}
        >
          <label style={{ fontWeight: 600 }}>Adjust Stock (optional)</label>
          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "2px 0 8px" }}>
            Current stock: <b>{product.stockQty} {product.unitCode}</b>. Enter a positive number to add (purchase) or negative to subtract (wastage). Leave blank to skip.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8 }}>
            <input
              type="number"
              step="0.1"
              value={stockDelta}
              onChange={(e) => setStockDelta(e.target.value)}
              placeholder={`e.g. 10 or -2.5`}
            />
            <input
              value={stockNote}
              onChange={(e) => setStockNote(e.target.value)}
              placeholder="Reason / supplier / batch"
            />
          </div>
        </div>

        {error && <p style={{ color: "var(--accent-red)", fontSize: 13, margin: "12px 0 0" }}>{error}</p>}
        {success && <p style={{ color: "var(--accent-green)", fontSize: 13, margin: "12px 0 0" }}>{success}</p>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}