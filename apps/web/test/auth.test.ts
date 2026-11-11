import { describe, expect, it } from "vitest";
import { appBaseUrl, plateUrl } from "../src/lib/links.ts";
import { hashPassword, validateNewPassword, verifyPassword } from "../src/lib/password.ts";

describe("password", () => {
  it("faz round-trip, usa salt e rejeita senha errada ou hash malformado", async () => {
    const a = await hashPassword("uma senha bem longa 123");
    const b = await hashPassword("uma senha bem longa 123");
    expect(a).not.toBe(b);
    expect(await verifyPassword("uma senha bem longa 123", a)).toBe(true);
    expect(await verifyPassword("outra senha qualquer", a)).toBe(false);
    expect(await verifyPassword("x", "lixo")).toBe(false);
  });
});

describe("validateNewPassword", () => {
  it("aceita senha longa e recusa curta, repetida e com o e-mail", () => {
    expect(validateNewPassword("uma-senha-bem-longa-9", "contato@x.com")).toBeNull();
    expect(validateNewPassword("curta", "contato@x.com")).toMatch(/mínimo 12/);
    expect(validateNewPassword("aaaaaaaaaaaaaaaa", "contato@x.com")).toMatch(/fraca/);
    expect(validateNewPassword("minha-contato-123456", "contato@x.com")).toMatch(/e-mail/);
    expect(validateNewPassword(`${"x".repeat(200)}y`, "a@b.com")).toMatch(/máximo/);
  });
});

describe("links", () => {
  it("monta a URL eterna da plaquinha e rejeita base com path", () => {
    process.env.APP_BASE_URL = "https://gerelink.online";
    expect(plateUrl("raN3FXDf")).toBe("https://gerelink.online/raN3FXDf");
    process.env.APP_BASE_URL = "https://gerelink.online/app";
    expect(() => appBaseUrl()).toThrow();
  });
});
