; ============================================
; installer.nsh — NSIS custom macros
; INSTALL_ARCH must be defined before including this file
; (defaults to "x64" if not defined)
; ============================================

!ifndef INSTALL_ARCH
  !define INSTALL_ARCH "x64"
!endif

; Redefine the uninstall app key to be architecture-specific
; so different architectures can coexist side by side
!ifdef UNINSTALL_APP_KEY
  !undef UNINSTALL_APP_KEY
!endif
!define UNINSTALL_APP_KEY "NexCode IDE (${INSTALL_ARCH})"

!macro customInit
  ; Set architecture-specific installation directory
  !if "${INSTALL_ARCH}" == "arm64"
    StrCpy $INSTDIR "$PROGRAMFILES\NexCode IDE (arm64)"
  !else if "${INSTALL_ARCH}" == "ia32"
    StrCpy $INSTDIR "$PROGRAMFILES\NexCode IDE (x86)"
  !else
    StrCpy $INSTDIR "$PROGRAMFILES\NexCode IDE (x64)"
  !endif
!macroend

!macro customInstall
  ReadRegStr $0 HKLM "SYSTEM\CurrentControlSet\Control\Session Manager\Environment" "Path"
  WriteRegExpandStr HKLM "SYSTEM\CurrentControlSet\Control\Session Manager\Environment" "Path" "$0;$INSTDIR\resources\cli\bin"
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000
!macroend

!macro customUninstall
  
!macroend