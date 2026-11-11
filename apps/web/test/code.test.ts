import { describe, expect, it } from "vitest";
import {
  CODE_PATTERN,
  generatePlateCode,
  lookupCandidates,
  parseCustomCode,
} from "../src/lib/code.ts";

describe("parseCustomCode", () => {
  it("aceita e normaliza links personalizados", () => {
    expect(parseCustomCode("padariaexemplo-testeunico")).toEqual({
      ok: true,
      code: "padariaexemplo-testeunico",
    });
    expect(parseCustomCode("  Padaria-Exemplo ")).toEqual({ ok: true, code: "padaria-exemplo" });
    expect(parseCustomCode("mesa-3")).toEqual({ ok: true, code: "mesa-3" });
  });

  it.each([
    "ab",
    "a".repeat(41),
    "-padaria",
    "padaria-",
    "padaria--exemplo",
    "padaria exemplo",
    "padaria_exemplo",
    "padaría",
    "padaria/exemplo",
    "padaria.exemplo",
    "../admin",
    "",
  ])("rejeita %j", (input) => {
    expect(parseCustomCode(input).ok).toBe(false);
  });

  it.each(["admin", "API", "login", "robots"])("rejeita nome reservado %j", (input) => {
    const result = parseCustomCode(input);
    expect(result.ok).toBe(false);
  });
});

describe("CODE_PATTERN", () => {
  it("aceita código aleatório e personalizado, e recusa o resto", () => {
    expect(CODE_PATTERN.test(generatePlateCode())).toBe(true);
    expect(CODE_PATTERN.test("raN3FXDf")).toBe(true);
    expect(CODE_PATTERN.test("padariaexemplo-testeunico")).toBe(true);
    expect(CODE_PATTERN.test("Padaria-Exemplo")).toBe(false);
    expect(CODE_PATTERN.test("a b")).toBe(false);
    expect(CODE_PATTERN.test("x/../y")).toBe(false);
    expect(CODE_PATTERN.test("")).toBe(false);
  });
});

describe("lookupCandidates", () => {
  it("tenta exato e depois minúsculas, só com formatos válidos", () => {
    expect(lookupCandidates("raN3FXDf")).toEqual(["raN3FXDf", "ran3fxdf"]);
    expect(lookupCandidates("Padaria-Exemplo")).toEqual(["padaria-exemplo"]);
    expect(lookupCandidates("padaria-exemplo")).toEqual(["padaria-exemplo"]);
    expect(lookupCandidates("a b")).toEqual([]);
  });
});
