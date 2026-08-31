"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Send,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  Trash2,
  Plus,
} from "lucide-react";
import type { Product, Settings } from "@/lib/types";
import { parseOrderFromText, type ParsedOrder, type ParsedOrderItem } from "@/lib/order-parser";
import { DHAKA_AREAS_FLAT } from "@/lib/ui";
import CustomerMatchBanner from "./customer-match-banner";

interface Props {
  products: Product[];
  settings: Settings | null;
}

const EMPTY_ITEM: ParsedOrderItem = {
  nameHint: "",
  quantity: 1,
  unitPrice: 0,
  unit: "kg",
  matchedProductId: null,
  confidence: 1,
  lineTotal: 0,
};

export default function OrderParseForm({ products, settings }: Props) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParsedOrder | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Stable catalog — only rebuild when products list itself changes.
  const catalog = useMemo(
    () =>
      products.map((p) => ({
        id: p.id,
        name: p.name,
        nameBn: p.nameBn,
        sku: p.sku,
        sellPrice: p.sellPrice,
        unit: p.unit,
      })),
    [products]
  );

  // Run parser on text change with a small debounce. Avoids re-running on every
  // render (catalog only recomputed when products array identity changes).
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!text.trim()) {
      setParsed(null);
      return;
    }
    debounceRef.current = setTimeout(() => {
      const result = parseOrderFromText({ text, products: catalog });
      setParsed(result);
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [text, catalog]);

  // Ctrl/Cmd+Enter shortcut from the textarea to submit.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        if (parsed && !submitting) submit();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, submitting]);

  const lowConfidence = parsed
    ? Math.min(
        parsed.confidence.customerName,
        parsed.confidence.customerPhone,
        parsed.confidence.items
      ) < 0.5
    : false;

  const reset = () => {
    setText("");
    setParsed(null);
    setBanner(null);
    textareaRef.current?.focus();
  };

  const submit = async () => {
    if (!parsed) return;
    setSubmitting(true);
    setBanner(null);
    try {
      // Drop items without a matched product to avoid 422.
      const finalItems = parsed.items
        .filter((it) => it.matchedProductId && it.quantity > 0 && it.unitPrice > 0)
        .map((it) => ({
          productId: it.matchedProductId,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
        }));
      if (finalItems.length === 0) {
        setBanner({ kind: "err", text: "At least one item must be matched to a product with a price. Review and edit first." });
        setSubmitting(false);
        return;
      }
      const res = await fetch("/api/orders/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parsed, finalItems, text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setBanner({ kind: "err", text: data.error || `Submit failed (HTTP ${res.status})` });
        setSubmitting(false);
        return;
      }
      setBanner({ kind: "ok", text: `Order #${data.order.orderNo} created. Pending review.` });
      setTimeout(() => router.push("/orders/approval"), 1100);
    } catch (e) {
      setBanner({ kind: "err", text: `Error: ${String(e)}` });
      setSubmitting(false);
    }
  };

  // Computed live totals on the form — items + delivery.
  const itemsSum = parsed
    ? parsed.items.reduce((s, it) => s + it.lineTotal, 0)
    : 0;
  const deliveryFee =
    parsed?.shippingMode === "inside_dhaka" ? 100 : parsed?.shippingMode === "outside_dhaka" ? 150 : 0;
  const computedTotal = itemsSum + deliveryFee;
  const totalHintDiff =
    parsed && parsed.totalHint
      ? Math.abs(parsed.totalHint - computedTotal)
      : null;

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
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
            <Link href="/orders" style={{ color: "var(--text-muted)", textDecoration: "none" }}>
              Orders
            </Link>
            <span>/</span>
            <span style={{ color: "var(--text-secondary)" }}>Quick Add</span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Quick Add — paste a customer message</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-muted)" }}>
            Paste a Facebook DM, WhatsApp, or phone note. We extract phone, items, totals. You review before submitting.
          </p>
        </div>
        <Link href="/orders" className="btn btn-secondary">
          <ArrowLeft size={15} /> Back
        </Link>
      </div>

      {banner && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            background: banner.kind === "ok" ? "rgba(77,158,71,0.10)" : "rgba(226,59,46,0.10)",
            border:
              banner.kind === "ok"
                ? "1px solid rgba(77,158,71,0.35)"
                : "1px solid rgba(226,59,46,0.35)",
            color: banner.kind === "ok" ? "var(--accent-green)" : "var(--accent-red)",
            fontSize: 13,
            marginBottom: 14,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {banner.kind === "ok" ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
          {banner.text}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16 }}>
        {/* ─── Left: paste textarea ─── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <section className="card" style={{ padding: 0 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 14px",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <span style={{ fontWeight: 700, fontSize: 14 }}>Customer message</span>
              <button
                className="btn btn-secondary"
                style={{ fontSize: 12, padding: "4px 10px" }}
                onClick={reset}
                type="button"
              >
                <RotateCcw size={12} /> Reset
              </button>
            </div>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={PLACEHOLDER}
              rows={20}
              spellCheck={false}
              autoFocus
              style={{
                width: "100%",
                padding: 14,
                fontFamily: 'inherit, "Courier New", monospace',
                fontSize: 13,
                lineHeight: 1.6,
                background: "transparent",
                color: "var(--text-primary)",
                border: "none",
                outline: "none",
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />
          </section>
          <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>
            Tip: <kbd style={kbdStyle}>Ctrl</kbd>+<kbd style={kbdStyle}>Enter</kbd> submits.{" "}
            {(parsed?.items.length || 0)} item(s) extracted.
          </p>
        </div>

        {/* ─── Right: parsed preview ─── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {parsed ? (
            <ParsePreview
              parsed={parsed}
              products={products}
              onPatch={(patch) => setParsed({ ...parsed, ...patch })}
              onItemsChange={(items) => setParsed({ ...parsed, items })}
              onAddItem={() =>
                setParsed({ ...parsed, items: [...parsed.items, { ...EMPTY_ITEM }] })
              }
              onRemoveItem={(idx) => {
                const next = parsed.items.filter((_, i) => i !== idx);
                setParsed({ ...parsed, items: next });
              }}
              onClearAllItems={() => setParsed({ ...parsed, items: [] })}
              disabled={submitting}
              itemsSum={itemsSum}
              deliveryFee={deliveryFee}
              computedTotal={computedTotal}
              totalHintDiff={totalHintDiff}
            />
          ) : (
            <section className="card" style={{ padding: 18, color: "var(--text-muted)" }}>
              Paste a message on the left — extracted fields will appear here.
            </section>
          )}

          <button
            className="btn btn-primary"
            onClick={submit}
            disabled={submitting || !parsed?.customerName || !parsed?.customerPhone || parsed?.items.length === 0}
            style={{ width: "100%", justifyContent: "center", padding: "10px 14px" }}
            type="button"
          >
            <Send size={15} />{" "}
            {submitting ? "Submitting…" : lowConfidence ? "Submit anyway" : "Submit for review"}
          </button>
          {parsed && lowConfidence && (
            <p style={{ fontSize: 12, color: "var(--accent-amber)", margin: 0, textAlign: "center" }}>
              Some fields have low confidence — review carefully before submitting.
            </p>
          )}
        </div>
      </div>

      <style>{FORM_CSS}</style>
    </div>
  );
}

const PLACEHOLDER = `Paste here. Example:

Kabir
Sec#12, R#07, H#12/14 (5th floor), Uttara, Dhaka.
Phone
01712935050
Payment via
Cash on delivery
Shipping method
Inside Dhaka
Product	Quantity	Total
🐐 দেশি ছাগলের মাংস — ১ কেজি
2	1,790.00৳`;

const FORM_CSS = `
  .qp-input { width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg-elev, transparent); color: var(--text-primary); font-family: inherit; font-size: 13px; }
  .qp-input:focus { outline: none; border-color: var(--accent-green); }
  .qp-input.num { text-align: right; font-variant-numeric: tabular-nums; }
  .qp-row { display: grid; grid-template-columns: 2fr 0.7fr 0.7fr auto; gap: 8px; align-items: start; margin-bottom: 8px; padding: 6px; border: 1px dashed var(--border); border-radius: 6px; }
  .qp-kbd { font-family: ui-monospace, monospace; font-size: 11px; padding: 1px 5px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg-elev); }
`;

const kbdStyle = {
  fontFamily: 'ui-monospace, monospace',
  fontSize: 11,
  padding: "1px 5px",
  border: "1px solid var(--border)",
  borderRadius: 4,
  background: "var(--bg-elev)",
};

function ParsePreview({
  parsed,
  products,
  onPatch,
  onItemsChange,
  onAddItem,
  onRemoveItem,
  onClearAllItems,
  disabled,
  itemsSum,
  deliveryFee,
  computedTotal,
  totalHintDiff,
}: {
  parsed: ParsedOrder;
  products: Product[];
  onPatch: (patch: Partial<ParsedOrder>) => void;
  onItemsChange: (items: ParsedOrderItem[]) => void;
  onAddItem: () => void;
  onRemoveItem: (idx: number) => void;
  onClearAllItems: () => void;
  disabled: boolean;
  itemsSum: number;
  deliveryFee: number;
  computedTotal: number;
  totalHintDiff: number | null;
}) {
  const cf = (val: number) => (val >= 0.85 ? "ok" : val >= 0.5 ? "warn" : "bad");
  const c = parsed.confidence;

  const setItem = (idx: number, patch: Partial<ParsedOrderItem>) => {
    onItemsChange(parsed.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const recalcLine = (idx: number, patch: Partial<ParsedOrderItem>) => {
    const updated = { ...parsed.items[idx], ...patch };
    const lt = Math.round((updated.unitPrice || 0) * (updated.quantity || 0) * 100) / 100;
    setItem(idx, { ...patch, lineTotal: lt });
  };

  return (
    <section className="card" style={{ padding: 18 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 14 }}>Extracted</span>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          Confidence {Math.round(((c.customerName + c.customerPhone + c.items) / 3) * 100)}%
        </span>
      </div>

      <Field label="Customer name" tone={cf(c.customerName)}>
        <input
          className="qp-input"
          value={parsed.customerName}
          onChange={(e) => onPatch({ customerName: e.target.value })}
          disabled={disabled}
          placeholder="Customer full name"
        />
      </Field>

      <Field label="Phone (BD)" tone={cf(c.customerPhone)}>
        <input
          className="qp-input num"
          value={parsed.customerPhone}
          onChange={(e) =>
            onPatch({ customerPhone: e.target.value, phoneRaw: e.target.value })
          }
          disabled={disabled}
          placeholder="+8801XXXXXXXXX or 01XXXXXXXXX"
        />
      </Field>

      <CustomerMatchBanner phone={parsed.customerPhone} compact />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Field label="Area" tone={cf(c.area)}>
          <select
            className="qp-input"
            value={parsed.area}
            onChange={(e) => onPatch({ area: e.target.value })}
            disabled={disabled}
          >
            <option value="">— pick —</option>
            {DHAKA_AREAS_FLAT.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
            <option value="Other">Other (type custom)…</option>
          </select>
        </Field>
        <Field label="Shipping method" tone={cf(c.shippingMode)}>
          <select
            className="qp-input"
            value={parsed.shippingMode}
            onChange={(e) =>
              onPatch({
                shippingMode: e.target.value as ParsedOrder["shippingMode"],
              })
            }
            disabled={disabled}
          >
            <option value="">— pick —</option>
            <option value="inside_dhaka">Inside Dhaka (+ ৳100)</option>
            <option value="outside_dhaka">Outside Dhaka (+ ৳150)</option>
          </select>
        </Field>
      </div>

      <Field label="Address" tone={cf(c.address)}>
        <textarea
          className="qp-input"
          value={parsed.address}
          onChange={(e) => onPatch({ address: e.target.value })}
          disabled={disabled}
          rows={2}
        />
      </Field>

      {/* Items */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 14,
          marginBottom: 6,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
          Items ({parsed.items.length})
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          {parsed.items.length > 0 && (
            <button
              type="button"
              onClick={onClearAllItems}
              disabled={disabled}
              className="btn btn-secondary"
              style={{ fontSize: 11, padding: "2px 8px" }}
            >
              Clear all
            </button>
          )}
          <button
            type="button"
            onClick={onAddItem}
            disabled={disabled}
            className="btn btn-secondary"
            style={{ fontSize: 11, padding: "2px 8px" }}
          >
            <Plus size={11} /> Add
          </button>
        </div>
      </div>

      {parsed.items.length === 0 && (
        <div
          style={{
            fontSize: 12,
            color: "var(--text-muted)",
            padding: 8,
            marginBottom: 8,
            border: "1px dashed var(--border)",
            borderRadius: 6,
            textAlign: "center",
          }}
        >
          No items detected. Click <strong>+ Add</strong> to add manually.
        </div>
      )}

      {parsed.items.map((it, i) => (
        <ItemRow
          key={i}
          index={i}
          item={it}
          products={products}
          disabled={disabled}
          onPatch={(patch) => recalcLine(i, patch)}
          onRemove={() => onRemoveItem(i)}
        />
      ))}

      {/* Totals summary */}
      <div
        style={{
          marginTop: 12,
          padding: "10px 12px",
          borderRadius: 8,
          background: "var(--bg-elev, rgba(255,255,255,0.02))",
          fontSize: 13,
        }}
      >
        <SummaryRow label="Items subtotal" value={`৳${Math.round(itemsSum).toLocaleString("en-IN")}`} />
        <SummaryRow label={`Delivery (${parsed.shippingMode === "inside_dhaka" ? "Inside Dhaka" : parsed.shippingMode === "outside_dhaka" ? "Outside Dhaka" : "auto"})`} value={deliveryFee > 0 ? `৳${deliveryFee.toLocaleString("en-IN")}` : "—"} />
        <SummaryRow
          label="Computed total"
          value={`৳${Math.round(computedTotal).toLocaleString("en-IN")}`}
          bold
        />
        {parsed.totalHint != null && totalHintDiff != null && (
          <div
            style={{
              fontSize: 12,
              marginTop: 6,
              color: totalHintDiff < 5 ? "var(--accent-green)" : "var(--accent-amber)",
            }}
          >
            {totalHintDiff < 5 ? "✓" : "⚠"} Text total hint: ৳{parsed.totalHint.toLocaleString("en-IN")} ·
            {" "}{totalHintDiff < 5 ? "matches computed" : `differs by ৳${Math.round(totalHintDiff).toLocaleString("en-IN")}`}
          </div>
        )}
      </div>

      {/* Payment + Note */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
        <Field label="Total hint (BDT)" tone={cf(c.totalHint)}>
          <input
            className="qp-input num"
            value={parsed.totalHint ?? ""}
            onChange={(e) =>
              onPatch({
                totalHint: e.target.value === "" ? null : Number(e.target.value),
              })
            }
            disabled={disabled}
            type="number"
            step="any"
            placeholder="0"
          />
        </Field>
        <Field label="Payment" tone={cf(c.paymentMethod)}>
          <select
            className="qp-input"
            value={parsed.paymentMethod}
            onChange={(e) =>
              onPatch({ paymentMethod: e.target.value as ParsedOrder["paymentMethod"] })
            }
            disabled={disabled}
          >
            <option value="cod">Cash on delivery (COD)</option>
            <option value="bkash">bKash</option>
            <option value="nagad">Nagad</option>
            <option value="card">Card</option>
            <option value="advance">Advance</option>
          </select>
        </Field>
      </div>
      <Field label="Note">
        <textarea
          className="qp-input"
          value={parsed.note}
          onChange={(e) => onPatch({ note: e.target.value })}
          disabled={disabled}
          rows={2}
        />
      </Field>
    </section>
  );
}

function SummaryRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: 8,
        padding: "3px 0",
      }}
    >
      <span
        style={{
          fontSize: 12,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.03em",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: bold ? 14 : 13,
          fontWeight: bold ? 700 : 500,
          fontVariantNumeric: "tabular-nums",
          color: bold ? "var(--accent-green)" : "var(--text-primary)",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function Field({
  label,
  tone,
  children,
}: {
  label: string;
  tone?: "ok" | "warn" | "bad";
  children: React.ReactNode;
}) {
  const dot =
    tone === "ok"
      ? "var(--accent-green)"
      : tone === "warn"
      ? "var(--accent-amber)"
      : tone === "bad"
      ? "var(--accent-red)"
      : "var(--text-muted)";
  return (
    <label style={{ display: "block", marginBottom: 10 }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--text-secondary)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 4,
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: 999,
            background: dot,
          }}
        />
        {label}
      </span>
      {children}
    </label>
  );
}

function ItemRow({
  index,
  item,
  products,
  disabled,
  onPatch,
  onRemove,
}: {
  index: number;
  item: ParsedOrderItem;
  products: Product[];
  disabled: boolean;
  onPatch: (patch: Partial<ParsedOrderItem>) => void;
  onRemove: () => void;
}) {
  const matched = item.matchedProductId
    ? products.find((p) => p.id === item.matchedProductId)
    : null;

  // Whether this item has a productId yet — without it, server will skip it.
  const isReady = item.matchedProductId && item.quantity > 0 && item.unitPrice > 0;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "2fr 0.7fr 0.7fr auto",
        gap: 8,
        alignItems: "start",
        marginBottom: 8,
        padding: 8,
        border: "1px dashed var(--border)",
        borderRadius: 6,
        background: isReady ? "rgba(77,158,71,0.04)" : "transparent",
      }}
    >
      <div>
        <select
          className="qp-input"
          value={item.matchedProductId ?? ""}
          onChange={(e) => {
            const v = Number(e.target.value);
            const p = products.find((x) => x.id === v);
            onPatch({
              matchedProductId: v || null,
              unitPrice: p?.sellPrice ?? item.unitPrice,
              unit: (p?.unit as "kg" | "pcs") ?? item.unit,
              nameHint: p
                ? `${p.name}${p.nameBn ? ` · ${p.nameBn}` : ""}`
                : item.nameHint,
            });
          }}
          disabled={disabled}
        >
          <option value="">— choose product —</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.nameBn || p.sku} ({p.sellPrice}/{(p as { unit: string }).unit})
            </option>
          ))}
        </select>
        {item.nameHint && item.matchedProductId == null && (
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
            Parsed from: {item.nameHint}
          </div>
        )}
      </div>
      <div>
        <input
          className="qp-input num"
          type="number"
          min="0"
          step="any"
          value={item.quantity}
          onChange={(e) => onPatch({ quantity: Number(e.target.value) || 0 })}
          disabled={disabled}
          placeholder="qty"
          style={{ textAlign: "right" }}
        />
        <div style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "right", marginTop: 2 }}>
          {item.unit}
        </div>
      </div>
      <div>
        <input
          className="qp-input num"
          type="number"
          min="0"
          step="any"
          value={item.unitPrice || ""}
          onChange={(e) =>
            onPatch({ unitPrice: e.target.value === "" ? 0 : Number(e.target.value) })
          }
          disabled={disabled}
          placeholder="৳/unit"
          style={{ textAlign: "right" }}
        />
        <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "right", marginTop: 2 }}>
          = ৳{item.lineTotal.toLocaleString("en-IN")}
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        className="btn btn-danger"
        style={{ fontSize: 11, padding: "4px 8px" }}
        title="Remove item"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}
