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

function Install([switch]$QuoteDirectory) {
    $directoryArgument = "/D=$install"
    if ($QuoteDirectory) { $directoryArgument = '"' + $directoryArgument + '"' }
    $process = Start-Process -FilePath $Setup -ArgumentList "--updated /S $directoryArgument" -Wait -PassThru
    return $process.ExitCode
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
    New-Item -ItemType Directory -Path $data -Force | Out-Null
    Set-Content -LiteralPath "$data\memory.txt" -Value 'user data'
    Set-Content -LiteralPath "$install\notes.txt" -Value 'user file'
    # Node's Windows spawn quotes the /D argument when the path contains spaces.
    Assert-Exit (Install -QuoteDirectory) $true
    if (Test-Path -LiteralPath "$install\.coopanion-update-cleanup") {
        throw 'The successful installation left its retired transaction.'
    }
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
    Remove-Item -LiteralPath $state

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
    Assert-Preserved

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

    $uninstall = Start-Process -FilePath "$install\Uninstall Coopanion.exe" -ArgumentList '/S /KEEP_APP_DATA' -Wait -PassThru
    if ($uninstall.ExitCode -ne 0 -or (Test-Path -LiteralPath $exe)) { throw 'Uninstall failed.' }
    Assert-Preserved
} catch {
    Get-Content -LiteralPath "$data\logs\installer.log" -ErrorAction SilentlyContinue
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
