import { NextResponse } from "next/server";
import { getCompanies } from "@/lib/db";

/**
 * GET /api/companies
 *
 * Lists every active company so the header switcher can render a dropdown.
 * Inactive companies are hidden (callers can still resolve them via
 * getCompany(id) server-side if needed).
 */
export async function GET() {
  return NextResponse.json(getCompanies());
}
