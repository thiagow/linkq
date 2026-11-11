"use server";

import { maskPixKey, normalizeText, PixError, parsePixKey } from "@linkq/pix-brcode";
import { count, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client.ts";
import { auditLog, customers, operators, plates } from "@/db/schema.ts";
import { CODE_PATTERN, generatePlateCode, parseCustomCode } from "@/lib/code.ts";
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
  code: z.string().trim().max(60).default(""),
});

/** Violação de unicidade do Postgres (o driver embrulha o erro original em `cause`). */
function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return (e.cause?.code ?? e.code) === "23505";
}

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
  customCode?: string,
): Promise<string[]> {
  if (customCode) {
    await tx.insert(plates).values({ code: customCode, customerId, label });
    return [customCode];
  }
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

  let customCode: string | undefined;
  if (data.code !== "") {
    if (data.quantity !== 1) {
      fail("/admin/customers/new", "Link personalizado vale para 1 plaquinha por vez.");
    }
    const custom = parseCustomCode(data.code);
    if (!custom.ok) fail("/admin/customers/new", custom.error);
    customCode = custom.code;
  }

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

  let codes: string[];
  try {
    codes = await db.transaction(async (tx) => {
      const [customer] = await tx.insert(customers).values(values).returning({ id: customers.id });
      if (!customer) throw new Error("Falha ao criar cliente.");
      const created = await insertPlates(tx, customer.id, data.quantity, null, customCode);
      await tx.insert(auditLog).values({
        action: "customer.create",
        operatorId,
        customerId: customer.id,
        detail: { plates: created.length, keyType: values.pixKeyType, mask: values.pixKeyMask },
      });
      return created;
    });
  } catch (error) {
    if (customCode && isUniqueViolation(error)) {
      fail("/admin/customers/new", "Este link já está em uso. Escolha outro.");
    }
    throw error;
  }

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

/**
 * Troca o código (o final do link) da plaquinha. O link antigo deixa de funcionar: tags NFC e QR
 * já gravados com ele precisam ser regravados, por isso exige confirmação explícita.
 */
export async function renamePlateAction(formData: FormData) {
  const { operatorId } = await requireOperator();
  const code = String(formData.get("code") ?? "");
  if (!CODE_PATTERN.test(code)) redirect("/admin");
  const path = `/admin/plates/${code}`;

  if (formData.get("confirm") !== "yes") {
    fail(path, "Marque a confirmação para trocar o link da plaquinha.");
  }
  const next = parseCustomCode(String(formData.get("newCode") ?? ""));
  if (!next.ok) fail(path, next.error);
  if (next.code === code) fail(path, "O novo link é igual ao atual.");

  try {
    await db.transaction(async (tx) => {
      const updated = await tx
        .update(plates)
        .set({ code: next.code })
        .where(eq(plates.code, code))
        .returning({ customerId: plates.customerId });
      const customerId = updated[0]?.customerId;
      if (!customerId) throw new Error("not_found");
      await tx.insert(auditLog).values({
        action: "plate.rename",
        operatorId,
        customerId,
        plateCode: next.code,
        detail: { from: code, to: next.code },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) fail(path, "Este link já está em uso. Escolha outro.");
    if (error instanceof Error && error.message === "not_found") redirect("/admin");
    throw error;
  }
  redirect(`/admin/plates/${next.code}?saved=1`);
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
  redirect(formData.get("from") === "list" ? "/admin" : `/admin/plates/${code}`);
}

/**
 * Exclui a plaquinha de forma definitiva: o link gravado na tag/QR passa a dar "não encontrado".
 * Se era a última do cliente, o cliente (e a chave Pix cifrada) também é removido. Para algo
 * reversível, use suspender.
 */
export async function deletePlateAction(formData: FormData) {
  const { operatorId } = await requireOperator();
  const code = String(formData.get("code") ?? "");
  if (!CODE_PATTERN.test(code)) redirect("/admin");
  if (formData.get("confirm") !== "yes") {
    fail(`/admin/plates/${code}`, "Marque a confirmação para excluir a plaquinha.");
  }

  await db.transaction(async (tx) => {
    const [plate] = await tx.select().from(plates).where(eq(plates.code, code)).limit(1);
    if (!plate) return;
    const [customer] = await tx
      .select({ name: customers.displayName, mask: customers.pixKeyMask })
      .from(customers)
      .where(eq(customers.id, plate.customerId))
      .limit(1);
    await tx.delete(plates).where(eq(plates.code, code));
    const [remaining] = await tx
      .select({ n: count() })
      .from(plates)
      .where(eq(plates.customerId, plate.customerId));
    const customerDeleted = (remaining?.n ?? 0) === 0;
    if (customerDeleted) await tx.delete(customers).where(eq(customers.id, plate.customerId));
    await tx.insert(auditLog).values({
      action: "plate.delete",
      operatorId,
      customerId: plate.customerId,
      plateCode: code,
      detail: { customer: customer?.name ?? null, mask: customer?.mask ?? null, customerDeleted },
    });
  });
  redirect("/admin");
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
