"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RiderIndexPage() {
  const router = useRouter();
  useEffect(() => {
    try {
      const raw = localStorage.getItem("dropify-rider-auth");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.session?.mustChangePin) router.replace("/rider/change-pin");
        else router.replace("/rider/orders");
      } else {
        router.replace("/rider/login");
      }
    } catch {
      router.replace("/rider/login");
    }
    // Safety net: if the redirect never fires (broken hydration, blocked
    // JS chunk, stuck SW), push the rider to the login screen anyway
    // so they're not staring at "Loading…" forever.
    const t = window.setTimeout(() => {
      router.replace("/rider/login");
    }, 2500);
    return () => window.clearTimeout(t);
  }, [router]);
  return <main style={{ padding: 24 }}>Loading…</main>;
}