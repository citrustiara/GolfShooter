<#
Copies the playable GolfShooter static files into the website repo.

Defaults:
  Source:      this script's folder
  Destination: D:\Repos\website

The script refreshes only the deployed game targets (index.html plus the css,
js, assets, and maps folders). The folders are copied recursively, file-for-file,
so new asset types keep deploying without updating this script. It removes known
GolfShooter dev leftovers from older broad copies and leaves protected website
folders alone (ZBS, BSK, .git). It does not copy .git,
.antigravity/.antigravitycli, .claude, root README/LICENSE files, node_modules,
scratch, scripts, or other dev-only top-level files.

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
  "Thumbs.db",
  ".DS_Store",
  "desktop.ini"
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
$ExcludedFileNameSet = New-InsensitiveSet $ExcludedFileNames

function Assert-NotProtectedTarget([string]$RelativePath) {
  $firstPart = ($RelativePath -split "[\\/]")[0]
  if ($ProtectedSet.Contains($firstPart)) {
    throw "Refusing to modify protected destination target '$RelativePath'."
  }
}

function Test-ExcludedFile([System.IO.FileInfo]$File) {
  if ($ExcludedFileNameSet.Contains($File.Name)) { return $true }
  return $false
}

function Remove-DestinationTarget([string]$RelativePath, [string]$Reason) {
  Assert-NotProtectedTarget $RelativePath
  $targetPath = Join-Path $Destination $RelativePath
  if (-not (Test-Path -LiteralPath $targetPath)) { return }

  if ($DryRun) {
    Write-Host "[dry-run] Remove $RelativePath ($Reason)"
  } else {
    Write-Verbose "Remove $RelativePath ($Reason)"
    Remove-Item -LiteralPath $targetPath -Recurse -Force
  }
  $script:RemovedCount++
}

function Copy-GameFile([System.IO.FileInfo]$SourceFile) {
  $relativePath = Get-RelativePath $Source $SourceFile.FullName
  [void]$script:ExpectedRelativePaths.Add($relativePath)

  $targetPath = Join-Path $Destination $relativePath
  $targetDir = Split-Path -Parent $targetPath

  if ($DryRun) {
    Write-Host "[dry-run] Copy $relativePath"
  } else {
    Write-Verbose "Copy $relativePath"
    if (-not (Test-Path -LiteralPath $targetDir)) {
      [void](New-Item -ItemType Directory -Path $targetDir -Force)
    }
    Copy-Item -LiteralPath $SourceFile.FullName -Destination $targetPath -Force
  }
  $script:CopiedCount++
}

function Test-CopiedGameFiles() {
  $failures = @()

  foreach ($relativePath in $ExpectedRelativePaths) {
    $sourcePath = Join-Path $Source $relativePath
    $targetPath = Join-Path $Destination $relativePath

    if (-not (Test-Path -LiteralPath $targetPath -PathType Leaf)) {
      $failures += "Missing: $relativePath"
      continue
    }

    $sourceInfo = Get-Item -LiteralPath $sourcePath
    $targetInfo = Get-Item -LiteralPath $targetPath
    if ($sourceInfo.Length -ne $targetInfo.Length) {
      $failures += "Size mismatch: $relativePath"
      continue
    }

    $sourceHash = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash
    $targetHash = (Get-FileHash -LiteralPath $targetPath -Algorithm SHA256).Hash
    if ($sourceHash -ne $targetHash) {
      $failures += "Hash mismatch: $relativePath"
    }
  }

  if ($failures.Count -gt 0) {
    $preview = ($failures | Select-Object -First 20) -join [Environment]::NewLine
    if ($failures.Count -gt 20) {
      $preview += [Environment]::NewLine + "...and $($failures.Count - 20) more."
    }
    throw "Copy verification failed for $($failures.Count) file(s):$([Environment]::NewLine)$preview"
  }

  return $ExpectedRelativePaths.Count
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
$ExpectedRelativePaths = New-Object "System.Collections.Generic.List[string]"

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
  if (-not (Test-ExcludedFile $file)) {
    Copy-GameFile $file
  } else {
    $SkippedCount++
  }
}

foreach ($directoryName in $GameDirectories) {
  $directoryPath = Join-Path $Source $directoryName
  Get-ChildItem -LiteralPath $directoryPath -Recurse -File -Force | ForEach-Object {
    if (-not (Test-ExcludedFile $_)) {
      Copy-GameFile $_
    } else {
      $SkippedCount++
    }
  }
}

$VerifiedCount = 0
if (-not $DryRun) {
  $VerifiedCount = Test-CopiedGameFiles
}

$verb = if ($DryRun) { "Would copy" } else { "Copied" }
$removeVerb = if ($DryRun) { "Would remove" } else { "Removed" }
Write-Host "$verb $CopiedCount game file(s)."
if (-not $DryRun) { Write-Host "Verified $VerifiedCount copied game file(s) in destination." }
Write-Host "$removeVerb $RemovedCount old/non-game target(s)."
Write-Host "Skipped $SkippedCount excluded file(s) from the source."
Write-Host "Protected destination folders were left untouched: ZBS, BSK, .git"
