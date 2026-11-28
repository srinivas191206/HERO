'use client';

import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

export interface MapMarkerSpec {
  id: string;
  lat: number;
  lng: number;
  title: string;
  subtitle?: string;
  badge?: string;
  color: string;
  radius?: number;
  pulse?: boolean;
  onClick?: () => void;
}

export interface MapPolygonSpec {
  id: string;
  positions: Array<[number, number]>; // [lat, lng]
  color: string;
  fillColor: string;
  fillOpacity?: number;
  weight?: number;
  dashArray?: string;
  title?: string;
  subtitle?: string;
  onClick?: () => void;
}

export interface MapPolylineSpec {
  id: string;
  positions: Array<[number, number]>; // [lat, lng]
  color: string;
  weight?: number;
  opacity?: number;
  dashArray?: string;
  title?: string;
  subtitle?: string;
  onClick?: () => void;
}

export interface IntelligenceLeafletMapProps {
  center: [number, number];
  zoom: number;
  radarTileUrl?: string | null;
  geojsonData?: any;
  geojsonStyle?: (feature: any) => L.PathOptions;
  onEachGeoJsonFeature?: (feature: any, layer: L.Layer) => void;
  polygons?: MapPolygonSpec[];
  polylines?: MapPolylineSpec[];
  markers?: MapMarkerSpec[];
  baseStyle?: 'voyager' | 'dark' | 'topo';
  className?: string;
}

export default function IntelligenceLeafletInner({
  center,
  zoom,
  radarTileUrl = null,
  geojsonData = null,
  geojsonStyle,
  onEachGeoJsonFeature,
  polygons = [],
  polylines = [],
  markers = [],
  baseStyle = 'voyager',
  className = ''
}: IntelligenceLeafletMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const baseLayerRef = useRef<L.TileLayer | null>(null);
  const radarLayerRef = useRef<L.TileLayer | null>(null);
  const vectorGroupRef = useRef<L.LayerGroup | null>(null);
  const geojsonGroupRef = useRef<L.LayerGroup | null>(null);

  // Initialize Leaflet map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: false
    }).setView(center, zoom);

    // Offline fallback grid
    const OfflineGrid = L.GridLayer.extend({
      createTile: function (coords: L.Coords) {
        const tile = document.createElement('canvas');
        const size = this.getTileSize();
        tile.width = size.x;
        tile.height = size.y;
        const ctx = tile.getContext('2d');
        if (ctx) {
          ctx.fillStyle = baseStyle === 'dark' ? '#0f172a' : '#f1f5f9';
          ctx.fillRect(0, 0, size.x, size.y);
          ctx.strokeStyle = 'rgba(14, 165, 233, 0.14)';
          ctx.strokeRect(0, 0, size.x, size.y);
        }
        return tile;
      }
    });
    new (OfflineGrid as any)({ zIndex: 0 }).addTo(map);

    const tileUrl =
      baseStyle === 'dark'
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : baseStyle === 'topo'
          ? 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png'
          : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

    baseLayerRef.current = L.tileLayer(tileUrl, { maxZoom: 18, zIndex: 1 }).addTo(map);
    geojsonGroupRef.current = L.layerGroup().addTo(map);
    vectorGroupRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-center / zoom cleanly when requested
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.flyTo(center, zoom, { duration: 0.7 });
  }, [center[0], center[1], zoom]);

  // Swap animated radar tile overlay cleanly
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (radarLayerRef.current) {
      map.removeLayer(radarLayerRef.current);
      radarLayerRef.current = null;
    }

    if (radarTileUrl) {
      radarLayerRef.current = L.tileLayer(radarTileUrl, {
        opacity: 0.72,
        zIndex: 5,
        maxNativeZoom: 10,
        maxZoom: 18
      }).addTo(map);
    }
  }, [radarTileUrl]);

  // Render GeoJSON boundary layers
  useEffect(() => {
    const group = geojsonGroupRef.current;
    if (!group) return;
    group.clearLayers();
    if (!geojsonData) return;

    const layer = L.geoJSON(geojsonData, {
      style: geojsonStyle,
      onEachFeature: onEachGeoJsonFeature
    });
    layer.addTo(group);
  }, [geojsonData, geojsonStyle, onEachGeoJsonFeature]);

  // Render dynamic polygons, polylines & markers
  useEffect(() => {
    const group = vectorGroupRef.current;
    if (!group) return;
    group.clearLayers();

    polygons.forEach(p => {
      const poly = L.polygon(p.positions, {
        color: p.color,
        fillColor: p.fillColor,
        fillOpacity: p.fillOpacity ?? 0.35,
        weight: p.weight ?? 2,
        dashArray: p.dashArray
      }).addTo(group);
      if (p.title || p.subtitle) {
        poly.bindPopup(
          `<div class="text-xs font-sans"><strong>${p.title || ''}</strong>${p.subtitle ? `<div class="text-slate-500 mt-0.5">${p.subtitle}</div>` : ''}</div>`
        );
      }
      if (p.onClick) poly.on('click', p.onClick);
    });

    polylines.forEach(line => {
      const pl = L.polyline(line.positions, {
        color: line.color,
        weight: line.weight ?? 4,
        opacity: line.opacity ?? 0.9,
        dashArray: line.dashArray
      }).addTo(group);
      if (line.title || line.subtitle) {
        pl.bindPopup(
          `<div class="text-xs font-sans"><strong>${line.title || ''}</strong>${line.subtitle ? `<div class="text-slate-500 mt-0.5">${line.subtitle}</div>` : ''}</div>`
        );
      }
      if (line.onClick) pl.on('click', line.onClick);
    });

    markers.forEach(m => {
      const icon = L.divIcon({
        className: 'custom-div-icon',
        html: `
          <div style="position:relative;display:flex;align-items:center;justify-content:center;">
            ${m.pulse ? `<span style="position:absolute;width:28px;height:28px;border-radius:9999px;background:${m.color};opacity:0.35;animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></span>` : ''}
            <div style="min-width:${(m.radius ?? 10) * 2}px;height:${(m.radius ?? 10) * 2}px;padding:0 5px;border-radius:9999px;background:${m.color};border:2px solid #ffffff;color:#ffffff;font-size:9px;font-weight:900;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.35);white-space:nowrap;">
              ${m.badge || ''}
            </div>
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      const marker = L.marker([m.lat, m.lng], { icon }).addTo(group);
      if (m.title || m.subtitle) {
        marker.bindPopup(
          `<div class="text-xs font-sans"><strong>${m.title}</strong>${m.subtitle ? `<div class="text-slate-500 mt-0.5">${m.subtitle}</div>` : ''}</div>`
        );
      }
      if (m.onClick) marker.on('click', m.onClick);
    });
  }, [polygons, polylines, markers]);

  return (
    <div className={`relative w-full h-full rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 ${className}`}>
      <div ref={containerRef} className="w-full h-full min-h-[380px] z-0" />
    </div>
  );
}
