@echo off
rem Cortico installs extensions with `corepack pnpm ...`. The app ships no Node and no corepack:
rem this stands in for corepack and runs the bundled pnpm on the app's own runtime.
setlocal
set ELECTRON_RUN_AS_NODE=1
if /i "%~1"=="pnpm" shift
set ARGS=
:collect
if "%~1"=="" goto run
set ARGS=%ARGS% "%~1"
shift
goto collect
:run
"%CORTICO_NODE_EXE%" "%CORTICO_PNPM_CJS%" %ARGS%
exit /b %ERRORLEVEL%
