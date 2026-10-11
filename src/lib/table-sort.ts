export type SortOrder = "asc" | "desc";

export function parseSortOrder(value: string | undefined, fallback: SortOrder = "desc"): SortOrder {
  return value === "asc" || value === "desc" ? value : fallback;
}

function applyOrder(result: number, order: SortOrder) {
  if (result === 0) return 0;
  return order === "asc" ? result : -result;
}

export function compareString(a: string | null | undefined, b: string | null | undefined, order: SortOrder) {
  const result = (a ?? "").localeCompare(b ?? "", "zh-Hans-CN", {
    numeric: true,
    sensitivity: "base",
  });
  return applyOrder(result, order);
}

export function compareNumber(a: number, b: number, order: SortOrder) {
  return applyOrder(a - b, order);
}

export function compareNullableNumber(
  a: number | null | undefined,
  b: number | null | undefined,
  order: SortOrder,
) {
  const aMissing = a === null || a === undefined;
  const bMissing = b === null || b === undefined;
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  return compareNumber(a, b, order);
}

export function compareNullableDate(
  a: Date | null | undefined,
  b: Date | null | undefined,
  order: SortOrder,
) {
  const aMissing = !a;
  const bMissing = !b;
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  return compareNumber(a.getTime(), b.getTime(), order);
}
