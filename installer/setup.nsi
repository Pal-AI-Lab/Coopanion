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
Var installerLock

!macro releaseInstallerLock
  ${If} $installerLock != 0
    System::Call 'kernel32::CloseHandle(p $installerLock)'
    StrCpy $installerLock 0
  ${EndIf}
!macroend

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
  StrCpy $installerLock $0
  ${If} $0 == 0
  ${OrIf} $1 == 183
    !insertmacro releaseInstallerLock
    ${If} ${isForceRun}
      MessageBox MB_OK|MB_ICONEXCLAMATION|MB_SETFOREGROUND|MB_TOPMOST "$(installerBusy)"
    ${Else}
      MessageBox MB_OK|MB_ICONEXCLAMATION "$(installerBusy)" /SD IDOK
    ${EndIf}
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
  Call IdentifyInstallation
  ${If} $ownsPreviousFiles == 0
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
  !insertmacro requireInstallerLock
  StrCpy $appExe "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  Call InstallPayload
  ${If} ${Silent}
  ${AndIf} ${isForceRun}
    Call StartInstalledApp
  ${EndIf}
  !insertmacro releaseInstallerLock
SectionEnd

Function un.onInit
  !insertmacro check64BitAndSetRegView
  SetShellVarContext current
FunctionEnd

!macro removeProgramFile NAME
  ${If} ${FileExists} "$INSTDIR\${NAME}\*.*"
    RMDir /r "$INSTDIR\${NAME}"
  ${Else}
    Delete "$INSTDIR\${NAME}"
  ${EndIf}
!macroend

Section "Uninstall"
  !insertmacro requireInstallerLock
  ${If} ${FileExists} "$INSTDIR\.coopanion-update\owned"
    !insertmacro setInstallPaths
    StrCpy $failure "interrupted installation"
    Call un.WriteFailure
    !insertmacro releaseInstallerLock
    MessageBox MB_OK|MB_ICONSTOP "$(installRecoveryNeeded)" /SD IDOK
    SetErrorLevel 2
    Quit
  ${EndIf}
un_wait_for_app:
  !insertmacro waitForApp
  ${If} $0 != 0
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY un_wait_for_app
    !insertmacro releaseInstallerLock
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
    WinShell::UninstAppUserModelId "${APP_ID}"
    WinShell::UninstShortcut "$DESKTOP\${SHORTCUT_NAME}.lnk"
    Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
    System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
    DeleteRegKey HKCU "${UNINSTALL_REGISTRY_KEY}"
    DeleteRegKey HKCU "${INSTALL_REGISTRY_KEY}"
  ${EndIf}
  !insertmacro releaseInstallerLock
SectionEnd
