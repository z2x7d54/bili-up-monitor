const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const stateFile = path.join(root, '.yourbili-running.json');
const wait = ms => new Promise(r => setTimeout(r, ms));
process.chdir(root);

function readState() {
  try { const s = JSON.parse(fs.readFileSync(stateFile, 'utf8')); return s.root === root ? s : null; }
  catch { return null; }
}
async function control(s, action) {
  const response = await fetch(`http://127.0.0.1:${s.controlPort}/${action}`, {
    method: action === 'stop' ? 'POST' : 'GET',
    headers: { 'X-YourBili-Token': s.token }, signal: AbortSignal.timeout(2500),
  });
  if (!response.ok) throw new Error('Invalid control response');
  return response.json();
}
function openBrowser(url) {
  if (process.env.YOURBILI_NO_BROWSER === '1') return;
  const p = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], { detached: true, stdio: 'ignore', windowsHide: true });
  p.on('error', () => console.log(`请在浏览器打开：${url}`));
  p.unref();
}
function portFree(port) {
  return new Promise(resolve => {
    const socket = net.createServer();
    socket.once('error', () => resolve(false));
    socket.listen(port, '127.0.0.1', () => socket.close(() => resolve(true)));
  });
}

async function main() {
  const old = readState();
  if (process.argv.includes('--stop')) {
    if (!old) { console.log('YourBili 没有在运行。'); return; }
    try { await control(old, 'stop'); console.log('已停止网页、后端和定时监控。'); }
    catch {
      let alive = false;
      try { process.kill(old.pid, 0); alive = true; } catch {}
      if (alive) throw new Error('启动进程仍存在但无法响应，请关闭启动窗口后再试。');
      fs.unlinkSync(stateFile);
      console.log('服务已经退出，已清理旧的启动记录。');
    }
    return;
  }
  if (!fs.existsSync(path.join(root, '.next/BUILD_ID'))) throw new Error('缺少编译文件，请先完成构建，或重新解压完整的分享包。');
  if (!fs.existsSync(path.join(root, 'node_modules/next/dist/bin/next'))) throw new Error('缺少依赖，请重新解压完整分享包。');
  if (old) {
    try {
      const status = await control(old, 'status');
      if (status.ready) openBrowser(status.url);
      console.log(status.ready ? `YourBili 已运行：${status.url}` : 'YourBili 正在启动，请稍等。');
      return;
    } catch {
      let alive = false;
      try { process.kill(old.pid, 0); alive = true; } catch {}
      if (alive) throw new Error('已有启动进程尚未退出，请先关闭启动窗口再重试。');
      fs.unlinkSync(stateFile);
    }
  }
  let port = Number(process.env.YOURBILI_PORT || 3000);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('YOURBILI_PORT 必须是 1024–65535 的整数。');
  let free = false;
  for (let i = 0; i < 20 && port <= 65535; i++, port++) { if (await portFree(port)) { free = true; break; } }
  if (!free) throw new Error('找不到空闲端口，请关闭占用端口的程序后重试。');
  const url = `http://127.0.0.1:${port}`;
  const token = randomUUID();
  fs.writeFileSync(stateFile, JSON.stringify({ root, pid: process.pid, token }), { flag: 'wx' });
  let child, ready = false, closing = false;
  const server = http.createServer((req, res) => {
    if (req.headers['x-yourbili-token'] !== token) { res.writeHead(403).end(); return; }
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/status' && req.method === 'GET') res.end(JSON.stringify({ ready, url }));
    else if (req.url === '/stop' && req.method === 'POST') { res.end(JSON.stringify({ stopped: true })); setTimeout(() => shutdown(0), 100); }
    else res.writeHead(404).end();
  });
  function cleanup() {
    if (readState()?.token === token) { try { fs.unlinkSync(stateFile); } catch {} }
  }
  function shutdown(code) {
    if (closing) return;
    closing = true;
    if (child && child.exitCode === null) child.kill();
    cleanup();
    server.close();
    setTimeout(() => process.exit(code), 500);
  }
  process.on('exit', cleanup);
  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  fs.writeFileSync(stateFile, JSON.stringify({ root, pid: process.pid, token, controlPort: server.address().port, port }));
  const env = { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1',
    DATABASE_URL: `file:${path.join(root, 'data/yourbili.db').replaceAll('\\', '/')}` };
  console.log('正在准备本地数据库…');
  const init = spawnSync(process.execPath, [path.join(root, 'scripts/init-db.mjs')], { cwd: root, env, stdio: 'inherit', windowsHide: true });
  if (init.error || init.status !== 0) { console.error('数据库初始化失败。'); shutdown(1); return; }
  fs.mkdirSync(path.join(root, 'logs'), { recursive: true });
  const log = fs.createWriteStream(path.join(root, 'logs/server.log'), { flags: 'a' });
  child = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { process.stdout.write(chunk); log.write(chunk); });
  child.on('error', error => { console.error(error); shutdown(1); });
  child.on('exit', code => { log.end(); if (!closing) { console.log('服务已退出。'); shutdown(code || 1); } });
  try {
    const deadline = Date.now() + 60000;
    let started = false;
    while (Date.now() < deadline && !closing) {
      try {
        const response = await fetch(`${url}/api/settings`, { signal: AbortSignal.timeout(3000) });
        if (response.ok) { started = true; break; }
      } catch {}
      await wait(500);
    }
    if (!started) throw new Error('服务启动超时，请查看 logs/server.log。');
    // The web server owns the scheduler, so tasks also run with the browser closed.
    const ping = await fetch(`${url}/api/scheduler/ping`, { signal: AbortSignal.timeout(210000) });
    const payload = await ping.json();
    if (!ping.ok || !payload.data?.started) throw new Error('后台监控初始化失败，请查看日志。');
    ready = true;
    console.log(`\nYourBili 已启动：${url}\n网页、后端接口、定时监控均已启用。\n关闭浏览器后监控仍运行。停止服务请双击「停止服务.bat」或按 Ctrl+C。\n请保留这个窗口，最小化即可。`);
    openBrowser(url);
  } catch (error) { console.error(error.message); shutdown(1); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
