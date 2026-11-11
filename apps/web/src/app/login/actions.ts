"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client.ts";
import { auditLog, operators } from "@/db/schema.ts";
import { burnPasswordCheck, verifyPassword } from "@/lib/password.ts";
import { rateLimit } from "@/lib/rate-limit.ts";
import { clientIp, endSession, startSession } from "@/lib/session.ts";

const credentials = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(256),
});

export async function loginAction(formData: FormData) {
  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) redirect("/login?error=invalid");
  const { email, password } = parsed.data;

  const ip = await clientIp();
  const allowed =
    (await rateLimit(`login:ip:${ip}`, 20, 15 * 60)) &&
    (await rateLimit(`login:email:${email}`, 6, 15 * 60));
  if (!allowed) redirect("/login?error=throttled");

  const [operator] = await db.select().from(operators).where(eq(operators.email, email)).limit(1);
  if (!operator) {
    await burnPasswordCheck(password);
    redirect("/login?error=invalid");
  }
  if (!(await verifyPassword(password, operator.passwordHash))) redirect("/login?error=invalid");

  await startSession(operator.id);
  await db.insert(auditLog).values({
    action: "operator.login",
    operatorId: operator.id,
    detail: { ip },
  });
  redirect("/admin");
}

export async function logoutAction() {
  await endSession();
  redirect("/login");
}
