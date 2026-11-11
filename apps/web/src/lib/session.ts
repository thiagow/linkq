import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt, ne } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db/client.ts";
import { operators, sessions } from "@/db/schema.ts";

const COOKIE = "lq_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

async function writeCookie(token: string, ttlMs: number) {
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: Math.floor(ttlMs / 1000),
  });
}

/** Abre a sessão do operador (senha já verificada) e grava o cookie. */
export async function startSession(operatorId: string) {
  const token = randomBytes(32).toString("base64url");
  await db.insert(sessions).values({
    tokenHash: hashToken(token),
    operatorId,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  await writeCookie(token, SESSION_TTL_MS);
}

export const getSession = cache(async () => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const [row] = await db
    .select({
      tokenHash: sessions.tokenHash,
      operatorId: operators.id,
      email: operators.email,
    })
    .from(sessions)
    .innerJoin(operators, eq(sessions.operatorId, operators.id))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return row ?? null;
});

export async function endSession() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  store.delete(COOKIE);
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

/** Encerra todas as sessões do operador, exceto a atual (usado após trocar a senha). */
export async function revokeOtherSessions(operatorId: string, keepTokenHash: string) {
  await db
    .delete(sessions)
    .where(and(eq(sessions.operatorId, operatorId), ne(sessions.tokenHash, keepTokenHash)));
}

/** Exige operador autenticado. Use em TODA página e ação do painel. */
export async function requireOperator() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/**
 * IP do cliente para rate limit. Na Netlify, `x-nf-client-connection-ip` é definido pela borda
 * (o cliente não consegue forjá-lo); x-forwarded-for fica só como fallback de dev local.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  return h.get("x-nf-client-connection-ip") || forwarded?.split(",")[0]?.trim() || "unknown";
}
