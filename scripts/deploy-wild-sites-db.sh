#!/usr/bin/env bash
set -euo pipefail
cd /root/rehkitzrettung
SQL=scripts/sql/create-secured-wild-sites.sql
[[ -f "$SQL" ]] || { echo 'SQL-Datei fehlt'; exit 1; }
DB_FILE="$(NODE_ENV=production node scripts/resolve-wild-sites-db.cjs)"
[[ -n "$DB_FILE" && -f "$DB_FILE" ]] || { echo 'ABBRUCH: Produktive SQLite-Datei nicht gefunden'; exit 1; }
export DB_FILE
python3 - <<'PY'
import sqlite3, os, datetime, pathlib
path = os.environ['DB_FILE']
sql = pathlib.Path('scripts/sql/create-secured-wild-sites.sql').read_text()
if sql.count('CREATE TABLE "SecuredWildLocation"') != 1 or 'DROP ' in sql.upper() or 'ALTER TABLE' in sql.upper():
    raise SystemExit('ABBRUCH: SQL-Datei weicht vom erwarteten Nur-Anlegen-Skript ab')
with sqlite3.connect(path) as db:
    existing = db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='SecuredWildLocation'").fetchone()
    if existing:
        print('Tabelle SecuredWildLocation existiert bereits – nicht erneut ausgefuehrt.')
    else:
        backup_path = '/root/rehkitzrettung-sicherung-wild-' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S') + '.sqlite'
        with sqlite3.connect(backup_path) as backup:
            db.backup(backup)
            assert backup.execute('PRAGMA integrity_check').fetchone()[0] == 'ok', 'Backup defekt'
        print('DATENBANKSICHERUNG OK:', backup_path)
        db.executescript('BEGIN IMMEDIATE;\n'+sql+'\nCOMMIT;')
        print('Nur neue Tabelle und Indizes angelegt.')
    print('Tabellenstatus:', db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='SecuredWildLocation'").fetchone())
PY
