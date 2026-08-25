import { NextResponse } from "next/server";
import { getExpenseSummary } from "@/lib/db";
import type { ExpenseCategory } from "@/lib/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;
  const category = searchParams.get("category") || undefined;
  const summary = getExpenseSummary({
    from,
    to,
    category: category as ExpenseCategory | "all" | undefined,
  });
  return NextResponse.json(summary);
}
