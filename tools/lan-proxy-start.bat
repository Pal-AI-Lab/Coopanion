@echo off
rem 一次起两个反代：宠物页 17789->7797，控制台 17791->17788
rem python 用 PATH 里的（装 Python 时勾了 Add to PATH 就行）；
rem 想指定解释器就设环境变量 COOPANION_PYTHON 或改下面这行。
set "PY=pythonw"
if defined COOPANION_PYTHON set "PY=%COOPANION_PYTHON%"
set "BASE=%~dp0"
start "" %PY% "%BASE%lan-proxy.py" --port 17789 --upstream 127.0.0.1:7797
start "" %PY% "%BASE%lan-proxy.py" --port 17791 --upstream 127.0.0.1:17788
echo started: 17789 -^> pet(7797), 17791 -^> console(17788)