import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { checkRateLimit } from "@vercel/firewall";
import dbConnect from "@/lib/mongodb";
import Url from "@/models/Url";

const SHORT_CODE_LENGTH = 8;
const MIN_TTL_SECONDS = 60;                  //1 min
const MAX_TTL_SECONDS = 60 * 60 * 24 * 30;   //30 dias
const LINK_TTL_SECONDS = 60 * 15; //15 minutos - Longo o bastante para showcase, curto o bastante para evitar abuso
const MAX_RETRIES = 3;


export async function POST(request: NextRequest) {
  const { rateLimited } = await checkRateLimit('shorten-api', { request });
  if (rateLimited) {
    return NextResponse.json(
      { error: 'Muitas requisições. Tente novamente em instantes.' },
      { status: 429 }
    );
  }

  //Parse do body, JSON inválido não pode derrubar a rota
  let body: { url?: string, ttlSeconds?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Body inválido: envie um JSON com o campo 'url'" },
      { status: 400 }
    );
  }

  //Validação da URL com o construtor nativo
  const { url } = body;
  if (!url || typeof url !== "string") {
    return NextResponse.json(
      { error: "O campo 'url' é obrigatório" },
      { status: 400 }
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json(
      { error: "URL malformada" },
      { status: 400 }
    );
  }

  //Só http/https - bloqueia javascript:, file:, data: etc.
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return NextResponse.json(
      { error: "Apenas URLs http ou https são aceitas" },
      { status: 400 }
    );
  }

  const ttlSecondsRaw = body?.ttlSeconds;
  
  let ttlSeconds = LINK_TTL_SECONDS; //Default quando omitido

  if (ttlSecondsRaw !== undefined) {
    if (
      !Number.isInteger(ttlSecondsRaw) ||
      ttlSecondsRaw < MIN_TTL_SECONDS ||
      ttlSecondsRaw > MAX_TTL_SECONDS
    ) {
      return NextResponse.json(
        { error: `ttlSeconds deve ser um inteiro entre ${MIN_TTL_SECONDS} e ${MAX_TTL_SECONDS}.` },
        { status: 400 }
      );
    }
    ttlSeconds = ttlSecondsRaw;
  }

  await dbConnect();

  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  //Criação com retry em caso de colisão do nanoid
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const shortCode = nanoid(SHORT_CODE_LENGTH);
    try {
      const doc = await Url.create({ originalUrl: url, shortCode, expiresAt });
      return NextResponse.json(
        {
          shortCode: doc.shortCode,
          originalUrl: doc.originalUrl,
          shortUrl: `${request.nextUrl.origin}/${doc.shortCode}`,
          expiresAt,
        },
        { status: 201 }
      );
    } catch (error: unknown) {
      // E11000 = colisão de shortCode: tenta com outro código
      const isDuplicate =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code: number }).code === 11000;

      if (!isDuplicate) throw error; // erro real: 500 natural
      // colisão: loop gera outro nanoid
    }
  }

  return NextResponse.json(
    { error: "Não foi possível gerar um código único, tente novamente" },
    { status: 503 }
  );
}