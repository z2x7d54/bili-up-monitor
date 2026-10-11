const RISK_CONTROL_PATTERNS = [
  "风控",
  "校验失败",
  "请求被拦截",
  "访问权限校验失败",
  "request was banned",
  "banned",
  "412",
  "-412",
];

export function isRiskControlMessage(message?: string | null) {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return RISK_CONTROL_PATTERNS.some((pattern) => normalized.includes(pattern));
}

export function getRiskControlMessage(messages: Array<string | null | undefined>) {
  return messages.find((message) => isRiskControlMessage(message)) ?? null;
}
