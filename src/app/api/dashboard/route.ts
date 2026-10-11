import { jsonOk } from "@/lib/http";
import { getDashboardData } from "@/lib/monitor/service";

export async function GET() {
  return jsonOk(await getDashboardData());
}
