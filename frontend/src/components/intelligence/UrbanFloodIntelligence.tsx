'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Compass, Navigation, RefreshCw, Route } from 'lucide-react';
import { HUDPanel } from '../ui/HUDPanel';
import { IntelligenceLeafletMap, MapMarkerSpec, MapPolylineSpec } from './IntelligenceLeafletMap';
import { fetchPointWeather, PointWeatherTelemetry } from '../../services/intelligence/OpenMeteoService';
import { sampleTerrainAndSlope } from '../../services/intelligence/TerrariumElevationService';

interface UrbanCorridor {
  id: string;
  city: string;
  lat: number;
  lng: number;
  drainCapacityMmHr: number;
  segments: Array<{
    id: string;
    name: string;
    role: 'drain_choke' | 'low_road' | 'safe_evac';
    thresholdDepthM: number;
    path: Array<[number, number]>;
    note: string;
  }>;
}

const AP_URBAN_HUBS: UrbanCorridor[] = [
  {
    id: 'eluru',
    city: 'Eluru Urban (Tammileru & Eluru Canal)',
    lat: 16.7107,
    lng: 81.0952,
    drainCapacityMmHr: 32,
    segments: [
      { id: 'elr-1', name: 'Powerpeta Railway Underpass', role: 'low_road', thresholdDepthM: 0.4, path: [[16.709, 81.089], [16.711, 81.095], [16.713, 81.101]], note: 'Chronically waterlogged underpass during heavy rain' },
      { id: 'elr-2', name: 'Tangellamudi Canal Bund Drain', role: 'drain_choke', thresholdDepthM: 0.8, path: [[16.718, 81.085], [16.721, 81.096], [16.724, 81.108]], note: 'Tammileru overflow backwater zone' },
      { id: 'elr-3', name: 'NH-16 Bypass Emergency Spine', role: 'safe_evac', thresholdDepthM: 2.2, path: [[16.695, 81.072], [16.715, 81.082], [16.735, 81.098]], note: 'Elevated highway — Safe Ambulance/Police Route' }
    ]
  },
  {
    id: 'vijayawada',
    city: 'Vijayawada (Budameru & Krishnalanka)',
    lat: 16.5062,
    lng: 80.648,
    drainCapacityMmHr: 35,
    segments: [
      { id: 'vja-1', name: 'Ajit Singh Nagar / Budameru Lowlands', role: 'low_road', thresholdDepthM: 0.5, path: [[16.541, 80.628], [16.535, 80.641], [16.529, 80.654]], note: 'Budameru rivulet urban spill corridor' },
      { id: 'vja-2', name: 'Benz Circle Underpass & MG Road', role: 'drain_choke', thresholdDepthM: 0.9, path: [[16.498, 80.642], [16.499, 80.654], [16.501, 80.666]], note: 'High-density stormwater trunk junction' },
      { id: 'vja-3', name: 'Inner Ring Elevated Corridor', role: 'safe_evac', thresholdDepthM: 2.4, path: [[16.518, 80.612], [16.522, 80.648], [16.519, 80.682]], note: 'Clear High-Ground Emergency Route' }
    ]
  },
  {
    id: 'kakinada',
    city: 'Kakinada (Salt Creek & Bhanugudi)',
    lat: 16.974,
    lng: 82.245,
    drainCapacityMmHr: 38,
    segments: [
      { id: 'kkd-1', name: 'Jagannaickpur Salt Creek Margin', role: 'low_road', thresholdDepthM: 0.4, path: [[16.942, 82.231], [16.948, 82.241], [16.955, 82.249]], note: 'Tidal backwater + storm surge choke point' },
      { id: 'kkd-2', name: 'Bhanugudi–Main Road Drain Trunk', role: 'drain_choke', thresholdDepthM: 0.9, path: [[16.968, 82.235], [16.978, 82.241], [16.987, 82.247]], note: 'Main commercial drainage bottleneck' },
      { id: 'kkd-3', name: 'ADB Road Elevated Evacuation Link', role: 'safe_evac', thresholdDepthM: 2.3, path: [[16.992, 82.212], [17.012, 82.185], [17.035, 82.155]], note: 'Safe Expressway Corridor to Samalkot/Surampalem' }
    ]
  },
  {
    id: 'visakhapatnam',
    city: 'Visakhapatnam (Gajuwaka & Poorna Market)',
    lat: 17.7231,
    lng: 83.3013,
    drainCapacityMmHr: 42,
    segments: [
      { id: 'vzg-1', name: 'Convent Junction–Port Low Basin', role: 'low_road', thresholdDepthM: 0.5, path: [[17.698, 83.285], [17.703, 83.295], [17.709, 83.304]], note: 'Low-lying coastal stormwater basin' },
      { id: 'vzg-2', name: 'Gajuwaka Old NH-16 Drain', role: 'drain_choke', thresholdDepthM: 0.9, path: [[17.686, 83.208], [17.692, 83.219], [17.699, 83.229]], note: 'Hill-runoff urban culvert' },
      { id: 'vzg-3', name: 'Beach Road & MVP Elevated Spine', role: 'safe_evac', thresholdDepthM: 2.3, path: [[17.718, 83.331], [17.734, 83.339], [17.748, 83.344]], note: 'Primary Coastal Emergency Access Route' }
    ]
  },
  {
    id: 'guntur',
    city: 'Guntur (Brodipet & Nallapadu)',
    lat: 16.3067,
    lng: 80.4365,
    drainCapacityMmHr: 30,
    segments: [
      { id: 'gnt-1', name: 'Kankarakunta Railway Underbridge', role: 'low_road', thresholdDepthM: 0.35, path: [[16.298, 80.432], [16.303, 80.438], [16.308, 80.443]], note: 'Frequent flash waterlogging (>35cm)' },
      { id: 'gnt-2', name: 'Nallacheruvu Drain Trunk', role: 'drain_choke', thresholdDepthM: 0.85, path: [[16.288, 80.442], [16.295, 80.449], [16.302, 80.456]], note: 'Silt-restricted city drain' },
      { id: 'gnt-3', name: 'Inner Ring Road (Autonagar–Pattabhipuram)', role: 'safe_evac', thresholdDepthM: 2.2, path: [[16.318, 80.408], [16.325, 80.434], [16.319, 80.461]], note: 'Passable Emergency Ring Route' }
    ]
  },
  {
    id: 'tirupati',
    city: 'Tirupati (Kapila Theertham & Town)',
    lat: 13.6288,
    lng: 79.4192,
    drainCapacityMmHr: 36,
    segments: [
      { id: 'tpt-1', name: 'Leelamahal–Railway Underpass', role: 'low_road', thresholdDepthM: 0.45, path: [[13.626, 79.412], [13.629, 79.420], [13.631, 79.428]], note: 'Seshachalam runoff underpass' },
      { id: 'tpt-2', name: 'Kapila Theertham Waterfall Outfall Drain', role: 'drain_choke', thresholdDepthM: 0.8, path: [[13.649, 79.419], [13.642, 79.424], [13.636, 79.429]], note: 'Fast hill-to-city stormwater channel' },
      { id: 'tpt-3', name: 'Garuda Elevated Highway Spine', role: 'safe_evac', thresholdDepthM: 2.4, path: [[13.618, 79.398], [13.624, 79.422], [13.628, 79.448]], note: 'Elevated Emergency Dispatch Corridor' }
    ]
  }
];

interface UrbanFloodIntelligenceProps {
  onInspectIn3D?: (target: { id: string; name: string; lat: number; lng: number; kind: 'incident' | 'station'; floor?: string; districtName?: string; description: string }) => void;
}

export const UrbanFloodIntelligence: React.FC<UrbanFloodIntelligenceProps> = ({ onInspectIn3D }) => {
  const [selectedCityId, setSelectedCityId] = useState<string>('eluru');
  const [waterDepthM, setWaterDepthM] = useState<number>(0.7);
  const [weather, setWeather] = useState<PointWeatherTelemetry | null>(null);
  const [microElevM, setMicroElevM] = useState<number | null>(null);
  const [kakinadaRoadsGj, setKakinadaRoadsGj] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const hub = useMemo(() => AP_URBAN_HUBS.find(u => u.id === selectedCityId) || AP_URBAN_HUBS[0], [selectedCityId]);

  const loadCityTelemetry = async () => {
    setLoading(true);
    try {
      const [w, t] = await Promise.all([
        fetchPointWeather(hub.lat, hub.lng).catch(() => null),
        sampleTerrainAndSlope(hub.lat, hub.lng, 18)
      ]);
      setWeather(w);
      setMicroElevM(t.elevationMeters);
      if (hub.id === 'kakinada' && !kakinadaRoadsGj) {
        fetch('/gis-3d/data/kakinada_roads.geojson')
          .then(r => (r.ok ? r.json() : null))
          .then(gj => gj && setKakinadaRoadsGj(gj))
          .catch(() => {});
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCityTelemetry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hub.id]);

  const { polylines, markers, floodedCount, safeCount } = useMemo(() => {
    let fCount = 0;
    let sCount = 0;
    const lines: MapPolylineSpec[] = [];
    const mks: MapMarkerSpec[] = [];

    hub.segments.forEach(seg => {
      const isFlooded = waterDepthM >= seg.thresholdDepthM;
      if (isFlooded) fCount++;
      else sCount++;

      const color = isFlooded ? '#ef4444' : seg.role === 'safe_evac' ? '#10b981' : '#f59e0b';
      lines.push({
        id: seg.id,
        positions: seg.path,
        color,
        weight: isFlooded ? 6 : 5,
        dashArray: isFlooded ? '8, 6' : undefined,
        title: `${seg.name} — ${isFlooded ? 'FLOODED / IMPASSABLE' : 'PASSABLE'}`,
        subtitle: `${seg.note} (Flood threshold ${seg.thresholdDepthM}m)`
      });

      const mid = seg.path[Math.floor(seg.path.length / 2)];
      mks.push({
        id: `umk-${seg.id}`,
        lat: mid[0],
        lng: mid[1],
        title: seg.name,
        subtitle: `${isFlooded ? 'Blocked at' : 'Safe up to'} ${seg.thresholdDepthM}m • ${seg.note}`,
        badge: isFlooded ? 'BLOCKED' : 'CLEAR',
        color,
        radius: 12,
        pulse: isFlooded
      });
    });

    return { polylines: lines, markers: mks, floodedCount: fCount, safeCount: sCount };
  }, [hub, waterDepthM]);

  return (
    <div className="space-y-5">
      <HUDPanel
        title="Urban Flood Nowcasting System"
        subtitle="Street-Level Waterlogging, Drainage Capacity, Micro-Topography & Emergency Route Identification"
        statusColor={floodedCount >= 2 ? 'red' : floodedCount === 1 ? 'amber' : 'green'}
        headerRight={
          <div className="flex items-center gap-2">
            {onInspectIn3D && (
              <button
                type="button"
                onClick={() =>
                  onInspectIn3D({
                    id: `urban-${hub.id}`,
                    name: `${hub.city} Flooded Zone (Safe Floors: Level 1+)`,
                    lat: hub.lat,
                    lng: hub.lng,
                    kind: 'incident',
                    floor: waterDepthM >= 1.2 ? '2' : '1',
                    districtName: hub.city.split(' ')[0],
                    description: `Simulated Street Water Depth ${waterDepthM.toFixed(1)}m • Ground floor submerged, upper levels safe`
                  })
                }
                className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-[10px] font-black uppercase flex items-center gap-1 cursor-pointer"
              >
                <Compass className="w-3.5 h-3.5" />
                Inspect Safe Floor in 3D
              </button>
            )}
            <button
              type="button"
              onClick={loadCityTelemetry}
              className="p-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 cursor-pointer"
              title="Refresh Urban Rain & DEM"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs items-center">
          <div>
            <label htmlFor="urban-city-select" className="text-[10px] font-black uppercase text-slate-500 block mb-1">
              AP Municipal Corridor
            </label>
            <select
              id="urban-city-select"
              value={selectedCityId}
              onChange={e => setSelectedCityId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 cursor-pointer"
            >
              {AP_URBAN_HUBS.map(u => (
                <option key={u.id} value={u.id}>
                  {u.city}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="urban-depth-slider" className="text-[10px] font-black uppercase text-slate-500 flex justify-between mb-1">
              <span>Street Waterlogging Depth</span>
              <span className="font-mono font-black text-sky-700">{waterDepthM.toFixed(1)} m</span>
            </label>
            <input
              id="urban-depth-slider"
              type="range"
              min={0.1}
              max={2.5}
              step={0.1}
              value={waterDepthM}
              onChange={e => setWaterDepthM(Number(e.target.value))}
              className="w-full cursor-pointer"
            />
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
            <span className="text-[9px] font-black uppercase text-slate-400 block">DRAINAGE vs LIVE RAIN</span>
            <span className="text-sm font-black font-mono text-slate-800">
              {hub.drainCapacityMmHr} mm/hr cap • {weather?.precipitationMm ?? 0} mm now
            </span>
            <span className="text-[9px] text-slate-500 block">DEM micro-elev: {microElevM ?? '--'} m AMSL</span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="bg-red-50 border border-red-200 rounded-xl p-2">
              <span className="text-[9px] font-black uppercase text-red-600 block">FLOODED ROADS</span>
              <span className="text-lg font-black text-red-700">{floodedCount}</span>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2">
              <span className="text-[9px] font-black uppercase text-emerald-600 block">SAFE ROUTES</span>
              <span className="text-lg font-black text-emerald-700">{safeCount}</span>
            </div>
          </div>
        </div>
      </HUDPanel>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 h-[440px]">
          <IntelligenceLeafletMap
            center={[hub.lat, hub.lng]}
            zoom={13}
            geojsonData={hub.id === 'kakinada' ? kakinadaRoadsGj : null}
            geojsonStyle={() => ({ color: '#64748b', weight: 1.2, opacity: 0.45 })}
            polylines={polylines}
            markers={markers}
          />
        </div>

        <HUDPanel title="Street Drainage & Emergency Route Feed" subtitle={hub.city} className="h-[440px]">
          <div className="space-y-3 overflow-y-auto h-full pr-1 text-xs">
            {hub.segments.map(seg => {
              const isFlooded = waterDepthM >= seg.thresholdDepthM;
              return (
                <div
                  key={seg.id}
                  className={`p-3 rounded-2xl border space-y-1.5 ${
                    isFlooded ? 'bg-red-50/80 border-red-200' : seg.role === 'safe_evac' ? 'bg-emerald-50/80 border-emerald-200' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black text-slate-800 flex items-center gap-1.5">
                      {isFlooded ? <AlertTriangle className="w-3.5 h-3.5 text-red-600" /> : <Route className="w-3.5 h-3.5 text-emerald-600" />}
                      {seg.name}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                        isFlooded ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'
                      }`}
                    >
                      {isFlooded ? 'IMPASSABLE' : 'OPEN'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600">{seg.note}</p>
                  <div className="text-[10px] font-mono text-slate-500">
                    Critical Threshold: {seg.thresholdDepthM}m • Simulated Depth: {waterDepthM.toFixed(1)}m
                  </div>
                </div>
              );
            })}
            <div className="p-2.5 rounded-xl bg-sky-50 border border-sky-200 text-[10.5px] text-sky-900 flex items-center gap-2">
              <Navigation className="w-4 h-4 text-sky-600 flex-shrink-0" />
              <span>
                Patrol dispatch automatically avoids roads flagged IMPASSABLE and routes emergency vehicles along OPEN elevated spines.
              </span>
            </div>
          </div>
        </HUDPanel>
      </div>
    </div>
  );
};
