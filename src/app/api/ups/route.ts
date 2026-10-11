import { z } from "zod";
import { isRiskControlError } from "@/lib/bilibili/client";
import { DEFAULT_GROUP_NAME } from "@/lib/constants";
import { jsonError, jsonOk } from "@/lib/http";
import { prisma } from "@/lib/db";
import { createOrUpdateCreatorFromInput, syncCreatorById } from "@/lib/monitor/service";

const createUpSchema = z.object({
  upInput: z.string().min(1),
  groupName: z.string().optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const search = url.searchParams.get("q")?.trim();
  const groupName = url.searchParams.get("group")?.trim();
  const status = url.searchParams.get("status")?.trim();

  const creators = await prisma.upCreator.findMany({
    where: {
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { alias: { contains: search } },
              { note: { contains: search } },
              { mid: { contains: search } },
              { description: { contains: search } },
            ],
          }
        : {}),
      ...(groupName ? { groupName } : {}),
      ...(status ? { status } : {}),
    },
    include: { _count: { select: { contents: true } } },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });

  return jsonOk(creators);
}

export async function POST(request: Request) {
  try {
    const body = createUpSchema.parse(await request.json());
    const creator = await createOrUpdateCreatorFromInput({
      upInput: body.upInput,
      groupName: body.groupName || DEFAULT_GROUP_NAME,
    });

    try {
      const syncResult = await syncCreatorById(creator.id);
      return jsonOk({ creator: syncResult.creator, initialSync: { ok: true, contentCount: syncResult.contentCount } }, { status: 201 });
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : String(syncError);
      const updatedCreator = await prisma.upCreator.findUnique({ where: { id: creator.id } });
      return jsonOk(
        {
          creator: updatedCreator ?? creator,
          initialSync: { ok: false, error: message },
        },
        { status: 201 },
      );
    }
  } catch (error) {
    if (isRiskControlError(error)) {
      return jsonError(new Error("风控校验失败"));
    }
    return jsonError(error);
  }
}
