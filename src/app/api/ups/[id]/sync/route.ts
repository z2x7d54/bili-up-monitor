import { jsonError, jsonOk } from "@/lib/http";
import { syncCreatorById } from "@/lib/monitor/service";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const result = await syncCreatorById(id);
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}
