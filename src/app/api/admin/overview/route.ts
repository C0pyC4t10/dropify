import { NextResponse } from "next/server";
import {
  getCompanies,
  getProducts,
  getOrders,
  getCustomers,
  getRiders,
} from "@/lib/db";
import Database from "better-sqlite3";
import path from "path";

/**
 * GET /api/admin/overview — cross-tenant stats for the Dropify admin console.
 *
 * Returns per-company rows plus system-wide totals.
 */
export async function GET() {
  const db = new Database(path.join(process.cwd(), "data", "meat_delivery.db"), {
    readonly: true,
  });

  try {
    const totals = {
      companies: (
        db
          .prepare("SELECT COUNT(*) AS n FROM companies WHERE isActive = 1")
          .get() as { n: number }
      ).n,
      products: (db.prepare("SELECT COUNT(*) AS n FROM products").get() as { n: number }).n,
      orders: (db.prepare("SELECT COUNT(*) AS n FROM orders").get() as { n: number }).n,
      delivered: (
        db
          .prepare("SELECT COUNT(*) AS n FROM orders WHERE status = 'delivered'")
          .get() as { n: number }
      ).n,
      revenue: (
        db
          .prepare(
            "SELECT COALESCE(SUM(total), 0) AS n FROM orders WHERE status = 'delivered'"
          )
          .get() as { n: number }
      ).n,
      expenses: (db.prepare("SELECT COUNT(*) AS n FROM expenses").get() as { n: number }).n,
      customers: (
        db.prepare("SELECT COUNT(*) AS n FROM customers").get() as { n: number }
      ).n,
      riders: (db.prepare("SELECT COUNT(*) AS n FROM riders").get() as { n: number }).n,
      suppliers: (
        db.prepare("SELECT COUNT(*) AS n FROM suppliers").get() as { n: number }
      ).n,
      categories: (
        db.prepare("SELECT COUNT(*) AS n FROM categories").get() as { n: number }
      ).n,
      units: (db.prepare("SELECT COUNT(*) AS n FROM units").get() as { n: number }).n,
    };

    const perCompany = db
      .prepare(
        `SELECT
           c.id                AS id,
           c.slug              AS slug,
           c.name              AS name,
           c.tagline           AS tagline,
           c.logoUrl           AS logoUrl,
           c.accentColor       AS accentColor,
           c.isActive          AS isActive,
           c.createdAt         AS createdAt,
           (SELECT COUNT(*) FROM products    WHERE companyId = c.id) AS products,
           (SELECT COUNT(*) FROM orders      WHERE companyId = c.id) AS orders,
           (SELECT COUNT(*) FROM orders      WHERE companyId = c.id AND status = 'delivered') AS delivered,
           (SELECT COALESCE(SUM(total), 0) FROM orders WHERE companyId = c.id AND status = 'delivered') AS revenue,
           (SELECT COUNT(*) FROM expenses     WHERE companyId = c.id) AS expenses,
           (SELECT COUNT(*) FROM suppliers    WHERE companyId = c.id) AS suppliers,
           (SELECT COUNT(*) FROM purchase_orders WHERE companyId = c.id) AS purchaseOrders,
           (SELECT COUNT(*) FROM categories   WHERE companyId = c.id) AS categories,
           (SELECT COUNT(*) FROM units        WHERE companyId = c.id) AS units,
           (SELECT json_extract(data, '$.businessName') FROM settings WHERE companyId = c.id) AS businessName
         FROM companies c
        ORDER BY c.id ASC`
      )
      .all() as Array<{
        id: number;
        slug: string;
        name: string;
        tagline: string;
        logoUrl: string;
        accentColor: string;
        isActive: number;
        createdAt: string;
        products: number;
        orders: number;
        delivered: number;
        revenue: number;
        expenses: number;
        suppliers: number;
        purchaseOrders: number;
        categories: number;
        units: number;
        businessName: string | null;
      }>;

    return NextResponse.json({ totals, companies: perCompany });
  } finally {
    db.close();
  }
}
