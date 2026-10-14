$ErrorActionPreference = 'Stop'
$appDirectory = $PSScriptRoot
$appUrl = 'http://127.0.0.1:7317'
$stateDirectory = Join-Path $appDirectory '.ai-web'
New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null
try {
  $existing = Invoke-WebRequest -UseBasicParsing -Uri $appUrl -TimeoutSec 2
  if ($existing.Content -match '<title>Pane(?:\s|[<·])') { Write-Host "Pane is already running: $appUrl"; exit 0 }
  throw 'Port 7317 is used by another app.'
} catch {
  if ($_.Exception.Message -eq 'Port 7317 is used by another app.') { throw }
}
if (-not (Test-Path -LiteralPath (Join-Path $appDirectory 'dist\index.html'))) {
  Push-Location $appDirectory
  try {
    npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
    npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
  } finally { Pop-Location }
}
$serverFile = Join-Path $appDirectory 'server\index.ts'
$serverProcess = Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList '--import', 'tsx', ('"' + $serverFile + '"') -WorkingDirectory $appDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $stateDirectory 'server.log') -RedirectStandardError (Join-Path $stateDirectory 'server-error.log')
$serverProcess.Id | Set-Content -LiteralPath (Join-Path $stateDirectory 'server.pid')
for ($attempt = 0; $attempt -lt 40; $attempt++) {
  Start-Sleep -Milliseconds 250
  try {
    $reply = Invoke-WebRequest -UseBasicParsing -Uri $appUrl -TimeoutSec 1
    if ($reply.Content -match '<title>Pane(?:\s|[<·])') {
      Write-Host "Pane is ready: $appUrl"
      Write-Host 'The server runs in the background. This PowerShell window can be closed.'
      exit 0
    }
  } catch {}
  if ($serverProcess.HasExited) { break }
}
if (-not $serverProcess.HasExited) { $serverProcess.Kill() }
throw ('Pane did not start. Check ' + (Join-Path $stateDirectory 'server-error.log'))
