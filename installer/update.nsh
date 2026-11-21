; An active transaction owns new/ and old/. Before apply, any files in old/ can
; go straight back. After apply starts, recovery first moves the new files back
; out of the way. After commit, recovery only finishes registration.
!include "TextFunc.nsh"
!include "nsProcess.nsh"
Var updateDir
Var cleanupDir
Var installLog
Var moveFrom
Var moveTo
Var failedFile
Var failure
Var installedVersion
Var result
Var ownsPreviousFiles

!macro setInstallPaths
  StrCpy $updateDir "$INSTDIR\.coopanion-update"
  StrCpy $cleanupDir "$INSTDIR\.coopanion-update-cleanup"
  StrCpy $installLog "$INSTDIR\data\logs\installer.log"
!macroend

!macro waitForApp
  ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $0
  ${If} $0 == 603 ; the executable name is absent
    StrCpy $0 0
  ${Else}
    StrCpy $1 0
    StrCpy $2 15000
    ${IfNot} ${isUpdated}
    ${AndIf} ${FileExists} "$INSTDIR\resources\app\app\installer-events.cjs"
      StrCpy $1 1
      ; Includes Core's extension transactions and shutdown deadline.
      StrCpy $2 115000
    ${EndIf}
    System::Call 'kernel32::SetEnvironmentVariableW(w "COOPANION_INSTALL_EXE", w "$INSTDIR\${APP_EXECUTABLE_FILENAME}")'
    System::Call 'kernel32::SetEnvironmentVariableW(w "COOPANION_INSTALL_CLOSE", w r1)'
    System::Call 'kernel32::SetEnvironmentVariableW(w "COOPANION_INSTALL_WAIT_MS", w r2)'
    nsExec::Exec /TIMEOUT=125000 `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -Command \
      "try { $$watch = [Diagnostics.Stopwatch]::StartNew(); $$close = $$env:COOPANION_INSTALL_CLOSE -eq '1'; \
      do { \
        $$apps = Get-CimInstance Win32_Process -Filter 'Name=''${APP_EXECUTABLE_FILENAME}''' -ErrorAction Stop; \
        $$running = $$apps | Where-Object ExecutablePath -EQ $$env:COOPANION_INSTALL_EXE; \
        if (!$$running) { if ($$apps | Where-Object { !$$_.ExecutablePath }) { exit 2 }; exit 0 }; \
        if ($$close) { Start-Process -FilePath $$env:COOPANION_INSTALL_EXE -ArgumentList '--quit-for-installer' -ErrorAction Stop; $$close = $$false }; \
        Start-Sleep -Milliseconds 500 \
      } while ($$watch.ElapsedMilliseconds -lt [int]$$env:COOPANION_INSTALL_WAIT_MS) } catch { exit 2 }; exit 1"`
    Pop $0
  ${EndIf}
!macroend

Function IdentifyInstallation
  StrCpy $ownsPreviousFiles 0
  ReadRegStr $0 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${If} $0 == $INSTDIR
  ${OrIf} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  ${OrIf} ${FileExists} "$INSTDIR\${UNINSTALL_FILENAME}"
  ${OrIf} ${FileExists} "$INSTDIR\resources\app\core\companion.ts"
    StrCpy $ownsPreviousFiles 1
  ${ElseIf} ${FileExists} "$INSTDIR\data\home\companion\deployment.json"
    ; A copied deployment can sit beside another application's executable.
    ClearErrors
    FindFirst $0 $1 "$INSTDIR\*.exe"
    ${If} ${Errors}
      StrCpy $ownsPreviousFiles 1
    ${Else}
      FindClose $0
    ${EndIf}
  ${EndIf}
  ClearErrors
FunctionEnd

!macro writeFailure PREFIX
Function ${PREFIX}WriteFailure
retry_log:
  ClearErrors
  ${StdUtils.GetParentPath} $0 "$installLog"
  CreateDirectory "$0"
  FileOpen $0 "$installLog" a
  ${IfNot} ${Errors}
    ${GetTime} "" "L" $1 $2 $3 $4 $5 $6 $7
    FileWrite $0 "$3-$2-$1 $5:$6:$7 version=${VERSION} exit=2 stage=$failure file=$failedFile result=$result$\r$\n"
    FileClose $0
  ${EndIf}
  ${If} ${Errors}
  ${AndIf} $installLog != "$LOCALAPPDATA\Coopanion\installer.log"
    StrCpy $installLog "$LOCALAPPDATA\Coopanion\installer.log"
    Goto retry_log
  ${EndIf}
FunctionEnd
!macroend

!insertmacro writeFailure ""
!insertmacro writeFailure "un."

Function RememberUpdateFailure
  ${If} ${Silent}
  ${AndIf} ${isUpdated}
  ${AndIfNot} ${isForceRun}
    ${StdUtils.GetParentPath} $1 "$installLog"
    ClearErrors
    FileOpen $0 "$1\last-update-error.tmp" w
    ${IfNot} ${Errors}
      FileWriteUTF16LE /BOM $0 "$INSTDIR$\r$\n${VERSION}$\r$\n"
      FileClose $0
      ${IfNot} ${Errors}
        System::Call 'kernel32::MoveFileExW(w "$1\last-update-error.tmp", w "$1\last-update-error.txt", i 9)'
      ${EndIf}
      Delete "$1\last-update-error.tmp"
    ${EndIf}
  ${EndIf}
FunctionEnd

Function ClearUpdateFailure
  Delete "$INSTDIR\data\logs\last-update-error.txt"
  ClearErrors
  FileOpen $0 "$LOCALAPPDATA\Coopanion\last-update-error.txt" r
  ${IfNot} ${Errors}
    FileReadUTF16LE $0 $1
    FileClose $0
    ${TrimNewLines} $1 $1
    ${If} $1 == $INSTDIR
      Delete "$LOCALAPPDATA\Coopanion\last-update-error.txt"
    ${EndIf}
  ${EndIf}
FunctionEnd

; MOVEFILE_WRITE_THROUGH without a cross-volume copy fallback.
!macro moveChecked SOURCE DESTINATION
  System::Call 'kernel32::MoveFileExW(w "${SOURCE}", w "${DESTINATION}", i 8) i .r0'
  ${If} $0 == 0
    SetErrors
    Return
  ${EndIf}
!macroend

!macro moveEntry NAME
  ${If} ${FileExists} "$moveFrom\${NAME}"
    StrCpy $failedFile "${NAME}"
    ${If} $moveTo == "$updateDir\old"
    ${AndIf} $ownsPreviousFiles == 0
      SetErrors
      Return
    ${EndIf}
    System::Call 'kernel32::GetFileAttributesW(w "$moveFrom\${NAME}") i .r0'
    IntOp $0 $0 & 0x400
    ${If} $0 != 0
      SetErrors
      Return
    ${EndIf}
    !insertmacro moveChecked "$moveFrom\${NAME}" "$moveTo\${NAME}"
  ${EndIf}
!macroend

!macro moveProgramFile NAME
  !if "${NAME}" != "Coopanion.exe"
    !insertmacro moveEntry "${NAME}"
  !endif
!macroend

Function MoveProgramFiles
  ClearErrors
  ; Hide the launch entry before moving dependencies and publish it last.
  ${If} $moveFrom == $INSTDIR
    !insertmacro moveEntry "Coopanion.exe"
  ${EndIf}
  !insertmacro forProgramFiles moveProgramFile
  ${If} $moveTo == $INSTDIR
    !insertmacro moveEntry "Coopanion.exe"
  ${EndIf}
  StrCpy $failedFile ""
FunctionEnd

; Write the marker to a temporary file and flush it before publishing its name.
!macro saveRecord NAME VALUE
  ClearErrors
  FileOpen $0 "$updateDir\writing" w
  ${If} ${Errors}
    Return
  ${EndIf}
  FileWrite $0 "${VALUE}"
  System::Call 'kernel32::FlushFileBuffers(p r0) i .r1'
  FileClose $0
  ${If} ${Errors}
  ${OrIf} $1 == 0
    SetErrors
    Return
  ${EndIf}
  !insertmacro moveChecked "$updateDir\writing" "$updateDir\${NAME}"
!macroend

Function MarkApply
  !insertmacro saveRecord "apply" "1"
FunctionEnd

Function MarkRestore
  !insertmacro saveRecord "restore" "1"
FunctionEnd

Function MarkCommit
  !insertmacro saveRecord "commit" "1"
FunctionEnd

Function SaveRegistration
  !insertmacro saveRecord "version" "${VERSION}"
  ${IfNot} ${isNoDesktopShortcut}
    ReadRegStr $0 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
    ${If} $0 != $INSTDIR
    ${OrIfNot} ${FileExists} "$appExe"
      !insertmacro saveRecord "desktop" "1"
    ${EndIf}
  ${EndIf}
  ClearErrors
FunctionEnd

Function RegisterInstallation
  ClearErrors
  FileOpen $0 "$updateDir\version" r
  ${If} ${Errors}
    Return
  ${EndIf}
  FileRead $0 $installedVersion
  FileClose $0
  ${If} $installedVersion == ""
    SetErrors
    Return
  ${EndIf}
  !insertmacro registryAddInstallInfo
  WriteRegStr HKCU "${UNINSTALL_REGISTRY_KEY}" DisplayVersion "$installedVersion"
  WriteRegStr HKCU "${UNINSTALL_REGISTRY_KEY}" DisplayName "${PRODUCT_NAME} $installedVersion"
  ${If} ${FileExists} "$updateDir\desktop"
    SetOutPath "$INSTDIR"
    CreateShortCut "$DESKTOP\${SHORTCUT_NAME}.lnk" "$appExe" "" "$appExe"
    WinShell::SetLnkAUMI "$DESKTOP\${SHORTCUT_NAME}.lnk" "${APP_ID}"
  ${EndIf}
FunctionEnd

!macro cleanRetired PREFIX
Function ${PREFIX}CleanRetired
  ClearErrors
  System::Call 'kernel32::GetFileAttributesW(w "$cleanupDir") i .r0'
  ${IfThen} $0 == -1 ${|} Return ${|}
  IntOp $0 $0 & 0x410 ; DIRECTORY | REPARSE_POINT
  ${If} $0 <> 0x10
    SetErrors
    Return
  ${EndIf}
  ${If} ${FileExists} "$cleanupDir\owned"
    ${If} ${FileExists} "$cleanupDir\new"
      RMDir /r "$cleanupDir\new"
    ${EndIf}
    ${If} ${FileExists} "$cleanupDir\old"
      RMDir /r "$cleanupDir\old"
    ${EndIf}
    Delete "$cleanupDir\payload.7z"
    Delete "$cleanupDir\apply"
    Delete "$cleanupDir\restore"
    Delete "$cleanupDir\commit"
    Delete "$cleanupDir\version"
    Delete "$cleanupDir\desktop"
    Delete "$cleanupDir\writing"
    ${If} ${Errors}
      Return
    ${EndIf}
    Delete "$cleanupDir\owned"
  ${EndIf}
  RMDir "$cleanupDir"
FunctionEnd
!macroend

!insertmacro cleanRetired ""
!insertmacro cleanRetired "un."

Function RetireTransaction
  ; Deleting the markers and backups in place could resurrect a finished transaction.
  SetOutPath $TEMP
  !insertmacro moveChecked "$updateDir" "$cleanupDir"
  Call CleanRetired
  ClearErrors
FunctionEnd

Function RecoverInstallation
  ClearErrors
  ${If} ${FileExists} "$updateDir\commit"
    Call RegisterInstallation
    ${If} ${Errors}
      Return
    ${EndIf}
  ${Else}
    ${If} ${FileExists} "$updateDir\apply"
    ${AndIfNot} ${FileExists} "$updateDir\restore"
      StrCpy $moveFrom "$INSTDIR"
      StrCpy $moveTo "$updateDir\new"
      Call MoveProgramFiles
      ${If} ${Errors}
        Return
      ${EndIf}
      Call MarkRestore
      ${If} ${Errors}
        Return
      ${EndIf}
    ${EndIf}
    StrCpy $moveFrom "$updateDir\old"
    StrCpy $moveTo "$INSTDIR"
    Call MoveProgramFiles
    ${If} ${Errors}
      Return
    ${EndIf}
  ${EndIf}
  Call RetireTransaction
FunctionEnd

Function VerifyPayload
  ClearErrors
  FileOpen $0 "$updateDir\new\coopanion-payload.sha256" r
  ${If} ${Errors}
    StrCpy $failedFile "coopanion-payload.sha256"
    Return
  ${EndIf}

  ${Do}
    FileReadUTF16LE $0 $1
    ${If} ${Errors}
      StrCpy $failedFile "coopanion-payload.sha256"
      FileClose $0
      SetErrors
      Return
    ${EndIf}
    ${TrimNewLines} $1 $1
    ${IfThen} $1 == "END" ${|} ${ExitDo} ${|}
    StrCpy $2 $1 64
    StrCpy $failedFile $1 "" 65
    ${IfThen} $failedFile == "" ${|} Goto bad_payload ${|}
    ${If} $moveTo == "$updateDir\new"
      ${StdUtils.HashFile} $3 "SHA2-256" "$moveTo\$failedFile"
      ${IfThen} $3 != $2 ${|} Goto bad_payload ${|}
    ${ElseIfNot} ${FileExists} "$moveTo\$failedFile"
      Goto bad_payload
    ${EndIf}
  ${Loop}
  FileClose $0
  StrCpy $failedFile ""
  Return

bad_payload:
  FileClose $0
  SetErrors
FunctionEnd

!macro checkSpace
  SectionGetSize 0 $0
  System::Int64Op $0 * 1024
  Pop $1
  ; Budget for allocation overhead, the uninstaller and the journal.
  System::Int64Op $1 + 33554432
  Pop $1
  System::Call 'kernel32::GetDiskFreeSpaceExW(w "$updateDir", *l .r2, p 0, p 0) i .r0'
  System::Int64Op $2 < $1
  Pop $2
  ${If} $0 == 0
  ${OrIf} $2 != 0
    StrCpy $failure "disk space"
    Goto rollback
  ${EndIf}
!macroend

Function InstallPayload
  !insertmacro setInstallPaths
  StrCpy $result "previous files untouched"
  StrCpy $failure "staging"
  Call CleanRetired
  IfErrors failed
  System::Call 'kernel32::GetFileAttributesW(w "$updateDir") i .r0'
  ${If} $0 != -1
    IntOp $0 $0 & 0x410
    ${IfThen} $0 <> 0x10 ${|} Goto failed ${|}
    ${If} ${FileExists} "$updateDir\owned"
      StrCpy $failure "recover interrupted installation"
      !insertmacro waitForApp
      ${IfThen} $0 != 0 ${|} Goto incomplete ${|}
      Call RecoverInstallation
      IfErrors incomplete
    ${Else}
      ; An unmarked directory can only be reused if empty.
      ClearErrors
      RMDir "$updateDir"
      IfErrors failed
    ${EndIf}
  ${EndIf}

  StrCpy $failure "staging"
  ClearErrors
  CreateDirectory "$updateDir"
  IfErrors failed
  FileOpen $0 "$updateDir\owned" w
  IfErrors failed
  FileClose $0
  CreateDirectory "$updateDir\new"
  IfErrors rollback
  CreateDirectory "$updateDir\old"
  IfErrors rollback
  !insertmacro checkSpace
  SetOutPath "$updateDir"
  SetOverwrite try
  !ifdef COMPRESS
    SetCompress off
  !endif
  !ifdef APP_ARM64
    File /oname=payload.7z "${APP_ARM64}"
  !else
    File /oname=payload.7z "${APP_64}"
  !endif
  !ifdef COMPRESS
    SetCompress "${COMPRESS}"
  !endif
  IfErrors rollback
  !insertmacro checkSpace
  SetOutPath "$updateDir\new"
  Nsis7z::Extract "$updateDir\payload.7z"
  Delete "$updateDir\payload.7z"

  StrCpy $failure "verify extracted files"
  StrCpy $moveTo "$updateDir\new"
  Call VerifyPayload
  IfErrors rollback
  ClearErrors
  WriteUninstaller "$updateDir\new\${UNINSTALL_FILENAME}"
  IfErrors rollback
  Call SaveRegistration
  IfErrors rollback

  StrCpy $failure "close Coopanion"
wait_for_app:
  !insertmacro waitForApp
  ${If} $0 != 0
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY wait_for_app
    Goto rollback
  ${EndIf}
  SetOutPath $TEMP
  StrCpy $failure "back up previous files"
  Call IdentifyInstallation
  StrCpy $moveFrom "$INSTDIR"
  StrCpy $moveTo "$updateDir\old"
  Call MoveProgramFiles
  IfErrors rollback

  StrCpy $failure "apply new files"
  Call MarkApply
  IfErrors rollback
  StrCpy $moveFrom "$updateDir\new"
  StrCpy $moveTo "$INSTDIR"
  Call MoveProgramFiles
  IfErrors rollback
  ${IfNot} ${FileExists} "$INSTDIR\${UNINSTALL_FILENAME}"
    StrCpy $failedFile "${UNINSTALL_FILENAME}"
    Goto rollback
  ${EndIf}
  Call VerifyPayload
  IfErrors rollback
  StrCpy $failure "commit"
  Call MarkCommit
  IfErrors rollback
  StrCpy $failure "register installation"
  Call RegisterInstallation
  IfErrors incomplete
  Call RetireTransaction
  IfErrors incomplete

  Call ClearUpdateFailure
  ; Keep the base installer used for differential downloads.
  ${StdUtils.GetParentPath} $0 "$LOCALAPPDATA\${APP_INSTALLER_STORE_FILE}"
  CreateDirectory "$0"
  System::Call 'kernel32::CopyFileW(w "$EXEPATH", w "$LOCALAPPDATA\${APP_INSTALLER_STORE_FILE}", i 0)'
  ClearErrors
  Return

rollback:
  Push $failedFile
  Call RecoverInstallation
  Pop $failedFile
  IfErrors incomplete
  StrCpy $result "rollback complete"
  Goto failed

incomplete:
  StrCpy $result "recovery pending"
  Call WriteFailure
  Call RememberUpdateFailure
  !insertmacro releaseInstallerLock
  ${If} ${isForceRun}
    MessageBox MB_OK|MB_ICONSTOP|MB_SETFOREGROUND|MB_TOPMOST "$(installRecoveryNeeded)"
  ${Else}
    MessageBox MB_OK|MB_ICONSTOP "$(installRecoveryNeeded)" /SD IDOK
  ${EndIf}
  SetErrorLevel 2
  Abort

failed:
  Call WriteFailure
  Call RememberUpdateFailure
  ${If} ${isForceRun}
  ${AndIf} ${FileExists} "$appExe"
  ${AndIf} ${FileExists} "$INSTDIR\resources\app\core\boot.ts"
  ${AndIf} ${FileExists} "$INSTDIR\resources\app\node_modules\tsx\dist\loader.mjs"
    Call StartInstalledApp
  ${EndIf}
  !insertmacro releaseInstallerLock
  ${If} ${isForceRun}
    MessageBox MB_OK|MB_ICONSTOP|MB_SETFOREGROUND|MB_TOPMOST "$(installFailed)"
  ${Else}
    MessageBox MB_OK|MB_ICONSTOP "$(installFailed)" /SD IDOK
  ${EndIf}
  SetErrorLevel 2
  Abort
FunctionEnd
