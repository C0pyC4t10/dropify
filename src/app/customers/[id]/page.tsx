"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, User, Phone, MapPin, AlertTriangle, Trash2 } from "lucide-react";
import { formatMoney, DHAKA_AREAS_FLAT } from "@/lib/ui";
import { isLikelyBdMobile, normalizePhone } from "@/lib/phone";

interface FormState {
  name: string;
  phone: string;
  area: string;
  customArea: string;
  address: string;
  notes: string;
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
  const [stats, setStats] = useState<{ orders: number; spend: number }>({ orders: 0, spend: 0 });
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
      const all = await fetch("/api/orders").then((r) => r.json());
      const c = await fetch("/api/customers").then((r) => r.json());
      const me = (c as Array<{ id: number; phone: string; name: string }>).find(
        (x) => x.id === id
      );
      if (!me) return;
      const my = (all as Array<{
        customerPhone: string;
        customerName: string;
        total: number;
        status: string;
      }>).filter((o) => {
        if (me.phone && o.customerPhone && o.customerPhone === me.phone) return true;
        if (o.customerName === me.name) return true;
        return false;
      });
      const delivered = my.filter((o) => o.status === "delivered");
      const spend = delivered.reduce((s, o) => s + o.total, 0);
      setStats({ orders: my.length, spend: Math.round(spend) });
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
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Edit Customer</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-muted)" }}>
            #{id} — {stats.orders} orders · {formatMoney(stats.spend)} lifetime
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
            <Row label="Orders" value={String(stats.orders)} />
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
