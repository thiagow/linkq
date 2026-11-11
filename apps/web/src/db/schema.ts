import { sql } from "drizzle-orm";
import {
  bigserial,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const plateStatus = pgEnum("plate_status", ["active", "suspended"]);
export const pixKeyType = pgEnum("pix_key_type", ["cpf", "cnpj", "email", "phone", "random"]);

export const operators = pgTable("operators", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 do token do cookie; o token em si nunca é guardado. */
    tokenHash: text("token_hash").primaryKey(),
    operatorId: uuid("operator_id")
      .notNull()
      .references(() => operators.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_operator_idx").on(t.operatorId)],
);

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Nome exibido na página de pagamento. */
  displayName: text("display_name").notNull(),
  pixKeyEnc: text("pix_key_enc").notNull(),
  pixKeyType: pixKeyType("pix_key_type").notNull(),
  /** Versão mascarada, pré-computada para exibição pública sem decifrar. */
  pixKeyMask: text("pix_key_mask").notNull(),
  merchantName: varchar("merchant_name", { length: 25 }).notNull(),
  merchantCity: varchar("merchant_city", { length: 15 }).notNull(),
  brandColor: varchar("brand_color", { length: 7 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const plates = pgTable(
  "plates",
  {
    /** Código curto e aleatório gravado na tag NFC / QR. */
    code: varchar("code", { length: 8 }).primaryKey(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    label: text("label"),
    status: plateStatus("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("plates_customer_idx").on(t.customerId)],
);

/** Append-only: um trigger no banco bloqueia UPDATE e DELETE. */
export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  /** Sem FK de propósito: o log é imutável e não pode impedir a remoção de um operador. */
  operatorId: uuid("operator_id"),
  action: text("action").notNull(),
  customerId: uuid("customer_id"),
  plateCode: varchar("plate_code", { length: 8 }),
  detail: jsonb("detail").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Contador por janela para rate limit compartilhado entre instâncias. */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});
