# Coopanion one-line installer for Windows 10/11 (x64).
#
#   irm https://raw.githubusercontent.com/Pal-AI-Lab/Coopanion/main/installer/install.ps1 | iex
#
# Downloads the installer of the latest GitHub release into %TEMP%, runs it, and deletes it — unless
# it exits with an error, in which case the download stays for a retry. The installer is per-user (no
# administrator rights) and asks for the install directory.
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
$process = Start-Process -FilePath $target -Wait -PassThru
if ($process.ExitCode -ne 0) {
    # the download stays: retrying it (also with /S, see the README) beats downloading 140 MB again
    throw "The installer exited with code $($process.ExitCode); nothing was installed. The installer was kept at $target."
}
Remove-Item $target -ErrorAction SilentlyContinue
Write-Host 'Coopanion is installed; its icon is on the desktop. On first start, Coo asks which model service to use and for its API key.'
