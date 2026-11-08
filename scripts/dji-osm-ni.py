#!/usr/bin/env python3
"""Offline OSM hazard index for Rehkitzrettung. No external requests during queries.

Usage:
  python3 scripts/dji-osm-ni.py update --download
  python3 scripts/dji-osm-ni.py update --input /path/to/niedersachsen.osm.pbf
  python3 scripts/dji-osm-ni.py update --geojsonseq fixture.geojsonseq  # tests
  python3 scripts/dji-osm-ni.py query --bbox S,W,N,E
  python3 scripts/dji-osm-ni.py status

GeoFabrik source is an OSM extract. The resulting index is NOT a complete obstacle inventory.
"""
import argparse
import datetime as dt
import json
import math
import os
import pathlib
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import urllib.request

GEOFABRIK = 'https://download.geofabrik.de/europe/germany/niedersachsen-latest.osm.pbf'
DEFAULT_DIR = '/var/lib/rehkitzrettung/dji-geodata' if os.name != 'nt' else str(pathlib.Path.cwd() / '.local-dji-geodata')
BASE = pathlib.Path(os.environ.get('DJI_GEO_DATA_DIR') or DEFAULT_DIR).resolve()
DB = BASE / 'osm-hazards-ni.sqlite3'
MAX_FEATURES = 300000


def db_connect(path):
    c = sqlite3.connect(str(path))
    c.execute('PRAGMA synchronous=FULL')
    c.execute('CREATE TABLE hazard (id INTEGER PRIMARY KEY, osm_type TEXT NOT NULL, osm_id INTEGER NOT NULL, payload TEXT NOT NULL)')
    c.execute('CREATE VIRTUAL TABLE spatial USING rtree(id,minlon,maxlon,minlat,maxlat)')
    c.execute('CREATE TABLE meta (name TEXT PRIMARY KEY,value TEXT NOT NULL)')
    return c


def paths_and_bounds(geometry):
    if not isinstance(geometry, dict):
        return []
    t = geometry.get('type')
    c = geometry.get('coordinates')
    if t == 'Point' and isinstance(c, list):
        return [[c]]
    if t in ('LineString', 'MultiPoint'):
        return [c] if isinstance(c, list) else []
    if t == 'MultiLineString':
        return c if isinstance(c, list) else []
    if t == 'Polygon':
        return c if isinstance(c, list) else []
    if t == 'MultiPolygon':
        return [ring for poly in c for ring in poly] if isinstance(c, list) else []
    return []


def to_item(feature):
    props = feature.get('properties') or {}
    pwr = props.get('power')
    wind = props.get('generator:source') == 'wind' or props.get('man_made') in ('wind_turbine', 'windmill')
    if wind:
        kind = 'wind'
    elif pwr in ('line', 'minor_line', 'cable', 'tower', 'pole'):
        kind = 'power'
    else:
        return None
    osm_type = str(props.get('@type') or props.get('osm_type') or 'way')
    oid = props.get('@id') or props.get('osm_id')
    if osm_type not in ('node', 'way', 'relation'):
        return None
    try:
        oid = int(oid)
    except (ValueError, TypeError):
        return None
    valid = []
    for path in paths_and_bounds(feature.get('geometry')):
        pts = []
        for point in path:
            if isinstance(point, list) and len(point) >= 2:
                lon, lat = point[0], point[1]
                if isinstance(lon, (int, float)) and isinstance(lat, (int, float)) and math.isfinite(lon) and math.isfinite(lat) and -180 <= lon <= 180 and -85 <= lat <= 85:
                    pts.append({'lon': round(lon, 7), 'lat': round(lat, 7)})
        if pts:
            valid.append(pts)
    if not valid:
        return None
    coords = [p for path in valid for p in path]
    minlon, maxlon = min(p['lon'] for p in coords), max(p['lon'] for p in coords)
    minlat, maxlat = min(p['lat'] for p in coords), max(p['lat'] for p in coords)
    # Preserve original line geometry in separate elements so distances aren't distorted by joining disconnected rings.
    items = []
    for n, path in enumerate(valid):
        item = {'type': osm_type, 'id': oid, 'geometry': path, 'tags': {'power': pwr or '', 'generator:source': 'wind' if wind else ''}}
        bounds = (min(p['lon'] for p in path), max(p['lon'] for p in path), min(p['lat'] for p in path), max(p['lat'] for p in path))
        items.append((item, bounds))
    return items


def index_stream(input_lines, source, before_replace=None):
    BASE.mkdir(parents=True, exist_ok=True)
    temp = BASE / ('osm-hazards-ni.' + str(os.getpid()) + '.tmp.sqlite3')
    if temp.exists():
        raise RuntimeError('Temporäre Datenbank existiert bereits: ' + str(temp))
    c = db_connect(temp)
    count = 0
    try:
        for line in input_lines:
            line = line.strip().lstrip('\x1e')
            if not line:
                continue
            f = json.loads(line)
            if f.get('type') != 'Feature':
                continue
            for item, bounds in (to_item(f) or []):
                count += 1
                if count > MAX_FEATURES:
                    raise RuntimeError('Zu viele Gefahrenobjekte; Import aus Sicherheitsgründen abgebrochen.')
                cur = c.execute('INSERT INTO hazard(osm_type,osm_id,payload) VALUES(?,?,?)', (item['type'],item['id'],json.dumps(item, separators=(',', ':'))))
                c.execute('INSERT INTO spatial(id,minlon,maxlon,minlat,maxlat) VALUES(?,?,?,?,?)', (cur.lastrowid,*bounds))
                if count % 5000 == 0:
                    c.commit()
        if count < 1:
            raise RuntimeError('Keine Gefahrenobjekte gefunden; bisherige Datenbank bleibt erhalten.')
        c.execute('INSERT INTO meta(name,value) VALUES(?,?)', ('built_at', dt.datetime.now(dt.timezone.utc).isoformat()))
        c.execute('INSERT INTO meta(name,value) VALUES(?,?)', ('source',source))
        c.execute('INSERT INTO meta(name,value) VALUES(?,?)', ('count',str(count)))
        c.commit()
        result = c.execute('PRAGMA integrity_check').fetchone()[0]
        if result != 'ok':
            raise RuntimeError('SQLite Integritätsprüfung fehlgeschlagen: ' + result)
        c.close()
        if before_replace is not None:
            before_replace()
        os.replace(temp, DB)
        print('OSM-Gefahrenindex aktualisiert:',count,'Teilobjekte,',DB)
    except Exception:
        c.close()
        if temp.exists():
            temp.unlink()
        raise


def download_extract():
    BASE.mkdir(parents=True, exist_ok=True)
    target = BASE / 'niedersachsen-latest.osm.pbf'
    partial = BASE / 'niedersachsen-download.tmp'
    if shutil.disk_usage(BASE).free < 1500 * 1024 * 1024:
        raise RuntimeError('Für den OSM-Import sollten mindestens 1,5 GB freier Speicher vorhanden sein.')
    print('Lade Geofabrik Niedersachsen (ca. 500 MB) ...',flush=True)
    req = urllib.request.Request(GEOFABRIK,headers={'User-Agent':'Rehkitzrettung-DJI-Geodata/3.3 (+https://github.com/thw1905/rehkitzrettung)'})
    with urllib.request.urlopen(req, timeout=90) as response, open(partial,'wb') as output:
        while True:
            block=response.read(1024*1024)
            if not block:break
            output.write(block)
    if partial.stat().st_size < 10000000:
        partial.unlink(missing_ok=True)
        raise RuntimeError('OSM-Datei ungewöhnlich klein.')
    os.replace(partial,target)
    return target


def do_update(args):
    if args.download == bool(args.input or args.geojsonseq):
        raise RuntimeError('Genau eine Quelle wählen: --download, --input oder --geojsonseq.')
    if args.geojsonseq:
        with open(args.geojsonseq,'r',encoding='utf-8') as lines:
            index_stream(lines,'Lokale GeoJSON-Testdatei')
        return
    raw = download_extract() if args.download else pathlib.Path(args.input).resolve()
    if not raw.is_file():
        raise RuntimeError('Eingabedatei fehlt: '+str(raw))
    if not shutil.which('osmium'):
        raise RuntimeError('osmium fehlt: sudo apt install osmium-tool')
    with tempfile.TemporaryDirectory(prefix='dji-osm-ni-',dir=BASE if BASE.exists() else None) as tempdir:
        filtered = pathlib.Path(tempdir) / 'filtered.osm.pbf'
        filters = ['w/power=line,minor_line,cable','n/power=tower,pole','nw/generator:source=wind','nw/man_made=wind_turbine,windmill']
        print('Filtere Stromleitungen, Masten und Windanlagen ...',flush=True)
        subprocess.run(['osmium','tags-filter',str(raw),*filters,'-o',str(filtered)],check=True)
        print('Erzeuge lokalen räumlichen Index ...',flush=True)
        proc = subprocess.Popen(['osmium','export',str(filtered),'-f','geojsonseq','--attributes=type,id'],stdout=subprocess.PIPE,text=True,encoding='utf-8')
        try:
            def verify_export():
                if proc.wait() != 0:
                    raise RuntimeError('osmium export fehlgeschlagen; vorheriger Index bleibt erhalten.')
            index_stream(proc.stdout, GEOFABRIK if args.download else str(raw), before_replace=verify_export)
        except Exception:
            proc.kill()
            proc.wait()
            raise

    # Remove the large downloaded extract after successful indexing; not the user's --input file.
    if args.download:
        raw.unlink(missing_ok=True)


def do_query(args):
    if not DB.is_file():
        raise RuntimeError('OSM-Index fehlt: '+str(DB)+'; zuerst update --download ausführen.')
    values = [float(v) for v in args.bbox.split(',')]
    if len(values)!=4:
        raise RuntimeError('bbox: süd,west,nord,ost')
    s,w,n,e=values
    if not all(math.isfinite(v) for v in values) or not(-85<s<n<85 and -180<w<e<180) or (n-s)*(e-w)>0.25:
        raise RuntimeError('Ungültige oder zu große Suchregion.')
    c=sqlite3.connect('file:'+str(DB)+'?mode=ro',uri=True)
    try:
        rows=c.execute('SELECT h.payload FROM spatial r JOIN hazard h ON h.id=r.id WHERE r.minlon<=? AND r.maxlon>=? AND r.minlat<=? AND r.maxlat>=? LIMIT 1202',(e,w,n,s)).fetchall()
        if len(rows)>1200:
            raise RuntimeError('Mehr als 1200 Kandidaten; Gefahrenprüfung nicht abgeschlossen.')
        meta=dict(c.execute('SELECT name,value FROM meta').fetchall())
        print(json.dumps({'elements':[json.loads(row[0]) for row in rows], 'builtAt':meta.get('built_at'), 'source':meta.get('source'), 'count':meta.get('count')},separators=(',',':')))
    finally:
        c.close()


def do_status(_args):
    if not DB.is_file():
        print('Kein OSM-Index vorhanden:',DB)
        return
    c=sqlite3.connect('file:'+str(DB)+'?mode=ro',uri=True)
    print(json.dumps(dict(c.execute('SELECT name,value FROM meta')),indent=2))
    c.close()


def main():
    p=argparse.ArgumentParser(description='Lokaler OSM-Hindernishinweisindex Niedersachsen')
    sub=p.add_subparsers(dest='action',required=True)
    u=sub.add_parser('update');u.add_argument('--download',action='store_true');u.add_argument('--input');u.add_argument('--geojsonseq')
    q=sub.add_parser('query');q.add_argument('--bbox',required=True)
    sub.add_parser('status')
    args=p.parse_args()
    try:
        {'update':do_update,'query':do_query,'status':do_status}[args.action](args)
    except Exception as exc:
        print('FEHLER:',exc,file=sys.stderr)
        sys.exit(1)

if __name__=='__main__':main()
