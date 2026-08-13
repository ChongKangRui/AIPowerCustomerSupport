-- Prisma's diff engine proposed a plain RENAME here, which would have kept
-- the old index's `WHERE "deletedAt" IS NULL` condition intact under the
-- new name — since schema.prisma has no concept of a partial index, it
-- can't tell "same name, different definition" apart from "actually the
-- same index". Hand-corrected to a real drop + recreate so this is
-- genuinely a full-table unique constraint again (see User.email's comment
-- in schema.prisma — email reuse after delete was deliberately reversed).

-- DropIndex
DROP INDEX "User_email_active_key";

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
