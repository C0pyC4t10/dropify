import { NextResponse } from "next/server";
import { deleteCustomer } from "@/lib/db";

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { ids, action } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "ids must be a non-empty array" }, { status: 400 });
    }

    const results: Array<{ id: number; ok: boolean; error?: string }> = [];

    if (action === "delete") {
      for (const id of ids) {
        try {
          const ok = deleteCustomer(Number(id));
          results.push({ id: Number(id), ok });
        } catch (e) {
          results.push({ id: Number(id), ok: false, error: String(e) });
        }
      }
    } else {
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    return NextResponse.json({ success: true, processed: results.length, results });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
