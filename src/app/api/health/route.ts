import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import mongoose from "mongoose";

export async function GET() {
  const startedAt = Date.now();

  try{
    await dbConnect();

    const db = mongoose.connection.db;
    if (!db) throw new Error("Sem handle do banco!");
    await db.admin().ping();

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