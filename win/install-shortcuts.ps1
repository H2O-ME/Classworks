<#
.SYNOPSIS
  Classworks 讲台快捷方式安装器（Windows）

.DESCRIPTION
  在教室电脑上创建「作业看板」桌面快捷方式，用 Edge/Chrome 的应用窗口模式打开
  （没有地址栏、没有标签栏，看起来就是一个独立客户端），可选放进开机启动。

  为什么不用打包 exe：看板业务全在网页里，快捷方式直接加载线上地址 —— 发版后
  客户端自动就是新版，不存在版本分叉，也不用每次改作业都重新打包签名。

.PARAMETER Url
  站点地址。默认线上地址。

.PARAMETER Key
  白板口令（?key= 后面的值），必须与服务端 BOARD_TOKEN 一致。

.PARAMETER Name
  快捷方式名称。

.PARAMETER Startup
  同时把快捷方式放进当前用户的开机启动目录。

.PARAMETER DryRun
  只打印将要执行的动作，不创建任何文件（用于验证）。

.EXAMPLE
  .\install-shortcuts.ps1
  .\install-shortcuts.ps1 -Url https://classworks.tianhw.top -Key seewo -Startup
#>
param(
  [string]$Url = "https://classworks.tianhw.top",
  [string]$Key = "seewo",
  [string]$Name = "作业看板",
  [switch]$Startup,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

# ── 找浏览器（Edge 优先：Windows 10/11 与希沃白板自带；Chrome 兜底）──
function Find-Browser {
  $candidates = @(
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
  )
  foreach ($path in $candidates) {
    if ($path -and (Test-Path $path)) { return $path }
  }
  return $null
}

$browser = Find-Browser
if (-not $browser) {
  Write-Host "找不到 Edge 或 Chrome。请先安装 Microsoft Edge 后重试。" -ForegroundColor Red
  exit 1
}

$target = "$Url/?key=$Key"
if ($Url -match "\?") { $target = "$Url&key=$Key" }

# --app：应用窗口模式（无地址栏/标签栏）；--start-maximized 让看板直接铺满
$arguments = "--app=$target --start-maximized"

# ── 桌面路径（桌面可能被重定向到 OneDrive，用系统真实路径）──
$desktop = [Environment]::GetFolderPath("Desktop")
$linkPath = Join-Path $desktop "$Name.lnk"
$startupDir = Join-Path ([Environment]::GetFolderPath("Startup")) "$Name.lnk"

Write-Host "浏览器   : $browser"
Write-Host "打开地址 : $target"
Write-Host "快捷方式 : $linkPath"
if ($Startup) { Write-Host "开机启动 : $startupDir" }
Write-Host ""

if ($DryRun) {
  Write-Host "[DryRun] 不创建文件，检查通过。" -ForegroundColor Yellow
  exit 0
}

# ── 创建 .lnk（WScript.Shell，老系统也能用）──
function New-Shortcut([string]$path) {
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($path)
  $shortcut.TargetPath = $browser
  $shortcut.Arguments = $arguments
  $shortcut.WorkingDirectory = Split-Path $browser
  $shortcut.IconLocation = "$browser,0"
  $shortcut.Description = "Classworks 作业看板"
  $shortcut.Save()
}

New-Shortcut $linkPath
Write-Host "✓ 已创建桌面快捷方式" -ForegroundColor Green

if ($Startup) {
  New-Shortcut $startupDir
  Write-Host "✓ 已加入开机启动" -ForegroundColor Green
}

Write-Host ""
Write-Host "提示：" -ForegroundColor Cyan
Write-Host "  · 教室电脑若每天冰点还原，把本目录放到 D 盘等非还原分区，还原后双击 install.cmd 重建即可"
Write-Host "  · 想把 PWA 装成正式应用（有独立图标、可离线），在浏览器右上角菜单选「安装作业看板」"
Write-Host "  · 白板口令改了以后要重新运行本脚本（快捷方式里的 key 是写死的）"
