# Exercises the packaged NSIS installer in an isolated Windows runner.
param(
    [Parameter(Mandatory)][string]$Setup,
    [Parameter(Mandatory)][ValidateSet('x64', 'arm64')][string]$Arch
)
$ErrorActionPreference = 'Stop'
$Setup = (Resolve-Path $Setup).Path
$root = Join-Path $env:RUNNER_TEMP ('Coopanion installer ' + [guid]::NewGuid())
$install = Join-Path $root 'app'
$state = Join-Path $install '.coopanion-update'
$exe = Join-Path $install 'Coopanion.exe'
$data = Join-Path $install 'data'
$notice = Join-Path $data 'logs\last-update-error.txt'
$uninstaller = Join-Path $install 'Uninstall Coopanion.exe'
$installId = '3b83e019-1b4f-5c03-b0be-fa5cc2dfe27a'
$installKey = "HKCU:\Software\$installId"
$uninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$installId"
$desktop = [Environment]::GetFolderPath('DesktopDirectory')
$shortcut = Join-Path $desktop 'Coopanion.lnk'
$user = '*' + [Security.Principal.WindowsIdentity]::GetCurrent().User.Value

function Install([switch]$QuoteDirectory, [switch]$Manual) {
    $directoryArgument = "/D=$install"
    if ($QuoteDirectory) { $directoryArgument = '"' + $directoryArgument + '"' }
    $arguments = "/S $directoryArgument"
    if (-not $Manual) { $arguments = "--updated $arguments" }
    $process = Start-Process -FilePath $Setup -ArgumentList $arguments -Wait -PassThru
    return $process.ExitCode
}

function Wait-For([scriptblock]$Condition, [string]$Failure) {
    $watch = [Diagnostics.Stopwatch]::StartNew()
    while (-not (& $Condition)) {
        if ($watch.Elapsed.TotalSeconds -ge 30) { throw $Failure }
        Start-Sleep -Milliseconds 250
    }
}

function Assert-Exit([int]$Code, [bool]$Success) {
    if (($Code -eq 0) -ne $Success) {
        throw "Unexpected installer exit code $Code"
    }
}

function Assert-Preserved {
    if ((Get-Content -LiteralPath "$data\memory.txt") -ne 'user data' -or
        (Get-Content -LiteralPath "$install\notes.txt") -ne 'user file') {
        throw 'The installer changed a user file.'
    }
}

try {
    $deployment = Join-Path $data 'home\companion'
    $resources = Join-Path $install 'resources'
    New-Item -ItemType Directory -Path $deployment, $resources -Force | Out-Null
    Set-Content -LiteralPath "$data\memory.txt" -Value 'user data'
    Set-Content -LiteralPath "$install\notes.txt" -Value 'user file'
    Set-Content -LiteralPath "$deployment\deployment.json" -Value '{"bot":"cormini"}'
    Set-Content -LiteralPath "$deployment\config.json" -Value '{"companion":{"telemetry":false,"autoUpdate":false}}'
    Set-Content -LiteralPath "$resources\partial.txt" -Value 'partial payload'
    Set-Content -LiteralPath "$install\icudtl.dat" -Value 'partial payload'
    if ((Test-Path $installKey) -or (Test-Path $uninstallKey) -or (Test-Path -LiteralPath $exe)) {
        throw 'The partial-install fixture must have no application or registration.'
    }

    # A terminal error dialog must leave the installer lock available for a retry.
    Set-Content -LiteralPath $state -Value 'occupied'
    $failedSetup = Start-Process -FilePath $Setup -ArgumentList "--updated /S --force-run /D=$install" -PassThru
    try {
        Wait-For {
            if ($failedSetup.HasExited) { throw 'The restart update exited without an error dialog.' }
            if (-not (Test-Path -LiteralPath "$data\logs\installer.log")) { return $false }
            try {
                $mutex = [Threading.Mutex]::OpenExisting($installId)
                $mutex.Dispose()
                return $false
            } catch [Threading.WaitHandleCannotBeOpenedException] {
                return $true
            }
        } 'The failed restart update held the installer lock while showing its error dialog.'
        Remove-Item -LiteralPath $state
        # A desktop that refuses the shortcut leaves the fresh install complete.
        icacls $desktop /deny "${user}:(WD)" | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'The desktop fixture could not deny new files.' }
        try {
            # Node's Windows spawn quotes the /D argument when the path contains spaces.
            Assert-Exit (Install -QuoteDirectory) $true
        } finally {
            icacls $desktop /remove:d $user | Out-Null
        }
        if (Test-Path -LiteralPath $shortcut) { throw 'The desktop fixture did not refuse the shortcut.' }
        if ($failedSetup.HasExited) { throw 'The retry did not run while the error dialog was open.' }
    } finally {
        if (-not $failedSetup.HasExited) { Stop-Process -InputObject $failedSetup }
    }

    if (Test-Path -LiteralPath "$install\.coopanion-update-cleanup") {
        throw 'The successful installation left its retired transaction.'
    }
    if (Test-Path -LiteralPath "$resources\partial.txt") { throw 'The repair kept a partial program file.' }
    Assert-Preserved
    $exeHash = (Get-FileHash -LiteralPath $exe).Hash
    $loader = Join-Path $install 'resources\app\node_modules\tsx\dist\loader.mjs'

    # An existing file at the staging path prevents unpacking before the install is modified.
    Set-Content -LiteralPath $state -Value 'occupied'
    Assert-Exit (Install) $false
    if ((Get-FileHash -LiteralPath $exe).Hash -ne $exeHash -or -not (Test-Path -LiteralPath $loader)) {
        throw 'A staging failure changed the previous install.'
    }
    Assert-Preserved
    if ((Get-Content -LiteralPath "$data\logs\installer.log" -Tail 1) -notmatch 'stage=staging') {
        throw 'The installer did not report the staging failure.'
    }
    $failure = @(Get-Content -LiteralPath $notice)
    if ($failure.Count -ne 2 -or $failure[0] -ne $install -or $failure[1] -ne (Get-Content package.json -Raw | ConvertFrom-Json).version) {
        throw 'The quiet failure did not record its installation and target version.'
    }
    Remove-Item -LiteralPath $state

    # A staged transaction reaches the process check before unpacking. The app
    # process outlives the former 3 s wait, then exits during the updater's grace period.
    $hold = Join-Path $root 'hold.cjs'
    $ready = Join-Path $root 'running'
    Set-Content -LiteralPath $hold -Value 'require("node:fs").writeFileSync(process.argv[2], "ready"); setTimeout(() => {}, 10000);'
    New-Item -ItemType Directory -Path "$state\old", "$state\new" | Out-Null
    Set-Content -LiteralPath "$state\owned" -Value '1'
    $env:ELECTRON_RUN_AS_NODE = '1'
    try {
        $closing = Start-Process -FilePath $exe -ArgumentList ('"{0}" "{1}"' -f $hold, $ready) -PassThru
    } finally {
        Remove-Item Env:ELECTRON_RUN_AS_NODE
    }
    Wait-For { Test-Path -LiteralPath $ready } 'The updater wait fixture did not start.'

    # Windows denies a rename when a file is open without FILE_SHARE_DELETE.
    $locked = [IO.File]::Open("$install\icudtl.dat", 'Open', 'Read', 'Read')
    try {
        Assert-Exit (Install) $false
        if ((Get-FileHash -LiteralPath $exe).Hash -ne $exeHash -or -not (Test-Path -LiteralPath $loader)) {
            throw 'The installer did not restore the files it had already moved.'
        }
        Assert-Preserved
    } finally {
        $locked.Dispose()
        if (-not $closing.HasExited) { Stop-Process -InputObject $closing }
    }
    if (Test-Path -LiteralPath $state) { throw 'The rollback did not finish.' }
    if ((Get-Content -LiteralPath "$data\logs\installer.log" -Tail 1) -notmatch 'stage=back up previous files file=icudtl.dat result=rollback complete') {
        throw 'The expected sharing violation did not cause the rollback.'
    }

    # Disk state after an interruption between moving the old files and publishing
    # the whole new version. Lock one backup to interrupt the recovery itself.
    $old = Join-Path $state 'old'
    $new = Join-Path $state 'new'
    New-Item -ItemType Directory -Path $old, $new | Out-Null
    foreach ($line in Get-Content installer/program-files.nsh) {
        if ($line -match '^\s+!insertmacro \$\{OP\} "([^"]+)"$') {
            $entry = Join-Path $install $Matches[1]
            if (Test-Path -LiteralPath $entry) { Move-Item -LiteralPath $entry -Destination $old }
        }
    }
    Set-Content -LiteralPath "$state\owned" -Value '1'
    Set-Content -LiteralPath "$state\apply" -Value '1'
    Set-Content -LiteralPath "$install\snapshot_blob.bin" -Value 'partially applied file'
    $locked = [IO.File]::Open("$old\icudtl.dat", 'Open', 'Read', 'Read')
    try {
        Assert-Exit (Install) $false
        if (-not (Test-Path -LiteralPath "$state\restore")) {
            throw 'The installer did not finish moving the partial new version out of the way.'
        }
        if ((Get-FileHash -LiteralPath "$old\Coopanion.exe").Hash -ne $exeHash) {
            throw 'The interrupted recovery changed the executable in the backup.'
        }
        Assert-Preserved
    } finally {
        $locked.Dispose()
    }
    Assert-Exit (Install) $true
    if (Test-Path -LiteralPath $state) { throw 'The installer left a transaction after a successful retry.' }
    if (Test-Path -LiteralPath $notice) { throw 'The successful install left an obsolete failure notice.' }
    Assert-Preserved

    # The registered previous uninstaller rejects the arguments from a legacy upgrade.
    # Setup replaces the registered file and the running app through the transaction.
    if ((Get-ItemProperty $installKey).InstallLocation -ne $install -or
        (Get-ItemProperty $uninstallKey).UninstallString -notlike ('"{0}"*' -f $uninstaller)) {
        throw 'The previous install is missing its uninstall registration.'
    }
    Copy-Item -LiteralPath "$env:SystemRoot\System32\where.exe" -Destination $uninstaller -Force
    $app = Start-Process -FilePath $exe -PassThru
    try {
        Wait-For {
            Test-Path -LiteralPath "$data\logs\core.log"
        } 'The installed application did not start its Core.'
        Assert-Exit (Install -Manual) $true
        if (-not $app.HasExited) { throw 'The application did not exit for the manual upgrade.' }
        Assert-Preserved
    } finally {
        if (-not $app.HasExited) { Stop-Process -InputObject $app }
    }

    $env:ELECTRON_RUN_AS_NODE = '1'
    try {
        $script = (Resolve-Path scripts/check-native.cjs).Path
        $check = Start-Process -FilePath $exe -ArgumentList ('"{0}" "{1}\resources\app" {2}' -f $script, $install, $Arch) -Wait -PassThru -RedirectStandardOutput "$root\native.out" -RedirectStandardError "$root\native.err"
        Get-Content "$root\native.out", "$root\native.err"
        if ($check.ExitCode -ne 0) { throw "Native dependencies failed to load on $Arch" }
        $boot = (Resolve-Path tests/boot-installed-core.cjs).Path
        $check = Start-Process -FilePath $exe -ArgumentList ('"{0}" "{1}\resources\app" "{2}\boot"' -f $boot, $install, $root) -Wait -PassThru -RedirectStandardOutput "$root\boot.out" -RedirectStandardError "$root\boot.err"
        Get-Content "$root\boot.out", "$root\boot.err"
        if ($check.ExitCode -ne 0) { throw "The installed Core failed on $Arch" }
    } finally {
        Remove-Item Env:ELECTRON_RUN_AS_NODE
    }

    $uninstall = Start-Process -FilePath $uninstaller -ArgumentList '/S /KEEP_APP_DATA' -Wait -PassThru
    if ($uninstall.ExitCode -ne 0 -or (Test-Path -LiteralPath $exe)) { throw 'Uninstall failed.' }
    Assert-Preserved
} catch {
    Get-Content -LiteralPath "$data\logs\installer.log" -ErrorAction SilentlyContinue
    Get-Content -LiteralPath "$data\logs\core.log" -Tail 60 -ErrorAction SilentlyContinue
    foreach ($path in @($install, $state, $old, $new, "$install\.coopanion-update-cleanup")) {
        if ($path -and (Test-Path -LiteralPath $path -PathType Container)) {
            Write-Host "$path"
            Get-ChildItem -LiteralPath $path -Force -Name
        }
    }
    throw
} finally {
    Remove-Item -LiteralPath $root -Recurse -Force
}
