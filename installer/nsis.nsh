; Includes used by setup.nsi.

!ifdef APP_ARM64
  !ifndef APP_64
    ; makensis does not find an !include path written with forward slashes
    !include /CHARSET=UTF8 "${__FILEDIR__}\i18n\arm64.nsh"
  !endif
!endif

!macro reportUninstall
  ; The install id exists while usage statistics are enabled.
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
