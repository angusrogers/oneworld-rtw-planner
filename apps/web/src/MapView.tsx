import maplibregl, { Map as MlMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';

// OpenFreeMap: keyless, no usage limits — suitable for public hosting.
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

export interface MapViewProps {
  airports: GeoJSON.FeatureCollection;
  arcs: GeoJSON.FeatureCollection;
  onClickAirport: (iata: string) => void;
}

export function MapView({ airports, arcs, onClickAirport }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const readyRef = useRef(false);
  const clickRef = useRef(onClickAirport);
  clickRef.current = onClickAirport;

  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current!,
      style: STYLE_URL,
      center: [20, 20],
      zoom: 1.4,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    (window as unknown as { __map?: MlMap }).__map = map;
    map.on('error', (e) => console.error('map error:', e.error?.message ?? e));
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }));

    map.on('load', () => {
      // Soften the ocean to a lighter blue-grey than the stock style.
      for (const layer of map.getStyle().layers ?? []) {
        if (layer.type === 'fill' && /water|ocean|sea/i.test(layer.id)) {
          try {
            map.setPaintProperty(layer.id, 'fill-color', '#e3eaf0');
          } catch {
            // non-fatal styling tweak
          }
        }
      }

      map.addSource('airports', { type: 'geojson', data: airports });
      map.addSource('arcs', { type: 'geojson', data: arcs });

      map.addLayer({
        id: 'arc-lines',
        type: 'line',
        source: 'arcs',
        filter: ['!=', ['get', 'dashed'], true],
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 2.5,
        },
      });
      map.addLayer({
        id: 'arc-lines-surface',
        type: 'line',
        source: 'arcs',
        filter: ['==', ['get', 'dashed'], true],
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 2.5,
          'line-dasharray': [2, 2],
        },
      });
      map.addLayer({
        id: 'airport-circles',
        type: 'circle',
        source: 'airports',
        paint: {
          'circle-radius': ['get', 'size'],
          'circle-color': ['get', 'color'],
          'circle-opacity': ['get', 'opacity'],
          'circle-stroke-width': ['get', 'strokeW'],
          'circle-stroke-color': ['get', 'stroke'],
          'circle-stroke-opacity': ['get', 'opacity'],
        },
      });
      map.addLayer({
        id: 'airport-labels-hub',
        type: 'symbol',
        source: 'airports',
        minzoom: 2.2,
        filter: ['>=', ['get', 'degree'], 25],
        layout: {
          'text-field': ['get', 'iata'],
          'text-size': 10,
          'text-offset': [0, 1.1],
          'text-anchor': 'top',
        },
        paint: {
          'text-color': '#333',
          'text-halo-color': '#fff',
          'text-halo-width': 1,
          'text-opacity': ['get', 'opacity'],
        },
      });
      map.addLayer({
        id: 'airport-labels',
        type: 'symbol',
        source: 'airports',
        minzoom: 4.2,
        filter: ['<', ['get', 'degree'], 25],
        layout: {
          'text-field': ['get', 'iata'],
          'text-size': 9.5,
          'text-offset': [0, 1.0],
          'text-anchor': 'top',
        },
        paint: {
          'text-color': '#555',
          'text-halo-color': '#fff',
          'text-halo-width': 1,
          'text-opacity': ['get', 'opacity'],
        },
      });

      map.on('click', 'airport-circles', (e) => {
        const f = e.features?.[0];
        if (f?.properties?.iata) clickRef.current(f.properties.iata as string);
      });
      map.on('mouseenter', 'airport-circles', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'airport-circles', () => {
        map.getCanvas().style.cursor = '';
      });

      readyRef.current = true;
      (map.getSource('airports') as maplibregl.GeoJSONSource).setData(airports);
      (map.getSource('arcs') as maplibregl.GeoJSONSource).setData(arcs);
    });

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current!);

    return () => {
      ro.disconnect();
      readyRef.current = false;
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    (map.getSource('airports') as maplibregl.GeoJSONSource | undefined)?.setData(airports);
    (map.getSource('arcs') as maplibregl.GeoJSONSource | undefined)?.setData(arcs);
  }, [airports, arcs]);

  return <div ref={containerRef} className="map-container" />;
}
