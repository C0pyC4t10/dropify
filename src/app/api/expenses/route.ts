import { NextResponse } from "next/server";
import { createExpense, getExpenses } from "@/lib/db";
import type { ExpenseCategory, ExpensePaymentMethod } from "@/lib/types";
import { getCompanyIdFromRequest } from "@/lib/tenant";

const ALLOWED_CATEGORIES: ExpenseCategory[] = [
  "utilities",
  "salary",
  "rent",
  "fuel",
  "packaging",
  "marketing",
  "maintenance",
  "office",
  "other",
];

const ALLOWED_METHODS: ExpensePaymentMethod[] = ["cash", "bkash", "bank", "other"];

export async function GET(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;
  const category = searchParams.get("category") || undefined;
  const limitStr = searchParams.get("limit");
  const limit = limitStr ? parseInt(limitStr, 10) : undefined;

  const list = getExpenses(companyId, {
    from,
    to,
    category: category as ExpenseCategory | "all" | undefined,
    limit: Number.isFinite(limit) ? (limit as number) : undefined,
  });
  return NextResponse.json(list);
}

export async function POST(request: Request) {
  try {
    const companyId = await getCompanyIdFromRequest(request);
    const body = (await request.json()) as {
      date?: string;
      category?: string;
      amount?: number;
      vendor?: string;
      paymentMethod?: string;
      note?: string;
      createdBy?: string;
    };
    if (typeof body.amount !== "number" || !Number.isFinite(body.amount) || body.amount < 0) {
      return NextResponse.json(
        { error: "amount is required and must be a non-negative number." },
        { status: 400 }
      );
    }
    if (body.category && !(ALLOWED_CATEGORIES as string[]).includes(String(body.category))) {
      return NextResponse.json(
        { error: `Unknown category "${body.category}".` },
        { status: 400 }
      );
    }
    if (
      body.paymentMethod &&
      !(ALLOWED_METHODS as string[]).includes(String(body.paymentMethod))
    ) {
      return NextResponse.json(
        { error: `Unknown paymentMethod "${body.paymentMethod}".` },
        { status: 400 }
      );
    }
    const expense = createExpense({
      date: body.date,
      category: body.category as ExpenseCategory | undefined,
      amount: body.amount,
      vendor: body.vendor,
      paymentMethod: body.paymentMethod as ExpensePaymentMethod | undefined,
      note: body.note,
      createdBy: body.createdBy,
    }, companyId);
    return NextResponse.json(expense, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
