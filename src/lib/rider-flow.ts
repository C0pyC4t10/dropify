import type { OrderStatus } from "./types";

/**
 * Status transitions the rider app is allowed to make. The admin console has
 * its own broader rules in `setOrderStatus` (see `src/lib/db.ts:2704`); this
 * table is the *rider-facing* subset. Any (from, to) pair NOT listed here is
 * rejected with 400 by /api/rider/orders/[id]/transition.
 *
 *   confirmed   → preparing            (rider acknowledges the pickup)
 *   preparing   → out-for-delivery     (rider has the goods, is en route)
 *   out-for-delivery → delivered       (POD gate: photo + OTP verified)
 *   preparing   → returned             (could not pick up — failed before pickup)
 *   out-for-delivery → returned        (delivered attempt failed — failed in transit)
 *
 * Cancellation at `new` / `confirmed` is admin-only — a rider shouldn't see
 * or be able to act on orders not yet handed to them. Returns at `delivered`
 * are admin-only too (handled by /api/orders/[id] via returnReason).
 */
export const RIDER_LEGAL_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  "pending-approval": [],
  "new": [],
  "confirmed": ["preparing"],
  "preparing": ["out-for-delivery", "returned"],
  "out-for-delivery": ["delivered", "returned"],
  "delivered": [],
  "cancelled": [],
  "returned": [],
};

/** True iff the rider is allowed to move this order from `from` to `to`. */
export function isRiderLegalTransition(from: OrderStatus, to: OrderStatus): boolean {
  const allowed = RIDER_LEGAL_TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

/** True iff the transition requires a verified Proof-of-Delivery (photo +
 *  OTP) before the rider endpoint will accept it. The delivery-state guard
 *  is enforced server-side — never trust the client to flag "POD done". */
export function riderTransitionRequiresPod(
  from: OrderStatus,
  to: OrderStatus
): boolean {
  return from === "out-for-delivery" && to === "delivered";
}

/** Human label per status for the rider UI. Operator-floor tone, no jargon. */
export const RIDER_STATUS_LABEL: Record<OrderStatus, string> = {
  "pending-approval": "Awaiting approval",
  "new": "New order",
  "confirmed": "Pending pickup",
  "preparing": "Ready to pick up",
  "out-for-delivery": "On the way",
  "delivered": "Delivered",
  "cancelled": "Cancelled",
  "returned": "Failed delivery",
};

/** Codes the rider app surfaces in the "Mark as Failed" reason dropdown.
 *  `other` is always available as a free-text fallback. */
export const FAIL_REASON_CODES = [
  { code: "customer_unavailable", label: "Customer unavailable" },
  { code: "wrong_address",        label: "Wrong address" },
  { code: "refused",             label: "Customer refused" },
  { code: "phone_unreachable",   label: "Phone unreachable" },
  { code: "damaged_in_transit",  label: "Damaged in transit" },
  { code: "other",               label: "Other (write a note)" },
] as const;

export type FailReasonCode = (typeof FAIL_REASON_CODES)[number]["code"];

export function isFailReasonCode(s: string): s is FailReasonCode {
  return FAIL_REASON_CODES.some((c) => c.code === s);
}