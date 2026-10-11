export const CREATOR_STATUS = {
  MONITORING: "MONITORING",
  PAUSED: "PAUSED",
  ERROR: "ERROR",
} as const;

export const TASK_STATUS = {
  ACTIVE: "ACTIVE",
  PAUSED: "PAUSED",
  ERROR: "ERROR",
} as const;

export const TASK_TARGET_MODE = {
  ALL_ACTIVE: "ALL_ACTIVE",
  GROUP: "GROUP",
  SELECTED: "SELECTED",
} as const;

export const RUN_STATUS = {
  RUNNING: "RUNNING",
  SUCCESS: "SUCCESS",
  PARTIAL: "PARTIAL",
  FAILED: "FAILED",
} as const;

export const DEFAULT_GROUP_NAME = "未分组";

export const BILI_REQUEST_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
  referer: "https://www.bilibili.com/",
  accept: "application/json, text/plain, */*",
  "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
};
