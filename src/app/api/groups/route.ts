import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/http";
import {
  createCreatorGroup,
  moveCreatorGroup,
  deleteCreatorGroup,
  listCreatorGroups,
  reorderCreatorGroups,
  renameCreatorGroup,
} from "@/lib/groups";

const createGroupSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  parentName: z.string().nullable().optional(),
});

const renameGroupSchema = z.object({
  name: z.string().min(1),
  nextName: z.string().min(1),
});

const reorderGroupSchema = z.object({
  names: z.array(z.string().min(1)).min(1),
});

const deleteGroupSchema = z.object({
  name: z.string().min(1),
  moveTo: z.string().optional(),
});

export async function GET() {
  const groups = await listCreatorGroups();
  return jsonOk(groups);
}

export async function POST(request: Request) {
  try {
    const body = createGroupSchema.parse(await request.json());
    const group = await createCreatorGroup(body);
    return jsonOk(group, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const json = await request.json();
    if (Array.isArray(json.names)) {
      const body = reorderGroupSchema.parse(json);
      const result = await reorderCreatorGroups(body);
      return jsonOk(result);
    }

    if ("parentName" in json) {
      const body = z.object({ name: z.string().min(1), parentName: z.string().nullable() }).strict().parse(json);
      return jsonOk(await moveCreatorGroup(body));
    }
    const body = renameGroupSchema.parse(json);
    const group = await renameCreatorGroup(body);
    return jsonOk(group);
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const body = deleteGroupSchema.parse(await request.json());
    const result = await deleteCreatorGroup(body);
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}
