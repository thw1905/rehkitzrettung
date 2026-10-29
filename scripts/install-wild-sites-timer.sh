#!/usr/bin/env bash
set -euo pipefail
cd /root/rehkitzrettung
if [[ -e /etc/systemd/system/rehkitzrettung-wild-sites-cleanup.service || -e /etc/systemd/system/rehkitzrettung-wild-sites-cleanup.timer ]]; then
 echo 'ABBRUCH: systemd-Dienst existiert bereits. Bitte zuerst pruefen.'; exit 1
fi
if [[ ! -f scripts/cleanup-wild-sites.cjs ]]; then echo 'ABBRUCH: Cleanup-Skript fehlt'; exit 1; fi
cat >/etc/systemd/system/rehkitzrettung-wild-sites-cleanup.service <<'UNIT'
[Unit]
Description=Rehkitzrettung temporaere Sicherungsorte loeschen
[Service]
Type=oneshot
Environment=NODE_ENV=production
WorkingDirectory=/root/rehkitzrettung
ExecStart=/usr/bin/node /root/rehkitzrettung/scripts/cleanup-wild-sites.cjs
UNIT
cat >/etc/systemd/system/rehkitzrettung-wild-sites-cleanup.timer <<'UNIT'
[Unit]
Description=Wild-Sicherungsorte um 00:00 Europe/Berlin bereinigen
[Timer]
OnCalendar=*-*-* 00:00:00 Europe/Berlin
Persistent=true
AccuracySec=1s
Unit=rehkitzrettung-wild-sites-cleanup.service
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now rehkitzrettung-wild-sites-cleanup.timer
systemctl list-timers rehkitzrettung-wild-sites-cleanup.timer --no-pager
