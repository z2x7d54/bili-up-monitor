export function formatNumber(value: number | null | undefined): string {
  const number = value ?? 0;
  if (number >= 100_000_000) return `${(number / 100_000_000).toFixed(2)}亿`;
  if (number >= 10_000) return `${(number / 10_000).toFixed(1)}万`;
  return new Intl.NumberFormat("zh-CN").format(number);
}

export function formatSignedNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  if (value === 0) return "0";

  const prefix = value > 0 ? "+" : "-";
  return `${prefix}${formatNumber(Math.abs(value))}`;
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatFullDateTime(value: Date | string | null | undefined): string {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatReadablePublishTime(
  value: Date | string | null | undefined,
  now: Date = new Date(),
): string {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime()) || Number.isNaN(now.getTime())) return "-";

  const timeText = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const publishDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDiff = Math.floor((today.getTime() - publishDay.getTime()) / (24 * 60 * 60 * 1000));

  if (dayDiff === 0) return `今天 ${timeText}`;
  if (dayDiff === 1) return `昨天 ${timeText}`;
  if (dayDiff > 1 && dayDiff < 7) return `${dayDiff}天前 ${timeText}`;

  if (date.getFullYear() === now.getFullYear()) {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    MONITORING: "监控中",
    PAUSED: "已暂停",
    ERROR: "异常",
    ACTIVE: "运行中",
    RUNNING: "执行中",
    SUCCESS: "成功",
    PARTIAL: "部分失败",
    FAILED: "失败",
  };
  return labels[status] ?? status;
}

export function targetModeLabel(mode: string, groupName?: string | null, selectedCount?: number): string {
  if (mode === "GROUP") return `分组：${groupName || "未分组"}`;
  if (mode === "SELECTED") return `指定 UP：${selectedCount ?? 0} 个`;
  return "全部 UP 主";
}
