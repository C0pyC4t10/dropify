"use client";

import type { OrderStatus } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/ui";

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`status-badge status-${status}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}