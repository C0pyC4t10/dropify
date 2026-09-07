import { NextResponse } from "next/server";
import { getExpenseSummary } from "@/lib/db";
import type { ExpenseCategory } from "@/lib/types";
import { getCompanyIdFromRequest } from "@/lib/tenant";

export async function GET(request: Request) {
  const companyId = await getCompanyIdFromRequest(request);
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;
  const category = searchParams.get("category") || undefined;
  const summary = getExpenseSummary(companyId, {
    from,
    to,
    category: category as ExpenseCategory | "all" | undefined,
  });
  return NextResponse.json(summary);
}
