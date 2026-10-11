import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { removeWeeklyFeatures } from './monthly-only-migration.mjs';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
process.env.DATABASE_URL ||= `file:${resolve(root, 'data/yourbili.db').replaceAll('\\', '/')}`;
mkdirSync(resolve(root, 'data'), { recursive: true });
// Prisma's schema engine on Windows can fail if the SQLite file does not exist yet.
const configuredPath = process.env.DATABASE_URL.slice('file:'.length);
const dbPath = isAbsolute(configuredPath) ? configuredPath : resolve(root, 'prisma', configuredPath);
mkdirSync(dirname(dbPath), { recursive: true });
const emptyDatabase = new DatabaseSync(dbPath);
emptyDatabase.close();

const push = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate'], {
  cwd: root, env: process.env, stdio: 'inherit',
});
if (push.error || push.status !== 0) {
  console.error(push.error?.message || 'Database initialization failed.');
  process.exit(push.status || 1);
}

const removed = removeWeeklyFeatures(dbPath, root);
if (removed.goals || removed.notifications) console.log(`已移除 ${removed.goals} 个旧周目标和 ${removed.notifications} 份周报，已保存本地备份。`);
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
try {
  await prisma.appSetting.upsert({
    where: { id: 'singleton' }, update: {},
    create: { id: 'singleton', schedulerEnabled: true, defaultIntervalMinutes: 30,
      maxVideosPerUp: 30, requestDelayMinMs: 2000, requestDelayMaxMs: 5000, theme: 'PINK' },
  });
  await prisma.creatorGroup.upsert({ where: { name: '未分组' }, update: {}, create: { name: '未分组', sortOrder: 1024 } });
  if (await prisma.monitorTask.count() === 0) {
    await prisma.monitorTask.create({ data: {
      id: 'default-task', name: '默认监控任务', targetMode: 'ALL_ACTIVE', intervalMinutes: 30,
      status: 'ACTIVE', nextRunAt: new Date(Date.now() + 30 * 60 * 1000),
    } });
  }
  console.log('数据库已准备好，已有数据和设置会保留。');
} finally {
  await prisma.$disconnect();
}
