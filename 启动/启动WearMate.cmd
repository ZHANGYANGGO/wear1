@echo off
setlocal EnableExtensions
chcp 65001 >nul
title WearMate
pushd "%~dp0.." || goto :missing_project
if not exist "scripts\serve.mjs" goto :missing_project

where node.exe >nul 2>&1 || goto :missing_node
node.exe -e "process.exit(typeof process.loadEnvFile === 'function' ? 0 : 1)" || goto :missing_node
if not exist "node_modules\three\build\three.module.js" goto :install
if not exist "node_modules\@mediapipe\tasks-vision\vision_bundle.mjs" goto :install
goto :launch

:install
echo 正在安装 WearMate 项目依赖，请稍候……
call npm.cmd ci --no-audit --no-fund
if errorlevel 1 goto :failed

:launch
node.exe scripts\serve.mjs 4294 --open-browser
if errorlevel 1 goto :failed
popd
exit /b 0

:missing_project
echo 找不到项目，请将“启动”文件夹放在包含 package.json 的项目目录中。
goto :failed

:missing_node
echo 请先安装 Node.js 22 或更高版本，然后重新双击本文件。

:failed
echo 启动未完成。按任意键关闭窗口。
pause >nul
exit /b 1
