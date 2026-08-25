import { NextResponse } from "next/server";
import { getDashboard } from "@/lib/db";

export async function GET() {
  return NextResponse.json(getDashboard());
}