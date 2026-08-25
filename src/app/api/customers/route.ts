import { NextResponse } from "next/server";
import { getCustomers, createCustomer, findCustomerByPhone } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";

// GET /api/customers → list
// GET /api/customers?phone=01711234567 → uniqueness check (returns existing or null)
export async function GET(request: Request) {
  const url = new URL(request.url);
  const phoneParam = url.searchParams.get("phone");
  if (phoneParam !== null) {
    if (!normalizePhone(phoneParam)) {
      return NextResponse.json({ match: null });
    }
    const existing = findCustomerByPhone(phoneParam);
    if (!existing) {
      return NextResponse.json({ match: null });
    }
    return NextResponse.json({
      match: {
        id: existing.id,
        name: existing.name,
        phone: existing.phone,
        area: existing.area,
      },
    });
  }
  return NextResponse.json(getCustomers());
}

export async function POST(request: Request) {
  try {
    const data = await request.json();
    if (!data.name || !data.name.trim()) {
      return NextResponse.json({ ok: false, error: "Customer name is required" }, { status: 400 });
    }
    if (!data.phone || !normalizePhone(String(data.phone))) {
      return NextResponse.json({ ok: false, error: "Phone is required" }, { status: 400 });
    }
    const result = createCustomer(data);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, duplicate: result.duplicate, error: "Customer with this phone already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: true, customer: result.customer }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
