-- DropIndex
DROP INDEX "User_email_key";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- Hand-written: partial/filtered unique index, not expressible in
-- schema.prisma as of Prisma ORM 7 — see User.email's comment. Unique only
-- among active (non-soft-deleted) rows, so a new row may reuse a
-- soft-deleted row's exact email.
CREATE UNIQUE INDEX "User_email_active_key" ON "User"("email") WHERE "deletedAt" IS NULL;
