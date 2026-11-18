#!/usr/bin/env python3
"""Lokaler Hamburger OSM-Gefahrenindex für die DJI-Flugvorplanung.

Verwendung:
  python3 scripts/dji-osm-hh.py update --download
  python3 scripts/dji-osm-hh.py update --input /pfad/hamburg.osm.pbf
  python3 scripts/dji-osm-hh.py update --geojsonseq test.geojsonseq
  python3 scripts/dji-osm-hh.py query --bbox SUED,WEST,NORD,OST
  python3 scripts/dji-osm-hh.py status

Nur Hinweise, KEIN Hindernisfreiheits- oder Flugfreigabenachweis.
"""
import argparse
import datetime as dt
import json
import math
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import urllib.request

GEOFABRIK = 'https://download.geofabrik.de/europe/germany/hamburg-latest.osm.pbf'
BASE = Path(os.environ.get('DJI_GEO_DATA_DIR') or
            ('/var/lib/rehkitzrettung/dji-geodata' if os.name != 'nt'
             else str(Path.cwd() / '.local-dji-geodata'))).resolve()
DB = BASE / 'osm-hazards-hh.sqlite3'
MAX_FEATURES = 300000


def geometry_paths(geometry):
    if not isinstance(geometry, dict):
        return []
    kind, coords = geometry.get('type'), geometry.get('coordinates')
    if kind == 'Point':
        return [[coords]] if isinstance(coords, list) else []
    if kind in ('LineString', 'MultiPoint'):
        return [coords] if isinstance(coords, list) else []
    if kind in ('MultiLineString', 'Polygon'):
        return coords if isinstance(coords, list) else []
    if kind == 'MultiPolygon' and isinstance(coords, list):
        return [ring for poly in coords for ring in poly]
    return []


def to_items(feature):
    tags = feature.get('properties') or {}
    power = tags.get('power')
    wind = tags.get('generator:source') == 'wind' or tags.get('man_made') in ('wind_turbine', 'windmill')
    if not wind and power not in ('line', 'minor_line', 'cable', 'tower', 'pole'):
        return []
    osm_type = str(tags.get('@type') or tags.get('osm_type') or 'way')
    osm_id = tags.get('@id') or tags.get('osm_id')
    if osm_type not in ('node', 'way'):
        return []
    try:
        osm_id = int(osm_id)
    except (TypeError, ValueError):
        return []
    result = []
    for path in geometry_paths(feature.get('geometry')):
        points = []
        for raw in path:
            if not isinstance(raw, list) or len(raw) < 2:
                continue
            lon, lat = raw[:2]
            if (isinstance(lon, (float, int)) and isinstance(lat, (float, int))
                    and math.isfinite(lon) and math.isfinite(lat)
                    and -180 <= lon <= 180 and -85 <= lat <= 85):
                points.append({'lon': round(lon, 7), 'lat': round(lat, 7)})
        if not points:
            continue
        xs, ys = [p['lon'] for p in points], [p['lat'] for p in points]
        element = {
            'type': osm_type, 'id': osm_id, 'geometry': points,
            'tags': {'power': power or '', 'generator:source': 'wind' if wind else ''},
        }
        result.append((element, (min(xs), max(xs), min(ys), max(ys))))
    return result


def create_index(lines, source, before_replace=None):
    BASE.mkdir(parents=True, exist_ok=True)
    temporary = BASE / ('osm-hazards-hh.' + str(os.getpid()) + '.tmp.sqlite3')
    if temporary.exists():
        raise RuntimeError('Temporärer OSM-Index existiert bereits: ' + str(temporary))
    con = sqlite3.connect(str(temporary))
    count = 0
    try:
        con.execute('PRAGMA synchronous=FULL')
        con.execute('CREATE TABLE hazard (id INTEGER PRIMARY KEY, osm_type TEXT, osm_id INTEGER, payload TEXT NOT NULL)')
        con.execute('CREATE VIRTUAL TABLE spatial USING rtree(id,minlon,maxlon,minlat,maxlat)')
        con.execute('CREATE TABLE meta (name TEXT PRIMARY KEY,value TEXT NOT NULL)')
        for raw in lines:
            raw = raw.strip().lstrip('\x1e')
            if not raw:
                continue
            feature = json.loads(raw)
            if feature.get('type') != 'Feature':
                continue
            for element, bounds in to_items(feature):
                count += 1
                if count > MAX_FEATURES:
                    raise RuntimeError('Zu viele OSM-Objekte; der alte Index bleibt erhalten.')
                cur = con.execute('INSERT INTO hazard(osm_type,osm_id,payload) VALUES(?,?,?)',
                                  (element['type'], element['id'], json.dumps(element, separators=(',', ':'))))
                con.execute('INSERT INTO spatial(id,minlon,maxlon,minlat,maxlat) VALUES(?,?,?,?,?)',
                            (cur.lastrowid, *bounds))
                if count % 5000 == 0:
                    con.commit()
        if count == 0:
            raise RuntimeError('Keine Gefahrenobjekte gefunden; der alte Index bleibt erhalten.')
        meta = {
            'built_at': dt.datetime.now(dt.timezone.utc).isoformat(),
            'source': source,
            'count': str(count),
        }
        con.executemany('INSERT INTO meta(name,value) VALUES(?,?)', meta.items())
        con.commit()
        if con.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise RuntimeError('Integritätsprüfung des OSM-Indexes fehlgeschlagen.')
        con.close()
        if before_replace:
            before_replace()
        os.replace(temporary, DB)
        print('Hamburger OSM-Gefahrenindex aktualisiert:', count, 'Teilobjekte,', DB)
    except Exception:
        con.close()
        temporary.unlink(missing_ok=True)
        raise


def download_extract():
    BASE.mkdir(parents=True, exist_ok=True)
    target = BASE / 'hamburg-latest.osm.pbf'
    partial = BASE / ('hamburg-' + str(os.getpid()) + '.download.tmp')
    if shutil.disk_usage(BASE).free < 400 * 1024 * 1024:
        raise RuntimeError('Mindestens 400 MB freier Speicher für den Hamburg-Import benötigt.')
    req = urllib.request.Request(GEOFABRIK, headers={
        'User-Agent': 'Rehkitzrettung-DJI-Geodata/3.8 (+https://github.com/thw1905/rehkitzrettung)'})
    print('Lade Hamburger Geofabrik-Auszug ...', flush=True)
    try:
        with urllib.request.urlopen(req, timeout=90) as response, open(partial, 'wb') as targetfile:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                targetfile.write(chunk)
        if partial.stat().st_size < 1000000:
            raise RuntimeError('Heruntergeladene Hamburg-Datei ungewöhnlich klein.')
        os.replace(partial, target)
        return target
    finally:
        partial.unlink(missing_ok=True)


def update(args):
    if sum(bool(x) for x in (args.download, args.input, args.geojsonseq)) != 1:
        raise RuntimeError('Genau eine Quelle angeben: --download, --input oder --geojsonseq.')
    if args.geojsonseq:
        with open(args.geojsonseq, encoding='utf-8') as stream:
            create_index(stream, 'Lokale GeoJSON-Testdatei')
        return
    raw = download_extract() if args.download else Path(args.input).resolve()
    if not raw.is_file():
        raise RuntimeError('OSM-Eingabedatei fehlt: ' + str(raw))
    if not shutil.which('osmium'):
        raise RuntimeError('osmium fehlt: sudo apt install osmium-tool')
    with tempfile.TemporaryDirectory(prefix='dji-osm-hh-', dir=BASE) as workdir:
        filtered = Path(workdir) / 'gefahren.osm.pbf'
        tags = ['w/power=line,minor_line,cable', 'n/power=tower,pole',
                'nw/generator:source=wind', 'nw/man_made=wind_turbine,windmill']
        subprocess.run(['osmium', 'tags-filter', str(raw), *tags, '-o', str(filtered)], check=True)
        process = subprocess.Popen(
            ['osmium', 'export', str(filtered), '-f', 'geojsonseq', '--attributes=type,id'],
            stdout=subprocess.PIPE, text=True, encoding='utf-8')
        try:
            def verify():
                if process.wait() != 0:
                    raise RuntimeError('OSM-Export fehlgeschlagen; alter Index bleibt erhalten.')
            create_index(process.stdout, GEOFABRIK if args.download else str(raw), before_replace=verify)
        except Exception:
            process.kill()
            process.wait()
            raise
    if args.download:
        raw.unlink(missing_ok=True)


def query(args):
    if not DB.is_file():
        raise RuntimeError('Hamburger OSM-Index fehlt; zuerst update --download ausführen.')
    values = [float(x) for x in args.bbox.split(',')]
    if len(values) != 4:
        raise RuntimeError('BBOX erwartet SUED,WEST,NORD,OST.')
    s, w, n, e = values
    if (not all(math.isfinite(x) for x in values) or
            not (-85 < s < n < 85 and -180 < w < e < 180) or
            (n - s) * (e - w) > 0.25):
        raise RuntimeError('Ungültige oder zu große Suchregion.')
    con = sqlite3.connect('file:' + str(DB) + '?mode=ro', uri=True)
    try:
        rows = con.execute(
            'SELECT h.payload FROM spatial r JOIN hazard h ON h.id=r.id '
            'WHERE r.minlon<=? AND r.maxlon>=? AND r.minlat<=? AND r.maxlat>=? LIMIT 1202',
            (e, w, n, s)).fetchall()
        if len(rows) > 1200:
            raise RuntimeError('Mehr als 1200 Kandidaten; Prüfung nicht abgeschlossen.')
        meta = dict(con.execute('SELECT name,value FROM meta').fetchall())
        print(json.dumps({
            'elements': [json.loads(row[0]) for row in rows],
            'builtAt': meta.get('built_at'), 'source': meta.get('source'),
            'count': meta.get('count'),
        }, separators=(',', ':')))
    finally:
        con.close()


def status(_args):
    if not DB.is_file():
        print('Kein Hamburger OSM-Index vorhanden:', DB)
        return
    con = sqlite3.connect('file:' + str(DB) + '?mode=ro', uri=True)
    try:
        print(json.dumps(dict(con.execute('SELECT name,value FROM meta')), indent=2))
    finally:
        con.close()


def main():
    parser = argparse.ArgumentParser(description='OSM-Gefahrenhinweise Hamburg (offline)')
    commands = parser.add_subparsers(dest='command', required=True)
    u = commands.add_parser('update')
    u.add_argument('--download', action='store_true')
    u.add_argument('--input')
    u.add_argument('--geojsonseq')
    q = commands.add_parser('query')
    q.add_argument('--bbox', required=True)
    commands.add_parser('status')
    args = parser.parse_args()
    try:
        {'update': update, 'query': query, 'status': status}[args.command](args)
    except Exception as exc:
        print('FEHLER:', exc, file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
