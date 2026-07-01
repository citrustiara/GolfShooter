[CmdletBinding()]
param(
  [string]$Targets = "",
  [switch]$DebugBuild,
  [switch]$IterativeBuild,
  [switch]$NoMaximize
)

$ErrorActionPreference = "Stop"

$pakeVersion = "3.12.1"
$appName = "Golf Duel"
$appIdentifier = "com.golfshooter.golfduel"
$appVersion = "1.0.0"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$repoFull = [System.IO.Path]::GetFullPath($repoRoot + [System.IO.Path]::DirectorySeparatorChar)
$pakeRoot = Join-Path $repoRoot ".pake"
$stageRoot = Join-Path $pakeRoot "app"
$buildRoot = Join-Path $pakeRoot "build"
$stageFull = [System.IO.Path]::GetFullPath($stageRoot)

if (-not $stageFull.StartsWith($repoFull, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to stage outside repository root: $stageFull"
}

if (Test-Path -LiteralPath $stageFull) {
  Remove-Item -LiteralPath $stageFull -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $stageFull | Out-Null
New-Item -ItemType Directory -Force -Path $buildRoot | Out-Null

$requiredItems = @(
  "index.html",
  "css",
  "js",
  "maps",
  "assets",
  "vendor",
  "LICENSE"
)

foreach ($item in $requiredItems) {
  $source = Join-Path $repoRoot $item
  if (-not (Test-Path -LiteralPath $source)) {
    throw "Missing required desktop asset: $item"
  }
  Copy-Item -LiteralPath $source -Destination $stageFull -Recurse -Force
}

$iconPath = Join-Path $repoRoot "assets\desktop\golf-duel-icon.png"
if (-not (Test-Path -LiteralPath $iconPath)) {
  throw "Missing desktop icon: $iconPath"
}

$pakeArgs = @(
  "..\app\index.html",
  "--use-local-file",
  "--name", $appName,
  "--identifier", $appIdentifier,
  "--title", $appName,
  "--icon", $iconPath,
  "--width", "1280",
  "--height", "800",
  "--min-width", "960",
  "--min-height", "600",
  "--app-version", $appVersion,
  "--keep-binary"
)

if (-not $NoMaximize) {
  $pakeArgs += "--maximize"
}

if (-not [string]::IsNullOrWhiteSpace($Targets)) {
  $pakeArgs += @("--targets", $Targets)
}

if ($DebugBuild) {
  $pakeArgs += "--debug"
}

if ($IterativeBuild) {
  $pakeArgs += "--iterative-build"
}

Push-Location $buildRoot
try {
  $npmArgs = @("exec", "--yes", "--package", "pake-cli@$pakeVersion", "--", "pake") + $pakeArgs
  & npm.cmd @npmArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Pake exited with code $LASTEXITCODE"
  }
}
finally {
  Pop-Location
}

$artifactExtensions = @(".exe", ".msi", ".dmg", ".deb", ".rpm")
$artifacts = Get-ChildItem -LiteralPath $buildRoot -Recurse -File |
  Where-Object { $artifactExtensions -contains $_.Extension -or $_.Name.EndsWith(".AppImage") } |
  Sort-Object LastWriteTime -Descending

if ($artifacts.Count -gt 0) {
  Write-Host "Desktop build artifacts:"
  $artifacts | Select-Object -First 12 | ForEach-Object {
    Write-Host ("  {0}" -f $_.FullName)
  }
}
else {
  Write-Host "Pake finished, but no desktop artifact was found under $buildRoot."
}
