import { studentContractLifecycleService } from './student-contract-lifecycle.service.js';

let running = false;

const parsePositiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

export const startStudentContractLifecycleScheduler = () => {
  if (process.env.CONTRACT_LIFECYCLE_SCHEDULER_ENABLED === 'false') {
    return;
  }

  const intervalMinutes = parsePositiveInt(
    process.env.CONTRACT_LIFECYCLE_SCHEDULER_INTERVAL_MINUTES,
    15
  );

  const run = async () => {
    if (running) return;
    running = true;

    try {
      const result = await studentContractLifecycleService.activateDueSignedContracts();
      if (result.checked > 0 || result.failures.length > 0) {
        console.log('[contract-lifecycle-scheduler] cycle finished', result);
      }
    } catch (error) {
      console.error('[contract-lifecycle-scheduler] cycle failed', error);
    } finally {
      running = false;
    }
  };

  run().catch((error) => {
    console.error('[contract-lifecycle-scheduler] startup cycle failed', error);
  });

  setInterval(run, intervalMinutes * 60 * 1000);
  console.log(`[contract-lifecycle-scheduler] enabled interval=${intervalMinutes}m`);
};
