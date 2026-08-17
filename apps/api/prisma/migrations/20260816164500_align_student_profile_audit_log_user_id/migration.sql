-- Align the persisted audit-log column with the canonical Prisma schema.
-- Preserve historical values by renaming the existing column instead of recreating it.
ALTER TABLE "StudentProfileAuditLog"
RENAME COLUMN "changedByUserId" TO "userId";
