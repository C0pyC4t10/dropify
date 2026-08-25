"use client";

import { useEffect, useState } from "react";
import OrderParseForm from "@/components/order-parse-form";
import type { Product, Settings } from "@/lib/types";

export default function QuickOrderPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [p, s] = await Promise.all([
          fetch("/api/products").then((r) => r.json()),
          fetch("/api/settings").then((r) => r.json()),
        ]);
        setProducts(p);
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

  return <OrderParseForm products={products} settings={settings} />;
}
