#!/usr/bin/env bash
# Trägt Berechtigungstexte, Dateifreigabe, .schulpaket-Dokumenttyp und Ausrichtungen in die
# Info.plist der iOS-App ein. Idempotent: jeder Schlüssel wird vorher entfernt und neu gesetzt.
# Läuft auf macOS (PlistBuddy), z. B. in .github/workflows/ios.yml nach `npx cap sync ios`.
set -euo pipefail

PLIST="${1:-ios/App/App/Info.plist}"
PB=/usr/libexec/PlistBuddy

if [ ! -f "$PLIST" ]; then
  echo "Info.plist nicht gefunden: $PLIST" >&2
  exit 1
fi

loeschen() { "$PB" -c "Delete :$1" "$PLIST" >/dev/null 2>&1 || true; }
setzen() { loeschen "$1"; add "$@"; }
neu() { loeschen "$1"; "$PB" -c "Add :$1 $2" "$PLIST"; }
add() {
  if [ $# -lt 3 ]; then
    "$PB" -c "Add :$1 $2" "$PLIST"
  elif [ "$2" = string ]; then
    "$PB" -c "Add :$1 string \"$3\"" "$PLIST"
  else
    "$PB" -c "Add :$1 $2 $3" "$PLIST"
  fi
}

setzen CFBundleDisplayName string "Schul-Apps"
setzen ITSAppUsesNonExemptEncryption bool false

setzen NSCameraUsageDescription string "Schul-Apps nutzt die Kamera, um Arbeitsblätter, Schülerarbeiten oder Vokabellisten zu fotografieren oder zu scannen."
setzen NSPhotoLibraryUsageDescription string "Schul-Apps liest ausgewählte Fotos, damit die KI sie auswerten kann."
setzen NSPhotoLibraryAddUsageDescription string "Schul-Apps speichert erzeugte Bilder auf Wunsch in der Fotomediathek."

# Dateien-App: eigener Ordner „Auf meinem iPad" + Dokumente an Ort und Stelle öffnen
setzen UIFileSharingEnabled bool true
setzen LSSupportsOpeningDocumentsInPlace bool true

# Multitasking (Split View / Slide Over) erlauben
setzen UIRequiresFullScreen bool false

# Die Vorlage verlangt noch „armv7" – alle unterstützten Geräte (ab iOS 16.4) sind arm64
neu UIRequiredDeviceCapabilities array
add UIRequiredDeviceCapabilities:0 string arm64

# Ausrichtungen: iPhone hochkant + quer, iPad alle vier
neu UISupportedInterfaceOrientations array
add UISupportedInterfaceOrientations:0 string UIInterfaceOrientationPortrait
add UISupportedInterfaceOrientations:1 string UIInterfaceOrientationLandscapeLeft
add UISupportedInterfaceOrientations:2 string UIInterfaceOrientationLandscapeRight
neu "UISupportedInterfaceOrientations~ipad" array
add "UISupportedInterfaceOrientations~ipad:0" string UIInterfaceOrientationPortrait
add "UISupportedInterfaceOrientations~ipad:1" string UIInterfaceOrientationPortraitUpsideDown
add "UISupportedInterfaceOrientations~ipad:2" string UIInterfaceOrientationLandscapeLeft
add "UISupportedInterfaceOrientations~ipad:3" string UIInterfaceOrientationLandscapeRight

# Eigener Dateityp .schulpaket (ZIP-Container der Schul-Apps)
UTI=de.kornahrens.schulapps.schulpaket
neu UTExportedTypeDeclarations array
neu UTExportedTypeDeclarations:0 dict
add UTExportedTypeDeclarations:0:UTTypeIdentifier string "$UTI"
add UTExportedTypeDeclarations:0:UTTypeDescription string "Schul-Apps-Paket"
add UTExportedTypeDeclarations:0:UTTypeConformsTo array
add UTExportedTypeDeclarations:0:UTTypeConformsTo:0 string public.zip-archive
add UTExportedTypeDeclarations:0:UTTypeConformsTo:1 string public.data
add UTExportedTypeDeclarations:0:UTTypeTagSpecification dict
add UTExportedTypeDeclarations:0:UTTypeTagSpecification:public.filename-extension array
add UTExportedTypeDeclarations:0:UTTypeTagSpecification:public.filename-extension:0 string schulpaket
add UTExportedTypeDeclarations:0:UTTypeTagSpecification:public.mime-type string application/x-schulpaket

neu CFBundleDocumentTypes array
neu CFBundleDocumentTypes:0 dict
add CFBundleDocumentTypes:0:CFBundleTypeName string "Schul-Apps-Paket"
add CFBundleDocumentTypes:0:CFBundleTypeRole string Editor
add CFBundleDocumentTypes:0:LSHandlerRank string Owner
add CFBundleDocumentTypes:0:LSItemContentTypes array
add CFBundleDocumentTypes:0:LSItemContentTypes:0 string "$UTI"

/usr/bin/plutil -lint "$PLIST"
echo "Info.plist aktualisiert: $PLIST"
