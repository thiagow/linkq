ALTER TABLE "audit_log" ALTER COLUMN "plate_code" SET DATA TYPE varchar(40);--> statement-breakpoint
ALTER TABLE "plates" ALTER COLUMN "code" SET DATA TYPE varchar(40);