import { getNotificationInbox } from "@/lib/weekly-notifications";
import { jsonError, jsonOk } from "@/lib/http";

export async function GET(request: Request) {
  try { return jsonOk(await getNotificationInbox(new Date(), Number(new URL(request.url).searchParams.get("page") || 1)), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return jsonError(error, 500); }
}
