import { NextResponse } from "next/server";
import { updateRider } from "@/lib/db";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: idParam } = await params;
    const data = await request.json();
    const rider = updateRider(Number(idParam), data);
    if (!rider) return NextResponse.json({ error: "Rider not found" }, { status: 404 });
    return NextResponse.json(rider);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}