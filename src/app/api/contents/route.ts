import { jsonError, jsonOk } from "@/lib/http";
import { prisma } from "@/lib/db";
import { getGroupScope } from "@/lib/groups";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim();
    const creatorId = url.searchParams.get("creatorId")?.trim();
    const groupName = url.searchParams.get("group")?.trim();
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if ([from, to].some(value => value && !Number.isFinite(new Date(value).getTime()))) throw new Error("日期格式不正确");
    if (from && to && new Date(from) > new Date(to)) throw new Error("开始日期不能晚于结束日期");
    const contents = await prisma.contentItem.findMany({
      where: {
        ...(q ? { title: { contains: q } } : {}),
        ...(creatorId ? { creatorId } : {}),
        ...(groupName && groupName !== "ALL" ? { creator: { groupName: { in: await getGroupScope(groupName) } } } : {}),
        ...(from || to ? { publishedAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
      },
      include: { creator: true },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: 200,
    });
    return jsonOk(contents);
  } catch (error) { return jsonError(error); }
}
