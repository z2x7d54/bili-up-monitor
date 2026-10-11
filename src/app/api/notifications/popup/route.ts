import { claimReportPopups } from "@/lib/weekly-notifications";
import { jsonError, jsonOk } from "@/lib/http";
export async function POST() {
  try { const notifications = await claimReportPopups(); return jsonOk({ notification: notifications[0] ?? null, notifications }); }
  catch (error) { return jsonError(error, 500); }
}
