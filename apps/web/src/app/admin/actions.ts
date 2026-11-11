"use server";

import { maskPixKey, normalizeText, PixError, parsePixKey } from "@linkq/pix-brcode";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client.ts";
import { auditLog, customers, operators, plates } from "@/db/schema.ts";
import { CODE_PATTERN, generatePlateCode } from "@/lib/code.ts";
import { encryptSecret } from "@/lib/crypto.ts";
import { hashPassword, validateNewPassword, verifyPassword } from "@/lib/password.ts";
import { rateLimit } from "@/lib/rate-limit.ts";
import { requireOperator, revokeOtherSessions } from "@/lib/session.ts";

const color = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .or(z.literal(""))
  .transform((v) => (v === "" ? null : v));

const customerFields = z.object({
  displayName: z.string().trim().min(2).max(80),
  merchantName: z.string().trim().min(1).max(60),
  city: z.string().trim().min(1).max(60),
  color,
});

const newCustomer = customerFields.extend({
  key: z.string().trim().min(1).max(120),
  quantity: z.coerce.number().int().min(1).max(100),
});

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function describe(error: unknown): string {
  return error instanceof PixError ? error.message : "Dados inválidos. Revise os campos.";
}

/** Gera códigos únicos; colisão é improvável (~46 bits) mas é tratada com retry. */
async function insertPlates(
  tx: Pick<typeof db, "insert">,
  customerId: string,
  quantity: number,
  label: string | null,
): Promise<string[]> {
  const codes = new Set<string>();
  while (codes.size < quantity) codes.add(generatePlateCode());
  const list = [...codes];
  await tx.insert(plates).values(list.map((code) => ({ code, customerId, label })));
  return list;
}

export async function createCustomerAction(formData: FormData) {
  const { operatorId } = await requireOperator();
  const parsed = newCustomer.safeParse(Object.fromEntries(formData));
  if (!parsed.success) fail("/admin/customers/new", "Dados inválidos. Revise os campos.");
  const data = parsed.data;

  let values: typeof customers.$inferInsert;
  try {
    const key = parsePixKey(data.key);
    values = {
      displayName: data.displayName,
      pixKeyEnc: encryptSecret(key.value),
      pixKeyType: key.type,
      pixKeyMask: maskPixKey(key),
      merchantName: normalizeText(data.merchantName, 25, "INVALID_NAME"),
      merchantCity: normalizeText(data.city, 15, "INVALID_CITY"),
      brandColor: data.color,
    };
  } catch (error) {
    fail("/admin/customers/new", describe(error));
  }

  const codes = await db.transaction(async (tx) => {
    const [customer] = await tx.insert(customers).values(values).returning({ id: customers.id });
    if (!customer) throw new Error("Falha ao criar cliente.");
    const created = await insertPlates(tx, customer.id, data.quantity, null);
    await tx.insert(auditLog).values({
      action: "customer.create",
      operatorId,
      customerId: customer.id,
      detail: { plates: created.length, keyType: values.pixKeyType, mask: values.pixKeyMask },
    });
    return created;
  });

  redirect(codes.length === 1 ? `/admin/plates/${codes[0]}` : "/admin");
}

export async function updateCustomerAction(formData: FormData) {
  const { operatorId } = await requireOperator();
  const code = String(formData.get("code") ?? "");
  if (!CODE_PATTERN.test(code)) redirect("/admin");
  const parsed = customerFields.safeParse(Object.fromEntries(formData));
  if (!parsed.success) fail(`/admin/plates/${code}`, "Dados inválidos. Revise os campos.");

  const [plate] = await db.select().from(plates).where(eq(plates.code, code)).limit(1);
  if (!plate) redirect("/admin");

  try {
    await db
      .update(customers)
      .set({
        displayName: parsed.data.displayName,
        merchantName: normalizeText(parsed.data.merchantName, 25, "INVALID_NAME"),
        merchantCity: normalizeText(parsed.data.city, 15, "INVALID_CITY"),
        brandColor: parsed.data.color,
      })
      .where(eq(customers.id, plate.customerId));
  } catch (error) {
    fail(`/admin/plates/${code}`, describe(error));
  }
  await db.insert(auditLog).values({
    action: "customer.update",
    operatorId,
    customerId: plate.customerId,
    plateCode: code,
    detail: {},
  });
  redirect(`/admin/plates/${code}?saved=1`);
}

/** Troca de chave Pix: exige justificativa e fica registrada na auditoria. */
export async function changeKeyAction(formData: FormData) {
  const { operatorId } = await requireOperator();
  const code = String(formData.get("code") ?? "");
  if (!CODE_PATTERN.test(code)) redirect("/admin");
  const path = `/admin/plates/${code}`;

  if (!(await rateLimit(`keychange:${operatorId}`, 5, 10 * 60))) {
    fail(path, "Muitas tentativas. Aguarde alguns minutos.");
  }
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 5 || reason.length > 300)
    fail(path, "Informe a justificativa (5 a 300 caracteres).");

  const [row] = await db
    .select({ plate: plates, customer: customers })
    .from(plates)
    .innerJoin(customers, eq(plates.customerId, customers.id))
    .where(eq(plates.code, code))
    .limit(1);
  if (!row) redirect("/admin");

  try {
    const key = parsePixKey(String(formData.get("key") ?? ""));
    await db.transaction(async (tx) => {
      await tx
        .update(customers)
        .set({
          pixKeyEnc: encryptSecret(key.value),
          pixKeyType: key.type,
          pixKeyMask: maskPixKey(key),
        })
        .where(eq(customers.id, row.customer.id));
      await tx.insert(auditLog).values({
        action: "customer.key_change",
        operatorId,
        customerId: row.customer.id,
        plateCode: code,
        detail: { from: row.customer.pixKeyMask, to: maskPixKey(key), reason },
      });
    });
  } catch (error) {
    fail(path, describe(error));
  }
  redirect(`${path}?saved=1`);
}

export async function setPlateStatusAction(formData: FormData) {
  const { operatorId } = await requireOperator();
  const code = String(formData.get("code") ?? "");
  const status = formData.get("status") === "suspended" ? "suspended" : "active";
  if (!CODE_PATTERN.test(code)) redirect("/admin");

  const updated = await db
    .update(plates)
    .set({ status })
    .where(eq(plates.code, code))
    .returning({ customerId: plates.customerId });
  const customerId = updated[0]?.customerId;
  if (customerId) {
    await db.insert(auditLog).values({
      action: status === "suspended" ? "plate.suspend" : "plate.activate",
      operatorId,
      customerId,
      plateCode: code,
      detail: {},
    });
  }
  redirect(`/admin/plates/${code}`);
}

export async function addPlatesAction(formData: FormData) {
  const { operatorId } = await requireOperator();
  const code = String(formData.get("code") ?? "");
  const quantity = z.coerce.number().int().min(1).max(100).safeParse(formData.get("quantity"));
  if (!CODE_PATTERN.test(code) || !quantity.success) redirect("/admin");

  const [plate] = await db.select().from(plates).where(eq(plates.code, code)).limit(1);
  if (!plate) redirect("/admin");

  const created = await db.transaction(async (tx) => {
    const list = await insertPlates(tx, plate.customerId, quantity.data, plate.label);
    await tx.insert(auditLog).values({
      action: "plate.create",
      operatorId,
      customerId: plate.customerId,
      detail: { count: list.length },
    });
    return list;
  });
  redirect(created.length === 1 ? `/admin/plates/${created[0]}` : "/admin");
}

/** Troca a senha do operador logado: exige a senha atual e encerra as outras sessões. */
export async function changePasswordAction(formData: FormData) {
  const session = await requireOperator();
  const path = "/admin/account";

  if (!(await rateLimit(`pwchange:${session.operatorId}`, 5, 10 * 60))) {
    fail(path, "Muitas tentativas. Aguarde alguns minutos.");
  }

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const [operator] = await db
    .select({ passwordHash: operators.passwordHash })
    .from(operators)
    .where(eq(operators.id, session.operatorId))
    .limit(1);
  if (!operator || !(await verifyPassword(current, operator.passwordHash))) {
    fail(path, "Senha atual incorreta.");
  }
  if (next !== confirm) fail(path, "A confirmação não confere com a nova senha.");
  const problem = validateNewPassword(next, session.email);
  if (problem) fail(path, problem);
  if (await verifyPassword(next, operator.passwordHash)) {
    fail(path, "A nova senha deve ser diferente da atual.");
  }
  await db
    .update(operators)
    .set({ passwordHash: await hashPassword(next) })
    .where(eq(operators.id, session.operatorId));
  await revokeOtherSessions(session.operatorId, session.tokenHash);
  await db.insert(auditLog).values({
    action: "operator.password_change",
    operatorId: session.operatorId,
    detail: {},
  });
  redirect(`${path}?saved=1`);
}
