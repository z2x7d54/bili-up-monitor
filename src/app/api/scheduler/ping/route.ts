import { jsonError, jsonOk } from "@/lib/http";
import { tickSchedulerOnce } from "@/lib/monitor/scheduler";

export async function GET() {
  try {
    const results = await tickSchedulerOnce();
    return jsonOk({ started: true, dueRuns: results.length });
  } catch (error) {
    return jsonError(error, 500);
  }
}
