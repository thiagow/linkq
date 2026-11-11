ALTER TABLE "operators" DROP COLUMN "totp_secret_enc";--> statement-breakpoint
ALTER TABLE "operators" DROP COLUMN "totp_last_step";--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN "mfa_verified";