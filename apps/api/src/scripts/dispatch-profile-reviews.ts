import '../bootstrap-env.js';
import { profileReviewDispatchService } from '../modules/alunos/profile-review-dispatch.service.js';

const parseOptionalPositiveInt = (value: string | undefined): number | undefined => {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return Math.floor(parsed);
};

const run = async () => {
  const upcomingWindowDays = parseOptionalPositiveInt(process.env.PROFILE_REVIEW_UPCOMING_WINDOW_DAYS);
  const createOverdueReminder = process.env.PROFILE_REVIEW_CREATE_OVERDUE_REMINDER !== 'false';
  const dryRun = process.argv.includes('--dry-run');

  const result = await profileReviewDispatchService.dispatchDueProfileReviews({
    upcomingWindowDays,
    createOverdueReminder,
    dryRun,
  });

  console.log('[profile-review-dispatch] completed', JSON.stringify(result, null, 2));
};

run()
  .catch((error) => {
    console.error('[profile-review-dispatch] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Prisma client is owned by service module; allow process to exit naturally.
  });
