#!/usr/bin/env bash
#
# rebuild-and-install.sh
#
# Baut die ActualFinTS-App frisch signiert und installiert sie auf dem per USB
# verbundenen iPhone. Erneuert damit das ~7 Tage gueltige Entwickler-Profil der
# kostenlosen Signierung ("App ist nicht mehr verfuegbar").
#
# Benutzung:
#   ./rebuild-and-install.sh              # Build-Nummer +1, bauen, installieren
#   ./rebuild-and-install.sh --usb        # nur per USB verbundene iPhones suchen
#   ./rebuild-and-install.sh --wifi       # nur per WLAN erreichbare iPhones suchen
#   ./rebuild-and-install.sh --no-bump    # ohne Build-Nummer zu erhoehen
#   ./rebuild-and-install.sh --build-only # nur bauen, nicht installieren
#   ./rebuild-and-install.sh --list       # gefundene iPhones anzeigen und beenden
#
# Ohne --usb/--wifi werden beide Transporte akzeptiert, USB hat Vorrang.
#
# Ueberschreibbare Umgebungsvariablen:
#   DEVELOPER_DIR   Pfad zur Xcode-Toolchain (Default: Xcode-beta)
#   DEVICE_UDID     Hardware-UDID des iPhones (Default: automatische Erkennung)
#   DEVICE_NAME     Teilstring des Geraetenamens zum Eingrenzen bei mehreren iPhones

set -euo pipefail

# --- Konfiguration -----------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT="ActualFinTS.xcodeproj"
SCHEME="ActualFinTS"
CONFIG="Debug"
INFO_PLIST="$SCRIPT_DIR/ActualFinTS/App/Info.plist"
DERIVED_DATA="$SCRIPT_DIR/build/DerivedData"
APP_PATH="$DERIVED_DATA/Build/Products/${CONFIG}-iphoneos/${SCHEME}.app"

# Xcode-beta aktiv, ohne globales xcode-select umzustellen.
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode-beta.app/Contents/Developer}"

# --- Argumente ---------------------------------------------------------------
DO_BUMP=1
DO_INSTALL=1
DO_LIST=0
TRANSPORT="any"   # any | wired | localNetwork
for arg in "$@"; do
  case "$arg" in
    --usb|--wired)      TRANSPORT="wired" ;;
    --wifi|--wlan|--network) TRANSPORT="localNetwork" ;;
    --no-bump)    DO_BUMP=0 ;;
    --build-only) DO_INSTALL=0 ;;
    --list)       DO_LIST=1 ;;
    -h|--help)    grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unbekannte Option: $arg" >&2; exit 2 ;;
  esac
done

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# --- Vorbedingungen ----------------------------------------------------------
[ -d "$DEVELOPER_DIR" ] || die "Xcode nicht gefunden unter DEVELOPER_DIR=$DEVELOPER_DIR"
[ -f "$INFO_PLIST" ]    || die "Info.plist nicht gefunden: $INFO_PLIST"
log "Toolchain: $(xcodebuild -version | head -1)"

# --- iPhone erkennen ---------------------------------------------------------
case "$TRANSPORT" in
  wired)        TRANSPORT_LABEL="USB" ;;
  localNetwork) TRANSPORT_LABEL="WLAN" ;;
  *)            TRANSPORT_LABEL="USB oder WLAN" ;;
esac

if [ -n "${DEVICE_UDID:-}" ] && [ "$DO_LIST" -eq 0 ]; then
  UDID="$DEVICE_UDID"
  NAME="iPhone"
  log "Verwende vorgegebene UDID: $UDID"
else
  log "Suche iPhone ($TRANSPORT_LABEL) ..."
  TMP_JSON="$(mktemp -t devicectl).json"
  trap 'rm -f "$TMP_JSON"' EXIT
  xcrun devicectl list devices --json-output "$TMP_JSON" >/dev/null 2>&1 || die "devicectl fehlgeschlagen"

  # Eine Zeile pro Treffer: UDID<TAB>Name<TAB>Transport. USB zuerst.
  MATCHES="$(TRANSPORT="$TRANSPORT" NAME_FILTER="${DEVICE_NAME:-}" python3 -c "
import json, os, sys
want = os.environ['TRANSPORT']
name_filter = os.environ['NAME_FILTER'].lower()
devices = json.load(open(sys.argv[1])).get('result', {}).get('devices', [])
rows = []
for dev in devices:
    hw = dev.get('hardwareProperties', {})
    conn = dev.get('connectionProperties', {})
    name = dev.get('deviceProperties', {}).get('name', '?')
    transport = conn.get('transportType')
    if hw.get('deviceType') != 'iPhone' or conn.get('pairingState') != 'paired':
        continue
    if want != 'any' and transport != want:
        continue
    if name_filter and name_filter not in name.lower():
        continue
    rows.append((0 if transport == 'wired' else 1, hw.get('udid'), name, transport))
for _, udid, name, transport in sorted(rows):
    print('\t'.join([udid, name, transport or '?']))
" "$TMP_JSON")"

  [ -n "$MATCHES" ] || die "Kein gepaartes iPhone ueber $TRANSPORT_LABEL gefunden. Bei USB: iPhone anschliessen, entsperren, 'Vertrauen' bestaetigen. Bei WLAN: gleiches Netz, iPhone entsperrt, in Xcode einmalig 'Connect via network' aktiviert."

  if [ "$DO_LIST" -eq 1 ]; then
    log "Gefundene iPhones:"
    printf '%s\n' "$MATCHES" | while IFS=$'\t' read -r u n t; do
      printf '    %-40s %s (%s)\n' "$u" "$n" "$t"
    done
    exit 0
  fi

  if [ "$(printf '%s\n' "$MATCHES" | wc -l | tr -d ' ')" -gt 1 ]; then
    log "Mehrere iPhones gefunden, nehme das erste (DEVICE_NAME=... zum Eingrenzen):"
    printf '%s\n' "$MATCHES" | while IFS=$'\t' read -r u n t; do
      printf '    %-40s %s (%s)\n' "$u" "$n" "$t"
    done
  fi

  IFS=$'\t' read -r UDID NAME FOUND_TRANSPORT <<<"$(printf '%s\n' "$MATCHES" | head -1)"
  [ "$FOUND_TRANSPORT" = "wired" ] && FOUND_LABEL="USB" || FOUND_LABEL="WLAN"
  ok "Gefunden: $NAME ($UDID, $FOUND_LABEL)"
fi

# --- Build-Nummer erhoehen ---------------------------------------------------
if [ "$DO_BUMP" -eq 1 ]; then
  CUR="$(/usr/libexec/PlistBuddy -c 'Print CFBundleVersion' "$INFO_PLIST")"
  NEXT=$((CUR + 1))
  /usr/libexec/PlistBuddy -c "Set CFBundleVersion $NEXT" "$INFO_PLIST"
  ok "Build-Nummer $CUR → $NEXT"
else
  log "Build-Nummer unveraendert ($(/usr/libexec/PlistBuddy -c 'Print CFBundleVersion' "$INFO_PLIST"))"
fi

# --- Bauen -------------------------------------------------------------------
log "Baue $SCHEME ($CONFIG) ..."
xcodebuild \
  -project "$SCRIPT_DIR/$PROJECT" \
  -scheme "$SCHEME" \
  -configuration "$CONFIG" \
  -destination "id=$UDID" \
  -derivedDataPath "$DERIVED_DATA" \
  -allowProvisioningUpdates \
  clean build
[ -d "$APP_PATH" ] || die "Erwartete App nicht gefunden: $APP_PATH"
ok "Build erfolgreich: $APP_PATH"

# --- Installieren ------------------------------------------------------------
if [ "$DO_INSTALL" -eq 1 ]; then
  log "Installiere auf dem iPhone ..."
  xcrun devicectl device install app --device "$UDID" "$APP_PATH"
  ok "Installiert. Die App ist wieder ~7 Tage nutzbar."
else
  log "Installation uebersprungen (--build-only)."
fi
