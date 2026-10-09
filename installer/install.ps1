# Coopanion one-line installer for Windows 10/11 (x64).
#
#   irm https://raw.githubusercontent.com/Pal-AI-Lab/Coopanion/main/installer/install.ps1 | iex
#
# Downloads the installer of the latest GitHub release into %TEMP%, runs it, and deletes it. The
# installer is per-user (no administrator rights) and asks for the install directory.
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$repo = 'Pal-AI-Lab/Coopanion'
Write-Host 'Looking for the latest version...'
$release = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/latest" -Headers @{ 'User-Agent' = 'Coopanion-installer' }
$asset = $release.assets | Where-Object { $_.name -like 'Coopanion-Setup-*.exe' } | Select-Object -First 1
if (-not $asset) { throw "The latest release $($release.tag_name) has no installer." }

$target = Join-Path $env:TEMP $asset.name
Write-Host "Downloading $($asset.name) ($([math]::Round($asset.size / 1MB)) MB)..."
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $target -UseBasicParsing

Write-Host 'Installing...'
Start-Process -FilePath $target -Wait
Remove-Item $target -ErrorAction SilentlyContinue
Write-Host 'Coopanion is installed; its icon is on the desktop. On first start, Coo asks which model service to use and for its API key.'
