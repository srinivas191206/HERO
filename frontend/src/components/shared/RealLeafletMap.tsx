'use client';

import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { User, Incident, DistrictSummary } from '../../types';
import { matchApDistrict } from '../../utils/apDistricts';
import { MapPin, Maximize2, Minimize2, RadioTower } from 'lucide-react';

type BasemapKind = 'osm' | 'street' | 'satellite' | 'topo';
type OfficerWithCoords = User & { lat?: number; lng?: number };

interface LandmarkItem {
  id?: string;
  name: string;
  lat: number;
  lng: number;
  type?: string;
  kind?: 'station' | 'incident' | 'shelter' | 'landmark' | 'officer';
  desc?: string;
  levels?: number;
}

type SelectedEntityState =
  | { type: 'district'; data: DistrictSummary }
  | { type: 'officer'; data: OfficerWithCoords & { lat?: number; lng?: number } }
  | { type: 'incident'; data: Incident & { lat: number; lng: number } }
  | { type: 'landmark'; data: LandmarkItem };

const BASEMAP_URLS: Record<BasemapKind, { label: string; url: string }> = {
  osm: {
    label: 'OSM',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
  },
  street: {
    label: 'Streets',
    url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}'
  },
  satellite: {
    label: 'Satellite',
    url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
  },
  topo: {
    label: 'Terrain',
    url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}'
  }
};

interface RealLeafletMapProps {
  officers?: OfficerWithCoords[];
  incidents?: Incident[];
  districts?: DistrictSummary[];
  currentOfficerLocation?: { lat: number; lng: number; heading: number; isReal?: boolean } | null;
  districtCenter?: { lat: number; lng: number } | null;
  onDispatchOfficer?: (officerId: string, incidentId: string) => void;
  selectedIncidentId?: string | null;
  onSelectIncident?: (incidentId: string | null) => void;
  onOpenDistrictHub?: (districtId: string) => void;
  onOpenIncident?: (incident: Incident) => void;
  onInspectIn3D?: (target: {
    id?: string;
    name: string;
    lat: number;
    lng: number;
    kind: 'station' | 'incident' | 'shelter' | 'landmark' | 'officer';
    description?: string;
    levels?: number;
  }) => void;
  isCommandCenter?: boolean;
  strictRealCoordinates?: boolean;
  showApDistrictGeoJson?: boolean;
  defaultBasemap?: BasemapKind;
  isExpandable?: boolean;
}

export default function RealLeafletMap({
  officers = [],
  incidents = [],
  districts = [],
  currentOfficerLocation = null,
  districtCenter = null,
  onDispatchOfficer,
  selectedIncidentId = null,
  onSelectIncident,
  onOpenDistrictHub,
  onOpenIncident,
  onInspectIn3D,
  isCommandCenter = false,
  strictRealCoordinates = false,
  showApDistrictGeoJson = false,
  defaultBasemap = 'osm',
  isExpandable = false
}: RealLeafletMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const baseLayerRef = useRef<L.TileLayer | null>(null);
  const geojsonLayerRef = useRef<L.LayerGroup | null>(null);
  const markerGroupRef = useRef<L.LayerGroup | null>(null);
  const hasCenteredRef = useRef<boolean>(false);

  const [basemap, setBasemap] = useState<BasemapKind>(defaultBasemap);
  const [apGeoJson, setApGeoJson] = useState<GeoJSON.GeoJsonObject | null>(null);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntityState | null>(null);

  const landmarks: LandmarkItem[] = [
    { name: 'Visakhapatnam Railway Station', lat: 17.7289, lng: 83.2980, type: 'transit', desc: 'Central Transit Hub' },
    { name: 'Command HQ', lat: 17.8167, lng: 83.3426, type: 'hq', desc: 'HQ Base Operations' },
    { name: 'District Police Office', lat: 17.8170, lng: 83.3430, type: 'police', desc: 'Superintendent Office' },
    { name: 'Government General Hospital', lat: 17.7770, lng: 83.3220, type: 'medical', desc: 'Critical Trauma Care Center' },
    { name: 'Coastal Outpost', lat: 17.8200, lng: 83.3500, type: 'hq', desc: 'Coastal Landmark Outpost' },
  ];

  // Fetch local AP 28-district boundary GeoJSON when statewide overlay is enabled
  useEffect(() => {
    if (!showApDistrictGeoJson || apGeoJson) return;
    let active = true;
    fetch('/gis-3d/data/ap_districts.geojson')
      .then(r => (r.ok ? r.json() : null))
      .then((gj: GeoJSON.GeoJsonObject | null) => {
        if (active && gj) setApGeoJson(gj);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [showApDistrictGeoJson, apGeoJson]);

  // Initialize Map once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const initialCenter: [number, number] = districtCenter
      ? [districtCenter.lat, districtCenter.lng]
      : districts.length > 0 || showApDistrictGeoJson
        ? [15.95, 80.35]
        : [17.6868, 83.2185];
    const initialZoom = districtCenter ? 13 : districts.length > 0 || showApDistrictGeoJson ? 6 : 14;

    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
      attributionControl: false
    }).setView(initialCenter, initialZoom);

    // Offline tactical grid layer underneath online tiles so map remains legible without internet
    const OfflineGridLayer = L.GridLayer.extend({
      createTile: function (coords: L.Coords) {
        const tile = document.createElement('canvas');
        const size = this.getTileSize();
        tile.width = size.x;
        tile.height = size.y;
        const ctx = tile.getContext('2d');
        if (ctx) {
          ctx.fillStyle = defaultBasemap === 'satellite' ? '#0B1930' : '#F1F5F9';
          ctx.fillRect(0, 0, size.x, size.y);
          ctx.strokeStyle = defaultBasemap === 'satellite' ? 'rgba(56, 189, 248, 0.14)' : 'rgba(2, 132, 199, 0.12)';
          ctx.lineWidth = 1;
          ctx.strokeRect(0, 0, size.x, size.y);
          ctx.fillStyle = defaultBasemap === 'satellite' ? 'rgba(148, 163, 184, 0.35)' : 'rgba(100, 116, 139, 0.35)';
          ctx.font = '10px monospace';
          ctx.fillText(`Z${coords.z} (${coords.x},${coords.y})`, 8, 16);
        }
        return tile;
      }
    }) as unknown as new (opts: L.GridLayerOptions) => L.GridLayer;
    new OfflineGridLayer({ zIndex: 0 }).addTo(map);

    baseLayerRef.current = L.tileLayer(BASEMAP_URLS[defaultBasemap].url, {
      maxZoom: 19,
      zIndex: 1
    }).addTo(map);

    geojsonLayerRef.current = L.layerGroup().addTo(map);
    markerGroupRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    if (!strictRealCoordinates) {
      landmarks.forEach(lm => {
        const hqIcon = L.divIcon({
          className: 'custom-div-icon',
          html: `
            <div class="relative flex items-center justify-center">
              <span class="absolute inline-flex h-10 w-10 rounded-full bg-sky-400 opacity-20 animate-ping"></span>
              <div class="w-6 h-6 rounded-lg bg-sky-600 border border-white text-white flex items-center justify-center shadow-md">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path d="M4.75 9.75h14.5m-14.5 4.5h14.5M12 4.75v14.5"/></svg>
              </div>
            </div>
          `,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });

        const genericIcon = L.divIcon({
          className: 'custom-div-icon',
          html: `
            <div class="relative flex items-center justify-center">
              <div class="w-4 h-4 rounded-full bg-slate-650 border border-slate-300 shadow-md"></div>
            </div>
          `,
          iconSize: [16, 16],
          iconAnchor: [8, 8]
        });

        const marker = L.marker([lm.lat, lm.lng], {
          icon: lm.type === 'hq' ? hqIcon : genericIcon
        }).addTo(map);

        marker.on('click', () => {
          setSelectedEntity({ type: 'landmark', data: lm });
        });
      });
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap basemap when user selects a different layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (baseLayerRef.current) {
      map.removeLayer(baseLayerRef.current);
    }
    baseLayerRef.current = L.tileLayer(BASEMAP_URLS[basemap].url, {
      maxZoom: 19,
      zIndex: 1
    }).addTo(map);
  }, [basemap]);

  // Trigger Leaflet resize calculation after fullscreen expand/collapse
  useEffect(() => {
    const timer = setTimeout(() => {
      mapRef.current?.invalidateSize();
    }, 120);
    return () => clearTimeout(timer);
  }, [isExpanded]);

  // Draw real Andhra Pradesh GeoJSON district boundaries
  useEffect(() => {
    const group = geojsonLayerRef.current;
    if (!group) return;
    group.clearLayers();
    if (!apGeoJson) return;

    const layer = L.geoJSON(apGeoJson, {
      style: feature => {
        const props = feature?.properties as { district?: string } | undefined;
        const gjName = props?.district;
        const matchedProv = districts.find(
          d => matchApDistrict(d.name)?.district === gjName || matchApDistrict(d.code)?.district === gjName
        );
        if (matchedProv) {
          const isOnline = matchedProv.status === 'online';
          const hasSos = matchedProv.sosCount > 0 || matchedProv.p1Count > 0;
          return {
            color: hasSos ? '#ef4444' : isOnline ? '#34d399' : '#fbbf24',
            weight: 1.8,
            fillColor: hasSos ? '#ef4444' : isOnline ? '#0ea5e9' : '#f59e0b',
            fillOpacity: basemap === 'satellite' ? 0.34 : 0.24
          };
        }
        return {
          color: basemap === 'satellite' ? '#7dd3fc' : '#0284c7',
          weight: 1.1,
          fillColor: basemap === 'satellite' ? '#1e3a8a' : '#38bdf8',
          fillOpacity: basemap === 'satellite' ? 0.22 : 0.1
        };
      },
      onEachFeature: (feature, polyLayer) => {
        const props = feature?.properties as { district?: string } | undefined;
        const gjName = props?.district;
        if (!gjName) return;
        const matchedProv = districts.find(
          d => matchApDistrict(d.name)?.district === gjName || matchApDistrict(d.code)?.district === gjName
        );
        const label = matchedProv
          ? `${matchedProv.name} (${matchedProv.code}) • ${
              matchedProv.status === 'online'
                ? 'Cloud Synced'
                : matchedProv.status === 'provisioning'
                  ? 'Provisioning'
                  : 'Local / Offline'
            }`
          : `${gjName} • Unprovisioned District`;
        polyLayer.bindTooltip(label, { sticky: true });
        if (matchedProv) {
          polyLayer.on('click', () => {
            setSelectedEntity({ type: 'district', data: matchedProv });
          });
        }
      }
    });
    layer.addTo(group);
  }, [apGeoJson, districts, basemap]);

  // Fly to district center when switching single-district view
  const distLatVal = districtCenter?.lat;
  const distLngVal = districtCenter?.lng;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || distLatVal == null || distLngVal == null) return;
    map.setView([distLatVal, distLngVal], 13);
    hasCenteredRef.current = false;
  }, [distLatVal, distLngVal]);

  // Focus map when an incident is selected
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedIncidentId) return;
    const inc = incidents.find(i => i.id === selectedIncidentId);
    if (inc?.locationLat != null && inc?.locationLng != null) {
      map.flyTo([inc.locationLat, inc.locationLng], 15, { duration: 0.6 });
    }
  }, [selectedIncidentId, incidents]);

  // Auto-fit bounds across real entities once
  useEffect(() => {
    const map = mapRef.current;
    if (!map || hasCenteredRef.current) return;

    const points: L.LatLngExpression[] = [];

    if (districts.length > 0) {
      districts.forEach(d => {
        if (d.centerLat != null && d.centerLng != null) {
          points.push([d.centerLat, d.centerLng]);
        }
      });
    }

    officers.forEach(off => {
      if (off.status !== 'Offline') {
        const offLat = off.location?.latitude ?? off.lat;
        const offLng = off.location?.longitude ?? off.lng;
        if (offLat != null && offLng != null) {
          points.push([offLat, offLng]);
        }
      }
    });

    incidents.forEach(inc => {
      if (inc.locationLat != null && inc.locationLng != null) {
        points.push([inc.locationLat, inc.locationLng]);
      }
    });

    if (currentOfficerLocation && currentOfficerLocation.isReal) {
      points.push([currentOfficerLocation.lat, currentOfficerLocation.lng]);
    }

    if (points.length > 0) {
      try {
        if (points.length === 1) {
          map.setView(points[0], districts.length > 0 ? 8 : 14);
        } else {
          const bounds = L.latLngBounds(points);
          map.fitBounds(bounds, {
            padding: [42, 42],
            maxZoom: districts.length > 0 ? 8 : 15
          });
        }
        hasCenteredRef.current = true;
      } catch (err) {
        console.warn('Failed to center map bounds:', err);
      }
    }
  }, [districts, officers, incidents, currentOfficerLocation]);

  // Update dynamic markers (districts, real incidents, real officers, self location)
  useEffect(() => {
    const map = mapRef.current;
    const markerGroup = markerGroupRef.current;
    if (!map || !markerGroup) return;

    markerGroup.clearLayers();

    const fallbackLat = districtCenter?.lat ?? 17.6868;
    const fallbackLng = districtCenter?.lng ?? 83.2185;

    districts.forEach(dist => {
      if (dist.centerLat == null || dist.centerLng == null) return;
      const isSynced = dist.status === 'online';
      const hasAlert = dist.sosCount > 0 || dist.p1Count > 0;
      const isProvisioning = dist.status === 'provisioning';
      const dotColor = isSynced ? '#10b981' : isProvisioning ? '#f59e0b' : '#f97316';
      const ringColor = hasAlert ? '#ef4444' : dotColor;

      const distIcon = L.divIcon({
        className: 'custom-div-icon',
        html: `
          <div class="relative flex flex-col items-center justify-center">
            ${hasAlert || isSynced ? `<span class="absolute inline-flex h-8 w-8 rounded-full opacity-35 animate-ping" style="background:${ringColor}"></span>` : ''}
            <div class="w-6 h-6 rounded-full border-2 border-white shadow-lg flex items-center justify-center text-[8px] font-black text-white" style="background:${dotColor}">
              ${dist.code.slice(0, 3)}
            </div>
            <div class="mt-0.5 px-1.5 py-0.5 bg-slate-950/85 border border-slate-700 rounded text-[8px] font-bold text-white whitespace-nowrap shadow">
              ${dist.code}
            </div>
          </div>
        `,
        iconSize: [38, 38],
        iconAnchor: [19, 19]
      });

      const marker = L.marker([dist.centerLat, dist.centerLng], { icon: distIcon }).addTo(markerGroup);
      marker.on('click', () => {
        setSelectedEntity({ type: 'district', data: dist });
      });
    });

    incidents.forEach(inc => {
      if (strictRealCoordinates && (inc.locationLat == null || inc.locationLng == null)) {
        return;
      }
      const indexSeed = parseInt(inc.id.replace(/\D/g, ''), 10) || 0;
      const incLat = inc.locationLat ?? (fallbackLat + (indexSeed % 5) * 0.004 - 0.008);
      const incLng = inc.locationLng ?? (fallbackLng + (indexSeed % 7) * 0.004 - 0.01);

      const isP1 = inc.priority === 'P1';

      const icon = L.divIcon({
        className: 'custom-div-icon',
        html: `
          <div class="relative flex items-center justify-center">
            ${isP1 ? '<span class="absolute inline-flex h-12 w-12 rounded-full bg-red-500 opacity-40 animate-ping"></span>' : ''}
            <div class="flex items-center justify-center w-6 h-6 rounded-lg ${isP1 ? 'bg-red-600' : 'bg-amber-500'} text-white shadow-lg border-2 border-white">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            </div>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      const marker = L.marker([incLat, incLng], { icon }).addTo(markerGroup);
      marker.on('click', () => {
        setSelectedEntity({ type: 'incident', data: { ...inc, lat: incLat, lng: incLng } });
        if (onSelectIncident) {
          onSelectIncident(inc.id);
        }
      });
    });

    officers.forEach(off => {
      const hasRealCoords =
        (off.location?.latitude != null && off.location?.longitude != null) ||
        (off.lat != null && off.lng != null);
      if (strictRealCoordinates && !hasRealCoords) {
        return;
      }

      const seed = parseInt(off.badgeNumber.replace(/\D/g, ''), 10) || 1;
      const offLat = off.location?.latitude ?? off.lat ?? (fallbackLat + (seed % 4) * 0.004 - 0.006);
      const offLng = off.location?.longitude ?? off.lng ?? (fallbackLng + (seed % 6) * 0.004 - 0.008);

      const isOnline = off.status !== 'Offline';
      const isEmergency = off.status === 'Emergency';

      const icon = L.divIcon({
        className: 'custom-div-icon',
        html: `
          <div class="relative flex flex-col items-center justify-center">
            ${isEmergency ? '<span class="absolute inline-flex h-10 w-10 rounded-full bg-red-400 opacity-60 animate-ping"></span>' : ''}
            <div class="w-4 h-4 rounded-full ${isEmergency ? 'bg-red-500' : isOnline ? 'bg-emerald-500' : 'bg-slate-400'} border-2 border-white shadow-md flex items-center justify-center">
              <div class="w-1.5 h-1.5 rounded-full bg-white"></div>
            </div>
            <div class="mt-0.5 px-1 bg-slate-950/80 rounded border border-slate-800 text-[8px] text-white font-bold font-sans tracking-tight whitespace-nowrap shadow">
              ${off.badgeNumber || off.name}
            </div>
          </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      });

      const marker = L.marker([offLat, offLng], { icon }).addTo(markerGroup);
      marker.on('click', () => {
        setSelectedEntity({ type: 'officer', data: { ...off, lat: offLat, lng: offLng } });
      });
    });

    if (!strictRealCoordinates && districtCenter?.lat != null && districtCenter?.lng != null) {
      const tacticalSites: LandmarkItem[] = [
        { id: 'dpo-hq', name: 'District Police Office (DPO)', lat: districtCenter.lat, lng: districtCenter.lng, kind: 'station', desc: 'Superintendent HQ & 3D Command Post', levels: 4 },
        { id: 'town-ps', name: 'Town Quick-Response Station', lat: districtCenter.lat + 0.0042, lng: districtCenter.lng - 0.0038, kind: 'station', desc: 'Sector Tactical Police Station', levels: 3 },
        { id: 'relief-shelter', name: 'Central Disaster Relief Shelter', lat: districtCenter.lat - 0.0035, lng: districtCenter.lng + 0.0048, kind: 'shelter', desc: 'APSDMA Evacuation & Relief Building', levels: 3 }
      ];
      tacticalSites.forEach(site => {
        const badgeBg = site.kind === 'station' ? 'bg-indigo-600' : 'bg-emerald-600';
        const siteIcon = L.divIcon({
          className: 'custom-div-icon',
          html: `
            <div class="relative flex flex-col items-center justify-center">
              <div class="w-6 h-6 rounded-lg ${badgeBg} border-2 border-white shadow-md flex items-center justify-center text-white text-[9px] font-black">
                ${site.kind === 'station' ? 'PS' : 'SH'}
              </div>
            </div>
          `,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });
        const m = L.marker([site.lat, site.lng], { icon: siteIcon }).addTo(markerGroup);
        m.on('click', () => {
          setSelectedEntity({ type: 'landmark', data: site });
        });
      });
    }

    if (!strictRealCoordinates && currentOfficerLocation) {
      const icon = L.divIcon({
        className: 'custom-div-icon',
        html: `
          <div class="relative flex items-center justify-center">
            <span class="absolute inline-flex h-10 w-10 rounded-full bg-sky-400 opacity-50 animate-ping"></span>
            <div class="w-5 h-5 rounded-full bg-sky-600 border-2 border-white shadow-md flex items-center justify-center">
              <svg class="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/></svg>
            </div>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      const marker = L.marker([currentOfficerLocation.lat, currentOfficerLocation.lng], { icon }).addTo(markerGroup);
      marker.on('click', () => {
        setSelectedEntity({
          type: 'officer',
          data: {
            id: 'local-client',
            name: 'YOU (Patrol Node)',
            badgeNumber: 'Local Client',
            role: 'officer',
            status: 'Available',
            battery: 100,
            teamId: null,
            lat: currentOfficerLocation.lat,
            lng: currentOfficerLocation.lng
          }
        });
      });
    }
  }, [districts, officers, incidents, currentOfficerLocation, districtCenter, strictRealCoordinates, onSelectIncident]);

  const syncedCount = districts.filter(d => d.status === 'online').length;
  const offlineCount = districts.filter(d => d.status !== 'online').length;
  const activeIncidentsWithCoords = incidents.filter(
    i => i.status !== 'Closed' && i.status !== 'Resolved' && i.locationLat != null && i.locationLng != null
  ).length;
  const totalActiveIncidents = incidents.filter(i => i.status !== 'Closed' && i.status !== 'Resolved').length;

  const wrapperClass = isExpanded
    ? 'fixed inset-4 z-[9999] bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl flex flex-col'
    : 'relative w-full h-full bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden shadow-xs flex flex-col';

  return (
    <div className={wrapperClass}>
      {selectedEntity && (
        <div className="absolute bottom-4 left-4 z-[1000] bg-white/95 border border-slate-200 text-slate-800 rounded-2xl shadow-2xl p-4 w-72 max-w-[calc(100%-32px)] font-mono text-xs flex flex-col justify-between gap-2.5 backdrop-blur-md">
          <div className="flex justify-between items-start border-b border-slate-200 pb-2 gap-2">
            <div className="min-w-0">
              <span className="text-[9px] text-slate-500 font-extrabold uppercase tracking-wider block">
                {selectedEntity.type} Information
              </span>
              <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight truncate mt-0.5 font-sans">
                {selectedEntity.type === 'district' && `${selectedEntity.data.name} (${selectedEntity.data.code})`}
                {selectedEntity.type === 'officer' && selectedEntity.data.name}
                {selectedEntity.type === 'incident' && selectedEntity.data.title}
                {selectedEntity.type === 'landmark' && selectedEntity.data.name}
              </h4>
            </div>
            <button
              type="button"
              onClick={() => setSelectedEntity(null)}
              aria-label="Close map entity popover"
              className="text-slate-400 hover:text-slate-800 p-1 hover:bg-slate-100 rounded transition font-sans font-bold cursor-pointer"
            >
              ✕
            </button>
          </div>

          <div className="space-y-1.5 text-slate-600 text-[11px]">
            {selectedEntity.type === 'district' && (
              <>
                <div className="flex justify-between">
                  <span>STATUS:</span>
                  <span
                    className={`font-bold uppercase ${
                      selectedEntity.data.status === 'online' ? 'text-emerald-600' : 'text-amber-600'
                    }`}
                  >
                    {selectedEntity.data.status === 'online'
                      ? 'Cloud Synced'
                      : selectedEntity.data.status === 'provisioning'
                        ? 'Provisioning'
                        : 'Local / Offline'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>OFFICERS:</span>
                  <span className="font-bold text-slate-800">
                    {selectedEntity.data.onlineOfficers}/{selectedEntity.data.totalOfficers}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>INCIDENTS / SOS:</span>
                  <span className="font-bold text-red-600">
                    {selectedEntity.data.activeIncidents} ({selectedEntity.data.sosCount} SOS)
                  </span>
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 border-t border-slate-200 pt-1.5">
                  <span>LAST SYNC:</span>
                  <span>
                    {selectedEntity.data.lastSyncAt
                      ? new Date(selectedEntity.data.lastSyncAt).toLocaleTimeString()
                      : 'Never Synced'}
                  </span>
                </div>
              </>
            )}

            {selectedEntity.type === 'officer' && (
              <>
                <div className="flex justify-between">
                  <span>BADGE ID:</span>
                  <span className="text-sky-600 font-bold">{selectedEntity.data.badgeNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span>STATUS:</span>
                  <span
                    className={`font-bold ${
                      selectedEntity.data.status === 'Emergency'
                        ? 'text-red-600'
                        : selectedEntity.data.status === 'Offline'
                          ? 'text-slate-500'
                          : 'text-emerald-600'
                    }`}
                  >
                    {selectedEntity.data.status}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span>BATTERY:</span>
                  <span className="font-bold font-mono">{selectedEntity.data.battery}%</span>
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 border-t border-slate-200 pt-1.5">
                  <span>GPS:</span>
                  <span>
                    {selectedEntity.data.lat?.toFixed(4)}, {selectedEntity.data.lng?.toFixed(4)}
                  </span>
                </div>
              </>
            )}

            {selectedEntity.type === 'incident' && (
              <>
                <div className="flex justify-between">
                  <span>PRIORITY:</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-sm font-bold text-[10px] ${
                      selectedEntity.data.priority === 'P1'
                        ? 'bg-red-50 text-red-600 border border-red-200'
                        : 'bg-amber-50 text-amber-600 border border-amber-200'
                    }`}
                  >
                    {selectedEntity.data.priority}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>STATE:</span>
                  <span className="text-sky-600 font-bold uppercase">{selectedEntity.data.status}</span>
                </div>
                {selectedEntity.data.description && (
                  <p className="text-[10px] text-slate-500 leading-relaxed bg-slate-50 p-2 rounded border border-slate-200 font-sans">
                    {selectedEntity.data.description}
                  </p>
                )}
              </>
            )}

            {selectedEntity.type === 'landmark' && (
              <>
                <p className="text-[11px] leading-relaxed text-slate-500 font-sans">
                  {selectedEntity.data.desc}
                </p>
                <div className="flex justify-between text-[10px] text-slate-400 border-t border-slate-200 pt-1.5">
                  <span>GPS POSITION:</span>
                  <span>
                    {selectedEntity.data.lat.toFixed(4)} N, {selectedEntity.data.lng.toFixed(4)} E
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="border-t border-slate-200 pt-2.5 flex flex-wrap gap-2 font-sans font-bold">
            {selectedEntity.type === 'district' && onOpenDistrictHub && (
              <button
                type="button"
                onClick={() => onOpenDistrictHub(selectedEntity.data.id)}
                className="flex-1 py-1.5 px-2 bg-[#0E5AD6] hover:bg-[#0B47AD] text-[10px] text-white font-black uppercase rounded-lg cursor-pointer transition"
              >
                Open Hub
              </button>
            )}
            {selectedEntity.type === 'incident' && onOpenIncident && (
              <button
                type="button"
                onClick={() => onOpenIncident(selectedEntity.data)}
                className="flex-1 py-1.5 px-2 bg-[#0E5AD6] hover:bg-[#0B47AD] text-[10px] text-white font-black uppercase rounded-lg cursor-pointer transition"
              >
                Open Incident
              </button>
            )}
            {onInspectIn3D && (
              <button
                type="button"
                onClick={() => {
                  if (selectedEntity.type === 'district') {
                    onInspectIn3D({
                      id: selectedEntity.data.id,
                      name: selectedEntity.data.name,
                      lat: selectedEntity.data.centerLat,
                      lng: selectedEntity.data.centerLng,
                      kind: 'station',
                      levels: 4,
                      description: `${selectedEntity.data.name} (${selectedEntity.data.code})`
                    });
                  } else if (selectedEntity.type === 'incident') {
                    onInspectIn3D({
                      id: selectedEntity.data.id,
                      name: selectedEntity.data.title,
                      lat: selectedEntity.data.lat,
                      lng: selectedEntity.data.lng,
                      kind: 'incident',
                      levels: 4,
                      description: selectedEntity.data.description
                    });
                  } else if (selectedEntity.type === 'officer') {
                    onInspectIn3D({
                      id: selectedEntity.data.id,
                      name: selectedEntity.data.name,
                      lat: selectedEntity.data.lat ?? districtCenter?.lat ?? 17.08799,
                      lng: selectedEntity.data.lng ?? districtCenter?.lng ?? 82.06686,
                      kind: 'officer',
                      levels: 4,
                      description: selectedEntity.data.badgeNumber
                    });
                  } else {
                    const lm = selectedEntity.data;
                    const resolvedKind =
                      lm.kind || (lm.type === 'police' || lm.type === 'hq' ? 'station' : 'landmark');
                    onInspectIn3D({
                      id: lm.id,
                      name: lm.name,
                      lat: lm.lat,
                      lng: lm.lng,
                      kind: resolvedKind,
                      levels: lm.levels || 4,
                      description: lm.desc || ''
                    });
                  }
                }}
                className="flex-1 py-1.5 px-2 bg-indigo-600 hover:bg-indigo-700 text-[10px] text-white font-black uppercase rounded-lg cursor-pointer transition"
              >
                3D Map
              </button>
            )}
            {selectedEntity.type === 'officer' && isCommandCenter && selectedIncidentId && onDispatchOfficer && (
              <button
                type="button"
                onClick={() => {
                  onDispatchOfficer(selectedEntity.data.id, selectedIncidentId);
                  setSelectedEntity(null);
                }}
                className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-[10px] text-white font-bold rounded-lg cursor-pointer transition"
              >
                DISPATCH
              </button>
            )}
          </div>
        </div>
      )}

      <div ref={mapContainerRef} className="flex-1 w-full h-full bg-slate-900/10 z-0" />

      <div className="absolute top-3 right-3 z-[500] flex flex-wrap items-center gap-1.5">
        <div className="hidden sm:flex items-center gap-0.5 bg-white/95 backdrop-blur-md p-0.5 rounded-xl border border-slate-200 shadow-sm">
          {(Object.keys(BASEMAP_URLS) as BasemapKind[]).map(key => (
            <button
              key={key}
              type="button"
              onClick={() => setBasemap(key)}
              className={`px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition ${
                basemap === key ? 'bg-[#0E5AD6] text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {BASEMAP_URLS[key].label}
            </button>
          ))}
        </div>

        {(isCommandCenter || districts.length > 0) && (
          <button
            type="button"
            onClick={() => {
              const map = mapRef.current;
              if (!map) return;
              const pts: L.LatLngExpression[] = [];
              districts.forEach(d => {
                if (d.centerLat != null && d.centerLng != null) pts.push([d.centerLat, d.centerLng]);
              });
              officers.forEach(off => {
                if (off.location?.latitude != null && off.location?.longitude != null) {
                  pts.push([off.location.latitude, off.location.longitude]);
                }
              });
              incidents.forEach(inc => {
                if (inc.locationLat != null && inc.locationLng != null) {
                  pts.push([inc.locationLat, inc.locationLng]);
                }
              });
              if (pts.length === 1) map.setView(pts[0], 13);
              else if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [42, 42], maxZoom: districts.length > 0 ? 8 : 15 });
              else if (districtCenter) map.setView([districtCenter.lat, districtCenter.lng], 13);
              else map.setView([15.95, 80.35], 6);
            }}
            className="px-2.5 py-1.5 bg-white/95 hover:bg-slate-50 border border-slate-200 text-slate-800 rounded-xl shadow-sm transition cursor-pointer flex items-center gap-1 text-[10px] font-bold"
            title="Fit All Nodes & Active Units"
          >
            <RadioTower className="w-3.5 h-3.5 text-emerald-600" />
            <span>{districts.length > 0 ? 'Fit AP' : 'Fit Units'}</span>
          </button>
        )}

        {currentOfficerLocation && !strictRealCoordinates && (
          <button
            type="button"
            onClick={() => {
              if (mapRef.current) {
                mapRef.current.setView([currentOfficerLocation.lat, currentOfficerLocation.lng], 15);
              }
            }}
            className="px-2.5 py-1.5 bg-white/95 hover:bg-slate-50 border border-slate-200 text-slate-800 rounded-xl shadow-sm transition cursor-pointer flex items-center gap-1 text-[10px] font-bold"
            title="Recenter Map on My Location"
          >
            <MapPin className="w-3.5 h-3.5 text-sky-600" />
            <span>My Location</span>
          </button>
        )}

        {isExpandable && (
          <button
            type="button"
            onClick={() => setIsExpanded(prev => !prev)}
            aria-label={isExpanded ? 'Collapse operational map' : 'Expand operational map'}
            title={isExpanded ? 'Collapse Map' : 'Expand Map'}
            className="p-1.5 bg-white/95 hover:bg-slate-50 border border-slate-200 text-slate-800 rounded-xl shadow-sm transition cursor-pointer"
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {(districts.length > 0 || showApDistrictGeoJson) && !selectedEntity && (
        <div className="absolute bottom-3 right-3 z-[500] bg-slate-950/85 backdrop-blur-md border border-slate-700/80 text-white rounded-xl px-3 py-2 text-[11px] space-y-1 shadow-lg">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-emerald-400/30" />
            <span className="font-medium">Cloud Synced ({syncedCount})</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-amber-400/30" />
            <span className="font-medium">Local / Offline ({offlineCount})</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-red-500/40" />
            <span className="font-medium">
              Active Incident ({totalActiveIncidents}
              {activeIncidentsWithCoords < totalActiveIncidents ? `, ${activeIncidentsWithCoords} Geo` : ''})
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
