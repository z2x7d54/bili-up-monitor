import { withDataWrite } from "@/lib/data-transfer-lock";
import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/http";
import { prisma } from "@/lib/db";
import { updateMonitorTask } from "@/lib/monitor/service";

const updateTaskSchema = z.object({
  name: z.string().min(1).optional(),
  targetMode: z.enum(["ALL_ACTIVE", "GROUP", "SELECTED"]).optional(),
  groupName: z.string().optional().nullable(),
  intervalMinutes: z.coerce.number().int().min(1).max(1440).optional(),
  status: z.enum(["ACTIVE", "PAUSED", "ERROR"]).optional(),
  creatorIds: z.array(z.string()).optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = updateTaskSchema.parse(await request.json());
    const task = await updateMonitorTask(id, body);
    return jsonOk(task);
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await withDataWrite(() => prisma.$transaction(async tx => {
      const task = await tx.monitorTask.findUniqueOrThrow({ where: { id } });
      if (task.isRunning) throw new Error("任务正在运行，请本轮完成后再删除。");
      await tx.monitorTask.delete({ where: { id } });
    }));
    return jsonOk({ deleted: true });
  } catch (error) {
    return jsonError(error);
  }
}
