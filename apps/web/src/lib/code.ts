import { randomInt } from "node:crypto";

// Base58 sem 0/O/I/l: legível em plaquinha impressa e sem ambiguidade ao digitar.
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export const CODE_LENGTH = 8;
export const CODE_MAX_LENGTH = 40;

/** Código aleatório gerado pelo sistema (8 caracteres base58, diferencia maiúsculas). */
export const RANDOM_CODE_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{8}$/;

/** Código personalizado: minúsculas, números e hífen entre eles; 3 a 40 caracteres. */
export const SLUG_PATTERN = /^(?=.{3,40}$)[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Qualquer código válido de plaquinha (aleatório ou personalizado). */
export const CODE_PATTERN = new RegExp(
  `(?:${RANDOM_CODE_PATTERN.source})|(?:${SLUG_PATTERN.source})`,
);

// Rotas do app e nomes que não podem virar código (o segmento fixo ganharia da plaquinha).
const RESERVED = new Set([
  "admin",
  "api",
  "login",
  "logout",
  "conta",
  "account",
  "health",
  "robots",
  "sitemap",
  "favicon",
  "static",
  "public",
  "assets",
  "www",
  "app",
  "null",
  "undefined",
]);

/** Código aleatório criptograficamente seguro (~46 bits): não sequencial, não enumerável. */
export function generatePlateCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

/**
 * Valida um código personalizado digitado pelo operador. Devolve o código normalizado
 * (minúsculas, sem espaços nas pontas) ou a mensagem de erro.
 */
export function parseCustomCode(
  input: string,
): { ok: true; code: string } | { ok: false; error: string } {
  const code = input.trim().toLowerCase();
  if (code.length < 3 || code.length > CODE_MAX_LENGTH) {
    return { ok: false, error: `O link deve ter entre 3 e ${CODE_MAX_LENGTH} caracteres.` };
  }
  if (!SLUG_PATTERN.test(code)) {
    return {
      ok: false,
      error:
        "Use só letras minúsculas sem acento, números e hífen (sem hífen no começo, no fim ou repetido).",
    };
  }
  if (RESERVED.has(code)) return { ok: false, error: "Este nome é reservado. Escolha outro." };
  return { ok: true, code };
}

/** Candidatos de busca para o que veio na URL: exato primeiro, depois em minúsculas. */
export function lookupCandidates(raw: string): string[] {
  const list = [raw];
  const lower = raw.toLowerCase();
  if (lower !== raw) list.push(lower);
  return list.filter((c) => CODE_PATTERN.test(c));
}
