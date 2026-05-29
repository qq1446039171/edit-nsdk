param(
  [switch]$Details
)

$ErrorActionPreference = 'Stop'

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

$procs = Get-CimInstance Win32_Process | Where-Object {
  $_.Name -eq 'node.exe' -and $_.CommandLine -match 'src[\\/]+scheduler\.js'
}
if (@($procs).Count -gt 0) {
  Write-Host 'RUNNING'
  if ($Details) {
    Write-Host ""
    Write-Host "ProjectDir: $projectDir"
    Write-Host "RepoRoot:   $repoRoot"
    Write-Host "Settings:   $settingsPath"
    Write-Host "LogDir:     $logDir"
    Write-Host ""

    $taskName = 'NasdaqReminder'
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($null -ne $task) {
      Write-Host "Autostart:  ScheduledTask FOUND ($taskName)"
      $task | Select-Object TaskName,State | Format-Table -AutoSize
    } else {
      Write-Host "Autostart:  ScheduledTask NOT_FOUND ($taskName)"
    }

    $startupDir = [Environment]::GetFolderPath('Startup')
    $lnkPath = Join-Path $startupDir ($taskName + '.lnk')
    if (Test-Path $lnkPath) {
      Write-Host "Autostart:  StartupLink FOUND ($lnkPath)"
    } else {
      Write-Host "Autostart:  StartupLink NOT_FOUND ($lnkPath)"
    }

    Write-Host ""
    $procs | Select-Object ProcessId, CommandLine | Format-List
  }
  exit 0
}

Write-Host 'STOPPED'
if ($Details) {
  Write-Host ""
  Write-Host "ProjectDir: $projectDir"
  Write-Host "RepoRoot:   $repoRoot"
  Write-Host "Settings:   $settingsPath"
  Write-Host "LogDir:     $logDir"
  Write-Host ""

  $taskName = 'NasdaqReminder'
  $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($null -ne $task) {
    Write-Host "Autostart:  ScheduledTask FOUND ($taskName)"
    $task | Select-Object TaskName,State | Format-Table -AutoSize
  } else {
    Write-Host "Autostart:  ScheduledTask NOT_FOUND ($taskName)"
  }

  $startupDir = [Environment]::GetFolderPath('Startup')
  $lnkPath = Join-Path $startupDir ($taskName + '.lnk')
  if (Test-Path $lnkPath) {
    Write-Host "Autostart:  StartupLink FOUND ($lnkPath)"
  } else {
    Write-Host "Autostart:  StartupLink NOT_FOUND ($lnkPath)"
  }

  Write-Host ""

  $autoLog = Join-Path $logDir 'autostart.log'
  $execLog = Join-Path $logDir 'execution.log'

  if (Test-Path $autoLog) {
    Write-Host "Tail autostart.log:"
    Get-Content -Tail 10 $autoLog
  } else {
    Write-Host "autostart.log not found: $autoLog"
  }

  Write-Host ""

  if (Test-Path $execLog) {
    Write-Host "Tail execution.log:"
    Get-Content -Tail 5 $execLog
  } else {
    Write-Host "execution.log not found: $execLog"
  }
}
exit 0
