#!/usr/bin/env bash
# DJI_WIREGUARD_V6 -- einmalige VPN-Einrichtung fuer DJI Pilot 2 (MQTT ueber privaten Tunnel).
# Kein Proxy, kein oeffentliches Klartext-MQTT, keine Aenderung an DJI PinPoint/WS/Map.
set -Eeuo pipefail

IFACE="wg-dji"
VPN_IP="10.94.55.1"
VPN_NET="10.94.55.0/24"
CLIENT_IP="10.94.55.2"
UDP_PORT="51820"
MQTT_PORT="1884"
DOMAIN="kitzrettung-hegering-hittfeld.de"
PROJECT="/root/rehkitzrettung"
ENVFILE="$PROJECT/.env.production.local"
CONF="/etc/mosquitto/conf.d/dji.conf"
WGFILE="/etc/wireguard/$IFACE.conf"
CLIENT_DIR="/root/dji-vpn-client"
CLIENT_FILE="$CLIENT_DIR/fernsteuerung-1.conf"
META="/root/dji-vpn-v6-info"

fail() { printf 'ABBRUCH: %s\n' "$*" >&2; exit 1; }
info() { printf '%s\n' "$*"; }
root_check() { [[ "$(id -u)" == 0 ]] || fail 'Bitte mit sudo ausfuehren.'; }
check() {
  root_check
  [[ -f "$CONF" && -f "$ENVFILE" && -f "$PROJECT/package.json" ]] || fail 'Mosquitto-Konfiguration oder Rehkitzrettungs-Projekt nicht gefunden.'
  [[ -f /etc/mosquitto/mosquitto.conf ]] || fail 'Mosquitto-Hauptkonfiguration fehlt.'
  grep -Eq '^listener[[:space:]]+1883[[:space:]]+127\.0\.0\.1' "$CONF" || fail 'Erwarteter interner Port 1883 fehlt. Bitte zuerst Konfiguration pruefen.'
  grep -Eq '^listener[[:space:]]+8883' "$CONF" || fail 'Erwarteter TLS-Port 8883 fehlt. Bitte zuerst Konfiguration pruefen.'
  ! grep -q '^per_listener_settings[[:space:]]\+true' "$CONF" || fail 'per_listener_settings ist aktiv; Benutzerrechte fuer neue Listener manuell pruefen.'
  [[ ! -e "$WGFILE" && ! -e "$META" && ! -e "$CLIENT_FILE" ]] || fail 'VPN V6 existiert bereits oder wg-dji wird bereits genutzt. Keine Aenderung.'
  ! ss -ltnH | awk '{print $4}' | grep -Eq ":${MQTT_PORT}$" || fail "TCP $MQTT_PORT wird bereits verwendet."
  ! ss -lunH | awk '{print $4}' | grep -Eq ":${UDP_PORT}$" || fail "UDP $UDP_PORT wird bereits verwendet."
  ! ip -o -4 addr show | grep -q "${VPN_IP}/" || fail "IP $VPN_IP ist bereits vorhanden."
  [[ ! -e /etc/wireguard/wg-dji.conf ]] || fail 'WireGuard wg-dji ist bereits konfiguriert.'
  command -v python3 >/dev/null || fail 'python3 fehlt.'
  command -v openssl >/dev/null || fail 'openssl fehlt.'
  command -v systemctl >/dev/null || fail 'systemd fehlt.'
  info "VORPRUEFUNG OK: DNS $DOMAIN, VPN $VPN_NET, UDP $UDP_PORT, privater MQTT-Port $MQTT_PORT."
  info 'Die Installation erzeugt VPN-Schluessel, bindet MQTT ausschliesslich an die VPN-IP und sichert bestehende Konfigurationen.'
  info 'Port 1883 bleibt lokal, 8883 bleibt verschluesselt; noch kein Autoconnect und keine PM2-Aenderung.'
}

set_env() {
  local mode="$1"
  python3 - "$ENVFILE" "$mode" <<'PY'
import pathlib, sys
p=pathlib.Path(sys.argv[1]); mode=sys.argv[2]
raw=p.read_text(encoding='utf-8')
updates={
 'DJI_MQTT_PILOT_HOST':'tcp://10.94.55.1:1884',
 'DJI_MQTT_ALLOW_PRIVATE_PLAINTEXT':'true',
 'DJI_MQTT_AUTOCONNECT':'true' if mode == 'activate' else 'false',
}
lines=[s for s in raw.splitlines() if not any(s.startswith(k+'=') for k in updates)]
lines.extend(f'{k}={v}' for k,v in updates.items())
p.write_text('\n'.join(lines).rstrip()+'\n', encoding='utf-8')
PY
  chmod 600 "$ENVFILE"
}

install() {
  check
  info 'Installiere WireGuard-Werkzeuge auf Ubuntu ...'
  if ! command -v wg >/dev/null || ! command -v wg-quick >/dev/null; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y wireguard-tools
  fi
  command -v wg >/dev/null || fail 'WireGuard konnte nicht installiert werden.'
  umask 077
  local BACKUP="/root/dji-vpn-v6-backup-$(date -u +%Y%m%dT%H%M%SZ)"
  mkdir -m 700 "$BACKUP" "$CLIENT_DIR" 2>/dev/null || fail 'Backup- oder Clientverzeichnis konnte nicht angelegt werden.'
  cp -a "$CONF" "$BACKUP/dji.conf"
  cp -a "$ENVFILE" "$BACKUP/env.production.local"
  printf '%s\n' "$BACKUP" > "$META"
  chmod 600 "$META"
  local done=0
  rollback_error() {
    local status=$?
    if [[ "$status" != 0 && "$done" == 0 ]]; then
      info 'Fehler bei Installation: stelle Mosquitto- und App-Konfiguration wieder her.' >&2
      cp -a "$BACKUP/dji.conf" "$CONF" || true
      cp -a "$BACKUP/env.production.local" "$ENVFILE" || true
      systemctl restart mosquitto >/dev/null 2>&1 || true
      systemctl disable --now "wg-quick@$IFACE" >/dev/null 2>&1 || true
      rm -f "$WGFILE" "$META" "$CLIENT_FILE"
    fi
    exit "$status"
  }
  trap rollback_error EXIT
  mkdir -p -m 700 /etc/wireguard
  local server_private server_public client_private client_public
  server_private="$(wg genkey)"; server_public="$(printf %s "$server_private" | wg pubkey)"
  client_private="$(wg genkey)"; client_public="$(printf %s "$client_private" | wg pubkey)"
  cat > "$WGFILE" <<EOF
[Interface]
Address = $VPN_IP/24
ListenPort = $UDP_PORT
PrivateKey = $server_private

[Peer]
PublicKey = $client_public
AllowedIPs = $CLIENT_IP/32
EOF
  chmod 600 "$WGFILE"
  cat > "$CLIENT_FILE" <<EOF
[Interface]
PrivateKey = $client_private
Address = $CLIENT_IP/32

[Peer]
PublicKey = $server_public
Endpoint = $DOMAIN:$UDP_PORT
AllowedIPs = $VPN_IP/32
PersistentKeepalive = 25
EOF
  chmod 600 "$CLIENT_FILE"
  systemctl enable --now "wg-quick@$IFACE"
  ip -o -4 addr show dev "$IFACE" | grep -q "$VPN_IP/" || fail 'VPN-IP nach Start nicht vorhanden.'
  # Listener auf VPN-Adresse gebunden: kein offenes Klartext-MQTT auf der oeffentlichen Server-IP.
  printf '\n# DJI_WIREGUARD_V6 - nur ueber %s erreichbar\nlistener %s %s\n' "$IFACE" "$MQTT_PORT" "$VPN_IP" >> "$CONF"
  systemctl restart mosquitto
  systemctl is-active --quiet mosquitto || fail 'Mosquitto nicht aktiv.'
  ss -ltnH | awk '{print $4}' | grep -Eq "${VPN_IP}:${MQTT_PORT}$" || fail 'Privater MQTT-Listener wurde nicht geoeffnet.'
  set_env prepare
  done=1
  trap - EXIT
  info ''
  info 'INSTALLATION ERFOLGREICH. PINPOINTS UND WEBSOCKET BLEIBEN UNVERAENDERT.'
  info "WireGuard: $VPN_IP, UDP $UDP_PORT"
  info "Privates MQTT: tcp://$VPN_IP:$MQTT_PORT (nicht aus dem Internet direkt erreichbar)"
  info "Client-Profil: $CLIENT_FILE (ENTHAELT EINEN PRIVATEN SCHLUESSEL!)"
  info "Backup: $BACKUP"
  info 'Naechstes: bei IONOS eingehend UDP 51820 erlauben. Dann WireGuard-Profil auf EINER DJI-Fernsteuerung importieren.'
  info 'Danach: sudo bash setup-dji-vpn-v6.sh --activate'
}

activate() {
  root_check
  [[ -f "$META" && -f "$WGFILE" ]] || fail 'VPN V6 wurde noch nicht eingerichtet.'
  systemctl is-active --quiet "wg-quick@$IFACE" || fail 'WireGuard-Dienst ist nicht aktiv.'
  systemctl is-active --quiet mosquitto || fail 'Mosquitto-Dienst ist nicht aktiv.'
  # Vor Aktivierung erforderliche Pilot-Anmeldung pruefen, ohne Passwort anzuzeigen.
  grep -q '^DJI_MQTT_PILOT_USER=.' "$ENVFILE" || fail 'DJI_MQTT_PILOT_USER fehlt.'
  grep -q '^DJI_MQTT_PILOT_PASSWORD=.' "$ENVFILE" || fail 'DJI_MQTT_PILOT_PASSWORD fehlt.'
  set_env activate
  if command -v pm2 >/dev/null; then
    pm2 restart rehkitzrettung --update-env
  else
    info 'PM2 nicht im PATH. Bitte Web-App anschliessend manuell neu starten.'
  fi
  info 'VPN-MQTT V6 freigeschaltet. DJI Pilot 2 verbindet bei Anmeldung ueber den privaten VPN-Port.'
  info 'Die Fernsteuerung muss zuvor WireGuard aktivieren. Verbindungsstatus unter DJI Pilot 2 pruefen.'
}

status() {
  root_check
  systemctl --no-pager --plain is-active "wg-quick@$IFACE" mosquitto || true
  command -v wg >/dev/null && wg show "$IFACE" || true
  ss -ltnp | grep -E ":(${MQTT_PORT}|1883|8883)[[:space:]]" || true
  grep -E '^(DJI_MQTT_AUTOCONNECT|DJI_MQTT_PILOT_HOST|DJI_MQTT_ALLOW_PRIVATE_PLAINTEXT)=' "$ENVFILE" || true
}

case "${1:-}" in
  --check) check ;;
  --install) install ;;
  --activate) activate ;;
  --status) status ;;
  *) echo 'Aufruf: sudo bash setup-dji-vpn-v6.sh --check|--install|--activate|--status'; exit 2 ;;
esac
