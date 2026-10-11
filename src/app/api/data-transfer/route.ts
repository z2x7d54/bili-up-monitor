import { exportDataFile, importDataFile } from "@/lib/data-transfer";
import { readDataRequest } from "@/lib/data-transfer-format";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export async function GET() {
  try {
    const result = await exportDataFile();
    const timestamp = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 19).replace(/[T:]/g, "-");
    return new Response(result.json, { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="YourBili-data-${timestamp}.json"`, "Cache-Control": "no-store" } });
  } catch (error) { return jsonError(error, 500); }
}
export async function POST(request: Request) {
  try {
    const mode = request.headers.get("X-YourBili-Personal-Data") ?? "local";
    if (mode !== "local" && mode !== "file") throw new Error("请选择有效的备注合并方式。");
    return jsonOk(await importDataFile(await readDataRequest(request), { personalDataMode: mode }));
  }
  catch (error) { return jsonError(error); }
}
