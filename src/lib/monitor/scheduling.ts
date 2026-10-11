import { TASK_STATUS } from "@/lib/constants";

export function calculateNextRunAt(from: Date, intervalMinutes: number): Date {
  return new Date(from.getTime() + Math.max(1, intervalMinutes) * 60 * 1000);
}

export function calculateFailureBackoffMinutes(failureCount: number): number {
  if (failureCount <= 0) return 10;
  return Math.min(240, 10 * 2 ** Math.min(failureCount - 1, 5));
}

export function shouldRunTask(task: {
  status: string;
  isRunning: boolean;
  nextRunAt: Date | null;
}, now = new Date()): boolean {
  if (task.status !== TASK_STATUS.ACTIVE) return false;
  if (task.isRunning) return false;
  if (!task.nextRunAt) return true;
  return task.nextRunAt.getTime() <= now.getTime();
}

export function jitterDelay(minMs: number, maxMs: number): number {
  const min = Math.max(0, minMs);
  const max = Math.max(min, maxMs);
  return Math.floor(min + Math.random() * (max - min + 1));
}
