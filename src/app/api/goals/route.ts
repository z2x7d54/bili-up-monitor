import { getGoal, saveGoal } from "@/lib/goals";
import { jsonError, jsonOk } from "@/lib/http";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const p = new URL(request.url).searchParams;
    const period = p.get("period");
    if (period !== "MONTH") throw new Error("请选择月目标，周目标已停用");
    return jsonOk(await getGoal({ creatorId: p.get("creatorId") || undefined, groupName: p.get("groupName") || undefined, period }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return jsonError(error); }
}
export async function POST(request: Request) {
  try { return jsonOk(await saveGoal(await request.json())); }
  catch (error) { return jsonError(error); }
}
