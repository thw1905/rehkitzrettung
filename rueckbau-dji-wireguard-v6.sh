#!/usr/bin/env bash
# Rueckbau NUR der Aenderungen des DJI WireGuard V6-Installers.
# Bestehende DJI-API, PinPoint, Akku-V5, SQLite und andere PM2-Dienste bleiben unberuehrt.
set -Eeuo pipefail

META=/root/dji-vpn-v6-info
CONF=/etc/mosquitto/conf.d/dji.conf
ENVFILE=/root/rehkitzrettung/.env.production.local
WGFILE=/etc/wireguard/wg-dji.conf
CLIENT_FILE=/root/dji-vpn-client/fernsteuerung-1.conf
SERVICE=wg-quick@wg-dji

fail() { echo "ABBRUCH: $*" >&2; exit 1; }
[[ $(id -u) -eq 0 ]] || fail 'Bitte mit sudo oder als root starten.'
[[ ${1:-} == --check || ${1:-} == --undo ]] || fail 'Aufruf: bash rueckbau-dji-wireguard-v6.sh --check|--undo'
[[ -f "$META" ]] || fail 'V6-Metadatendatei fehlt. Kein automatischer Rueckbau.'
BACKUP=$(head -n 1 "$META")
[[ "$BACKUP" == /root/dji-vpn-v6-backup-* ]] || fail 'Unbekannter V6-Backup-Pfad.'
[[ -f "$BACKUP/dji.conf" && -f "$BACKUP/env.production.local" ]] || fail 'Originalsicherung von V6 ist nicht vollstaendig.'
[[ -f "$CONF" && -f "$ENVFILE" ]] || fail 'Mosquitto- oder Umgebungsdatei fehlt.'
[[ -f "$WGFILE" ]] || fail 'V6-WireGuard-Datei fehlt; bitte Zustand manuell pruefen.'

# Erst pruefen, ob ausschliesslich die erwarteten V6-Zeilen vorhanden sind.
# Dabei keine Passwoerter oder Schluessel ausgeben.
python3 - "$CONF" "$ENVFILE" "$BACKUP/env.production.local" "${1:-}" <<'PY'
import pathlib, re, sys
conf, env, saved = map(pathlib.Path, sys.argv[1:4])
c = conf.read_text(encoding='utf-8')
pattern = r'(?m)^# DJI_WIREGUARD_V6 - nur ueber wg-dji erreichbar\nlistener 1884 10\.94\.55\.1(?:\n|$)'
if len(re.findall(pattern, c)) != 1:
    raise SystemExit('ABBRUCH: V6-MQTT-Listener weicht vom Original ab. Keine Aenderung.')

def env_values(path):
    result = {}
    for line in path.read_text(encoding='utf-8').splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            k, v = line.split('=', 1)
            if k in ('DJI_MQTT_PILOT_HOST', 'DJI_MQTT_ALLOW_PRIVATE_PLAINTEXT', 'DJI_MQTT_AUTOCONNECT'):
                if k in result:
                    raise SystemExit(f'ABBRUCH: {k} mehrfach vorhanden.')
                result[k] = v
    return result
v = env_values(env)
original = env_values(saved)
expected = {
  'DJI_MQTT_PILOT_HOST': 'tcp://10.94.55.1:1884',
  'DJI_MQTT_ALLOW_PRIVATE_PLAINTEXT': 'true',
}
for key, val in expected.items():
    if v.get(key) != val:
        raise SystemExit(f'ABBRUCH: {key} wurde seit V6 geaendert. Bitte manuell pruefen.')
if v.get('DJI_MQTT_AUTOCONNECT') not in ('true', 'false'):
    raise SystemExit('ABBRUCH: Unbekannter DJI_MQTT_AUTOCONNECT-Wert.')
print('VORPRUEFUNG OK: Exakt der V6-MQTT-Listener und die drei V6-Umgebungswerte gefunden.')
print('Vorheriger MQTT-Host:', original.get('DJI_MQTT_PILOT_HOST', '(nicht gesetzt)'))
print('Andere Umgebungsvariablen und Mosquitto-Regeln bleiben unveraendert.')
PY

if [[ "$1" == --check ]]; then
  echo 'Keine Aenderungen vorgenommen. Zum Rueckbau --undo ausfuehren.'
  exit 0
fi

# Sicherheitskopie des IST-Zustands VOR dem Rueckbau.
PREVIOUS=$(mktemp -d /root/dji-v6-rueckbau-sicherung-XXXXXXXX)
chmod 700 "$PREVIOUS"
cp -a "$CONF" "$PREVIOUS/dji.conf"
cp -a "$ENVFILE" "$PREVIOUS/env.production.local"
echo "Sicherung des aktuellen Zustands: $PREVIOUS"

# Gezielt nur die von V6 hinzugefuegte Listener-Sektion und ENV-Schluessel aendern.
python3 - "$CONF" "$ENVFILE" "$BACKUP/env.production.local" <<'PY'
import os, pathlib, re, stat, sys, tempfile
conf, env, saved = map(pathlib.Path, sys.argv[1:])
keys = {'DJI_MQTT_PILOT_HOST', 'DJI_MQTT_ALLOW_PRIVATE_PLAINTEXT', 'DJI_MQTT_AUTOCONNECT'}
old = {}
for line in saved.read_text(encoding='utf-8').splitlines():
    if '=' in line and not line.lstrip().startswith('#'):
        k, v = line.split('=', 1)
        if k in keys:
            old[k] = line
c = conf.read_text(encoding='utf-8')
pat = r'(?m)^# DJI_WIREGUARD_V6 - nur ueber wg-dji erreichbar\nlistener 1884 10\.94\.55\.1(?:\n|$)'
c = re.sub(pat, '', c, count=1)
lines = [s for s in env.read_text(encoding='utf-8').splitlines() if s.split('=', 1)[0] not in keys]
lines.extend(old[k] for k in sorted(old))
e = '\n'.join(lines).rstrip() + '\n'

def write_replace(path, content):
    fd, name = tempfile.mkstemp(prefix='.dji-v6-undo-', dir=str(path.parent))
    try:
        os.fchmod(fd, stat.S_IMODE(path.stat().st_mode))
        os.fchown(fd, path.stat().st_uid, path.stat().st_gid)
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            f.write(content)
        os.replace(name, path)
    finally:
        if os.path.exists(name): os.unlink(name)

write_replace(conf, c)
write_replace(env, e)
PY

if ! systemctl restart mosquitto; then
  echo 'Mosquitto-Neustart fehlgeschlagen. Stelle letzten Zustand wieder her.' >&2
  cp -a "$PREVIOUS/dji.conf" "$CONF"
  cp -a "$PREVIOUS/env.production.local" "$ENVFILE"
  systemctl restart mosquitto || true
  fail 'Konfiguration wurde zurueckgesetzt, bitte Mosquitto-Status pruefen.'
fi
systemctl disable --now "$SERVICE"
rm -f -- "$WGFILE" "$CLIENT_FILE"
rmdir /root/dji-vpn-client 2>/dev/null || true
# Metadaten erst nach erfolgreichem Rueckbau entfernen.
rm -f -- "$META"

if command -v pm2 >/dev/null 2>&1; then
  if ! (cd /root/rehkitzrettung && pm2 restart rehkitzrettung --update-env); then
    echo 'WARNUNG: App-Neustart ist fehlgeschlagen. PM2-Status bitte pruefen.' >&2
  fi
else
  echo 'WARNUNG: PM2 nicht gefunden. Web-App bei Gelegenheit neu starten.' >&2
fi

echo 'RUECKBAU ABGESCHLOSSEN: V6-WireGuard und MQTT-Port 1884 entfernt.'
echo 'Datenbank, V5-Akkuempfaenger, MQTT-8883 und DJI-WebSocket wurden nicht geaendert.'
echo 'WireGuard-Paket darf installiert bleiben; es hat ohne Tunnel keinen Einfluss.'
echo 'Falls in IONOS eine Regel UDP 51820 eingerichtet wurde, diese manuell wieder entfernen.'
echo "Rueckbau-Sicherung: $PREVIOUS"
