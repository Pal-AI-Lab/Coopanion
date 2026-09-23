# CortiCompanion one-line installer for Windows 10/11 (x64).
#
#   irm https://raw.githubusercontent.com/Pal-AI-Lab/Coopanion/main/installer/install.ps1 | iex
#
# Downloads the installer of the latest GitHub release into %TEMP% and runs it. The installer is
# per-user: no administrator rights, installed under %LOCALAPPDATA%\Programs\CortiCompanion.
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$repo = 'Pal-AI-Lab/Coopanion'
Write-Host '正在查找最新版本…'
$release = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/latest" -Headers @{ 'User-Agent' = 'CortiCompanion-installer' }
$asset = $release.assets | Where-Object { $_.name -like 'CortiCompanion-Setup-*.exe' } | Select-Object -First 1
if (-not $asset) { throw "最新版本 $($release.tag_name) 里没有安装程序。" }

$target = Join-Path $env:TEMP $asset.name
Write-Host "正在下载 $($asset.name)($([math]::Round($asset.size / 1MB)) MB)…"
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $target -UseBasicParsing

Write-Host '正在安装…'
Start-Process -FilePath $target -Wait
Remove-Item $target -ErrorAction SilentlyContinue
Write-Host 'CortiCompanion 装好了:桌面和开始菜单里都有它。第一次打开时填入 DeepSeek 的 API Key 就能用。'
