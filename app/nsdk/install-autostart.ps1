$ErrorActionPreference = 'Stop'

$taskName = 'NasdaqReminder'
$projectDir = $PSScriptRoot

$repoRoot = Resolve-Path (Join-Path $projectDir '..\..')
$settingsPath = Join-Path $repoRoot 'Config\settings.json'

$logDir = 'D:\log-nsdk'
try {
  if (Test-Path $settingsPath) {
    $settings = Get-Content -Raw -Path $settingsPath | ConvertFrom-Json
    $configured = $settings.nsdk.logDir
    if ($configured -and [string]::IsNullOrWhiteSpace([string]$configured) -eq $false) {
      $v = ([string]$configured).Trim() -replace '/', '\\'
      if ([System.IO.Path]::IsPathRooted($v)) {
        $logDir = $v
      } else {
        $logDir = Join-Path $repoRoot $v
      }
    }
  }
} catch {}

if (-not (Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir | Out-Null
}

$autoLog = Join-Path $logDir 'autostart.log'
try {
  Add-Content -Path $autoLog -Value ('[NasdaqReminder] install ' + (Get-Date).ToString('s') + ' projectDir=' + $projectDir)
} catch {}

$nodeCmd = Get-Command node -ErrorAction Stop
$nodePath = $nodeCmd.Source

$scriptPath = Join-Path $projectDir 'src\scheduler.js'
if (-not (Test-Path $scriptPath)) {
  throw "Not found: $scriptPath"
}

$action = New-ScheduledTaskAction -Execute $nodePath -Argument "`"$scriptPath`"" -WorkingDirectory $projectDir
$trigger = New-ScheduledTaskTrigger -AtLogOn
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)

$task = New-ScheduledTask -Action $action -Trigger $trigger -Principal $principal -Settings $settings

try {
  Register-ScheduledTask -TaskName $taskName -InputObject $task -Force | Out-Null
  Start-ScheduledTask -TaskName $taskName
  Write-Host "OK: installed and started scheduled task '$taskName'"
  try { Add-Content -Path $autoLog -Value ('[NasdaqReminder] scheduled_task_started ' + (Get-Date).ToString('s')) } catch {}
  exit 0
} catch {
  Write-Host "WARN: scheduled task install failed (will fallback to Startup folder)."
  $errMsg = $_.Exception.Message
  try { Add-Content -Path $autoLog -Value ('[NasdaqReminder] scheduled_task_failed ' + (Get-Date).ToString('s') + ' ' + $errMsg) } catch {}
}

$startupDir = [Environment]::GetFolderPath('Startup')
$cmdPath = Join-Path $startupDir "$taskName.cmd"
$vbsPath = Join-Path $startupDir "$taskName.vbs"
$lnkPath = Join-Path $startupDir "$taskName.lnk"

try {
  $psPath = Join-Path $PSHOME 'powershell.exe'
  $startupScript = Join-Path $projectDir 'startup-run.ps1'
  $cmd = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$startupScript`""

  $wsh = New-Object -ComObject WScript.Shell
  $s = $wsh.CreateShortcut($lnkPath)
  $s.TargetPath = $psPath
  $s.Arguments = $cmd
  $s.WorkingDirectory = $projectDir
  $s.WindowStyle = 7
  $s.Save()

  Write-Host "OK: installed Startup shortcut autostart: $lnkPath"

  try {
    $runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
    $startupScript = Join-Path $projectDir 'startup-run.ps1'
    $runValue = "`"$psPath`" -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$startupScript`""
    New-ItemProperty -Path $runKey -Name $taskName -Value $runValue -PropertyType String -Force | Out-Null
    Write-Host "OK: installed Registry Run autostart: $runKey\\$taskName"
    try { Add-Content -Path $autoLog -Value ('[NasdaqReminder] registry_run_installed ' + (Get-Date).ToString('s')) } catch {}
  } catch {
    Write-Host "WARN: registry Run autostart failed."
    try { Add-Content -Path $autoLog -Value ('[NasdaqReminder] registry_run_failed ' + (Get-Date).ToString('s') + ' ' + $_.Exception.Message) } catch {}
  }

  exit 0
} catch {
  Write-Host "WARN: shortcut autostart failed (will fallback to .cmd visible window)."
}

$cmd = @"
@echo off
cd /d "$projectDir"
if not exist "$logDir" mkdir "$logDir"
echo [NasdaqReminder] start %DATE% %TIME%>> "$logDir\\autostart.log"
echo [NasdaqReminder] projectDir=$projectDir>> "$logDir\\autostart.log"
echo [NasdaqReminder] nodePath=$nodePath>> "$logDir\\autostart.log"
"$nodePath" "src\\scheduler.js" >> "$logDir\\autostart.log" 2>&1
"@

Set-Content -Path $cmdPath -Value $cmd -Encoding ASCII
Write-Host "OK: installed Startup cmd autostart: $cmdPath"
