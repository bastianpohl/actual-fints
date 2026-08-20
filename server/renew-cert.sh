#!/usr/bin/env bash
#
# renew-cert.sh
#
# Erneuert das Tailscale-/Let's-Encrypt-Zertifikat des actual-fints-Containers
# und startet die REST-API neu. Wird lokal auf dem Mac ausgefuehrt und arbeitet
# per Tailscale-SSH direkt auf dem LXC-Container.
#
# Hintergrund: die API liest Cert und Key nicht aus /var/lib/tailscale/certs,
# sondern aus Kopien in /root (siehe HTTPS_CERT_PATH/HTTPS_KEY_PATH in .env).
# Nach jeder Erneuerung muessen diese Kopien aktualisiert und der Dienst neu
# gestartet werden - genau das macht dieses Script.
#
# Warum ueberhaupt manuell? Tailscale holt die Zertifikate zwar per ACME bei
# Let's Encrypt (90 Tage Laufzeit), erneuert die per "tailscale cert" auf Platte
# geschriebenen Dateien aber nicht von selbst - der Daemon weiss laut Doku nicht,
# wohin sie gehoeren und wie sie zu installieren sind. Automatisch erneuert wird
# nur, was tailscaled selbst ausliefert (tailscale serve/funnel).
#
# Zu --min-validity: ohne dieses Flag liefert "tailscale cert" ein noch gueltiges
# Zertifikat einfach aus dem Cache zurueck und erneuert erst nach Ablauf. Das
# Script fordert deshalb ueber --min-validity eine Mindestrestlaufzeit an, damit
# rechtzeitig ein frisches Zertifikat ausgestellt wird. Vorsicht bei zu hohen
# Werten: liegt die Mindestlaufzeit nahe der 90-Tage-Laufzeit, stellt jeder Lauf
# ein neues Zertifikat aus und laeuft in die Let's-Encrypt-Limits (5 identische
# Zertifikate pro Woche). Deshalb wird der Wert hier auf 60 Tage gedeckelt.
#
# Benutzung:
#   ./renew-cert.sh              # nur erneuern, wenn Restlaufzeit < 30 Tage
#   ./renew-cert.sh --check      # nur Status anzeigen, nichts aendern
#   ./renew-cert.sh --force      # Ablauf immer durchspielen, egal wie lang gueltig
#                                # (tailscaled liefert dabei ggf. den Cache aus)
#   ./renew-cert.sh --no-restart # Cert erneuern, Dienst aber nicht neu starten
#   ./renew-cert.sh --days 45    # eigene Schwelle fuer die Restlaufzeit
#
# Ueberschreibbare Umgebungsvariablen:
#   HOST          SSH-Ziel des Containers (Default: actual-fints.tail75bc4.ts.net)
#   SSH_USER      Benutzer auf dem Container (Default: root)
#   DOMAIN        Zertifikatsname (Default: gleich HOST)
#   SERVICE       systemd-Unit der API (Default: actual-fints-api.service)
#   PORT          HTTPS-Port fuer die Endkontrolle (Default: 3000)
#   RENEW_DAYS    Schwelle in Tagen (Default: 30)
#
# Exit-Codes: 0 = ok bzw. nichts zu tun, 1 = Fehler.

set -euo pipefail

# --- Konfiguration -----------------------------------------------------------
HOST="${HOST:-actual-fints.tail75bc4.ts.net}"
SSH_USER="${SSH_USER:-root}"
DOMAIN="${DOMAIN:-$HOST}"
SERVICE="${SERVICE:-actual-fints-api.service}"
PORT="${PORT:-3000}"
RENEW_DAYS="${RENEW_DAYS:-30}"

TS_CERT_DIR="/var/lib/tailscale/certs"   # Ablage von "tailscale cert"
APP_CERT_DIR="/root"                     # von der API tatsaechlich gelesen

SSH_OPTS=(-o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new)

# --- Argumente ---------------------------------------------------------------
DO_FORCE=0
DO_CHECK=0
DO_RESTART=1
while [ $# -gt 0 ]; do
  case "$1" in
    --force)      DO_FORCE=1 ;;
    --check)      DO_CHECK=1 ;;
    --no-restart) DO_RESTART=0 ;;
    --days)       shift; RENEW_DAYS="${1:-}"; [ -n "$RENEW_DAYS" ] || { echo "--days braucht einen Wert" >&2; exit 2; } ;;
    -h|--help)    grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unbekannte Option: $1" >&2; exit 2 ;;
  esac
  shift
done

case "$RENEW_DAYS" in
  ''|*[!0-9]*) echo "RENEW_DAYS muss eine Zahl sein: $RENEW_DAYS" >&2; exit 2 ;;
esac

# Mindestrestlaufzeit fuer "tailscale cert", auf 60 Tage gedeckelt (siehe Kopf).
MIN_VALIDITY_H=$(( RENEW_DAYS * 24 ))
MIN_VALIDITY_CAPPED=0
if [ "$MIN_VALIDITY_H" -gt 1440 ]; then MIN_VALIDITY_H=1440; MIN_VALIDITY_CAPPED=1; fi

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# --- Vorbedingungen ----------------------------------------------------------
command -v ssh >/dev/null || die "ssh nicht gefunden"
[ "$MIN_VALIDITY_CAPPED" -eq 1 ] && \
  warn "RENEW_DAYS=$RENEW_DAYS ist hoch - --min-validity wird auf 60 Tage gedeckelt (LE-Limits)."

log "Verbinde mit $SSH_USER@$HOST ..."
ssh "${SSH_OPTS[@]}" "$SSH_USER@$HOST" true \
  || die "Keine SSH-Verbindung zu $HOST (Tailscale aktiv? 'tailscale status' pruefen)"

# --- Status erheben ----------------------------------------------------------
STATUS="$(ssh "${SSH_OPTS[@]}" "$SSH_USER@$HOST" bash -s -- \
            "$TS_CERT_DIR" "$APP_CERT_DIR" "$DOMAIN" "$SERVICE" <<'REMOTE_EOF'
set -euo pipefail
TS_DIR="$1"; APP_DIR="$2"; DOMAIN="$3"; SERVICE="$4"

expiry_of() {
  [ -f "$1" ] || { echo "-"; return; }
  local d; d="$(openssl x509 -in "$1" -noout -enddate 2>/dev/null | cut -d= -f2)" || { echo "-"; return; }
  [ -n "$d" ] && date -d "$d" +%s || echo "-"
}
echo "TS_EXPIRY=$(expiry_of "$TS_DIR/$DOMAIN.crt")"
echo "APP_EXPIRY=$(expiry_of "$APP_DIR/$DOMAIN.crt")"
echo "SERVICE_STATE=$(systemctl is-active "$SERVICE" 2>/dev/null || true)"
echo "NOW=$(date +%s)"
REMOTE_EOF
)" || die "Status konnte nicht gelesen werden"

field() { printf '%s\n' "$STATUS" | sed -n "s/^$1=//p" | head -1; }
TS_EXPIRY="$(field TS_EXPIRY)"
APP_EXPIRY="$(field APP_EXPIRY)"
SERVICE_STATE="$(field SERVICE_STATE)"
NOW="$(field NOW)"

human() {
  [ "$1" = "-" ] && { echo "nicht vorhanden"; return; }
  local days=$(( ($1 - NOW) / 86400 ))
  if [ "$1" -le "$NOW" ]; then
    echo "$(date -r "$1" '+%d.%m.%Y %H:%M') (ABGELAUFEN seit $(( -days )) Tagen)"
  else
    echo "$(date -r "$1" '+%d.%m.%Y %H:%M') (noch $days Tage)"
  fi
}

log "Zertifikat in $TS_CERT_DIR: $(human "$TS_EXPIRY")"
log "Kopie in $APP_CERT_DIR:     $(human "$APP_EXPIRY")"
log "Dienst $SERVICE: ${SERVICE_STATE:-unbekannt}"

# --- Entscheidung ------------------------------------------------------------
NEED_RENEW=0
REASON=""
if [ "$TS_EXPIRY" = "-" ]; then
  NEED_RENEW=1; REASON="kein Zertifikat vorhanden"
elif [ "$(( (TS_EXPIRY - NOW) / 86400 ))" -lt "$RENEW_DAYS" ]; then
  NEED_RENEW=1; REASON="Restlaufzeit unter $RENEW_DAYS Tagen"
elif [ "$APP_EXPIRY" != "$TS_EXPIRY" ]; then
  NEED_RENEW=1; REASON="Kopie in $APP_CERT_DIR ist nicht aktuell"
fi

if [ "$DO_CHECK" -eq 1 ]; then
  [ "$NEED_RENEW" -eq 1 ] && warn "Erneuerung faellig: $REASON" || ok "Alles aktuell, nichts zu tun."
  exit 0
fi

if [ "$NEED_RENEW" -eq 0 ] && [ "$DO_FORCE" -eq 0 ]; then
  ok "Alles aktuell, nichts zu tun. (Mit --force trotzdem erneuern.)"
  exit 0
fi
[ "$NEED_RENEW" -eq 1 ] && log "Erneuerung noetig: $REASON" || log "Erneuerung erzwungen (--force)"

# --- Erneuern ----------------------------------------------------------------
log "Fordere neues Zertifikat an und installiere es ..."
ssh "${SSH_OPTS[@]}" "$SSH_USER@$HOST" bash -s -- \
      "$TS_CERT_DIR" "$APP_CERT_DIR" "$DOMAIN" "$SERVICE" "$DO_RESTART" "$PORT" "$MIN_VALIDITY_H" <<'REMOTE_EOF'
set -euo pipefail
TS_DIR="$1"; APP_DIR="$2"; DOMAIN="$3"; SERVICE="$4"; DO_RESTART="$5"; PORT="$6"; MIN_VALIDITY_H="$7"

command -v tailscale >/dev/null || { echo "tailscale nicht gefunden" >&2; exit 1; }

# 1) Backup der aktuell aktiven Dateien
BACKUP="$APP_DIR/cert-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP/app" "$BACKUP/tailscale"
cp -a "$APP_DIR/$DOMAIN.crt" "$APP_DIR/$DOMAIN.key" "$BACKUP/app/"       2>/dev/null || true
cp -a "$TS_DIR/$DOMAIN.crt"  "$TS_DIR/$DOMAIN.key"  "$BACKUP/tailscale/" 2>/dev/null || true
echo "  Backup: $BACKUP"

# 2) Neues Zertifikat zuerst nach /tmp, damit nichts Kaputtes aktiv wird
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
# Mindestrestlaufzeit anfordern; kennt die Tailscale-Version das Flag nicht
# oder lehnt die CA den Wert ab, ohne Flag erneut versuchen.
if ! tailscale cert --min-validity "${MIN_VALIDITY_H}h" \
       --cert-file "$TMP/cert" --key-file "$TMP/key" "$DOMAIN" 2>"$TMP/err"; then
  echo "  --min-validity fehlgeschlagen ($(tr -d '\n' < "$TMP/err" | head -c 200)), versuche ohne Flag"
  tailscale cert --cert-file "$TMP/cert" --key-file "$TMP/key" "$DOMAIN"
fi

# 3) Pruefen, bevor es scharf geschaltet wird
openssl x509 -in "$TMP/cert" -noout -checkend 0 >/dev/null \
  || { echo "Neues Zertifikat ist bereits abgelaufen - Abbruch" >&2; exit 1; }
a="$(openssl x509 -in "$TMP/cert" -noout -pubkey | openssl md5)"
b="$(openssl pkey -in "$TMP/key" -pubout | openssl md5)"
[ "$a" = "$b" ] || { echo "Key passt nicht zum Zertifikat - Abbruch" >&2; exit 1; }
echo "  Neu gueltig bis: $(openssl x509 -in "$TMP/cert" -noout -enddate | cut -d= -f2)"

# 4) Installieren: Tailscale-Ablage und die von der API gelesene Kopie
install -d -m 700 "$TS_DIR"
install -m 644 "$TMP/cert" "$TS_DIR/$DOMAIN.crt"
install -m 600 "$TMP/key"  "$TS_DIR/$DOMAIN.key"
install -m 644 "$TMP/cert" "$APP_DIR/$DOMAIN.crt"
install -m 600 "$TMP/key"  "$APP_DIR/$DOMAIN.key"
echo "  Installiert nach $TS_DIR und $APP_DIR"

# 5) Dienst neu starten, bei Fehlschlag zurueckrollen
if [ "$DO_RESTART" = "1" ]; then
  echo "  Starte $SERVICE neu ..."
  systemctl restart "$SERVICE"

  # "active" allein sagt bei Type=simple noch nichts - erst der lauschende
  # Port beweist, dass Node mit dem neuen Zertifikat hochgekommen ist.
  up=0
  for i in $(seq 1 20); do
    sleep 1
    [ "$(systemctl is-active "$SERVICE")" = "active" ] || continue
    if ss -tlnH "sport = :$PORT" 2>/dev/null | grep -q ":$PORT"; then up=1; break; fi
  done

  if [ "$up" -ne 1 ]; then
    echo "Dienst lauscht nicht auf Port $PORT - stelle altes Zertifikat wieder her" >&2
    cp -a "$BACKUP/app/$DOMAIN.crt" "$APP_DIR/$DOMAIN.crt" 2>/dev/null || true
    cp -a "$BACKUP/app/$DOMAIN.key" "$APP_DIR/$DOMAIN.key" 2>/dev/null || true
    systemctl restart "$SERVICE" || true
    journalctl -u "$SERVICE" -n 20 --no-pager >&2 || true
    exit 1
  fi
  echo "  $SERVICE laeuft und lauscht auf Port $PORT"
else
  echo "  Neustart uebersprungen (--no-restart) - das Zertifikat wird erst danach aktiv"
fi
REMOTE_EOF

# --- Endkontrolle von aussen -------------------------------------------------
if [ "$DO_RESTART" -eq 1 ] && command -v openssl >/dev/null; then
  log "Pruefe TLS von hier aus gegen $HOST:$PORT ..."
  OUT=""; END=""
  for i in 1 2 3 4 5; do
    OUT="$(echo | openssl s_client -connect "$HOST:$PORT" -servername "$DOMAIN" 2>/dev/null || true)"
    END="$(printf '%s' "$OUT" | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2 || true)"
    [ -n "$END" ] && break
    sleep 2
  done
  if printf '%s' "$OUT" | grep -q "Verify return code: 0"; then
    ok "Zertifikat gueltig, Kette ok - laeuft bis $END"
  elif [ -n "$END" ]; then
    warn "Server antwortet (gueltig bis $END), aber die Kette wurde nicht verifiziert."
  else
    warn "Keine TLS-Antwort auf $HOST:$PORT - bitte manuell pruefen."
  fi
fi

ok "Fertig."
