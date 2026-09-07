"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Save,
  User,
  Phone,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  Link2,
} from "lucide-react";
import { useActiveCompany } from "@/lib/active-company";
import { formatMoney, DHAKA_AREAS_FLAT } from "@/lib/ui";
import { isLikelyBdMobile, normalizePhone } from "@/lib/phone";

interface FormState {
  name: string;
  phone: string;
  area: string;
  customArea: string;
  address: string;
  notes: string;
  linkExisting: boolean; // checked when duplicate detected
}

export default function NewCustomerPage() {
  const router = useRouter();
  const { activeCompany } = useActiveCompany();
  const isMeat = activeCompany?.slug === "meat";
  const [form, setForm] = useState<FormState>({
    name: "",
    phone: "",
    area: isMeat ? "Aftabnagar" : "",
    customArea: "",
    address: "",
    notes: "",
    linkExisting: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [duplicate, setDuplicate] = useState<{ id: number; name: string } | null>(null);
  const [knownPhones, setKnownPhones] = useState<Set<string>>(new Set());

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const phone = form.phone.trim();
  const normalizedPhone = normalizePhone(phone);
  const phoneLooksValid = phone ? isLikelyBdMobile(phone) : true;

  // Live phone uniqueness check (debounced).
  useEffect(() => {
    if (!normalizedPhone || !phoneLooksValid) {
      setDuplicate(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/customers?phone=${encodeURIComponent(form.phone)}`);
        const data = await res.json();
        if (data.match) {
          setDuplicate({ id: data.match.id, name: data.match.name });
        } else {
          setDuplicate(null);
        }
      } catch {
        // ignore network blips
      }
    }, 250);
    return () => clearTimeout(t);
  }, [form.phone, normalizedPhone, phoneLooksValid]);

  const areaValue = form.area === "Other" ? form.customArea.trim() : form.area.trim();
  const savedDisabled =
    saving || !form.name.trim() || !normalizedPhone || !phoneLooksValid;

  const submit = async () => {
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
    if (duplicate && !form.linkExisting) {
      setError(
        `Phone already belongs to "${duplicate.name}". Tick "Link anyway" or change the phone.`
      );
      return;
    }

    const payload = {
      name: form.name.trim(),
      phone: normalizedPhone,
      area: areaValue,
      address: form.address.trim(),
      notes: form.notes.trim(),
      ...(duplicate ? { linkExisting: form.linkExisting } : {}),
    };

    setSaving(true);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.ok) {
        router.push(`/customers/${data.customer.id}`);
        router.refresh();
      } else if (data.duplicate) {
        setDuplicate(data.duplicate);
        setError(
          `Phone already belongs to "${data.duplicate.name}". Tick "Link anyway" or change the phone.`
        );
        setSaving(false);
      } else {
        setError(data.error || "Failed to save customer.");
        setSaving(false);
      }
    } catch (e) {
      setError(String(e));
      setSaving(false);
    }
  };

  // Ctrl/Cmd + S
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (!savedDisabled) submit();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, saving, duplicate]);

  // Order count & lifetime spend summary — fetched live as user types the phone.
  const summary = useCustomerSummary(duplicate ? duplicate.id : null, normalizedPhone, knownPhones);

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
            <span style={{ color: "var(--text-secondary)" }}>New Customer</span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Add Customer</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-muted)" }}>
            Walk-in or phone order. Phone is required so future orders auto-link.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/customers" className="btn btn-secondary">
            <ArrowLeft size={15} /> Back
          </Link>
          <button className="btn btn-primary" onClick={submit} disabled={savedDisabled}>
            <Save size={15} /> {saving ? "Saving..." : "Save Customer"}
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
          {/* Identity */}
          <section className="card" style={{ padding: 18 }}>
            <SectionHeader icon={<User size={16} color="var(--accent-green)" />} title="Identity" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label>Name *</label>
                <input
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Full name"
                  autoFocus
                />
              </div>
              <div>
                <label>Phone *</label>
                <input
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  placeholder="01711234567"
                  style={{
                    fontFamily: "monospace",
                    borderColor:
                      !phoneLooksValid
                        ? "var(--accent-red)"
                        : duplicate
                        ? "var(--accent-amber)"
                        : undefined,
                  }}
                />
                <PhoneHint valid={phoneLooksValid} duplicate={duplicate} phone={normalizedPhone} />
              </div>
            </div>
          </section>

          {/* Location */}
          <section className="card" style={{ padding: 18 }}>
            <SectionHeader icon={<MapPin size={16} color="var(--accent-amber)" />} title="Location" />
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

          {/* Notes */}
          <section className="card" style={{ padding: 18 }}>
            <SectionHeader
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

        {/* Sticky summary */}
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
            <SummaryRow label="Name" value={form.name || "—"} />
            <SummaryRow label="Phone" value={normalizedPhone || "—"} mono />
            <SummaryRow label="Area" value={areaValue || "—"} />
            <SummaryRow label="Address" value={form.address.trim() || "—"} />
            {form.notes && <SummaryRow label="Notes" value={form.notes.trim() || "—"} />}
            <div style={{ height: 1, background: "var(--border)", margin: "10px 0" }} />
            {duplicate ? (
              <>
                <SummaryRow
                  label="Existing Match"
                  value={`"${duplicate.name}"`}
                  highlight="amber"
                />
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    marginTop: 8,
                    color: "var(--text-secondary)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={form.linkExisting}
                    onChange={(e) => set("linkExisting", e.target.checked)}
                  />
                  <span>
                    <Link2 size={11} style={{ marginRight: 4 }} />
                    Link to existing (re-use "{duplicate.name}")
                  </span>
                </label>
              </>
            ) : normalizedPhone ? (
              <SummaryRow label="Existing Match" value="None — new" highlight="green" />
            ) : null}
            <div style={{ height: 1, background: "var(--border)", margin: "10px 0" }} />
            <SummaryRow label="Orders" value={String(summary.orders)} />
            <SummaryRow label="Lifetime Spend" value={formatMoney(summary.spend)} highlight />
          </section>

          <button
            className="btn btn-primary"
            onClick={submit}
            disabled={savedDisabled}
            style={{ width: "100%", marginTop: 12, justifyContent: "center" }}
          >
            <Save size={15} /> {saving ? "Saving..." : "Save Customer"}
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

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
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

function PhoneHint({
  valid,
  duplicate,
  phone,
}: {
  valid: boolean;
  duplicate: { id: number; name: string } | null;
  phone: string;
}) {
  if (!phone) {
    return (
      <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-muted)" }}>
        Canonical BD mobile, e.g. <code>01711234567</code>
      </p>
    );
  }
  if (!valid) {
    return (
      <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--accent-red)" }}>
        Doesn't look like a valid BD mobile (need 11 digits, starts with 01).
      </p>
    );
  }
  if (duplicate) {
    return (
      <p
        style={{
          margin: "4px 0 0",
          fontSize: 11,
          color: "var(--accent-amber)",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <AlertTriangle size={11} /> Belongs to "{duplicate.name}"
      </p>
    );
  }
  return (
    <p
      style={{
        margin: "4px 0 0",
        fontSize: 11,
        color: "var(--accent-green)",
        display: "flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      <CheckCircle2 size={11} /> Available
    </p>
  );
}

function SummaryRow({
  label,
  value,
  highlight,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  highlight?: boolean | "green" | "amber";
  mono?: boolean;
}) {
  const color =
    highlight === "green" || highlight === true
      ? "var(--accent-green)"
      : highlight === "amber"
      ? "var(--accent-amber)"
      : "var(--text-primary)";
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
          color,
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

/**
 * Live customer summary: order count + lifetime spend, fetched when an
 * existing customer is matched. Cheap because the data is already in /customers.
 */
function useCustomerSummary(
  customerId: number | null,
  phone: string,
  knownPhones: Set<string>
) {
  const [data, setData] = useState<{ orders: number; spend: number }>({ orders: 0, spend: 0 });
  useEffect(() => {
    if (!customerId) {
      setData({ orders: 0, spend: 0 });
      return;
    }
    let aborted = false;
    (async () => {
      try {
        const [custs, orders] = await Promise.all([
          fetch("/api/customers").then((r) => r.json()),
          fetch("/api/orders").then((r) => r.json()),
        ]);
        if (aborted) return;
        const c = (custs as Array<{ id: number }>).find((x) => x.id === customerId);
        if (!c) return;
        const cust = c as { name: string; phone: string; id: number };
        const my = (orders as Array<{
          customerName: string;
          customerPhone: string;
          total: number;
          status: string;
        }>).filter((o) => {
          if (o.customerPhone && cust.phone && o.customerPhone === cust.phone) return true;
          if (o.customerName === cust.name) return true;
          return false;
        });
        const delivered = my.filter((o) => o.status === "delivered");
        const spend = delivered.reduce((s, o) => s + o.total, 0);
        setData({ orders: my.length, spend: Math.round(spend) });
      } catch {
        // ignore
      }
    })();
    return () => {
      aborted = true;
    };
  }, [customerId, phone, knownPhones]);
  return data;
}
