import { z } from "zod";
import { markNotificationRead, markAllNotificationsRead } from "@/lib/weekly-notifications";
import { jsonError, jsonOk } from "@/lib/http";
const schema = z.union([z.object({ id: z.string().min(1) }).strict(), z.object({ all: z.literal(true) }).strict()]);
export async function POST(request: Request) {
  try { const body = schema.parse(await request.json()); return jsonOk("all" in body ? await markAllNotificationsRead() : await markNotificationRead(body.id)); }
  catch (error) { return jsonError(error); }
}
