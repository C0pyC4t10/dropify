"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { Save, Store, MapPin, Plus, Trash2, Truck } from "lucide-react";
import type { Settings } from "@/lib/types";
import type { DeliveryPartner } from "@/lib/delivery-partners";

// SSR-safe Leaflet wrapper — same approach as the planner map.
const ClientRouteMap = dynamic(() => import("@/components/map/client-route-map"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: 320,
        width: "100%",
        borderRadius: 8,
        border: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-elevated, #1a1a1a)",
        color: "var(--text-muted)",
        fontSize: 13,
      }}
    >
      Loading map…
    </div>
  ),
});

export default function SettingsPage() {
  const [form, setForm] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const s = await fetch("/api/settings").then((r) => r.json());
      setForm(s);
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

  // Keep a ref to the latest form so the Save button always serialises
  // the current state (not whatever `form` was when the render happened).
  const formRef = useRef<Settings | null>(form);
  useEffect(() => {
    formRef.current = form;
  }, [form]);

  const submit = async () => {
    const current = formRef.current;
    if (!current) return;
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(current),
      });
      const updated = await res.json();
      setForm(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>Loading...</div>;
  }

  if (!form) return null;

  // Functional setForm updater — always uses the latest form state, so
  // the child component's onChange callback can't capture a stale `form`.
  const set = (k: string, v: unknown) =>
    setForm((prev) => (prev ? { ...prev, [k]: v } : prev));

  // The map needs a valid center. If the user hasn't set shopLat/shopLng yet,
  // fall back to the address's area centroid (or Aftabnagar as a last resort).
  const fallbackCenter: { lat: number; lng: number } = (() => {
    if (typeof form.shopLat === "number" && typeof form.shopLng === "number") {
      return { lat: form.shopLat, lng: form.shopLng };
    }
    return { lat: 23.7628, lng: 90.425 }; // Aftabnagar
  })();

  const mapShop = {
    lat: typeof form.shopLat === "number" ? form.shopLat : fallbackCenter.lat,
    lng: typeof form.shopLng === "number" ? form.shopLng : fallbackCenter.lng,
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Settings</h1>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 16, marginBottom: 16 }}>
        <div className="card" style={{ padding: 20 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 16px", display: "flex", alignItems: "center", gap: 8 }}>
            <Store size={16} color="var(--accent-green)" /> Business
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><label>Business Name</label><input value={form.businessName} onChange={(e) => set("businessName", e.target.value)} /></div>
            <div><label>Tagline</label><input value={form.tagline} onChange={(e) => set("tagline", e.target.value)} /></div>
            <div><label>Phone</label><input value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
            <div><label>Address</label><input value={form.address} onChange={(e) => set("address", e.target.value)} /></div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label>POS Printer Name (Windows)</label>
              <input
                value={form.posPrinterName}
                onChange={(e) => set("posPrinterName", e.target.value)}
                placeholder="e.g. Xprinter XP-350BM"
              />
              <span style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, display: "block" }}>
                Must match the exact printer name shown in Windows Settings → Printers & scanners.
              </span>
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 16px" }}>Delivery</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label>Free Delivery Threshold (৳)</label>
              <input type="number" value={form.freeDeliveryThreshold} onChange={(e) => set("freeDeliveryThreshold", parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <label>Delivery Charge (৳)</label>
              <input type="number" value={form.deliveryCharge} onChange={(e) => set("deliveryCharge", parseFloat(e.target.value) || 0)} />
            </div>
          </div>
        </div>
      </div>

      {/* Shop Location (route-planner origin) */}
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 8px", display: "flex", alignItems: "center", gap: 8 }}>
          <MapPin size={16} color="var(--accent-green)" /> Shop Location
        </h2>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
          Drag the pin to your shop, or click anywhere on the map to move it. This is the starting point
          for the route planner. Defaults to your business address's area centroid if unset.
        </div>
        <div style={{ marginBottom: 10, fontSize: 12, fontFamily: "monospace", color: "var(--text-secondary)" }}>
          {typeof form.shopLat === "number" && typeof form.shopLng === "number"
            ? `Lat ${form.shopLat.toFixed(5)}, Lng ${form.shopLng.toFixed(5)}`
            : "Not set — defaulting to Aftabnagar"}
        </div>
        <ClientRouteMap
          center={fallbackCenter}
          shop={mapShop}
          shopLabel="Shop"
          stops={[]}
          drawRoute={false}
          height={320}
          fitBounds={false}
          onShopMove={(p) => {
            set("shopLat", p.lat);
            set("shopLng", p.lng);
          }}
        />
        {typeof form.shopLat === "number" && typeof form.shopLng === "number" && (
          <button
            onClick={() => {
              set("shopLat", null);
              set("shopLng", null);
            }}
            style={{
              marginTop: 8,
              fontSize: 11,
              padding: "4px 8px",
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: 4,
              color: "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            Reset to default (Aftabnagar centroid)
          </button>
        )}
      </div>

      {/* bKash Payment QR — uses the static image at /public/bkash-qr.png.
          To update: drop a new PNG file at the project root's /public/ folder, then refresh.
          public\bkash-qr.png (overwrite the existing one). The same
          image is embedded on every invoice surface — no re-encoding. */}
      <div className="card" style={{ padding: 20, marginBottom: 16, borderLeft: "3px solid #9d174d" }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 8px", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "#9d174d" }}>bKash Payment QR</span>
        </h2>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10, lineHeight: 1.5 }}>
          Invoices use the static QR image at{" "}
          <code style={{ background: "var(--bg-elevated, #1a1a1a)", padding: "1px 4px", borderRadius: 3 }}>
            public/bkash-qr.png
          </code>
          . When scanned, the bKash app opens in <strong>Payment</strong> mode with
          merchant + amount prefilled.
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: 10,
            background: "var(--bg-elevated, #1a1a1a)",
            border: "1px solid var(--border)",
            borderRadius: 6,
          }}
        >
          <img
            src="/bkash-qr.png"
            alt="Current bKash QR"
            style={{ width: 100, height: 100, borderRadius: 4, background: "#fff", padding: 3 }}
          />
          <div style={{ flex: 1, minWidth: 0, fontSize: 11 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Current QR loaded ✓</div>
            <div style={{ color: "var(--text-muted)" }}>
              To replace: drop a new PNG at{" "}
              <code>public/bkash-qr.png</code> and restart the dev server
              (HMR will pick it up on the next request).
            </div>
          </div>
        </div>
      </div>

      {/* Delivery Partners — managed by the user; shown in the invoice
          footer when the user picks the "With Delivery Partner" format. */}
      <DeliveryPartnersCard
        initialPartners={form.deliveryPartners ?? []}
        initialDefaultId={form.defaultDeliveryPartnerId ?? ""}
        onChange={(next, defaultId) => {
          set("deliveryPartners", next);
          set("defaultDeliveryPartnerId", defaultId);
        }}
      />

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 16px" }}>Invoice</h2>
        <div>
          <label>Invoice Footer Note</label>
          <textarea
            rows={3}
            value={form.invoiceNote}
            onChange={(e) => set("invoiceNote", e.target.value)}
            placeholder="Thank you message printed at the bottom of invoices"
          />
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button className="btn btn-primary" onClick={submit} disabled={saving}>
          <Save size={15} /> {saving ? "Saving..." : "Save Settings"}
        </button>
        {saved && <span style={{ fontSize: 13, color: "var(--accent-green)" }}>Saved.</span>}
      </div>
    </div>
  );
}

function DeliveryPartnersCard({
  initialPartners,
  initialDefaultId,
  onChange,
}: {
  initialPartners: DeliveryPartner[];
  initialDefaultId: string;
  onChange: (next: DeliveryPartner[], defaultId: string) => void;
}) {
  // Hold partners/defaultId in local state so the row count, add/update/remove
  // operations, and the default-radio are all driven from one place. Sync
  // back to the parent via `onChange` on every mutation. This is more
  // robust than threading closures through the parent's `set` function.
  const [partners, setPartners] = useState<DeliveryPartner[]>(initialPartners);
  const [defaultId, setDefaultId] = useState<string>(initialDefaultId);

  // Re-sync if the parent reloads (e.g. after Save Settings, the parent's
  // form is refetched and the prop changes). This keeps the local copy in
  // step with what's persisted.
  useEffect(() => setPartners(initialPartners), [initialPartners]);
  useEffect(() => setDefaultId(initialDefaultId), [initialDefaultId]);

  const newId = () => `p_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const add = () => {
    const next: DeliveryPartner[] = [
      ...partners,
      { id: newId(), name: `New Partner ${partners.length + 1}` },
    ];
    setPartners(next);
    onChange(next, defaultId);
  };
  const update = (id: string, patch: Partial<DeliveryPartner>) => {
    const next = partners.map((p) => (p.id === id ? { ...p, ...patch } : p));
    setPartners(next);
    onChange(next, defaultId);
  };
  const remove = (id: string) => {
    const next = partners.filter((p) => p.id !== id);
    const nextDefault = defaultId === id ? "" : defaultId;
    setPartners(next);
    setDefaultId(nextDefault);
    onChange(next, nextDefault);
  };
  const setDefault = (id: string) => {
    setDefaultId(id);
    onChange(partners, id);
  };

  return (
    <div className="card" style={{ padding: 20, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <Truck size={16} color="var(--accent-green)" /> Delivery Partners
        </h2>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={add}
          style={{ fontSize: 12, padding: "4px 10px" }}
        >
          <Plus size={12} /> Add partner
        </button>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
        Add the delivery partners you work with (Pathao, Steadfast, RedX, etc.).
        On the invoice page you can pick one to print in the footer.{" "}
        <strong>Don't forget to click <em>Save Settings</em> below</strong> — partner
        changes don't persist until you save.
      </div>
      {partners.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--text-muted)", padding: 12, textAlign: "center", border: "1px dashed var(--border)", borderRadius: 6 }}>
          No delivery partners yet — click <strong>Add partner</strong> above.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {partners.map((p) => (
            <div
              key={p.id}
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr 1fr 1fr auto",
                gap: 8,
                alignItems: "center",
                padding: 10,
                background: "var(--bg-elevated, #1a1a1a)",
                border: "1px solid var(--border)",
                borderRadius: 6,
              }}
            >
              <input
                type="radio"
                name="defaultDeliveryPartner"
                checked={p.id === defaultId}
                onChange={() => setDefault(p.id)}
                title="Use as default for new invoices"
              />
              <input
                type="text"
                value={p.name}
                onChange={(e) => update(p.id, { name: e.target.value })}
                placeholder="Name (e.g. Pathao)"
              />
              <input
                type="text"
                value={p.phone ?? ""}
                onChange={(e) => update(p.id, { phone: e.target.value })}
                placeholder="Phone"
              />
              <input
                type="text"
                value={p.website ?? ""}
                onChange={(e) => update(p.id, { website: e.target.value })}
                placeholder="Website / tracking URL"
              />
              <button
                type="button"
                onClick={() => remove(p.id)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--accent-red)",
                  cursor: "pointer",
                  padding: 4,
                }}
                title="Remove"
              >
                <Trash2 size={14} />
              </button>
              {p.notes !== undefined && (
                <div style={{ gridColumn: "2 / -1" }}>
                  <input
                    type="text"
                    value={p.notes}
                    onChange={(e) => update(p.id, { notes: e.target.value })}
                    placeholder="Optional note (e.g. tracking portal link)"
                    style={{ width: "100%" }}
                  />
                </div>
              )}
              <div style={{ gridColumn: "2 / -1", marginTop: -2 }}>
                <button
                  type="button"
                  onClick={() => update(p.id, { notes: p.notes === undefined ? "" : undefined })}
                  style={{
                    fontSize: 10,
                    background: "transparent",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  {p.notes === undefined ? "+ Add note" : "− Hide note"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}