import { NextResponse } from "next/server";
import { getPurchaseOrder, updatePurchaseOrder, setPurchaseOrderStatus } from "@/lib/db";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await params;
  const po = getPurchaseOrder(Number(idParam));
  if (!po) return NextResponse.json({ error: "PO not found" }, { status: 404 });
  return NextResponse.json(po);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: idParam } = await params;
    const id = Number(idParam);
    const data = await request.json();
    let po;
    if (data.status) {
      po = setPurchaseOrderStatus(id, data.status);
    } else {
      po = updatePurchaseOrder(id, data);
    }
    if (!po) return NextResponse.json({ error: "PO not found" }, { status: 404 });
    return NextResponse.json(po);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}