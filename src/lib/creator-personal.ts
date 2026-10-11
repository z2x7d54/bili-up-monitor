import { z } from "zod";
export const CREATOR_ALIAS_LIMIT = 100;
export const CREATOR_NOTE_LIMIT = 5000;
export const creatorAliasSchema = z.string().trim().max(CREATOR_ALIAS_LIMIT).nullable();
export const creatorNoteSchema = z.string().max(CREATOR_NOTE_LIMIT).nullable();
export type CreatorPersonalFields = { alias?: string | null; note?: string | null };
export function creatorDisplayName(creator: { name: string; alias?: string | null }) { return creator.alias?.trim() || creator.name; }
// Preserve local annotations on repeated/legacy imports; populate empty fields on a new PC.
export function mergeCreatorPersonalFields(local: CreatorPersonalFields | null, incoming: CreatorPersonalFields, preferIncoming = false) {
  if (preferIncoming) return { alias: incoming.alias !== undefined ? incoming.alias?.trim() || null : local?.alias || null, note: incoming.note !== undefined ? incoming.note?.trim() || null : local?.note || null };
  return { alias: local?.alias?.trim() ? local.alias : incoming.alias?.trim() || null, note: local?.note?.trim() ? local.note : incoming.note?.trim() || null };
}
