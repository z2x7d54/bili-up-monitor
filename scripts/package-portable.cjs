const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');

async function main() {
  try { await fs.access(path.join(root, '.yourbili-running.json')); throw new Error('请先双击「停止服务.bat」，停止后再打包。'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await fs.access(path.join(root, '.next/BUILD_ID'));
  await fs.access(path.join(root, 'runtime/node.exe'));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const tempRoot = path.join(root, '.package-work', stamp);
  const stage = path.join(tempRoot, 'YourBili');
  const out = path.join(root, '分享包');
  await fs.mkdir(stage, { recursive: true });
  await fs.mkdir(out, { recursive: true });
  const exclude = new Set(['.git', '.local-backups', 'data', 'logs', '.package-work', '分享包', '.yourbili-running.json', 'tsconfig.tsbuildinfo', '首次使用图文手册.pdf', '首次使用图文手册.html']);
  function filter(src) {
    const relative = path.relative(root, src).replaceAll('\\', '/');
    if (relative === '.next/cache' || relative === 'node_modules/.cache' || relative === 'node_modules/.pnpm') return false;
    // Retain the native modules for Windows x64; other platforms cannot use this release.
    const name = path.basename(src);
    if (/^(swc-|sharp-|sharp-libvips-|oxide-|resolver-binding-|rollup-|lightningcss-|watcher-)/.test(name) &&
        /(?:linux|darwin|android|freebsd|openbsd|netbsd|sunos|aix|wasm|arm64|ia32|armv7)/.test(name)) return false;
    if (path.basename(path.dirname(src)) === '@esbuild' && name !== 'win32-x64') return false;
    return true;
  }
  console.log('正在复制源码、编译文件、便携 Node.js 和运行依赖…');
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    if (exclude.has(entry.name) || (entry.name === '.env' || entry.name.startsWith('.env.')) && entry.name !== '.env.example') continue;
    await fs.cp(path.join(root, entry.name), path.join(stage, entry.name), { recursive: true, dereference: true, filter });
  }
  // Never distribute machine-specific dotenv files or accidentally stored secrets.
  await fs.writeFile(path.join(stage, '.env'), 'DATABASE_URL="file:../data/yourbili.db"\n', 'utf8');
  await fs.writeFile(path.join(stage, '.env.example'), 'DATABASE_URL="file:../data/yourbili.db"\n', 'utf8');
  // Every recipient gets a clean database: no personal monitoring data or Bilibili cookies.
  const init = spawnSync(path.join(stage, 'runtime/node.exe'), [path.join(stage, 'scripts/init-db.mjs')], {
    cwd: stage, env: { ...process.env, DATABASE_URL: `file:${path.join(stage, 'data/yourbili.db').replaceAll('\\', '/')}` },
    stdio: 'inherit', windowsHide: true,
  });
  if (init.error || init.status !== 0) throw new Error('分享包数据库初始化失败。');
  const zip = path.join(out, `YourBili-Windows-x64-${stamp}.zip`);
  console.log('正在压缩，请稍等…');
  const compress = spawnSync('powershell.exe', ['-NoProfile', '-Command',
    'Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory($env:YOURBILI_STAGE, $env:YOURBILI_ZIP, [System.IO.Compression.CompressionLevel]::Optimal, $true)'], {
    env: { ...process.env, YOURBILI_STAGE: stage, YOURBILI_ZIP: zip }, stdio: 'inherit', windowsHide: true,
  });
  if (compress.error || compress.status !== 0) throw new Error('压缩失败，请查看上方错误信息。');
  const stat = await fs.stat(zip);
  console.log(`\n分享包已生成：${zip}\n大小：${(stat.size / 1024 / 1024).toFixed(1)} MB\n发给 Windows 10/11 64 位用户，解压后双击「启动服务.bat」。`);
  // Only delete the uniquely created staging directory under this project's .package-work.
  const allowed = path.resolve(root, '.package-work') + path.sep;
  if (!path.resolve(tempRoot).startsWith(allowed)) throw new Error('临时目录路径校验失败。');
  await fs.rm(tempRoot, { recursive: true, force: true });
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
