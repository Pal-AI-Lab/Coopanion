; electron-builder NSIS hooks. The app keeps every file under its install directory, its data in
; $INSTDIR\data, so the default location stays out of AppData and uninstalling keeps data\.

!macro customInit
  ; the per-user default is %LOCALAPPDATA%\Programs. An update stays where the install is: moving it left
  ; data\ behind (#84; app/main.cjs takes it back after such a move)
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
    nsExec::Exec `powershell -NoProfile -NonInteractive -Command "try { [Net.ServicePointManager]::SecurityProtocol = 'Tls12'; Invoke-RestMethod -Method Post -Uri 'https://survey.palailab.org/v1/uninstall' -ContentType 'application/json' -Body (ConvertTo-Json @{ installId = '$1' }) -TimeoutSec 5 | Out-Null } catch {}"`
    Pop $0
  ${EndIf}
!macroend
