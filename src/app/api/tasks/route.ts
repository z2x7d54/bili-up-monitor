import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/http";
import { prisma } from "@/lib/db";
import { createMonitorTask } from "@/lib/monitor/service";

const createTaskSchema = z.object({
  name: z.string().min(1),
  targetMode: z.enum(["ALL_ACTIVE", "GROUP", "SELECTED"]),
  groupName: z.string().optional().nullable(),
  intervalMinutes: z.coerce.number().int().min(1).max(1440),
  status: z.enum(["ACTIVE", "PAUSED"]).optional(),
  creatorIds: z.array(z.string()).optional(),
});

export async function GET() {
  const tasks = await prisma.monitorTask.findMany({
    include: {
      targets: { include: { creator: true } },
      runs: { orderBy: { startedAt: "desc" }, take: 3 },
    },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });
  return jsonOk(tasks);
}

export async function POST(request: Request) {
  try {
    const body = createTaskSchema.parse(await request.json());
    const task = await createMonitorTask(body);
    return jsonOk(task, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
