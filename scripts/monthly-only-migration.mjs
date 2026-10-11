import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

// Back up retired values; never interpret weekly numbers as monthly targets.
export function removeWeeklyFeatures(dbPath, projectRoot) {
  const db = new DatabaseSync(dbPath);
  try {
    db.exec('BEGIN IMMEDIATE');
    const goals = db.prepare("SELECT * FROM GoalConfig WHERE period = 'WEEK'").all();
    const notifications = db.prepare("SELECT * FROM WeeklyNotification WHERE kind = 'WEEK'").all();
    if (goals.length || notifications.length) {
      const directory = resolve(projectRoot, '.local-backups/monthly-only');
      mkdirSync(directory, { recursive: true });
      writeFileSync(resolve(directory, `retired-weekly-${randomUUID()}.json`), JSON.stringify({ createdAt: new Date().toISOString(), goals, notifications }), { flag: 'wx' });
      db.prepare("DELETE FROM GoalConfig WHERE period = 'WEEK'").run();
      db.prepare("DELETE FROM WeeklyNotification WHERE kind = 'WEEK'").run();
    }
    db.exec('COMMIT');
    return { goals: goals.length, notifications: notifications.length };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  } finally { db.close(); }
}
