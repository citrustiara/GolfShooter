<#
Copies the playable GolfShooter static files into the website repo.

Defaults:
  Source:      this script's folder
  Destination: D:\Repos\website

The script refreshes only the deployed game targets (index.html, css, js,
assets, maps), removes known GolfShooter dev leftovers from older broad copies,
and leaves protected website folders alone (ZBS, BSK, .git). It does not copy
.git, .antigravity/.antigravitycli, .claude, README/LICENSE files,
node_modules, scratch, scripts, or other dev-only files.

Run:
  powershell -ExecutionPolicy Bypass -File .\copy-game-to-website.ps1

Preview without changing files:
  powershell -ExecutionPolicy Bypass -File .\copy-game-to-website.ps1 -DryRun
#>
[CmdletBinding()]
param(
  [string]$Source = $PSScriptRoot,
  [string]$Destination = "D:\Repos\website",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$RootGameFiles = @(
  "index.html"
)

$GameDirectories = @(
  "css",
  "js",
  "assets",
  "maps"
)

# Extensions used by the browser-playable game. Markdown/docs and dev files are excluded.
$AllowedExtensions = @(
  ".html", ".css", ".js", ".json",
  ".glb", ".gltf", ".bin",
  ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".ico",
  ".mp3", ".wav", ".ogg", ".m4a",
  ".woff", ".woff2", ".ttf", ".otf",
  ".wasm"
)

$NeverCopyOrDelete = @(
  ".git",
  "ZBS",
  "BSK"
)

# Known non-game leftovers that may exist in D:\Repos\website from old broad copies.
$StaleNonGameTargets = @(
  ".antigravity",
  ".antigravitycli",
  ".claude",
  "node_modules",
  "scratch",
  "scripts",
  "README",
  "README.md",
  "LICENSE",
  "LICENSE.md",
  ".gitignore",
  "package.json",
  "package-lock.json",
  "server.cjs",
  "webrtc_stun_guide.md",
  "copy-game-to-website.ps1"
)

$ExcludedFileNames = @(
  "README",
  "README.md",
  "LICENSE",
  "LICENSE.md"
)

$ExcludedFilePatterns = @(
  "*.orig.*"
)

function Get-FullPath([string]$Path) {
  $expanded = [Environment]::ExpandEnvironmentVariables($Path)
  if ([System.IO.Path]::IsPathRooted($expanded)) {
    return [System.IO.Path]::GetFullPath($expanded)
  }
  return [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $expanded))
}

function Get-RelativePath([string]$BasePath, [string]$FullPath) {
  $baseFull = [System.IO.Path]::GetFullPath($BasePath).TrimEnd("\", "/")
  $full = [System.IO.Path]::GetFullPath($FullPath)
  if ($full -ieq $baseFull) { return "" }

  $baseWithSlash = $baseFull + [System.IO.Path]::DirectorySeparatorChar
  if (-not $full.StartsWith($baseWithSlash, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Path '$FullPath' is not inside '$BasePath'."
  }

  return $full.Substring($baseWithSlash.Length)
}

function New-InsensitiveSet([string[]]$Values) {
  $set = New-Object "System.Collections.Generic.HashSet[string]" ([System.StringComparer]::OrdinalIgnoreCase)
  foreach ($value in $Values) { [void]$set.Add($value) }
  return $set
}

$ProtectedSet = New-InsensitiveSet $NeverCopyOrDelete
$AllowedExtensionSet = New-InsensitiveSet $AllowedExtensions
$ExcludedFileNameSet = New-InsensitiveSet $ExcludedFileNames

function Assert-NotProtectedTarget([string]$RelativePath) {
  $firstPart = ($RelativePath -split "[\\/]")[0]
  if ($ProtectedSet.Contains($firstPart)) {
    throw "Refusing to modify protected destination target '$RelativePath'."
  }
}

function Test-ExcludedFile([System.IO.FileInfo]$File) {
  if ($ExcludedFileNameSet.Contains($File.Name)) { return $true }
  foreach ($pattern in $ExcludedFilePatterns) {
    if ($File.Name -like $pattern) { return $true }
  }
  return $false
}

function Test-AllowedGameFile([System.IO.FileInfo]$File) {
  if (Test-ExcludedFile $File) { return $false }
  $extension = [System.IO.Path]::GetExtension($File.Name)
  return $AllowedExtensionSet.Contains($extension)
}

function Remove-DestinationTarget([string]$RelativePath, [string]$Reason) {
  Assert-NotProtectedTarget $RelativePath
  $targetPath = Join-Path $Destination $RelativePath
  if (-not (Test-Path -LiteralPath $targetPath)) { return }

  if ($DryRun) {
    Write-Host "[dry-run] Remove $RelativePath ($Reason)"
  } else {
    Remove-Item -LiteralPath $targetPath -Recurse -Force
  }
  $script:RemovedCount++
}

function Copy-GameFile([System.IO.FileInfo]$SourceFile) {
  $relativePath = Get-RelativePath $Source $SourceFile.FullName
  $targetPath = Join-Path $Destination $relativePath
  $targetDir = Split-Path -Parent $targetPath

  if ($DryRun) {
    Write-Host "[dry-run] Copy $relativePath"
  } else {
    if (-not (Test-Path -LiteralPath $targetDir)) {
      [void](New-Item -ItemType Directory -Path $targetDir -Force)
    }
    Copy-Item -LiteralPath $SourceFile.FullName -Destination $targetPath -Force
  }
  $script:CopiedCount++
}

$Source = Get-FullPath $Source
$Destination = Get-FullPath $Destination

if (-not (Test-Path -LiteralPath $Source -PathType Container)) {
  throw "Source folder does not exist: $Source"
}

$sourceComparable = $Source.TrimEnd("\", "/")
$destinationComparable = $Destination.TrimEnd("\", "/")
if ($sourceComparable -ieq $destinationComparable) {
  throw "Source and destination are the same folder. Refusing to continue."
}

$missing = @()
foreach ($fileName in $RootGameFiles) {
  $path = Join-Path $Source $fileName
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { $missing += $fileName }
}
foreach ($directoryName in $GameDirectories) {
  $path = Join-Path $Source $directoryName
  if (-not (Test-Path -LiteralPath $path -PathType Container)) { $missing += $directoryName }
}
if ($missing.Count -gt 0) {
  throw "Missing required game source target(s): $($missing -join ', ')"
}

if (-not (Test-Path -LiteralPath $Destination -PathType Container)) {
  if ($DryRun) {
    Write-Host "[dry-run] Create destination folder $Destination"
  } else {
    [void](New-Item -ItemType Directory -Path $Destination -Force)
  }
}

$CopiedCount = 0
$RemovedCount = 0
$SkippedCount = 0

Write-Host "Source:      $Source"
Write-Host "Destination: $Destination"
if ($DryRun) { Write-Host "Mode:        dry run (no files will be changed)" }

# Refresh the actual game deployment targets. This removes stale game files inside these folders.
foreach ($fileName in $RootGameFiles) {
  Remove-DestinationTarget $fileName "old deployed game file"
}
foreach ($directoryName in $GameDirectories) {
  Remove-DestinationTarget $directoryName "old deployed game directory"
}

# Remove known non-game files/folders left by older broad-copy deployments.
foreach ($target in $StaleNonGameTargets) {
  Remove-DestinationTarget $target "non-game leftover"
}

foreach ($fileName in $RootGameFiles) {
  $file = Get-Item -LiteralPath (Join-Path $Source $fileName)
  if (Test-AllowedGameFile $file) {
    Copy-GameFile $file
  } else {
    $SkippedCount++
  }
}

foreach ($directoryName in $GameDirectories) {
  $directoryPath = Join-Path $Source $directoryName
  Get-ChildItem -LiteralPath $directoryPath -Recurse -File -Force | ForEach-Object {
    if (Test-AllowedGameFile $_) {
      Copy-GameFile $_
    } else {
      $SkippedCount++
    }
  }
}

$verb = if ($DryRun) { "Would copy" } else { "Copied" }
$removeVerb = if ($DryRun) { "Would remove" } else { "Removed" }
Write-Host "$verb $CopiedCount game file(s)."
Write-Host "$removeVerb $RemovedCount old/non-game target(s)."
Write-Host "Skipped $SkippedCount non-game file(s) from the source."
Write-Host "Protected destination folders were left untouched: ZBS, BSK, .git"
