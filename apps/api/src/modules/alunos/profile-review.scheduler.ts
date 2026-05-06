import { profileReviewDispatchService } from './profile-review-dispatch.service.js';
import { assessmentPlanNotificationService } from './assessment-plan-notification.service.js';

let running = false;

const parsePositiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
};

export const startProfileReviewScheduler = () => {
  const isEnabled = process.env.PROFILE_REVIEW_SCHEDULER_ENABLED === 'true';

  if (!isEnabled) {
    return;
  }

  const intervalMinutes = parsePositiveInt(process.env.PROFILE_REVIEW_SCHEDULER_INTERVAL_MINUTES, 60);
  const upcomingWindowDays = parsePositiveInt(process.env.PROFILE_REVIEW_UPCOMING_WINDOW_DAYS, 7);
  const createOverdueReminder = process.env.PROFILE_REVIEW_CREATE_OVERDUE_REMINDER !== 'false';
  const assessmentNotificationWindowDays = parsePositiveInt(
    process.env.ASSESSMENT_NOTIFICATION_WINDOW_DAYS,
    upcomingWindowDays
  );

  const run = async () => {
    if (running) {
      return;
    }

    running = true;

    try {
      const result = await profileReviewDispatchService.dispatchDueProfileReviews({
        upcomingWindowDays,
        createOverdueReminder,
      });

      const assessmentResult = await assessmentPlanNotificationService.dispatchDueAndOverdue({
        upcomingWindowDays: assessmentNotificationWindowDays,
      });

      console.log('[profile-review-scheduler] cycle finished', result);
      console.log('[assessment-notification-scheduler] cycle finished', assessmentResult);
    } catch (error) {
      console.error('[profile-review-scheduler] cycle failed', error);
    } finally {
      running = false;
    }
  };

  run().catch((error) => {
    console.error('[profile-review-scheduler] startup cycle failed', error);
  });

  const intervalMs = intervalMinutes * 60 * 1000;
  setInterval(run, intervalMs);

  console.log(
    `[profile-review-scheduler] enabled interval=${intervalMinutes}m upcomingWindowDays=${upcomingWindowDays} createOverdueReminder=${createOverdueReminder} assessmentNotificationWindowDays=${assessmentNotificationWindowDays}`
  );
};
