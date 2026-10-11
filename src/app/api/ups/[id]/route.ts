import { creatorAliasSchema, creatorNoteSchema } from "@/lib/creator-personal";
import { withDataWrite } from "@/lib/data-transfer-lock";
import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/http";
import { prisma } from "@/lib/db";
import { ensureCreatorGroup, normalizeGroupName } from "@/lib/groups";

const updateUpSchema = z.object({
  groupName: z.string().min(1).optional(),
  status: z.enum(["MONITORING", "PAUSED", "ERROR"]).optional(),
  name: z.string().trim().min(1).max(100).optional(),
  alias: creatorAliasSchema.optional(),
  note: creatorNoteSchema.optional(),
});

async function PATCHImplementation(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = updateUpSchema.parse(await request.json());
    if (body.groupName) {
      body.groupName = normalizeGroupName(body.groupName);
      await ensureCreatorGroup(body.groupName);
    }
    const { name, ...data } = body;
    // Legacy manual names are local labels, never Bilibili profile fields.
    if (name !== undefined && data.alias === undefined) data.alias = name;
    if (data.alias !== undefined) data.alias = data.alias?.trim() || null;
    if (data.note !== undefined) data.note = data.note?.trim() || null;
    const creator = await prisma.upCreator.update({
      where: { id },
      data,
    });
    return jsonOk(creator);
  } catch (error) {
    return jsonError(error);
  }
}

async function DELETEImplementation(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await prisma.upCreator.delete({ where: { id } });
    return jsonOk({ deleted: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(...args: Parameters<typeof PATCHImplementation>) { try { return await withDataWrite(() => PATCHImplementation(...args)); } catch(error) { return jsonError(error); } }

export async function DELETE(...args: Parameters<typeof DELETEImplementation>) { try { return await withDataWrite(() => DELETEImplementation(...args)); } catch(error) { return jsonError(error); } }
