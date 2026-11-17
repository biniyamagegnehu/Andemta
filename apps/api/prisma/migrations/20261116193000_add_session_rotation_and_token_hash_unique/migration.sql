-- AlterTable
ALTER TABLE "sessions" ADD COLUMN "rotated_at" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refresh_token_hash_key" ON "sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "sessions_rotated_at_idx" ON "sessions"("rotated_at");
