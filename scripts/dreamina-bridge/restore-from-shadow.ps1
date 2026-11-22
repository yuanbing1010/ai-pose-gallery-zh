#Requires -RunAsAdministrator
<#
.SYNOPSIS
  从 Windows 卷影副本里找回被清零的 Chrome Cookies 库。

.DESCRIPTION
  用途：Chrome 把解不开的 Cookie 行删除后，空闲页会被清零，磁盘上无法回收。
  如果系统保护当时开着，卷影副本（Volume Shadow Copy）里会有完整的 Cookies 文件，
  这是唯一能整库恢复的途径。

  本脚本只做「从快照复制出来」，不修改 Chrome 的任何文件。

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\restore-from-shadow.ps1

.EXAMPLE
  # 指定配置目录与输出位置
  powershell -ExecutionPolicy Bypass -File .\restore-from-shadow.ps1 -ProfileDir "Profile 4"
#>

param(
  [string]$ProfileDir = 'Profile 4',
  [string]$OutDir = "$env:LOCALAPPDATA\dreamina-cookie-recovery\restored"
)

$ErrorActionPreference = 'Continue'
$userDir = "$env:SystemDrive\Users\$env:USERNAME\AppData\Local\Google\Chrome\User Data"
$relCookies = "Users\$env:USERNAME\AppData\Local\Google\Chrome\User Data\$ProfileDir\Network\Cookies"
$relJournal = "$relCookies-journal"
$relLocalState = "Users\$env:USERNAME\AppData\Local\Google\Chrome\User Data\Local State"

Write-Host "配置文件: $ProfileDir"
Write-Host "输出目录: $OutDir"
Write-Host ''

# 1) 枚举快照
$shadows = @()
try {
  $shadows = Get-CimInstance Win32_ShadowCopy -ErrorAction Stop | Sort-Object InstallDate -Descending
} catch {
  Write-Host "无法枚举卷影副本: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host '可能是系统保护未开启，或该磁盘没有快照。'
  exit 2
}

if (-not $shadows -or $shadows.Count -eq 0) {
  Write-Host '没有任何卷影副本 —— 系统保护没开过，这条路走不通。' -ForegroundColor Yellow
  Write-Host '结论：只能重新登录。'
  exit 3
}

Write-Host "发现 $($shadows.Count) 个快照："
$i = 0
foreach ($s in $shadows) {
  Write-Host ("  [{0}] InstallDate={1}  {2}" -f $i, $s.InstallDate, $s.DeviceObject)
  $i++
}
Write-Host ''

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# 2) 从最新的快照开始，找第一个含 Cookies 的
foreach ($s in $shadows) {
  $root = $s.DeviceObject
  if (-not $root) { continue }
  $cand = Join-Path $root $relCookies
  if (-not (Test-Path -LiteralPath $cand)) {
    Write-Host ("跳过 {0}: 没有 Cookies" -f $s.InstallDate)
    continue
  }
  $tmp = Join-Path $OutDir 'Cookies'
  Copy-Item -LiteralPath $cand -Destination $tmp -Force -ErrorAction SilentlyContinue
  if (-not (Test-Path $tmp)) { continue }

  $size = (Get-Item $tmp).Length
  Write-Host ("命中快照 {0}，Cookies = {1:N0} 字节" -f $s.InstallDate, $size) -ForegroundColor Green

  foreach ($pair in @(@($relJournal, 'Cookies-journal'), @($relLocalState, 'Local State'))) {
    $srcRel = $pair[0]
    $dstName = $pair[1]
    $src = Join-Path $root $srcRel
    if (Test-Path -LiteralPath $src) {
      Copy-Item -LiteralPath $src -Destination (Join-Path $OutDir $dstName) -Force -ErrorAction SilentlyContinue
      Write-Host ("  已带出 {0}" -f $dstName)
    }
  }

  Write-Host ''
  Write-Host '完成。请把下面目录告诉 AI：' -ForegroundColor Green
  Write-Host "  $OutDir"
  exit 0
}

Write-Host '所有快照里都没有找到该 Cookies 文件。' -ForegroundColor Yellow
Write-Host '可能是快照早于该配置创建时间，或 ProfileDir 名称不对。'
Write-Host "当前应存在的路径: $userDir\$ProfileDir\Network\Cookies"
exit 4
