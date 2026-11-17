import { checkDue } from "./checker";

let isRunning = false;

export function ensureSchedulerRunning() {
  if (globalThis.__PRICE_TRACKER_SCHEDULER_RUNNING__) {
    return;
  }
  globalThis.__PRICE_TRACKER_SCHEDULER_RUNNING__ = true;

  console.log("⏱️  [Continuous Scheduler] Started background price checker (polls due products every 30s)");

  const tick = async () => {
    if (isRunning) return;
    isRunning = true;
    try {
      const summary = await checkDue({ budgetMs: 25000 });
      if (summary.checked > 0 || summary.alerts > 0) {
        console.log(`⏱️  [Scheduler] Checked ${summary.checked} due product(s), ${summary.alerts} alert(s) sent.`);
      }
    } catch (err) {
      console.error("⏱️  [Scheduler Error]:", err.message);
    } finally {
      isRunning = false;
    }
  };

  // Run first check after 5 seconds, then every 30 seconds
  setTimeout(tick, 5000);
  const intervalId = setInterval(tick, 30000);
  if (intervalId.unref) intervalId.unref();
}
