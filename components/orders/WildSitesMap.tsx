"use client";
import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

type Site = { id: string; latitude: number; longitude: number; rehkitzeGesichert: number; sonstigesWildGesichert: number };
export default function WildSitesMap({ sites }: { sites: Site[] }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!root.current || !sites.length) return;
    let disposed = false;
    let destroy: (() => void) | undefined;
    void import("leaflet").then(L => {
      if (disposed || !root.current) return;
      const map = L.map(root.current, { scrollWheelZoom: false });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19, attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);
      const bounds: [number, number][] = [];
      for (const site of sites) {
        const position: [number, number] = [site.latitude, site.longitude];
        bounds.push(position);
        const marker = L.divIcon({ html: '<span style="display:block;background:#15803d;border:2px solid white;border-radius:50%;height:18px;width:18px;box-shadow:0 2px 5px #3336"></span>',
          iconSize: [22, 22], iconAnchor: [11, 11], className: "" });
        L.marker(position, { icon: marker }).addTo(map).bindPopup(`Sicherungsort · ${site.rehkitzeGesichert} Rehkitze, ${site.sonstigesWildGesichert} anderes Wild`);
      }
      if (bounds.length === 1) map.setView(bounds[0], 17);
      else map.fitBounds(bounds, { padding: [24, 24], maxZoom: 17 });
      destroy = () => map.remove();
    });
    return () => { disposed = true; destroy?.(); };
  }, [sites]);
  return <div ref={root} className="h-72 w-full overflow-hidden rounded-xl border" aria-label="Karte der vorübergehenden Wild-Sicherungsorte" />;
}
