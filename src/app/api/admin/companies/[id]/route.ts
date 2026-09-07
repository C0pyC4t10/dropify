import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

/**
 * DELETE /api/admin/companies/[id] — permanently remove a tenant and every
 * per-company row (products, orders, settings, suppliers, expenses, POs,
 * categories, units, stock movements). Customers and riders are SHARED so
 * they're untouched.
 *
 * This is a hard delete. We refuse to delete the meat company (id=1, slug='meat')
 * since it's the bootstrap tenant — use the PATCH endpoint with isActive=false
 * to deactivate it instead.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idParam } = await params;
    const id = Number(idParam);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    }
    if (id === 1) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "The default company (id=1) cannot be deleted. Set isActive=false via PATCH instead.",
        },
        { status: 400 }
      );
    }
    // Open a separate connection so we can wrap the deletes in a
    // transaction without touching the global connection the rest of the
    // app uses.
    const db = new Database(path.join(process.cwd(), "data", "meat_delivery.db"));
    const tx = db.transaction(() => {
      // Order matters only for FK clarity; SQLite doesn't enforce FKs by default.
      db.prepare("DELETE FROM orders WHERE companyId = ?").run(id);
      db.prepare("DELETE FROM stock_movements WHERE companyId = ?").run(id);
      db.prepare("DELETE FROM purchase_orders WHERE companyId = ?").run(id);
      db.prepare("DELETE FROM suppliers WHERE companyId = ?").run(id);
      db.prepare("DELETE FROM expenses WHERE companyId = ?").run(id);
      db.prepare("DELETE FROM products WHERE companyId = ?").run(id);
      db.prepare("DELETE FROM categories WHERE companyId = ?").run(id);
      db.prepare("DELETE FROM units WHERE companyId = ?").run(id);
      db.prepare("DELETE FROM settings WHERE companyId = ?").run(id);
      db.prepare("DELETE FROM companies WHERE id = ?").run(id);
    });
    tx();
    db.close();
    return NextResponse.json({ ok: true, deletedId: id });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
