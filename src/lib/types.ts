import type { DeliveryPartner } from "./delivery-partners";

/**
 * A company is the multi-tenant root: each company owns its own catalog,
 * orders, settings, suppliers, purchase orders, expenses, and stock
 * movements. Customers and riders are SHARED across companies.
 *
 * The active company is tracked client-side in the `active_company_id`
 * cookie and read on every API request so the right rows are scoped.
 */
export interface Company {
  id: number;
  /** URL-safe identifier (e.g. "meat", "fashion"). Unique. */
  slug: string;
  /** Display name shown in the header / footer / invoices. */
  name: string;
  /** Short one-liner shown under the brand name. */
  tagline: string;
  /** Optional logo URL. Unused for now — kept for future theming. */
  logoUrl: string;
  /** Optional accent color override. Unused for now — kept for future theming. */
  accentColor: string;
  /** Soft-delete flag. Hidden companies are skipped in API lists. */
  isActive: boolean;
  createdAt: string;
}

export type ProductCategory = "beef" | "chicken" | "mutton" | "offal" | "fish";

export type Unit = "kg" | "pcs";

export interface Product {
  id: number;
  sku: string;
  name: string;
  nameBn: string;
  category: ProductCategory;
  unit: Unit;
  costPrice: number;
  sellPrice: number;
  marketPrice: number;
  stockQty: number;
  reorderLevel: number;
  isActive: boolean;
  updatedAt: string;
}

export type StockMovementType = "purchase" | "sale" | "adjustment" | "wastage";

export interface StockMovement {
  id: number;
  productId: number;
  type: StockMovementType;
  qty: number;
  note: string;
  createdAt: string;
}

export interface Customer {
  id: number;
  name: string;
  phone: string;
  area: string;
  address: string;
  notes: string;
  /** Latitude derived from area centroid at create time (or set manually). Null when unknown. */
  lat: number | null;
  /** Longitude derived from area centroid at create time (or set manually). Null when unknown. */
  lng: number | null;
  createdAt: string;
}

export interface Rider {
  id: number;
  name: string;
  phone: string;
  vehicle: string;
  status: "active" | "inactive";
  /** Primary cluster the rider serves. "DHK-E" | "DHK-NW" | "DHK-CW" | "DHK-SE" | null. */
  homeCluster: "DHK-E" | "DHK-NW" | "DHK-CW" | "DHK-SE" | null;
  /** Secondary clusters the rider can cover when their home cluster is quiet. */
  subClusters: Array<"DHK-E" | "DHK-NW" | "DHK-CW" | "DHK-SE">;
  /** Optional soft cap on the number of stops per shift. Null = no cap. */
  maxStops: number | null;
  createdAt: string;
}

export type OrderStatus =
  | "pending-approval"
  | "new"
  | "confirmed"
  | "preparing"
  | "out-for-delivery"
  | "delivered"
  | "cancelled"
  | "returned";

export type OrderSource = "manual" | "facebook" | "wordpress" | "phone" | "whatsapp" | "walkin";

export type DeliveryMode = "own" | "pathao";

export type PaymentMethod = "cod" | "bkash" | "nagad" | "card" | "advance";

export interface OrderItem {
  productId: number;
  name: string;
  nameBn: string;
  unit: Unit;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

export interface Order {
  id: number;
  /** Tenant scope. Set at createOrder time and never changes. */
  companyId: number;
  orderNo: string;
  date: string;
  customerId: number | null;
  customerName: string;
  customerPhone: string;
  area: string;
  address: string;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  paid: number;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  source: OrderSource;
  deliveryMode: DeliveryMode;
  pathaoTrackingId: string;
  pathaoFare: number;
  riderId: number | null;
  riderCost: number;   // payout to own rider for this order (separate from customer delivery fee)
  /** Latitude for routing. Derived from area centroid at create time; can be refined by manual pin-drop. */
  lat: number | null;
  /** Longitude for routing. Derived from area centroid at create time; can be refined by manual pin-drop. */
  lng: number | null;
  /** Sequence within the assigned rider's plan (1, 2, 3...). Null when not in a plan. */
  riderSeq: number | null;
  note: string;
  createdAt: string;
  confirmedAt: string; // ISO timestamp when status first moved to "confirmed"
  deliveredAt: string; // ISO timestamp when status first moved to "delivered"
  cancelledAt: string; // ISO timestamp when status moved to "cancelled"
  cancelReason: string; // free-text reason entered when cancelling
  returnedAt: string; // ISO timestamp when status moved to "returned" (after delivery)
  returnReason: string; // free-text reason entered when marking a delivered order returned
  /** True when stock was already deducted for this order. WP orders start
   *  at `false` and only flip to `true` after approval, so a rejected WP
   *  order never touches inventory. */
  stockDeducted: boolean;
  /** WooCommerce order id for orders sourced from WordPress. Empty string otherwise. */
  wpOrderId: string;
  /** Delivery cluster the order belongs to, derived from the area at create time. */
  cluster: "DHK-E" | "DHK-NW" | "DHK-CW" | "DHK-SE" | null;
  /** Sub-cluster (route) the order belongs to, derived from the area at create time. */
  subCluster: string | null;
  updatedAt: string;
}

export interface Settings {
  id: number;
  businessName: string;
  tagline: string;
  phone: string;
  address: string;
  freeDeliveryThreshold: number;
  deliveryCharge: number;
  invoiceNote: string;
  posPrinterName: string;
  /** WordPress integration fields. */
  wpWebhookSecret: string;
  wpSiteUrl: string;
  wpOutboundEnabled: boolean;
  wpAutoApprove: boolean;
  /** Latitude of the shop / dispatch origin used as the route-planning start point. */
  shopLat: number | null;
  /** Longitude of the shop / dispatch origin used as the route-planning start point. */
  shopLng: number | null;
  /**
   * The static bKash Payment merchant QR string (provided by bKash when
   * you onboard as a merchant). When this is set, the invoice QR uses
   * it verbatim — that's what makes the bKash app open in **Payment**
   * mode (not Send Money) with the merchant pre-filled.
   */
  bkashPaymentQr: string;
  /**
   * List of delivery partners the shop works with (Pathao, Steadfast,
   * RedX, eCourier, etc.). The user manages these on /settings. The
   * invoice can show the selected partner's contact info in the footer
   * when the "With Delivery Partner" format is picked.
   */
  deliveryPartners: DeliveryPartner[];
  /**
   * Which delivery partner to print on invoices by default (id of an
   * entry in `deliveryPartners`). Empty = show no partner.
   */
  defaultDeliveryPartnerId: string;
  updatedAt: string;
}

export interface BnNumberMap {
  [key: string]: string;
}

export interface Supplier {
  id: number;
  name: string;
  contact: string;
  phone: string;
  address: string;
  category: string;
  paymentTerms: string;
  notes: string;
  isActive: boolean;
  createdAt: string;
}

export type PurchaseOrderStatus = "draft" | "sent" | "received" | "cancelled";

export interface PurchaseOrderItem {
  productId: number;
  name: string;
  nameBn: string;
  unit: Unit;
  qty: number;
  unitCost: number;
  lineTotal: number;
}

export interface PurchaseOrder {
  id: number;
  poNumber: string;
  date: string;
  supplierId: number;
  items: PurchaseOrderItem[];
  subtotal: number;
  status: PurchaseOrderStatus;
  expectedDate: string;
  receivedDate: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export type ExpenseCategory =
  | "utilities"
  | "salary"
  | "rent"
  | "fuel"
  | "packaging"
  | "marketing"
  | "maintenance"
  | "office"
  | "other";

export type ExpensePaymentMethod = "cash" | "bkash" | "bank" | "other";

export interface Expense {
  id: number;
  /** ISO date string (YYYY-MM-DD, BD local). */
  date: string;
  category: ExpenseCategory;
  /** Amount in BDT (৳). Always positive; refunds go through a separate "negative" note. */
  amount: number;
  /** Who/what was paid (e.g. "DPDC", "Karwan Bazar", "Rahim (rider salary)"). */
  vendor: string;
  paymentMethod: ExpensePaymentMethod;
  note: string;
  createdAt: string;
  updatedAt: string;
  /** Optional — who logged it. Empty string when unknown. */
  createdBy: string;
}