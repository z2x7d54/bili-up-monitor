import { withDataWrite } from "@/lib/data-transfer-lock";
import { z } from "zod";
import { ensureSettings, prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";

const updateSettingsSchema = z.object({
  schedulerEnabled: z.boolean().optional(),
  defaultIntervalMinutes: z.coerce.number().int().min(1).max(1440).optional(),
  maxVideosPerUp: z.coerce.number().int().min(1).max(50).optional(),
  requestDelayMinMs: z.coerce.number().int().min(0).max(60_000).optional(),
  requestDelayMaxMs: z.coerce.number().int().min(0).max(60_000).optional(),
  biliCookie: z.string().optional(),
  theme: z.enum(["PINK", "BLUE"]).optional(),
});

export async function GET() {
  return jsonOk(await ensureSettings());
}

export async function PATCH(request: Request) {
  try {
    const body = updateSettingsSchema.parse(await request.json());
    const settings = await withDataWrite(() => prisma.$transaction(async tx => {
      const prior = await tx.appSetting.findUniqueOrThrow({ where: { id: "singleton" } });
      const min = body.requestDelayMinMs ?? prior.requestDelayMinMs;
      const max = body.requestDelayMaxMs ?? prior.requestDelayMaxMs;
      if (min > max) throw new Error("最小请求间隔不能大于最大请求间隔");
      return tx.appSetting.update({ where: { id: "singleton" }, data: { ...body, ...(Object.hasOwn(body, "biliCookie") ? { biliCookie: body.biliCookie?.trim() || null } : {}) } });
    }));
    return jsonOk(settings);
  } catch (error) {
    return jsonError(error);
  }
}
