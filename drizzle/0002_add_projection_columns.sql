-- Task 1.2 / 1.3 — projection columns (contentHash + lastProjectedAt + projectionError).
-- Additive: nullable columns so legacy rows re-parse once (D2 incremental projection).

ALTER TABLE "specs" ADD COLUMN "content_hash" varchar; --> statement-breakpoint
ALTER TABLE "requirements" ADD COLUMN "content_hash" varchar; --> statement-breakpoint
ALTER TABLE "scenarios" ADD COLUMN "content_hash" varchar; --> statement-breakpoint
ALTER TABLE "changes" ADD COLUMN "content_hash" varchar; --> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN "content_hash" varchar; --> statement-breakpoint
ALTER TABLE "delta_specs" ADD COLUMN "content_hash" varchar; --> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "content_hash" varchar; --> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "last_projected_at" timestamp; --> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "projection_error" text;
