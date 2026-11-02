; electron-builder NSIS hooks. The app keeps every file under its install directory, its data in
; $INSTDIR\data, so the default location stays out of AppData and uninstalling keeps data\.

!macro customFiles_x64
  ; the installer template never checks whether Nsis7z::Extract succeeded: an extraction that
  ; antivirus software or a full disk emptied read as success, and the wizard registers, shortcuts to
  ; and "runs" an install that wrote no files or only part of them. Coopanion.exe or the TypeScript
  ; loader the Core starts with (app/core-host.cjs) missing is that case: stop here, before
  ; the uninstaller, the registry entry and the shortcuts are written, so a failed install leaves
  ; nothing behind. customFiles_x64 is undocumented but the first hook after the files land
  ; (customInstall runs only after the install is already registered).
  ${IfNot} ${FileExists} "$INSTDIR\Coopanion.exe"
  ${OrIfNot} ${FileExists} "$INSTDIR\resources\app\node_modules\tsx\dist\loader.mjs"
    ; /SD: a silent install (an automatic update runs one) must not wait on the box
    MessageBox MB_OK|MB_ICONSTOP "Coopanion's files did not all reach the install directory: the installer could not extract its package. This is usually antivirus software or low disk space. The install is incomplete; please check and run the installer again." /SD IDOK
    Abort
  ${EndIf}
!macroend

!macro customInstallMode
  ; the app writes data\ beside itself, which an install for all users (Program Files) cannot: the
  ; "for all users / only for me" page is skipped and the install is per-user, as "only for me" makes it
  StrCpy $isForceCurrentInstall "1"
!macroend

!macro customInit
  ; the per-user default is %LOCALAPPDATA%\Programs. An update stays where the install is, since data\ sits
  ; beside the program (app/main.cjs takes back a data\ that an earlier update left in the old place)
  StrLen $0 "$LOCALAPPDATA"
  StrCpy $1 "$INSTDIR" $0
  StrLen $2 "$APPDATA"
  StrCpy $3 "$INSTDIR" $2
  ${IfNot} ${isUpdated}
    ${If} $1 == "$LOCALAPPDATA"
    ${OrIf} $3 == "$APPDATA"
      StrCpy $INSTDIR "$PROFILE\Coopanion"
    ${EndIf}
  ${EndIf}
!macroend

!macro customRemoveFiles
  ; what an Electron build installs, by name, so data\ and anything else put in the directory
  ; stay (an update runs this too)
  SetOutPath $TEMP
  RMDir /r "$INSTDIR\resources"
  RMDir /r "$INSTDIR\locales"
  Delete "$INSTDIR\Coopanion.exe"
  Delete "$INSTDIR\Uninstall Coopanion.exe"
  Delete "$INSTDIR\*.dll"
  Delete "$INSTDIR\*.pak"
  Delete "$INSTDIR\*.bin"
  Delete "$INSTDIR\*.dat"
  Delete "$INSTDIR\vk_swiftshader_icd.json"
  Delete "$INSTDIR\LICENSE.electron.txt"
  Delete "$INSTDIR\LICENSES.chromium.html"
  ; removed only when nothing is left, data\ included
  RMDir "$INSTDIR"
!macroend

!macro customUnInstall
  ; usage statistics (core/telemetry.ts): an uninstall, not the one an update runs, is reported
  ; with the install's id; the app keeps the id file only while statistics are switched on
  ${IfNot} ${isUpdated}
  ${AndIf} ${FileExists} "$INSTDIR\data\home\companion\telemetry-id"
    FileOpen $0 "$INSTDIR\data\home\companion\telemetry-id" r
    FileRead $0 $1 64
    FileClose $0
    ; the id reaches PowerShell as an environment variable and is sent only when it is a UUID: the file is data, never part of the command
    System::Call 'kernel32::SetEnvironmentVariable(t "COOPANION_INSTALL_ID", t r1)'
    nsExec::Exec `powershell -NoProfile -NonInteractive -Command "try { $$id = ([string]$$env:COOPANION_INSTALL_ID).Trim(); if ($$id -match '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}\z') { [Net.ServicePointManager]::SecurityProtocol = 'Tls12'; Invoke-RestMethod -Method Post -Uri 'https://survey.palailab.org/v1/uninstall' -ContentType 'application/json' -Body (ConvertTo-Json @{ installId = $$id }) -TimeoutSec 5 | Out-Null } } catch {}"`
    Pop $0
  ${EndIf}
!macroend
