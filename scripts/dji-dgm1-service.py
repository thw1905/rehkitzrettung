#!/usr/bin/env python3
"""Local-only DGM1 elevation service for Rehkitzrettung. Uses LGLN STAC 1-m GeoTIFF tiles.

sudo apt install python3-rasterio python3-pyproj
DJI_DGM1_HEIGHT_URL=http://127.0.0.1:8788/heights  (in Next.js server env)
DJI_DGM1_AUTO_FETCH=1 is default; set 0 to sample only already downloaded GeoTIFFs.

Never a clearance calculation: DGM is bare earth, not trees, poles or cables.
"""
import hashlib
import json
import math
import os
import pathlib
import socket
import sys
import tempfile
import threading
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

try:
    import rasterio
    from rasterio.warp import transform
except ImportError:
    sys.exit('FEHLER: python3-rasterio fehlt. Auf Ubuntu: sudo apt install python3-rasterio')

DEFAULT_DIR = '/var/lib/rehkitzrettung/dji-geodata' if os.name != 'nt' else str(pathlib.Path.cwd() / '.local-dji-geodata')
BASE = pathlib.Path(os.environ.get('DJI_GEO_DATA_DIR') or DEFAULT_DIR).resolve()
TILES = BASE / 'dgm1'
STAC = 'https://dgm.stac.lgln.niedersachsen.de/search'
MAX_TILES_PER_SEARCH=30
MAX_BYTES=70*1024*1024
MAX_POINTS=100
AUTO_FETCH=os.environ.get('DJI_DGM1_AUTO_FETCH','1')=='1'
LOCK=threading.Lock()
UA='Rehkitzrettung-DJI-DGM1/3.3 (+https://github.com/thw1905/rehkitzrettung)'


def valid_asset(url):
    parsed=urllib.parse.urlparse(url)
    hostname=(parsed.hostname or '').lower()
    # STAC metadata must not cause requests to arbitrary internal services.
    allowed=hostname.endswith('.niedersachsen.de') or hostname=='niedersachsen.de'
    extra=[h.strip().lower() for h in os.environ.get('DJI_DGM1_ALLOWED_HOSTS','').split(',') if h.strip()]
    return parsed.scheme=='https' and not parsed.username and not parsed.password and (allowed or hostname in extra)


def json_request(url,timeout=18):
    if not valid_asset(url):
        raise RuntimeError('Nicht vertrauenswürdige STAC-Adresse: '+url)
    req=urllib.request.Request(url,headers={'User-Agent':UA,'Accept':'application/geo+json,application/json'})
    with urllib.request.urlopen(req,timeout=timeout) as response:
        raw=response.read(3_000_000)
        if response.read(1):
            raise RuntimeError('STAC-Antwort zu groß.')
    return json.loads(raw)


def stac_items(locations):
    lon=[v[0] for v in locations];lat=[v[1] for v in locations]
    pad=.00005
    bounds=f'{min(lon)-pad:.7f},{min(lat)-pad:.7f},{max(lon)+pad:.7f},{max(lat)+pad:.7f}'
    url=STAC+'?'+urllib.parse.urlencode({'collections':'dgm1','bbox':bounds,'limit':100})
    data=json_request(url)
    feats=data.get('features') or []
    if not isinstance(feats,list):
        raise RuntimeError('DGM1 STAC-Antwort enthält keine Feature-Liste.')
    if len(feats)>100:
        raise RuntimeError('Zu viele DGM1-Kacheln; bitte eine kleinere Fläche prüfen.')
    if len(feats)==100 or any(link.get('rel')=='next' for link in data.get('links',[]) if isinstance(link,dict)):
        raise RuntimeError('DGM1 STAC-Suchergebnis paginiert: zu großes Gebiet oder unvollständig.')
    return feats


def asset_for_item(item):
    assets=item.get('assets') or {}
    for _name,asset in assets.items():
        href=asset.get('href') if isinstance(asset,dict) else None
        typ=str(asset.get('type') or '').lower() if isinstance(asset,dict) else ''
        if isinstance(href,str) and ('.tif' in urllib.parse.urlparse(href).path.lower() or 'tiff' in typ or 'geotiff' in typ):
            if not valid_asset(href):
                raise RuntimeError('DGM1-Kachel-URL liegt außerhalb der erlaubten Datenanbieter. Keine Datei heruntergeladen: '+href)
            return href
    return None


def fetch_tile(href,item_id):
    TILES.mkdir(parents=True,exist_ok=True)
    basename=hashlib.sha256((item_id+'|'+href).encode()).hexdigest()[:24]+'.tif'
    dest=TILES/basename
    if dest.exists():
        return
    request=urllib.request.Request(href,headers={'User-Agent':UA})
    fd,tmp=tempfile.mkstemp(prefix='.download-',suffix='.tif',dir=TILES)
    os.close(fd)
    try:
        with urllib.request.urlopen(request,timeout=45) as response, open(tmp,'wb') as output:
            size=0
            while True:
                data=response.read(512*1024)
                if not data:break
                size+=len(data)
                if size>MAX_BYTES:
                    raise RuntimeError('DGM1-Kachel über 70 MB; Download abgebrochen.')
                output.write(data)
        with rasterio.open(tmp) as ds:
            if not ds.crs or ds.count<1 or not ds.width or not ds.height or ds.width>3000 or ds.height>3000 or ds.crs.to_epsg()!=25832:
                raise RuntimeError('DGM1-Kachel hat unerwartete GeoTIFF-Eigenschaften (CRS/Größe).')
        os.replace(tmp,dest)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)


def sample_points(points):
    # Output None for any points without valid local raster cells.
    missing=set(range(len(points)))
    out=[None]*len(points)
    for file in TILES.glob('*.tif') if TILES.is_dir() else []:
        try:
            with rasterio.open(file) as ds:
                if ds.crs is None:
                    continue
                xs,ys=transform('EPSG:4326',ds.crs,[p[0] for p in points],[p[1] for p in points])
                selected=[i for i in missing if ds.bounds.left<=xs[i]<ds.bounds.right and ds.bounds.bottom<ys[i]<=ds.bounds.top]
                if not selected:continue
                for i,v in zip(selected,ds.sample([(xs[i],ys[i]) for i in selected],indexes=[1],masked=True)):
                    z=v[0]
                    if not hasattr(z,'mask') or not bool(z.mask):
                        n=float(z)
                        if math.isfinite(n) and n!=-9999 and -500<n<9000:
                            out[i]=round(n,3)
                            missing.remove(i)
        except Exception as exc:
            print('DGM1 Datei nicht lesbar',file,exc,file=sys.stderr)
    return out,missing


def heights(locations):
    if not isinstance(locations,list) or not 1<=len(locations)<=MAX_POINTS:
        raise ValueError('1 bis 100 Punkte pro Höhenabfrage erlaubt.')
    points=[]
    for loc in locations:
        if not isinstance(loc,list) or len(loc)!=2 or any(not isinstance(v,(int,float)) or not math.isfinite(v) for v in loc):
            raise ValueError('Koordinaten müssen [lon, lat] sein.')
        lon,lat=loc
        if not (6.5<=lon<=11.7 and 51.2<=lat<=54.0):
            raise ValueError('DGM1-Dienst nur für Niedersachsen konfiguriert.')
        points.append((lon,lat))
    with LOCK:
        values,missing=sample_points(points)
        if missing and AUTO_FETCH:
            items=stac_items([points[i] for i in missing])
            if len(items)>MAX_TILES_PER_SEARCH:
                raise RuntimeError('Zu viele DGM1-Kacheln für einen Abruf; kleineres Testgebiet wählen.')
            n=0
            for it in items:
                url=asset_for_item(it)
                if url:
                    fetch_tile(url,str(it.get('id') or 'dgm1'))
                    n+=1
            if n==0:
                raise RuntimeError('Keine DGM1-GeoTIFF-Kacheln im STAC-Suchergebnis gefunden.')
            values,missing=sample_points(points)
        if missing:
            raise RuntimeError(f'Für {len(missing)} von {len(points)} Punkten fehlen gültige DGM1-Werte. Kein EU-DEM-Ersatz.')
    return {'dataset':'dgm1','elevations':values,'attribution':'LGLN DGM1, CC BY 4.0; nacktes Gelände, keine Hindernisse'}


class Handler(BaseHTTPRequestHandler):
    def send_json(self,status,obj):
        buf=json.dumps(obj,ensure_ascii=False,separators=(',',':')).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Cache-Control','no-store')
        self.send_header('Content-Length',str(len(buf)))
        self.end_headers();self.wfile.write(buf)

    def do_GET(self):
        if self.path!='/health':return self.send_json(404,{'error':'Nicht gefunden'})
        self.send_json(200,{'status':'online','dataset':'dgm1','source':'LGLN Niedersachsen STAC / lokale COGs','tiles':len(list(TILES.glob('*.tif'))) if TILES.exists() else 0,'autoFetch':AUTO_FETCH})

    def do_POST(self):
        if self.path!='/heights':return self.send_json(404,{'error':'Nicht gefunden'})
        try:
            size=int(self.headers.get('Content-Length','0'))
            if size<2 or size>20000:
                return self.send_json(413,{'error':'Anfrage zu groß.'})
            body=json.loads(self.rfile.read(size))
            self.send_json(200,heights(body.get('locations')))
        except ValueError as exc:
            self.send_json(400,{'error':str(exc)})
        except Exception as exc:
            print('DGM1:',exc,file=sys.stderr)
            self.send_json(503,{'error':str(exc)})


def main():
    port=int(os.environ.get('DJI_DGM1_PORT','8788'))
    TILES.mkdir(parents=True,exist_ok=True)
    server=ThreadingHTTPServer(('127.0.0.1',port),Handler)
    print('LGLN DGM1-Dienst lokal: http://127.0.0.1:%d/health'%port,flush=True)
    server.serve_forever()

if __name__=='__main__':main()
