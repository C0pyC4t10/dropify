"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Package, Tag, Boxes } from "lucide-react";
import type { Product, Category, Unit } from "@/lib/types";
import { formatMoney } from "@/lib/ui";
import { useActiveCompany } from "@/lib/active-company";

interface FormState {
  sku: string;
  name: string;
  nameBn: string;
  categoryId: number;
  unitId: number;
  costPrice: string;
  sellPrice: string;
  marketPrice: string;
  stockQty: string;
  reorderLevel: string;
}

export default function NewProductPage() {
  const router = useRouter();
  const { activeCompany } = useActiveCompany();
  const isMeat = activeCompany?.slug === "meat";
  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [form, setForm] = useState<FormState>({
    sku: "",
    name: "",
    nameBn: "",
    categoryId: 0,
    unitId: 0,
    costPrice: "0",
    sellPrice: "0",
    marketPrice: "0",
    stockQty: "0",
    reorderLevel: "5",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  // Live margin preview so the operator can sanity-check prices before saving.
  const cost = parseFloat(form.costPrice) || 0;
  const sell = parseFloat(form.sellPrice) || 0;
  const market = parseFloat(form.marketPrice) || 0;
  const margin = sell > 0 ? Math.round(((sell - cost) / sell) * 100) : 0;
  const marginColor =
    margin >= 15 && margin <= 35
      ? "var(--accent-green)"
      : margin > 35
      ? "var(--accent-amber)"
      : "var(--accent-red)";

  const submit = async () => {
    setError("");
    if (!form.name.trim() || !form.sku.trim()) {
      setError("SKU and product name are required.");
      return;
    }
    if (cost < 0 || sell < 0 || market < 0) {
      setError("Prices cannot be negative.");
      return;
    }
    if (!form.categoryId || !form.unitId) {
      setError("Pick a category and a unit before saving.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: form.sku,
          name: form.name,
          nameBn: form.nameBn,
          categoryId: form.categoryId,
          unitId: form.unitId,
          costPrice: cost,
          sellPrice: sell,
          marketPrice: market,
          stockQty: parseFloat(form.stockQty) || 0,
          reorderLevel: parseFloat(form.reorderLevel) || 0,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      router.push("/stock");
      router.refresh();
    } catch (e) {
      setError(String(e));
      setSaving(false);
    }
  };

  // Load dropdown data once on mount — categories + units per tenant.
  useEffect(() => {
    Promise.all([
      fetch("/api/categories").then((r) => r.json()),
      fetch("/api/units").then((r) => r.json()),
    ])
      .then(([cats, us]) => {
        const catsTyped = cats as Category[];
        const usTyped = us as Unit[];
        setCategories(catsTyped);
        setUnits(usTyped);
        setForm((prev) => ({
          ...prev,
          categoryId: prev.categoryId || catsTyped[0]?.id || 0,
          unitId: prev.unitId || usTyped[0]?.id || 0,
        }));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ctrl/Cmd + S to save (desktop power-user shortcut)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (!saving) submit();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, saving]);

  return (
    <div>
      {/* Header bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              marginBottom: 4,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Link href="/stock" style={{ color: "var(--text-muted)", textDecoration: "none" }}>
              Stock
            </Link>
            <span>/</span>
            <span style={{ color: "var(--text-secondary)" }}>New Product</span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Add Product</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-muted)" }}>
            Create a new SKU in the catalog. You can adjust stock and edit details any time.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/stock" className="btn btn-secondary">
            <ArrowLeft size={15} /> Back
          </Link>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>
            <Save size={15} /> {saving ? "Saving..." : "Save Product"}
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            background: "var(--tint-danger-12)",
            border: "1px solid color-mix(in srgb, var(--color-danger) 35%, transparent)",
            color: "var(--accent-red)",
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        {/* Left column: form sections */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Identity */}
          <section className="card" style={{ padding: 18 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 14,
                paddingBottom: 12,
                borderBottom: "1px solid var(--border)",
              }}
            >
              <Tag size={16} color="var(--accent-green)" />
              <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)" }}>
                Identity
              </h2>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label>SKU *</label>
                <input
                  value={form.sku}
                  onChange={(e) => set("sku", e.target.value)}
                  placeholder="e.g. BEEF-BL"
                  autoFocus
                />
                <p style={hintStyle}>Short code used on invoices and PO lines.</p>
              </div>
              <div>
                <label>Product Name *</label>
                <input
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Beef Boneless"
                />
              </div>
              {isMeat && (
                <div>
                  <label>Name (Bangla)</label>
                  <input
                    value={form.nameBn}
                    onChange={(e) => set("nameBn", e.target.value)}
                    placeholder="গরুর মাংস বোনলেস"
                    style={{ fontFamily: '"Hind Siliguri", "Noto Sans Bengali", sans-serif' }}
                  />
                </div>
              )}
              <div>
                <label>Category</label>
                <select
                  value={form.categoryId}
                  onChange={(e) => set("categoryId", Number(e.target.value))}
                >
                  {categories.length === 0 && (
                    <option value={0}>— no categories yet —</option>
                  )}
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {categories.length === 0 && (
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                    Add categories in{" "}
                    <Link href="/admin/categories" style={{ color: "var(--accent-green)" }}>
                      /admin/categories
                    </Link>{" "}
                    first.
                  </div>
                )}
              </div>
              <div>
                <label>Unit</label>
                <select
                  value={form.unitId}
                  onChange={(e) => set("unitId", Number(e.target.value))}
                >
                  {units.length === 0 && <option value={0}>— no units yet —</option>}
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.code} ({u.name})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* Pricing */}
          <section className="card" style={{ padding: 18 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 14,
                paddingBottom: 12,
                borderBottom: "1px solid var(--border)",
              }}
            >
              <Package size={16} color="var(--accent-amber)" />
              <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)" }}>
                Pricing
              </h2>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
              <div>
                <label>Cost Price (৳)</label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={form.costPrice}
                  onChange={(e) => set("costPrice", e.target.value)}
                />
                <p style={hintStyle}>What you pay the supplier per / {units.find((u) => u.id === form.unitId)?.code || ""}.</p>
              </div>
              <div>
                <label>Sell Price (৳)</label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={form.sellPrice}
                  onChange={(e) => set("sellPrice", e.target.value)}
                />
                <p style={hintStyle}>The price customers pay per / {units.find((u) => u.id === form.unitId)?.code || ""}.</p>
              </div>
              <div>
                <label>Market Price (৳)</label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={form.marketPrice}
                  onChange={(e) => set("marketPrice", e.target.value)}
                />
                <p style={hintStyle}>Today's retail market rate — for margin comparison.</p>
              </div>
            </div>
            {/* Margin preview */}
            <div
              style={{
                marginTop: 14,
                padding: "10px 14px",
                borderRadius: 8,
                background: "color-mix(in srgb, var(--color-brand) 6%, transparent)",
                border: "1px solid color-mix(in srgb, var(--color-brand) 20%, transparent)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Margin
                </span>
                <span style={{ fontSize: 18, fontWeight: 700, color: marginColor, fontVariantNumeric: "tabular-nums" }}>
                  {sell > 0 ? `${margin}%` : "—"}
                </span>
              </div>
              <div style={{ display: "flex", gap: 14, fontSize: 12, color: "var(--text-muted)" }}>
                <span>
                  Profit / {units.find((u) => u.id === form.unitId)?.code || ""}:{" "}
                  <b style={{ color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
                    {formatMoney(Math.max(0, sell - cost))}
                  </b>
                </span>
                {market > 0 && (
                  <span>
                    vs Market:{" "}
                    <b
                      style={{
                        color: sell <= market ? "var(--accent-green)" : "var(--accent-amber)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {sell <= market ? "under" : "over"} market
                    </b>
                  </span>
                )}
              </div>
            </div>
          </section>

          {/* Inventory */}
          <section className="card" style={{ padding: 18 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 14,
                paddingBottom: 12,
                borderBottom: "1px solid var(--border)",
              }}
            >
              <Boxes size={16} color="var(--accent-blue, #5aa8ff)" />
              <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)" }}>
                Inventory
              </h2>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label>Initial Stock ({units.find((u) => u.id === form.unitId)?.code || ""})</label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={form.stockQty}
                  onChange={(e) => set("stockQty", e.target.value)}
                />
                <p style={hintStyle}>
                  Use a Purchase Order for bulk stock-in. This field is for opening balance only.
                </p>
              </div>
              <div>
                <label>Reorder Level ({units.find((u) => u.id === form.unitId)?.code || ""})</label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={form.reorderLevel}
                  onChange={(e) => set("reorderLevel", e.target.value)}
                />
                <p style={hintStyle}>Dashboard will flag this product when stock falls below this.</p>
              </div>
            </div>
          </section>
        </div>

        {/* Right column: summary */}
        <aside style={{ position: "sticky", top: 70, alignSelf: "flex-start" }}>
          <section className="card" style={{ padding: 18 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 14px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)" }}>
              Summary
            </h2>
            <SummaryRow label="Name" value={form.name || "—"} />
            {isMeat && <SummaryRow label="Bangla" value={form.nameBn || "—"} bn />}
            <SummaryRow label="Category" value={categories.find((c) => c.id === form.categoryId)?.name || "—"} />
            <SummaryRow label="Unit" value={units.find((u) => u.id === form.unitId)?.code || ""} />
            <div style={{ height: 1, background: "var(--border)", margin: "10px 0" }} />
            <SummaryRow label="Cost" value={formatMoney(cost)} />
            <SummaryRow label="Sell" value={formatMoney(sell)} highlight />
            <SummaryRow label="Market" value={formatMoney(market)} />
            <div style={{ height: 1, background: "var(--border)", margin: "10px 0" }} />
            <SummaryRow label="Stock" value={`${form.stockQty} ${units.find((u) => u.id === form.unitId)?.code || ""}`} />
            <SummaryRow label="Reorder at" value={`${form.reorderLevel} ${units.find((u) => u.id === form.unitId)?.code || ""}`} />
          </section>

          <button
            className="btn btn-primary"
            onClick={submit}
            disabled={saving}
            style={{ width: "100%", marginTop: 12, justifyContent: "center" }}
          >
            <Save size={15} /> {saving ? "Saving..." : "Save Product"}
          </button>
          <Link
            href="/stock"
            className="btn btn-secondary"
            style={{ width: "100%", marginTop: 8, justifyContent: "center", textDecoration: "none" }}
          >
            Cancel
          </Link>
          <p
            style={{
              marginTop: 12,
              fontSize: 11,
              color: "var(--text-muted)",
              textAlign: "center",
            }}
          >
            Tip: Ctrl + S to save
          </p>
        </aside>
      </div>
    </div>
  );
}

const hintStyle: React.CSSProperties = {
  margin: "4px 0 0",
  fontSize: 11,
  color: "var(--text-muted)",
};

function SummaryRow({
  label,
  value,
  highlight,
  bn,
}: {
  label: string;
  value: React.ReactNode;
  highlight?: boolean;
  bn?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: 8,
        padding: "5px 0",
      }}
    >
      <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </span>
      <span
        style={{
          fontSize: 13,
          color: highlight ? "var(--accent-green)" : "var(--text-primary)",
          fontWeight: highlight ? 700 : 500,
          textAlign: "right",
          maxWidth: "60%",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontFamily: bn ? '"Hind Siliguri", "Noto Sans Bengali", sans-serif' : undefined,
        }}
        title={typeof value === "string" || typeof value === "number" ? String(value) : undefined}
      >
        {value}
      </span>
    </div>
  );
}