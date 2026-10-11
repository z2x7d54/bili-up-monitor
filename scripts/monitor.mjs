import { prisma, ensureSettings } from '../src/lib/db.ts';
import { runDueTasks } from '../src/lib/monitor/service.ts';

async function main() {
  console.log('🚀 YourBili 后台监控服务已启动');
  
  // 初始化配置
  try {
    await ensureSettings();
    console.log('✅ 系统配置初始化完成');
  } catch (error) {
    console.error('❌ 初始化配置失败:', error);
  }

  // 定时器间隔 (30秒检查一次)
  const TICK_INTERVAL = 30 * 1000;

  async function tick() {
    const now = new Date();
    process.stdout.write(`[${now.toLocaleTimeString()}] 正在检查待执行任务... `);
    
    try {
      const results = await runDueTasks();
      if (results && results.length > 0) {
        console.log(`\n✅ 成功执行 ${results.length} 个任务`);
      } else {
        process.stdout.write('暂无待执行任务\r');
      }
    } catch (error) {
      console.error('\n❌ 任务执行过程中出错:', error);
    }
  }

  // 立即执行一次
  await tick();

  // 开启循环
  setInterval(tick, TICK_INTERVAL);
}

// 优雅退出处理
process.on('SIGINT', async () => {
  console.log('\n👋 正在停止监控服务...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n👋 正在接收终止信号，停止监控服务...');
  await prisma.$disconnect();
  process.exit(0);
});

main().catch(async (e) => {
  console.error('💥 服务崩溃:', e);
  await prisma.$disconnect();
  process.exit(1);
});
