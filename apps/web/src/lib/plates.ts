import "server-only";
import { buildPayload } from "@linkq/pix-brcode";
import { eq } from "drizzle-orm";
import { db } from "@/db/client.ts";
import { customers, plates } from "@/db/schema.ts";
import { lookupCandidates } from "./code.ts";
import { decryptSecret } from "./crypto.ts";

export type PublicPlate =
  | { status: "suspended" }
  | {
      status: "active";
      displayName: string;
      merchantName: string;
      keyMask: string;
      brandColor: string | null;
      payload: string;
    };

/** Resolve o código da tag/QR em dados públicos. O payload é montado na hora; a chave nunca sai daqui. */
export async function resolvePlate(
  code: string,
  amountCents: number | undefined,
): Promise<PublicPlate | null> {
  // Códigos aleatórios diferenciam maiúsculas; links personalizados são sempre minúsculos,
  // então /PadariaExemplo também resolve (busca exata primeiro, depois em minúsculas).
  let row:
    | { plate: typeof plates.$inferSelect; customer: typeof customers.$inferSelect }
    | undefined;
  for (const candidate of lookupCandidates(code)) {
    [row] = await db
      .select({ plate: plates, customer: customers })
      .from(plates)
      .innerJoin(customers, eq(plates.customerId, customers.id))
      .where(eq(plates.code, candidate))
      .limit(1);
    if (row) break;
  }
  if (!row) return null;
  if (row.plate.status !== "active") return { status: "suspended" };

  const { customer } = row;
  return {
    status: "active",
    displayName: customer.displayName,
    merchantName: customer.merchantName,
    keyMask: customer.pixKeyMask,
    brandColor: customer.brandColor,
    payload: buildPayload({
      key: decryptSecret(customer.pixKeyEnc),
      merchantName: customer.merchantName,
      merchantCity: customer.merchantCity,
      ...(amountCents === undefined ? {} : { amountCents }),
    }),
  };
}
