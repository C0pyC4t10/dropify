"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Save,
  User,
  MapPin,
  AlertTriangle,
  Trash2,
  ShoppingBag,
  XCircle,
  CheckCircle2,
  Clock,
  Package,
} from "lucide-react";
import { formatDate, formatMoney, DHAKA_AREAS_FLAT } from "@/lib/ui";
import { isLikelyBdMobile, normalizePhone } from "@/lib/phone";

interface FormState {
  name: string;
  phone: string;
  area: string;
  customArea: string;
  address: string;
  notes: string;
}

interface CustomerOrderItem {
  productId?: number;
  name: string;
  nameBn?: string;
  unit: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

interface CustomerOrder {
  id: number;
  orderNo: string;
  date: string;
  customerPhone: string;
  customerName: string;
  status: string;
  items: CustomerOrderItem[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  createdAt: string;
}

export default function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [form, setForm] = useState<FormState>({
    name: "",
    phone: "",
    area: "",
    customArea: "",
    address: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [stats, setStats] = useState<{
    orders: number;
    delivered: number;
    cancelled: number;
    inProgress: number;
    spend: number;
  }>({ orders: 0, delivered: 0, cancelled: 0, inProgress: 0, spend: 0 });
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [id, setId] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const { id: idStr } = await params;
      const idNum = Number(idStr);
      setId(idNum);
      try {
        const c = await fetch(`/api/customers`).then((r) => r.json());
        const target = (c as Array<{ id: number }>).find((x) => x.id === idNum);
        if (!target) {
          setNotFound(true);
        } else {
          const cust = target as unknown as {
            name: string;
            phone: string;
            area: string;
            address: string;
            notes: string;
          };
          const isStandardArea = DHAKA_AREAS_FLAT.some(
            (a) => a.toLowerCase() === (cust.area || "").toLowerCase()
          );
          setForm({
            name: cust.name || "",
            phone: cust.phone || "",
            area: isStandardArea ? cust.area || DHAKA_AREAS_FLAT[0] : "Other",
            customArea: isStandardArea ? "" : cust.area || "",
            address: cust.address || "",
            notes: cust.notes || "",
          });
        }
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [params]);

  useEffect(() => {
    if (id === null) return;
    (async () => {
      const all = (await fetch("/api/orders").then((r) => r.json())) as CustomerOrder[];
      const c = await fetch("/api/customers").then((r) => r.json());
      const me = (c as Array<{ id: number; phone: string; name: string }>).find(
        (x) => x.id === id
      );
      if (!me) {
        setOrders([]);
        return;
      }
      const my = all
        .filter((o) => {
          if (me.phone && o.customerPhone && o.customerPhone === me.phone) return true;
          if (o.customerName === me.name) return true;
          return false;
        })
        // Newest first so the most recent order sits at the top of the list.
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      const delivered = my.filter((o) => o.status === "delivered");
      const cancelled = my.filter((o) => o.status === "cancelled");
      const inProgress = my.filter(
        (o) => o.status !== "delivered" && o.status !== "cancelled"
      );
      const spend = delivered.reduce((s, o) => s + o.total, 0);
      setOrders(my);
      setStats({
        orders: my.length,
        delivered: delivered.length,
        cancelled: cancelled.length,
        inProgress: inProgress.length,
        spend: Math.round(spend),
      });
    })();
  }, [id]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const phone = form.phone.trim();
  const normalizedPhone = normalizePhone(phone);
  const phoneLooksValid = phone ? isLikelyBdMobile(phone) : true;
  const areaValue = form.area === "Other" ? form.customArea.trim() : form.area.trim();
  const canSave = !saving && !!form.name.trim() && !!normalizedPhone && phoneLooksValid;

  const submit = async () => {
    if (id === null) return;
    setError("");
    if (!form.name.trim()) {
      setError("Customer name is required.");
      return;
    }
    if (!normalizedPhone) {
      setError("Phone is required.");
      return;
    }
    if (!phoneLooksValid) {
      setError("Phone must be a valid BD mobile (e.g. 01711234567).");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/customers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          phone: normalizedPhone,
          area: areaValue,
          address: form.address.trim(),
          notes: form.notes.trim(),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      router.push("/customers");
      router.refresh();
    } catch (e) {
      setError(String(e));
      setSaving(false);
    }
  };

  const remove = async () => {
    if (id === null) return;
    if (
      !confirm(
        `Delete "${form.name}"? Their order history will remain but the customer row will be gone.`
      )
    )
      return;
    try {
      const res = await fetch(`/api/customers/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      router.push("/customers");
      router.refresh();
    } catch (e) {
      setError(String(e));
    }
  };

  // Ctrl/Cmd + S
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (canSave) submit();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, saving, id]);

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>
        Loading…
      </div>
    );
  }
  if (notFound) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <p style={{ color: "var(--text-muted)" }}>Customer not found.</p>
        <Link href="/customers" className="btn btn-secondary" style={{ marginTop: 16 }}>
          <ArrowLeft size={15} /> Back to Customers
        </Link>
      </div>
    );
  }

  return (
    <div>
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
            <Link href="/customers" style={{ color: "var(--text-muted)", textDecoration: "none" }}>
              Customers
            </Link>
            <span>/</span>
            <span style={{ color: "var(--text-secondary)" }}>{form.name || "Edit"}</span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
            Edit Customer
            <span
              style={{
                marginLeft: 10,
                padding: "2px 10px",
                fontSize: 13,
                fontFamily: "monospace",
                fontWeight: 700,
                color: "var(--accent-green)",
                background: "rgba(77,158,71,0.10)",
                border: "1px solid rgba(77,158,71,0.30)",
                borderRadius: 999,
                verticalAlign: "middle",
              }}
            >
              #{id}
            </span>
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-muted)" }}>
            {stats.orders} orders · {stats.delivered} delivered · {stats.cancelled} cancelled ·{" "}
            {formatMoney(stats.spend)} lifetime
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/customers" className="btn btn-secondary">
            <ArrowLeft size={15} /> Back
          </Link>
          <button className="btn btn-danger" onClick={remove}>
            <Trash2 size={15} /> Delete
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={!canSave}>
            <Save size={15} /> {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            background: "rgba(226, 59, 46, 0.10)",
            border: "1px solid rgba(226, 59, 46, 0.35)",
            color: "var(--accent-red)",
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <section className="card" style={{ padding: 18 }}>
            <Header icon={<User size={16} color="var(--accent-green)" />} title="Identity" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label>Name *</label>
                <input
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label>Phone *</label>
                <input
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  style={{
                    fontFamily: "monospace",
                    borderColor: !phoneLooksValid ? "var(--accent-red)" : undefined,
                  }}
                />
                {!phoneLooksValid && (
                  <p
                    style={{
                      margin: "4px 0 0",
                      fontSize: 11,
                      color: "var(--accent-red)",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <AlertTriangle size={11} /> Need a valid BD mobile (11 digits, starts with 01).
                  </p>
                )}
              </div>
            </div>
          </section>

          <section className="card" style={{ padding: 18 }}>
            <Header icon={<MapPin size={16} color="var(--accent-amber)" />} title="Location" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label>Area (Dhaka Metro)</label>
                <select value={form.area} onChange={(e) => set("area", e.target.value)}>
                  {DHAKA_AREAS_FLAT.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                  <option value="Other">Other (type custom)…</option>
                </select>
                {form.area === "Other" && (
                  <input
                    value={form.customArea}
                    onChange={(e) => set("customArea", e.target.value)}
                    placeholder="Type area name"
                    style={{ marginTop: 6 }}
                  />
                )}
              </div>
              <div>
                <label>Address</label>
                <input
                  value={form.address}
                  onChange={(e) => set("address", e.target.value)}
                  placeholder="House, road, building"
                />
              </div>
            </div>
          </section>

          <section className="card" style={{ padding: 18 }}>
            <Header
              icon={<AlertTriangle size={16} color="var(--accent-blue, #5aa8ff)" />}
              title="Notes"
            />
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Allergies, preferred delivery time, building quirks…"
              rows={3}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: "var(--bg-elev, transparent)",
                color: "var(--text-primary)",
                fontFamily: "inherit",
                fontSize: 13,
                resize: "vertical",
              }}
            />
          </section>
        </div>

        <aside style={{ position: "sticky", top: 70, alignSelf: "flex-start" }}>
          <section className="card" style={{ padding: 18 }}>
            <h2
              style={{
                fontSize: 14,
                fontWeight: 700,
                margin: "0 0 14px",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "var(--text-secondary)",
              }}
            >
              Summary
            </h2>
            <Row label="Name" value={form.name || "—"} />
            <Row label="Phone" value={normalizedPhone || "—"} mono />
            <Row label="Area" value={areaValue || "—"} />
            <Row label="Address" value={form.address.trim() || "—"} />
            {form.notes && <Row label="Notes" value={form.notes.trim() || "—"} />}
            <div style={{ height: 1, background: "var(--border)", margin: "10px 0" }} />
            <Row label="Total Orders" value={String(stats.orders)} />
            <Row label="Delivered" value={String(stats.delivered)} />
            <Row label="Cancelled" value={String(stats.cancelled)} />
            {stats.inProgress > 0 && (
              <Row label="In Progress" value={String(stats.inProgress)} />
            )}
            <Row label="Lifetime Spend" value={formatMoney(stats.spend)} highlight />
          </section>
          <button
            className="btn btn-primary"
            onClick={submit}
            disabled={!canSave}
            style={{ width: "100%", marginTop: 12, justifyContent: "center" }}
          >
            <Save size={15} /> {saving ? "Saving..." : "Save Changes"}
          </button>
          <Link
            href="/customers"
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

      <section className="card" style={{ padding: 18, marginTop: 16 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14,
            paddingBottom: 12,
            borderBottom: "1px solid var(--border)",
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ShoppingBag size={16} color="var(--accent-green)" />
            <h2
              style={{
                fontSize: 14,
                fontWeight: 700,
                margin: 0,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "var(--text-secondary)",
              }}
            >
              Order History
            </h2>
            <span
              style={{
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 999,
                background: "var(--bg-elev, rgba(0,0,0,0.04))",
                color: "var(--text-muted)",
                fontWeight: 600,
              }}
            >
              {stats.orders}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <StatChip
              icon={<CheckCircle2 size={12} />}
              label="Delivered"
              value={stats.delivered}
              color="var(--accent-green)"
              bg="rgba(77,158,71,0.10)"
              border="rgba(77,158,71,0.30)"
            />
            <StatChip
              icon={<XCircle size={12} />}
              label="Cancelled"
              value={stats.cancelled}
              color="var(--accent-red)"
              bg="rgba(226,59,46,0.10)"
              border="rgba(226,59,46,0.30)"
            />
            <StatChip
              icon={<Clock size={12} />}
              label="In progress"
              value={stats.inProgress}
              color="var(--accent-amber, #f0a93b)"
              bg="rgba(240,169,59,0.10)"
              border="rgba(240,169,59,0.30)"
            />
          </div>
        </div>

        {orders.length === 0 ? (
          <p
            style={{
              margin: 0,
              padding: "20px 0",
              textAlign: "center",
              fontSize: 13,
              color: "var(--text-muted)",
            }}
          >
            No orders for this customer yet.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {orders.map((o) => (
              <OrderCard key={o.id} order={o} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatChip({
  icon,
  label,
  value,
  color,
  bg,
  border,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
  bg: string;
  border: string;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 999,
        background: bg,
        border: `1px solid ${border}`,
        fontSize: 12,
        color,
        fontWeight: 600,
      }}
      title={label}
    >
      {icon}
      <span>{label}</span>
      <span
        style={{
          fontFamily: "monospace",
          fontSize: 12,
          fontWeight: 700,
          color: "var(--text-primary)",
        }}
      >
        {value}
      </span>
    </div>
  );
}

const STATUS_COLORS: Record<string, { fg: string; bg: string; border: string; label: string }> = {
  delivered:        { fg: "var(--accent-green)",     bg: "rgba(77,158,71,0.10)",  border: "rgba(77,158,71,0.30)",  label: "Delivered" },
  cancelled:        { fg: "var(--accent-red)",       bg: "rgba(226,59,46,0.10)",  border: "rgba(226,59,46,0.30)",  label: "Cancelled" },
  confirmed:        { fg: "var(--accent-blue, #5aa8ff)", bg: "rgba(90,168,255,0.10)", border: "rgba(90,168,255,0.30)", label: "Confirmed" },
  preparing:        { fg: "var(--accent-amber, #f0a93b)", bg: "rgba(240,169,59,0.10)", border: "rgba(240,169,59,0.30)", label: "Preparing" },
  "out-for-delivery": { fg: "var(--accent-amber, #f0a93b)", bg: "rgba(240,169,59,0.10)", border: "rgba(240,169,59,0.30)", label: "Out for delivery" },
  new:              { fg: "var(--accent-blue, #5aa8ff)", bg: "rgba(90,168,255,0.10)", border: "rgba(90,168,255,0.30)", label: "New" },
  "pending-approval": { fg: "var(--accent-amber, #f0a93b)", bg: "rgba(240,169,59,0.10)", border: "rgba(240,169,59,0.30)", label: "Pending approval" },
};

function statusStyle(status: string) {
  return (
    STATUS_COLORS[status] || {
      fg: "var(--text-secondary)",
      bg: "rgba(0,0,0,0.04)",
      border: "var(--border)",
      label: status || "—",
    }
  );
}

function OrderCard({ order }: { order: CustomerOrder }) {
  const st = statusStyle(order.status);
  const items = order.items || [];
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 8,
        background: "var(--bg-card, transparent)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: "10px 14px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-elev, rgba(0,0,0,0.02))",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span
            style={{
              fontFamily: "monospace",
              fontSize: 13,
              fontWeight: 700,
              color: "var(--text-primary)",
            }}
          >
            #{order.orderNo || order.id}
          </span>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {formatDate(order.createdAt || order.date)}
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: "2px 10px",
              borderRadius: 999,
              background: st.bg,
              color: st.fg,
              border: `1px solid ${st.border}`,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {st.label}
          </span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
          {formatMoney(order.total)}
        </div>
      </div>
      {items.length === 0 ? (
        <p style={{ margin: 0, padding: "10px 14px", fontSize: 12, color: "var(--text-muted)" }}>
          No items recorded.
        </p>
      ) : (
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 13,
          }}
        >
          <thead>
            <tr style={{ background: "var(--bg-elev, rgba(0,0,0,0.02))" }}>
              <th
                style={{
                  textAlign: "left",
                  padding: "8px 14px",
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "var(--text-muted)",
                  fontWeight: 600,
                }}
              >
                Item
              </th>
              <th
                style={{
                  textAlign: "right",
                  padding: "8px 14px",
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "var(--text-muted)",
                  fontWeight: 600,
                  width: 80,
                }}
              >
                Qty
              </th>
              <th
                style={{
                  textAlign: "right",
                  padding: "8px 14px",
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "var(--text-muted)",
                  fontWeight: 600,
                  width: 110,
                }}
              >
                Unit Price
              </th>
              <th
                style={{
                  textAlign: "right",
                  padding: "8px 14px",
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "var(--text-muted)",
                  fontWeight: 600,
                  width: 110,
                }}
              >
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => (
              <tr
                key={`${order.id}-${idx}`}
                style={{ borderTop: idx === 0 ? "none" : "1px solid var(--border)" }}
              >
                <td style={{ padding: "8px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Package size={13} color="var(--text-muted)" />
                    <span>{it.name || "—"}</span>
                  </div>
                </td>
                <td style={{ padding: "8px 14px", textAlign: "right", fontFamily: "monospace" }}>
                  {it.qty} {it.unit || ""}
                </td>
                <td style={{ padding: "8px 14px", textAlign: "right", fontFamily: "monospace" }}>
                  {formatMoney(it.unitPrice)}
                </td>
                <td
                  style={{
                    padding: "8px 14px",
                    textAlign: "right",
                    fontFamily: "monospace",
                    fontWeight: 600,
                  }}
                >
                  {formatMoney(it.lineTotal)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "1px solid var(--border)", background: "var(--bg-elev, rgba(0,0,0,0.02))" }}>
              <td
                colSpan={3}
                style={{
                  padding: "8px 14px",
                  textAlign: "right",
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "var(--text-muted)",
                  fontWeight: 600,
                }}
              >
                Subtotal
              </td>
              <td
                style={{
                  padding: "8px 14px",
                  textAlign: "right",
                  fontFamily: "monospace",
                  fontWeight: 600,
                }}
              >
                {formatMoney(order.subtotal)}
              </td>
            </tr>
            {order.deliveryFee > 0 && (
              <tr>
                <td
                  colSpan={3}
                  style={{
                    padding: "4px 14px",
                    textAlign: "right",
                    fontSize: 11,
                    color: "var(--text-muted)",
                  }}
                >
                  Delivery
                </td>
                <td
                  style={{
                    padding: "4px 14px",
                    textAlign: "right",
                    fontFamily: "monospace",
                    color: "var(--text-muted)",
                  }}
                >
                  {formatMoney(order.deliveryFee)}
                </td>
              </tr>
            )}
            {order.discount > 0 && (
              <tr>
                <td
                  colSpan={3}
                  style={{
                    padding: "4px 14px",
                    textAlign: "right",
                    fontSize: 11,
                    color: "var(--accent-red)",
                  }}
                >
                  Discount
                </td>
                <td
                  style={{
                    padding: "4px 14px",
                    textAlign: "right",
                    fontFamily: "monospace",
                    color: "var(--accent-red)",
                  }}
                >
                  −{formatMoney(order.discount)}
                </td>
              </tr>
            )}
          </tfoot>
        </table>
      )}
    </div>
  );
}

function Header({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
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
      {icon}
      <h2
        style={{
          fontSize: 14,
          fontWeight: 700,
          margin: 0,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "var(--text-secondary)",
        }}
      >
        {title}
      </h2>
    </div>
  );
}

function Row({
  label,
  value,
  highlight,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  highlight?: boolean;
  mono?: boolean;
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
      <span
        style={{
          fontSize: 11,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
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
          fontFamily: mono ? "monospace" : undefined,
        }}
        title={typeof value === "string" ? value : undefined}
      >
        {value}
      </span>
    </div>
  );
}
