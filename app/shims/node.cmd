@echo off
rem pnpm runs packages' build scripts, which call `node`, when it installs or removes extensions. The app ships
rem no Node: this stands in for it and runs the app's own runtime as Node.
setlocal
set ELECTRON_RUN_AS_NODE=1
"%CORTICO_NODE_EXE%" %*
exit /b %ERRORLEVEL%
