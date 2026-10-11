import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export async function ensureSettings() {
  const settings = await prisma.appSetting.findUnique({
    where: { id: "singleton" },
  });

  if (!settings) {
    // 如果数据库中没有设置，返回默认值但不写入数据库
    // 这通常意味着用户还没有运行初始化脚本
    return {
      id: "singleton",
      schedulerEnabled: true,
      defaultIntervalMinutes: 30,
      maxVideosPerUp: 30,
      requestDelayMinMs: 2000,
      requestDelayMaxMs: 5000,
      biliCookie: null,
      theme: "PINK",
      updatedAt: new Date(),
    };
  }

  return settings;
}
