import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Url from "@/models/Url";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ shortCode: string }> }
) {
  const { shortCode } = await params;

  await dbConnect();

  //Busca + incremento de cliques em uma operação atômica
  const doc = await Url.findOneAndUpdate(
    { shortCode },
    { $inc: { clicks: 1 } }
  );

  if (!doc) {
    return NextResponse.json(
      { error: "URL não encontrada" },
      { status: 404 }
    );
  }
  
  return NextResponse.redirect(doc.originalUrl, 302);
}