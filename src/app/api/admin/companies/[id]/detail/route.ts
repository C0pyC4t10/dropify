import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

/**
 * GET /api/admin/companies/[id]/detail — full per-tenant snapshot for the
 * admin detail page: recent orders, settings, low-stock alerts, supplier
 * breakdown, and recent activity. Read-only; opens its own short-lived
 * connection so the global cached one is left alone.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idParam } = await params;
    const id = Number(idParam);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const db = new Database(path.join(process.cwd(), "data", "meat_delivery.db"), {
      readonly: true,
    });
    try {
      const company = db
        .prepare(
          "SELECT id, slug, name, tagline, logoUrl, accentColor, isActive, createdAt FROM companies WHERE id = ?"
        )
        .get(id) as
        | {
            id: number;
            slug: string;
            name: string;
            tagline: string;
            logoUrl: string;
            accentColor: string;
            isActive: number;
            createdAt: string;
          }
        | undefined;
      if (!company) {
        return NextResponse.json({ error: "Company not found" }, { status: 404 });
      }

      // Settings blob — return as parsed JSON so the UI can render fields
      // without re-parsing on the client.
      const settingsRow = db
        .prepare("SELECT data FROM settings WHERE companyId = ?")
        .get(id) as { data: string } | undefined;
      const settings = settingsRow ? JSON.parse(settingsRow.data) : null;

      // Last 10 orders.
      const recentOrders = db
        .prepare(
          `SELECT id, orderNo, date, customerName, customerPhone, area,
                  total, status, source, createdAt
             FROM orders
            WHERE companyId = ?
            ORDER BY id DESC
            LIMIT 10`
        )
        .all(id) as Array<{
          id: number;
          orderNo: string;
          date: string;
          customerName: string;
          customerPhone: string;
          area: string;
          total: number;
          status: string;
          source: string;
          createdAt: string;
        }>;

      // Counters (cheap, single-statement).
      const counts = db
        .prepare(
          `SELECT
             (SELECT COUNT(*) FROM products         WHERE companyId = ?) AS products,
             (SELECT COUNT(*) FROM products         WHERE companyId = ? AND stockQty <= reorderLevel) AS lowStock,
             (SELECT COUNT(*) FROM orders           WHERE companyId = ?) AS orders,
             (SELECT COUNT(*) FROM orders           WHERE companyId = ? AND status = 'delivered') AS delivered,
             (SELECT COUNT(*) FROM orders           WHERE companyId = ? AND status NOT IN ('delivered','cancelled','returned')) AS openOrders,
             (SELECT COUNT(*) FROM orders           WHERE companyId = ? AND date(createdAt) = date('now')) AS todayOrders,
             (SELECT COALESCE(SUM(total), 0) FROM orders WHERE companyId = ? AND status = 'delivered') AS revenue,
             (SELECT COUNT(*) FROM customers        WHERE EXISTS (SELECT 1 FROM orders o WHERE o.companyId = ? AND o.customerId = customers.id)) AS customersWithOrders,
             (SELECT COUNT(*) FROM suppliers         WHERE companyId = ?) AS suppliers,
             (SELECT COUNT(*) FROM purchase_orders   WHERE companyId = ?) AS purchaseOrders,
             (SELECT COUNT(*) FROM expenses         WHERE companyId = ?) AS expenses,
             (SELECT COUNT(*) FROM categories       WHERE companyId = ?) AS categories,
             (SELECT COUNT(*) FROM units            WHERE companyId = ?) AS units
          `
        )
        .get(
          id, id, id, id, id, id, id, id,
          id, id, id, id, id
        ) as Record<string, number>;

      // Low-stock products (top 10 by stockQty).
      const lowStock = db
        .prepare(
          `SELECT id, sku, name, stockQty, reorderLevel
             FROM products
            WHERE companyId = ? AND stockQty <= reorderLevel AND reorderLevel > 0
            ORDER BY (stockQty - reorderLevel) ASC
            LIMIT 10`
        )
        .all(id) as Array<{
          id: number;
          sku: string;
          name: string;
          stockQty: number;
          reorderLevel: number;
        }>;

      // Supplier rollup (top 5 by total PO spend).
      const suppliers = db
        .prepare(
          `SELECT s.id, s.name, s.phone,
                  (SELECT COUNT(*) FROM purchase_orders WHERE supplierId = s.id AND companyId = ?) AS poCount,
                  (SELECT COALESCE(SUM(subtotal), 0) FROM purchase_orders WHERE supplierId = s.id AND companyId = ?) AS poTotal
             FROM suppliers s
            WHERE s.companyId = ?
            ORDER BY poTotal DESC
            LIMIT 5`
        )
        .all(id, id, id) as Array<{
          id: number;
          name: string;
          phone: string;
          poCount: number;
          poTotal: number;
        }>;

      return NextResponse.json({
        company,
        settings,
        counts,
        recentOrders,
        lowStock,
        suppliers,
      });
    } finally {
      db.close();
    }
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
