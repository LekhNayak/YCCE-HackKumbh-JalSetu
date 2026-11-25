import { useEffect, useRef, useState } from "react";
import L from "leaflet";

/**
 * Thin wrapper around plain Leaflet (no react-leaflet). `draw(map)` adds layers and returns a cleanup; it re-runs
 * whenever the caller's memoised `draw` changes. Markers are circle markers / div icons, so no image assets are needed.
 */
export default function MapView({ center, zoom = 13, tiles = true, height = 320, draw, onClick, label, fitTo }: {
  center: [number, number]; zoom?: number; tiles?: boolean; height?: number;
  draw?: (map: L.Map) => (() => void) | void; onClick?: (lat: number, lon: number) => void; label: string;
  fitTo?: L.LatLngBoundsExpression | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<L.Map | null>(null);
  const clickRef = useRef(onClick);
  clickRef.current = onClick;

  useEffect(() => {
    if (!ref.current) return;
    const m = L.map(ref.current, { zoomControl: true, attributionControl: tiles, scrollWheelZoom: false }).setView(center, zoom);
    if (tiles) {
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(m);
    }
    m.on("click", (e: L.LeafletMouseEvent) => clickRef.current?.(e.latlng.lat, e.latlng.lng));
    setMap(m);
    return () => { m.remove(); setMap(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (map && fitTo) map.fitBounds(fitTo, { padding: [16, 16] }); }, [map, fitTo]);
  useEffect(() => { if (!map || !draw) return; const cleanup = draw(map); return () => { if (cleanup) cleanup(); }; }, [map, draw]);

  return <div ref={ref} style={{ height }} className="w-full overflow-hidden rounded-[14px] border border-line" role="region" aria-label={label} />;
}

export const pin = (color: string, size = 14, ring = "#fff") => L.divIcon({
  className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2],
  html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid ${ring};box-shadow:0 1px 4px rgba(10,31,102,.35)"></span>`,
});

export const homePin = () => L.divIcon({
  className: "", iconSize: [30, 30], iconAnchor: [15, 28],
  html: `<svg width="30" height="30" viewBox="0 0 24 24"><path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7z" fill="#FA5E00" stroke="#fff" stroke-width="1.5"/><circle cx="12" cy="9" r="2.6" fill="#fff"/></svg>`,
});
