ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'profile_review_requested';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'profile_review_reminder';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'profile_review_overdue';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'assessment_due';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'assessment_overdue';
