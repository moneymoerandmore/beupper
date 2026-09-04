param([switch]$NoBrowser)

$ErrorActionPreference = "Stop"

# Some shells expose both Path and PATH. Windows PowerShell's Start-Process
# treats them as duplicate environment keys, so normalize them before spawning.
$processPath = $env:Path
[Environment]::SetEnvironmentVariable("PATH", $null, "Process")
[Environment]::SetEnvironmentVariable("Path", $processPath, "Process")

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$runtimeDir = Join-Path $projectDir ".runtime"
$logDir = Join-Path $runtimeDir "logs"
$venvDir = Join-Path $runtimeDir "venv"
$frontendPort = 4317
$gatewayPort = 4318

New-Item -ItemType Directory -Force -Path $runtimeDir, $logDir | Out-Null

function Find-Executable([string]$name, [string[]]$candidates) {
  $command = Get-Command $name -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) { return $candidate }
  }
  return $null
}

function Test-Port([int]$port) {
  return [bool](Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
}

function Wait-Url([string]$url, [int]$seconds = 45) {
  $deadline = (Get-Date).AddSeconds($seconds)
  do {
    try {
      $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { return $true }
    } catch {}
    Start-Sleep -Milliseconds 700
  } while ((Get-Date) -lt $deadline)
  return $false
}

$nodeExe = Find-Executable "node.exe" @(
  "$env:ProgramFiles\nodejs\node.exe",
  "${env:ProgramFiles(x86)}\nodejs\node.exe",
  "$env:LOCALAPPDATA\Programs\nodejs\node.exe"
)
$npmExe = Find-Executable "npm.cmd" @(
  "$env:ProgramFiles\nodejs\npm.cmd",
  "${env:ProgramFiles(x86)}\nodejs\npm.cmd",
  "$env:LOCALAPPDATA\Programs\nodejs\npm.cmd"
)
$pythonExe = Find-Executable "python.exe" @(
  "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe",
  "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
  "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe"
)

if (-not $nodeExe -or -not $npmExe) {
  throw "Node.js was not found. Install Node.js 22 or newer: https://nodejs.org/"
}
if (-not $pythonExe) {
  throw "Python was not found. Install Python 3.11 or newer: https://www.python.org/downloads/"
}

Push-Location $projectDir
try {
  if (-not (Test-Path -LiteralPath (Join-Path $projectDir "node_modules\vinext\dist\cli.js"))) {
    Write-Host "[First run] Installing web dependencies..." -ForegroundColor Cyan
    & $npmExe install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed." }
  }

  if (-not (Test-Path -LiteralPath (Join-Path $projectDir "dist\server"))) {
    Write-Host "[First run] Building the web app..." -ForegroundColor Cyan
    $env:WRANGLER_LOG_PATH = ".wrangler/wrangler.log"
    & $npmExe run build
    if ($LASTEXITCODE -ne 0) { throw "Web app build failed." }
  }

  $venvPython = Join-Path $venvDir "Scripts\python.exe"
  if (-not (Test-Path -LiteralPath $venvPython)) {
    Write-Host "[First run] Creating the Python environment..." -ForegroundColor Cyan
    & $pythonExe -m venv $venvDir
    if ($LASTEXITCODE -ne 0) { throw "Could not create the Python virtual environment." }
    & $venvPython -m pip install --disable-pip-version-check -r (Join-Path $projectDir "requirements.txt")
    if ($LASTEXITCODE -ne 0) { throw "Python dependency installation failed." }
  }

  if (-not (Test-Port $gatewayPort)) {
    Write-Host "Starting AI gateway on port 4318..." -ForegroundColor Cyan
    # The Windows venv launcher can corrupt non-ASCII absolute script paths.
    # Run the system interpreter with the venv's packages and an ASCII relative path.
    $venvSitePackages = Join-Path $venvDir "Lib\site-packages"
    $existingPythonPath = $env:PYTHONPATH
    $env:PYTHONPATH = if ($existingPythonPath) { "$venvSitePackages;$existingPythonPath" } else { $venvSitePackages }
    Start-Process -FilePath $pythonExe `
      -ArgumentList @("scripts\poe_image_server.py") `
      -WorkingDirectory $projectDir `
      -WindowStyle Hidden `
      -RedirectStandardOutput (Join-Path $logDir "ai-gateway.out.log") `
      -RedirectStandardError (Join-Path $logDir "ai-gateway.err.log")
  } else {
    Write-Host "AI gateway is already running on port 4318." -ForegroundColor DarkGray
  }

  if (-not (Wait-Url "http://127.0.0.1:$gatewayPort/health" 20)) {
    throw "AI gateway failed to start. See .runtime\logs\ai-gateway.err.log"
  }

  if (-not (Test-Port $frontendPort)) {
    Write-Host "Starting web app on port 4317..." -ForegroundColor Cyan
    $env:WRANGLER_LOG_PATH = ".wrangler/wrangler.log"
    $vinextCli = Join-Path $projectDir "node_modules\vinext\dist\cli.js"
    Start-Process -FilePath $nodeExe `
      -ArgumentList @($vinextCli, "start", "--port", "$frontendPort") `
      -WorkingDirectory $projectDir `
      -WindowStyle Hidden `
      -RedirectStandardOutput (Join-Path $logDir "web.out.log") `
      -RedirectStandardError (Join-Path $logDir "web.err.log")
  } else {
    Write-Host "Web app is already running on port 4317." -ForegroundColor DarkGray
  }

  if (-not (Wait-Url "http://localhost:$frontendPort/" 60)) {
    throw "Web app failed to start. See .runtime\logs\web.err.log"
  }

  Write-Host "Financial Titan Content OS is ready: http://localhost:$frontendPort/" -ForegroundColor Green
  if (-not $NoBrowser) { Start-Process "http://localhost:$frontendPort/" }
} finally {
  Pop-Location
}
