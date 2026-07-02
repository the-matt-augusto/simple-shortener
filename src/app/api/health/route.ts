import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";

export async function GET() {
  const startedAt = Date.now();

  try{
    await dbConnect();

    return NextResponse.json({ 
      status: "healthy",
      checks: { database: "up" },
      latencyMs: Date.now() - startedAt
    });
  } catch {
    return NextResponse.json(
      {
        status: "unhealthy",
        checks: { database: "down" },
        latencyMs: Date.now() - startedAt,
      },
      { status: 503 }
    );
  }
}