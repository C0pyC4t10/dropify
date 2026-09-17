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
  }, [router]);
  return <main style={{ padding: 24 }}>Loading…</main>;
}