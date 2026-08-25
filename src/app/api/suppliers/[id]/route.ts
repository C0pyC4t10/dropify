import { NextResponse } from "next/server";
import { updateSupplier } from "@/lib/db";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: idParam } = await params;
    const data = await request.json();
    const supplier = updateSupplier(Number(idParam), data);
    if (!supplier) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
    return NextResponse.json(supplier);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}