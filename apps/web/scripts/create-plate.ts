// Cria cliente + plaquinha pela linha de comando (antes do painel admin existir).
// Uso: pnpm --filter @linkq/web plate:create -- --name "Padaria X" --key "<chave pix>" \
//        --merchant "PADARIA X" --city "SAO PAULO" [--color "#ff6a00"] [--label "Balcão"]
import { parseArgs } from "node:util";
import { maskPixKey, normalizeText, parsePixKey } from "@linkq/pix-brcode";
import { db } from "../src/db/client.ts";
import { auditLog, customers, plates } from "../src/db/schema.ts";
import { generatePlateCode, parseCustomCode } from "../src/lib/code.ts";
import { encryptSecret } from "../src/lib/crypto.ts";
import { plateUrl } from "../src/lib/links.ts";

const { values } = parseArgs({
  options: {
    name: { type: "string" },
    key: { type: "string" },
    merchant: { type: "string" },
    city: { type: "string" },
    color: { type: "string" },
    label: { type: "string" },
    code: { type: "string" },
  },
});

if (!values.name || !values.key || !values.merchant || !values.city) {
  console.error("Obrigatórios: --name --key --merchant --city");
  process.exit(1);
}
if (values.color && !/^#[0-9a-fA-F]{6}$/.test(values.color)) {
  console.error("--color deve ser #RRGGBB");
  process.exit(1);
}

const key = parsePixKey(values.key);
let code = generatePlateCode();
if (values.code) {
  const custom = parseCustomCode(values.code);
  if (!custom.ok) {
    console.error(custom.error);
    process.exit(1);
  }
  code = custom.code;
}

await db.transaction(async (tx) => {
  const [customer] = await tx
    .insert(customers)
    .values({
      displayName: values.name as string,
      pixKeyEnc: encryptSecret(key.value),
      pixKeyType: key.type,
      pixKeyMask: maskPixKey(key),
      merchantName: normalizeText(values.merchant as string, 25, "INVALID_NAME"),
      merchantCity: normalizeText(values.city as string, 15, "INVALID_CITY"),
      brandColor: values.color ?? null,
    })
    .returning({ id: customers.id });
  if (!customer) throw new Error("Falha ao criar cliente.");

  await tx.insert(plates).values({ code, customerId: customer.id, label: values.label ?? null });
  await tx.insert(auditLog).values({
    action: "plate.create",
    customerId: customer.id,
    plateCode: code,
    detail: { via: "cli", keyType: key.type },
  });
});

console.log(`Plaquinha criada.\nCódigo: ${code}\nURL para a tag NFC / QR: ${plateUrl(code)}`);
process.exit(0);
