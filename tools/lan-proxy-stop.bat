@echo off
rem 停掉 Coopanion LAN 反代（只杀跑 lan-proxy.py 的 pythonw/python，不碰别的 python 进程）
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='pythonw.exe' or Name='python.exe'\" | Where-Object { $_.CommandLine -like '*lan-proxy.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Host ('killed ' + $_.ProcessId) }"