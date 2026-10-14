$ErrorActionPreference = 'Stop'
$appDirectory = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $appDirectory '.ai-web\server.pid'
if (-not (Test-Path -LiteralPath $pidFile)) { Write-Host 'No AI Web process recorded.'; exit 0 }
$serverProcessId = [int](Get-Content -LiteralPath $pidFile)
$record = Get-CimInstance Win32_Process -Filter "ProcessId = $serverProcessId"
if (-not $record) { Remove-Item -LiteralPath $pidFile; Write-Host 'AI Web is already stopped.'; exit 0 }
$serverFile = Join-Path $appDirectory 'server\src\index.ts'
$legacyServerFile = Join-Path $appDirectory 'server\index.ts'
if ($record.Name -ne 'node.exe' -or (-not $record.CommandLine.Contains($serverFile) -and -not $record.CommandLine.Contains($legacyServerFile))) { throw 'The recorded PID belongs to another process. It was not stopped.' }
& (Join-Path $env:SystemRoot 'System32\taskkill.exe') /PID $serverProcessId /T /F | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'AI Web could not be stopped. Its PID record was retained.' }
Remove-Item -LiteralPath $pidFile
Write-Host 'AI Web and its own CLI processes stopped. External agents were not stopped.'
