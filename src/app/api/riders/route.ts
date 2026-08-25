import { NextResponse } from "next/server";
import { getRiders, createRider } from "@/lib/db";

export async function GET() {
  return NextResponse.json(getRiders());
}

export async function POST(request: Request) {
  try {
    const data = await request.json();
    const rider = createRider(data);
    return NextResponse.json(rider, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}