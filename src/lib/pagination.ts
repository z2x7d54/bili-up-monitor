export const DEFAULT_PAGE_SIZE = 30;
export const PAGE_SIZE_OPTIONS = [10, 30, 50, 100] as const;

export type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];

export function parsePage(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function parsePageSize(value: string | undefined): PageSizeOption {
  const parsed = Number.parseInt(value ?? "", 10);
  return PAGE_SIZE_OPTIONS.includes(parsed as PageSizeOption)
    ? (parsed as PageSizeOption)
    : DEFAULT_PAGE_SIZE;
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export function clampPage(page: number, total: number, pageSize: number): number {
  return Math.min(Math.max(1, page), pageCount(total, pageSize));
}

export function pageOffset(page: number, pageSize: number): number {
  return (page - 1) * pageSize;
}

export function paginateItems<T>(items: T[], page: number, pageSize: number) {
  const currentPage = clampPage(page, items.length, pageSize);
  const offset = pageOffset(currentPage, pageSize);
  return {
    items: items.slice(offset, offset + pageSize),
    currentPage,
    total: items.length,
  };
}
