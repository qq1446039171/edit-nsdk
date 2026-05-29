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

if (-not (Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir | Out-Null
}

$autoLog = Join-Path $logDir 'autostart.log'
try {
  Add-Content -Path $autoLog -Value ('[NasdaqReminder] start ' + (Get-Date).ToString('s') + ' projectDir=' + $projectDir)
} catch {}

$nodeExe = (Get-Command node -ErrorAction Stop).Source
$schedulerPath = Join-Path $projectDir 'src\scheduler.js'
if (-not (Test-Path $schedulerPath)) {
  throw "Not found: $schedulerPath"
}

$procs = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and ($_.CommandLine -like ('*' + $schedulerPath + '*')) }
if (@($procs).Count -gt 0) {
  try {
    Add-Content -Path $autoLog -Value ('[NasdaqReminder] already_running ' + (Get-Date).ToString('s'))
  } catch {}
  exit 0
}

Start-Process -WindowStyle Hidden -FilePath $nodeExe -ArgumentList @($schedulerPath) -WorkingDirectory $projectDir
