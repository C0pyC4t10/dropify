"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type { Customer, Product, Settings } from "@/lib/types";
import { OrderForm } from "@/components/order-form";

export default function NewOrderPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [p, c, s] = await Promise.all([
          fetch("/api/products").then((r) => r.json()),
          fetch("/api/customers").then((r) => r.json()),
          fetch("/api/settings").then((r) => r.json()),
        ]);
        setProducts(p);
        setCustomers(c);
        setSettings(s);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>
        Loading…
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
            <span style={{ color: "var(--text-secondary)" }}>New Order</span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Create Order</h1>
        </div>
        <Link href="/orders" className="btn btn-secondary">
          <ArrowLeft size={15} /> Back to Orders
        </Link>
      </div>

      <OrderForm
        products={products}
        customers={customers}
        settings={settings}
        embedded
        onClose={() => router.push("/orders")}
        onSaved={() => {
          /* no-op — OrderForm already opens the invoice print in a new tab */
        }}
      />
    </div>
  );
}