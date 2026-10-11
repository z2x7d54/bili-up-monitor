import { getMonthlyReport } from "@/lib/monthly-report";
import { jsonError, jsonOk } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    return jsonOk(await getMonthlyReport({ ...Object.fromEntries(url.searchParams), overdueDays: url.searchParams.get("days") ?? undefined, query:url.searchParams.get("accountQuery") ?? undefined }));
  } catch (error) { return jsonError(error, 500); }
}
