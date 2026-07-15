# ThaoTerminal Windows installer.
# Run via:
#   irm https://raw.githubusercontent.com/thaophamce/thaoterminal/main/install.ps1 | iex

$ErrorActionPreference = 'Stop'

$repo = "thaophamce/thaoterminal"
$appName = "ThaoTerminal"

Write-Host "Finding latest $appName release..." -ForegroundColor Cyan

# Fetch latest release info from GitHub API
$releasesUrl = "https://api.github.com/repos/$repo/releases/latest"
try {
    $response = Invoke-RestMethod -Uri $releasesUrl -UseBasicParsing
} catch {
    Write-Error "Failed to fetch release information from GitHub: $_"
    exit 1
}

$tag = $response.tag_name
if (-not $tag) {
    Write-Error "No releases found on GitHub."
    exit 1
}

$version = $tag.TrimStart('v')
Write-Host "Found version $tag" -ForegroundColor Green

# Construct download URL for the installer
# The installer is expected to be uploaded as ThaoTerminal-Setup-$version.exe
# If that fails, fallback to checking assets in the response
$installerName = "ThaoTerminal-Setup-$version.exe"
$asset = $response.assets | Where-Object { $_.name -like "*Setup*.exe" -or $_.name -like "*.exe" } | Select-Object -First 1

if ($asset) {
    $installerName = $asset.name
    $downloadUrl = $asset.browser_download_url
} else {
    $downloadUrl = "https://github.com/$repo/releases/download/$tag/$installerName"
}

$tempDir = [System.IO.Path]::GetTempPath()
$tempPath = Join-Path $tempDir $installerName

Write-Host "Downloading $appName Setup ($installerName)..." -ForegroundColor Cyan
Write-Host "From: $downloadUrl" -ForegroundColor Gray

try {
    # Using WebClient or Invoke-WebRequest
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $downloadUrl -OutFile $tempPath -UseBasicParsing
} catch {
    Write-Error "Failed to download installer: $_"
    exit 1
}

Write-Host "Launching installer..." -ForegroundColor Cyan
# Run installer
try {
    Start-Process -FilePath $tempPath -Wait
    Write-Host "Installation completed successfully!" -ForegroundColor Green
} catch {
    Write-Error "Failed to run installer: $_"
    exit 1
} finally {
    if (Test-Path $tempPath) {
        Remove-Item $tempPath -Force -ErrorAction SilentlyContinue
    }
}
