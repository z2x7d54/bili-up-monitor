@echo off
chcp 65001 >nul
setlocal
pushd "%~dp0"
if not exist "runtime\node.exe" (
  echo 缺少便携 Node.js，请完整解压分享包。
  pause
  exit /b 1
)
"runtime\node.exe" "scripts\launcher.cjs"
set "RESULT=%ERRORLEVEL%"
if not "%RESULT%"=="0" echo 操作失败，请查看上方信息。
popd
pause
exit /b %RESULT%
