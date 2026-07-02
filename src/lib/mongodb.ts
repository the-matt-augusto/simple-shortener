import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("Defina a variável MONGODB_URI em .env.local");
}

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache = globalThis.mongooseCache ?? {
  conn: null,
  promise: null,
};

globalThis.mongooseCache = cached;

export default async function dbConnect(): Promise<typeof mongoose> {
  // 1. Já conectado neste container? Retorna na hora.
  if (cached.conn) {
    return cached.conn;
  }

  // 2. Conexão em andamento? Aguarda a MESMA promise, não abre outra.
  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI as string, {
      bufferCommands: false,
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (error) {
    // Se a conexão falhou, limpa a promise para permitir retry
    // no próximo request (senão ficaríamos presos numa promise rejeitada)
    cached.promise = null;
    throw error;
  }

  return cached.conn;
}