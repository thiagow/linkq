// Cria um operador do painel (e-mail + senha). Não há cadastro público.
// Uso: OPERATOR_PASSWORD='<min. 12 caracteres>' pnpm --filter @linkq/web operator:create -- --email voce@empresa.com
import { parseArgs } from "node:util";
import { db } from "../src/db/client.ts";
import { auditLog, operators } from "../src/db/schema.ts";
import { hashPassword, MIN_PASSWORD_LENGTH } from "../src/lib/password.ts";

// Alguns gerenciadores repassam o "--" do `pnpm run … -- --email x` como argumento literal.
const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== "--"),
  options: { email: { type: "string" } },
});
const password = process.env.OPERATOR_PASSWORD;

if (!values.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
  console.error("Informe --email válido.");
  process.exit(1);
}
if (!password || password.length < MIN_PASSWORD_LENGTH) {
  console.error(`Defina OPERATOR_PASSWORD com no mínimo ${MIN_PASSWORD_LENGTH} caracteres.`);
  process.exit(1);
}

const email = values.email.trim().toLowerCase();

try {
  const passwordHash = await hashPassword(password);
  await db.transaction(async (tx) => {
    const [operator] = await tx
      .insert(operators)
      .values({ email, passwordHash })
      .returning({ id: operators.id });
    await tx.insert(auditLog).values({
      action: "operator.create",
      operatorId: operator?.id ?? null,
      detail: { email, via: "cli" },
    });
  });
} catch (error) {
  const cause = (error as { cause?: { code?: string; message?: string } }).cause;
  if (cause?.code === "23505") {
    console.error(`Já existe um operador com o e-mail ${email}.`);
  } else {
    console.error(`Falha ao criar operador: ${cause?.message ?? (error as Error).message}`);
  }
  process.exit(1);
}

console.log(`Operador ${email} criado.`);
process.exit(0);
