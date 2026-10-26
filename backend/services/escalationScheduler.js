const { runEscalationCheck } = require('./escalationService');

/**
 * Background scheduler for automatic escalation. Plain setInterval is
 * enough for this single-process Express + Mongoose app - no extra
 * dependency (cron library, job queue, worker process) is needed.
 */

const CHECK_INTERVAL_MS = 60 * 1000; // 1 minute

let intervalHandle = null;
let isRunning = false;

const tick = async () => {
  // Guard against overlapping runs if a check ever takes longer than the
  // interval (e.g. a slow DB) - never run two checks concurrently.
  if (isRunning) {
    return;
  }
  isRunning = true;
  try {
    await runEscalationCheck();
  } catch (error) {
    // runEscalationCheck already isolates per-complaint failures; this is a
    // last-resort net so the scheduler itself can never crash the server.
    console.error('[escalation-scheduler] Unexpected error during escalation check:', error.message);
  } finally {
    isRunning = false;
  }
};

const startEscalationScheduler = () => {
  if (intervalHandle) {
    return intervalHandle;
  }

  // Run once immediately on startup so complaints that became overdue while
  // the server was stopped are caught right away rather than waiting a full
  // interval after restart.
  tick();
  intervalHandle = setInterval(tick, CHECK_INTERVAL_MS);
  return intervalHandle;
};

const stopEscalationScheduler = () => {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
};

module.exports = { startEscalationScheduler, stopEscalationScheduler, CHECK_INTERVAL_MS };
