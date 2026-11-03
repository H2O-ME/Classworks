@echo off
rem Classworks Windows 快捷方式安装器（双击运行）
rem 用 PowerShell 执行实际逻辑；绕过执行策略限制，教室电脑通常不让跑脚本
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-shortcuts.ps1" %*
pause
