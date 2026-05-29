$ErrorActionPreference = 'Stop'

$procs = Get-CimInstance Win32_Process | Where-Object {
  $_.Name -eq 'node.exe' -and $_.CommandLine -match 'src[\\/]+scheduler\.js'
}
if (@($procs).Count -eq 0) {
  Write-Host "OK: no node scheduler process found"
  exit 0
}

foreach ($p in $procs) {
  try {
    Stop-Process -Id $p.ProcessId -Force
    Write-Host "OK: stopped PID $($p.ProcessId)"
  } catch {
    Write-Host "WARN: failed to stop PID $($p.ProcessId)"
  }
}
