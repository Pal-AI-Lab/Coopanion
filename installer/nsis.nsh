; electron-builder NSIS hooks. The app keeps every file under its install directory, its data in
; $INSTDIR\data, so the default location stays out of AppData and uninstalling keeps data\.

!macro customInit
  ; the per-user default is %LOCALAPPDATA%\Programs; an earlier install there moves too
  StrLen $0 "$LOCALAPPDATA"
  StrCpy $1 "$INSTDIR" $0
  StrLen $2 "$APPDATA"
  StrCpy $3 "$INSTDIR" $2
  ${If} $1 == "$LOCALAPPDATA"
  ${OrIf} $3 == "$APPDATA"
    StrCpy $INSTDIR "$PROFILE\Coopanion"
  ${EndIf}
!macroend

!macro customRemoveFiles
  ; what an Electron build installs, by name, so data\ and anything else put in the directory
  ; stay (an update runs this too)
  SetOutPath $TEMP
  RMDir /r "$INSTDIR\resources"
  RMDir /r "$INSTDIR\locales"
  ; Earlier branded executables may remain after an upgrade.
  Delete "$INSTDIR\CortiCompanion.exe"
  Delete "$INSTDIR\Uninstall CortiCompanion.exe"
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

!macro customInstall
  Delete "$DESKTOP\CortiCompanion.lnk"
!macroend
