; The wizard and silent updates share the same per-user installation.
!include "common.nsh"
!include "MUI2.nsh"
; Use electron-builder's directory selection in per-user mode.
!define ONE_CLICK
!ifdef INSTALL_MODE_PER_ALL_USERS_REQUIRED
  !undef INSTALL_MODE_PER_ALL_USERS_REQUIRED
!endif
!include "multiUser.nsh"
!undef ONE_CLICK
!include "installer.nsh"
!include "StrContains.nsh"
!include "program-files.nsh"

RequestExecutionLevel user
InstallDir "$LOCALAPPDATA\Programs\Coopanion"

Var appExe
!include "update.nsh"

!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_FUNCTION StartInstalledApp
!insertmacro MUI_PAGE_DIRECTORY
!define MUI_PAGE_CUSTOMFUNCTION_PRE SelectInstallFolder
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro addLangs
!include /CHARSET=UTF8 "i18n\install.nsh"

!macro requireInstallerLock
  System::Call 'kernel32::CreateMutexW(p 0, i 0, w "${APP_GUID}") p .r0 ?e'
  Pop $1
  ${If} $0 == 0
  ${OrIf} $1 == 183
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDOK
    SetErrorLevel 2
    Quit
  ${EndIf}
!macroend

Function .onInit
  !insertmacro check64BitAndSetRegView
  !ifdef APP_ARM64
    !ifndef APP_64
      ${IfNot} ${IsNativeARM64}
        MessageBox MB_OK|MB_ICONSTOP "$(arm64Required)" /SD IDOK
        SetErrorLevel 2
        Quit
      ${EndIf}
    !endif
  !endif
  !insertmacro requireInstallerLock
  !insertmacro setInstallModePerUser
  ; Preserve the default directory used by unattended fresh installs.
  !insertmacro GetDParameter $0
  ${If} ${Silent}
  ${AndIfNot} ${isUpdated}
  ${AndIf} $0 == ""
  ${AndIf} $perUserInstallationFolder == ""
    StrCpy $INSTDIR "$PROFILE\Coopanion"
  ${EndIf}
  !ifdef APP_ARM64_UNPACKED_SIZE
    SectionSetSize 0 ${APP_ARM64_UNPACKED_SIZE}
  !else
    SectionSetSize 0 ${APP_64_UNPACKED_SIZE}
  !endif
FunctionEnd

Function SelectInstallFolder
  ReadRegStr $0 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${If} $0 != $INSTDIR
  ${AndIfNot} ${FileExists} "$INSTDIR\data\home\*.*"
    ${StrContains} $0 "${APP_FILENAME}" $INSTDIR
    ${If} $0 == ""
      StrCpy $INSTDIR "$INSTDIR\${APP_FILENAME}"
    ${EndIf}
  ${EndIf}
FunctionEnd

Function StartInstalledApp
  SetOutPath "$INSTDIR"
  ${StdUtils.ExecShellAsUser} $0 "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "open" ""
FunctionEnd

Section "Install" INSTALL_SECTION_ID
  StrCpy $appExe "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  Call InstallPayload
  ${If} ${Silent}
  ${AndIf} ${isForceRun}
    Call StartInstalledApp
  ${EndIf}
SectionEnd

Function un.onInit
  !insertmacro check64BitAndSetRegView
  SetShellVarContext current
  !insertmacro requireInstallerLock
  ${If} ${FileExists} "$INSTDIR\.coopanion-update\owned"
    !insertmacro setInstallPaths
    StrCpy $failure "interrupted installation"
    Call un.WriteFailure
    MessageBox MB_OK|MB_ICONSTOP "$(installRecoveryNeeded)" /SD IDOK
    SetErrorLevel 2
    Quit
  ${EndIf}
FunctionEnd

!macro removeProgramFile NAME
  ${If} ${FileExists} "$INSTDIR\${NAME}\*.*"
    RMDir /r "$INSTDIR\${NAME}"
  ${Else}
    Delete "$INSTDIR\${NAME}"
  ${EndIf}
!macroend

Section "Uninstall"
  !insertmacro waitForApp
  ${If} $0 != 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDOK
    SetErrorLevel 2
    Abort
  ${EndIf}
  !insertmacro reportUninstall
  SetOutPath $TEMP
  !insertmacro forProgramFiles removeProgramFile
  !insertmacro setInstallPaths
  Call un.CleanRetired
  RMDir "$INSTDIR"
  ReadRegStr $0 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${If} $0 == $INSTDIR
    Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
    DeleteRegKey HKCU "${UNINSTALL_REGISTRY_KEY}"
    DeleteRegKey HKCU "${INSTALL_REGISTRY_KEY}"
  ${EndIf}
SectionEnd
