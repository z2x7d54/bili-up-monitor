@echo off
chcp 65001 >nul
setlocal
pushd "%~dp0"
if exist ".yourbili-running.json" (
 echo 请先停止服务再构建。
 pause
 exit /b 1
)
set "PATH=%CD%\runtime;%PATH%"
set "NEXT_TELEMETRY_DISABLED=1"
"runtime\node.exe" "node_modules\prisma\build\index.js" generate
if errorlevel 1 goto failed
"runtime\node.exe" "scripts\init-db.mjs"
if errorlevel 1 goto failed
"runtime\node.exe" "node_modules\next\dist\bin\next" build
if errorlevel 1 goto failed
echo 构建成功，可以启动或打包了。
popd
pause
exit /b 0
:failed
echo 构建失败，请查看上方错误信息。
popd
pause
exit /b 1
