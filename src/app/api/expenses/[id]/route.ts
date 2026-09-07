import { NextResponse } from "next/server";
import { deleteExpense, getExpense, updateExpense } from "@/lib/db";
import { getCompanyIdFromRequest } from "@/lib/tenant";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const companyId = await getCompanyIdFromRequest(request);
  const { id: idParam } = await params;
  const id = Number(idParam);
  const expense = getExpense(id, companyId);
  if (!expense) return NextResponse.json({ error: "Expense not found" }, { status: 404 });
  return NextResponse.json(expense);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const companyId = await getCompanyIdFromRequest(request);
    const { id: idParam } = await params;
    const id = Number(idParam);
    const body = await request.json();
    const updated = updateExpense(id, body, companyId);
    if (!updated) return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const companyId = await getCompanyIdFromRequest(request);
    const { id: idParam } = await params;
    const id = Number(idParam);
    const ok = deleteExpense(id, companyId);
    if (!ok) return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
