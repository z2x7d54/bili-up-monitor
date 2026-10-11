import { ensureReportNotifications } from "@/lib/weekly-notifications";
import { runDueTasks } from "@/lib/monitor/service";

const SCHEDULER_RUNTIME_VERSION = 4;

const globalScheduler = globalThis as unknown as {
  yourBiliScheduler?: {
    started: boolean;
    timer?: NodeJS.Timeout;
    lastTickAt?: Date;
    version?: number;
  };
};

export function ensureSchedulerStarted() {
  if (process.env.NODE_ENV === "test") return;

  if (!globalScheduler.yourBiliScheduler) {
    globalScheduler.yourBiliScheduler = { started: false };
  }

  const state = globalScheduler.yourBiliScheduler;
  if (state.started && state.version === SCHEDULER_RUNTIME_VERSION) return;

  if (state.timer) {
    clearInterval(state.timer);
  }

  state.started = true;
  state.version = SCHEDULER_RUNTIME_VERSION;
  state.timer = setInterval(() => {
    state.lastTickAt = new Date();
    runDueTasks().then(() => ensureReportNotifications()).catch((error) => {
      console.error("[yourbili:scheduler]", error);
    });
  }, 30_000);

  state.timer.unref?.();
}

export async function tickSchedulerOnce() {
  ensureSchedulerStarted();
  globalScheduler.yourBiliScheduler!.lastTickAt = new Date();
  const results = await runDueTasks();
  await ensureReportNotifications();
  return results;
}
