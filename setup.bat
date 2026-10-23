@echo off
setlocal EnableExtensions DisableDelayedExpansion

set "START_APP=1"
if /i "%~1"=="--no-start" set "START_APP=0"

pushd "%~dp0" >nul 2>&1
if errorlevel 1 (
    echo setup: cannot open the project directory.
    exit /b 1
)

if not exist "package.json" (
    echo setup: package.json is missing. Run setup.bat from the repository root.
    popd
    exit /b 1
)

where git >nul 2>&1
if errorlevel 1 (
    echo setup: Git is required. Install Git for Windows, then run setup.bat again.
    popd
    exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
    echo setup: Node.js 22 or newer is required. Install it, then run setup.bat again.
    popd
    exit /b 1
)

node -e "const major = Number(process.versions.node.split('.')[0]); if (major < 22) { console.error('setup: Node.js 22 or newer is required; found ' + process.versions.node); process.exit(1); }"
if errorlevel 1 (
    popd
    exit /b 1
)

where corepack >nul 2>&1
if errorlevel 1 (
    echo setup: Corepack is required. It is included with supported Node.js releases.
    popd
    exit /b 1
)

set "PNPM=corepack pnpm"

echo [1/4] Checking Cortico submodule...
call git submodule update --init --recursive
if errorlevel 1 (
    echo setup: failed to initialize vendor/cortico.
    popd
    exit /b 1
)

echo [2/4] Installing dependencies...
call %PNPM% install --frozen-lockfile
if errorlevel 1 (
    echo setup: dependency installation failed.
    popd
    exit /b 1
)

echo [3/4] Installing Electron...
set "ELECTRON_OK="
node node_modules\electron\install.js
if not errorlevel 1 set "ELECTRON_OK=1"

if not defined ELECTRON_OK if not defined ELECTRON_MIRROR (
    echo setup: the official Electron download failed; retrying with npmmirror.
    set "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/"
    set "ELECTRON_CUSTOM_DIR={{ version }}"
    set "force_no_cache=true"
    node node_modules\electron\install.js
    if not errorlevel 1 set "ELECTRON_OK=1"
)

if not defined ELECTRON_OK (
    echo setup: Electron installation failed. Set ELECTRON_MIRROR to a reachable mirror and retry.
    popd
    exit /b 1
)

if not exist "node_modules\electron\dist\electron.exe" (
    echo setup: Electron installed without an executable.
    popd
    exit /b 1
)

echo [4/4] Building Cortico and the settings window...
call %PNPM% run build:cortico
if errorlevel 1 (
    echo setup: build failed.
    popd
    exit /b 1
)

if not exist "build\cortico" (
    echo setup: build/cortico is missing.
    popd
    exit /b 1
)

if not exist "build\console" (
    echo setup: build/console is missing.
    popd
    exit /b 1
)

echo.
echo Setup complete.
echo Development: %PNPM% run dev
echo Staged build: %PNPM% run start

if "%START_APP%"=="1" (
    echo Starting Coopanion...
    start "" "%~dp0node_modules\electron\dist\electron.exe" .
    if errorlevel 1 (
        echo setup: Coopanion could not be started.
        popd
        exit /b 1
    )
)

popd
endlocal
exit /b 0
