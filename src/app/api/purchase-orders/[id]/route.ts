import { NextResponse } from "next/server";
import { getPurchaseOrder, updatePurchaseOrder, setPurchaseOrderStatus } from "@/lib/db";
import { getCompanyIdFromRequest } from "@/lib/tenant";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const companyId = await getCompanyIdFromRequest(request);
  const { id: idParam } = await params;
  const po = getPurchaseOrder(Number(idParam), companyId);
  if (!po) return NextResponse.json({ error: "PO not found" }, { status: 404 });
  return NextResponse.json(po);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const companyId = await getCompanyIdFromRequest(request);
    const { id: idParam } = await params;
    const id = Number(idParam);
    const data = await request.json();
    let po;
    if (data.status) {
      po = setPurchaseOrderStatus(id, data.status, companyId);
    } else {
      po = updatePurchaseOrder(id, data, companyId);
    }
    if (!po) return NextResponse.json({ error: "PO not found" }, { status: 404 });
    return NextResponse.json(po);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}