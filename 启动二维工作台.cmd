@echo off
setlocal EnableExtensions
chcp 65001 >nul
title WearMate 2D
pushd "%~dp0" || exit /b 1
where node.exe >nul 2>&1 || goto :missing
node.exe scripts\serve.mjs 4375 --open-browser
if errorlevel 1 goto :failed
popd
exit /b 0
:missing
echo 请先安装 Node.js 20 或更高版本。
:failed
echo 按任意键关闭此窗口。
pause >nul
popd
exit /b 1
