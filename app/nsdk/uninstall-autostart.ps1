$ErrorActionPreference = 'Stop'

$taskName = 'NasdaqReminder'

if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue | Out-Null
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false | Out-Null
  Write-Host "OK: uninstalled scheduled task '$taskName'"
} else {
  Write-Host "OK: task '$taskName' not found"
}

$startupDir = [Environment]::GetFolderPath('Startup')
$cmdPath = Join-Path $startupDir "$taskName.cmd"
$vbsPath = Join-Path $startupDir "$taskName.vbs"
$lnkPath = Join-Path $startupDir "$taskName.lnk"

if (Test-Path $cmdPath) { Remove-Item $cmdPath -Force }
if (Test-Path $vbsPath) { Remove-Item $vbsPath -Force }
if (Test-Path $lnkPath) { Remove-Item $lnkPath -Force }

Write-Host "OK: removed Startup files (if existed)"

try {
  $runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
  if (Get-ItemProperty -Path $runKey -Name $taskName -ErrorAction SilentlyContinue) {
    Remove-ItemProperty -Path $runKey -Name $taskName -ErrorAction SilentlyContinue
    Write-Host "OK: removed Registry Run entry '$taskName'"
  } else {
    Write-Host "OK: Registry Run entry '$taskName' not found"
  }
} catch {
  Write-Host "WARN: failed to remove Registry Run entry '$taskName'"
}
