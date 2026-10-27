' Coopanion LAN 反代：登录时无声启动（Hermes 2026-10-27）
' 放到 %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\ 即可自启。
' 起两个实例：17789 -> 宠物页(7797)，17791 -> 控制台(17788)。
' 手动停：tools\lan-proxy-stop.bat
Option Explicit
Dim sh, fso, base, py, script
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

base = "D:\yangyu\Coopanion-mobile\tools"
py = "C:\Users\16219\AppData\Local\Programs\Python\Python312\pythonw.exe"
script = base & "\lan-proxy.py"

If Not fso.FileExists(py) Then WScript.Quit 1
If Not fso.FileExists(script) Then WScript.Quit 1

sh.Run """" & py & """ """ & script & """ --port 17789 --upstream 127.0.0.1:7797 --log """ & base & "\lan-proxy.log""", 0, False
sh.Run """" & py & """ """ & script & """ --port 17791 --upstream 127.0.0.1:17788 --log """ & base & "\lan-proxy-console.log""", 0, False