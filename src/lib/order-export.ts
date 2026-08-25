import type { Order } from "./types";

/**
 * Flat-row representation of an order's line items, used by the expanded
 * "Order Items (XLSX)" export. Each row has the order context repeated on it
 * so a single filter/sort on the spreadsheet tells the full story.
 */
export interface OrderLineRow {
  orderId: number;
  orderNo: string;
  date: string;
  customerName: string;
  customerPhone: string;
  area: string;
  address: string;
  status: string;
  source: string;
  paymentMethod: string;
  // Item fields
  sku: string;
  productName: string;
  productNameBn: string;
  qty: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
  // Per-order totals, repeated for convenience (Excel can SUM)
  orderSubtotal: number;
  orderDeliveryFee: number;
  orderDiscount: number;
  orderTotal: number;
}

export interface AggregateSkuRow {
  sku: string;
  productName: string;
  productNameBn: string;
  totalKg: number;
  totalPcs: number;
  lineTotal: number;
  orderCount: number; // distinct orders touched this SKU
  firstDate: string;
  lastDate: string;
}

/**
 * Flatten an array of orders into one row per line item. Cleans up legacy
 * "Bengali dumped into English name" by detecting Bengali-only strings and
 * moving them into `productNameBn`, leaving `productName` empty.
 */
export function flattenOrdersToRows(orders: Order[]): OrderLineRow[] {
  const isBengali = (s: string) => /[\u0980-\u09FF]/.test(s);
  const splitLang = (en: string, bn: string): { en: string; bn: string } => {
    if (en && !bn && isBengali(en)) return { en: "", bn: en };
    if (bn && !en && isBengali(bn)) return { en: "", bn };
    return { en, bn };
  };

  const rows: OrderLineRow[] = [];
  for (const o of orders) {
    const items = Array.isArray(o.items) && o.items.length > 0
      ? o.items
      : [{ productId: 0, name: "(no items)", nameBn: "", unit: "kg", qty: 0, unitPrice: 0, lineTotal: 0 }];
    for (const it of items) {
      const cleaned = splitLang(String(it.name || ""), String(it.nameBn || ""));
      rows.push({
        orderId: o.id,
        orderNo: o.orderNo,
        date: o.date,
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        area: o.area,
        address: o.address,
        status: o.status,
        source: o.source,
        paymentMethod: o.paymentMethod,
        sku: it.productId ? `id-${it.productId}` : "",
        productName: cleaned.en,
        productNameBn: cleaned.bn,
        qty: it.qty,
        unit: it.unit,
        unitPrice: it.unitPrice,
        lineTotal: it.lineTotal,
        orderSubtotal: o.subtotal,
        orderDeliveryFee: o.deliveryFee,
        orderDiscount: o.discount,
        orderTotal: o.total,
      });
    }
  }
  return rows;
}

/**
 * Aggregate orders by SKU only — one row per product, summed across all dates.
 * No duplicate product rows. Names pick the FIRST non-empty English / Bengali
 * we encounter; later rows update lengthier variants so display names don't get
 * truncated by sparse early data.
 */
export function aggregateOrdersBySku(orders: Order[]): AggregateSkuRow[] {
  const bucket = new Map<string, AggregateSkuRow>();
  for (const o of orders) {
    if (o.status === "cancelled") continue;
    for (const it of o.items || []) {
      const sku = it.productId ? `id-${it.productId}` : (it.name || "unknown");
      const lineTotal = Number(it.lineTotal) || Number(it.qty) * Number(it.unitPrice) || 0;
      const en = String(it.name || "");
      const bn = String(it.nameBn || "");

      const existing = bucket.get(sku);
      if (existing) {
        if (it.unit === "kg") existing.totalKg += Number(it.qty) || 0;
        else if (it.unit === "pcs") existing.totalPcs += Number(it.qty) || 0;
        existing.lineTotal += lineTotal;
        existing.orderCount += 1;
        // Prefer the longest name strings — early data may have empty fields.
        if (en.length > existing.productName.length) existing.productName = en;
        if (bn.length > existing.productNameBn.length) existing.productNameBn = bn;
        if (o.date < existing.firstDate) existing.firstDate = o.date;
        if (o.date > existing.lastDate) existing.lastDate = o.date;
      } else {
        bucket.set(sku, {
          sku,
          productName: en,
          productNameBn: bn,
          totalKg: it.unit === "kg" ? Number(it.qty) || 0 : 0,
          totalPcs: it.unit === "pcs" ? Number(it.qty) || 0 : 0,
          lineTotal,
          orderCount: 1,
          firstDate: o.date,
          lastDate: o.date,
        });
      }
    }
  }
  return Array.from(bucket.values()).sort((a, b) => {
    const aName = a.productName || a.productNameBn;
    const bName = b.productName || b.productNameBn;
    return aName.localeCompare(bName);
  });
}
