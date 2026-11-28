'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Compass, MapPin, Mountain, Plus, RefreshCw, ShieldAlert } from 'lucide-react';
import { HUDPanel } from '../ui/HUDPanel';
import { IntelligenceLeafletMap, MapMarkerSpec } from './IntelligenceLeafletMap';
import { fetchBatchWeather, PointWeatherTelemetry } from '../../services/intelligence/OpenMeteoService';
import { sampleTerrainAndSlope, TerrainSample } from '../../services/intelligence/TerrariumElevationService';

interface LandslideZone {
  id: string;
  name: string;
  region: 'AP Eastern Ghats' | 'NER Corridor';
  stateOrDistrict: string;
  lat: number;
  lng: number;
  vulnerableRoad: string;
  historicalEvents: string;
  baseSlopeFallbackDeg: number;
}

interface FieldLandslideReport {
  id: string;
  zoneId: string;
  note: string;
  severity: 'High' | 'Moderate' | 'Observation';
  lat: number;
  lng: number;
  reportedAt: number;
}

const LANDSLIDE_CORRIDORS: LandslideZone[] = [
  { id: 'araku-ghat', name: 'Araku–Ananthagiri Ghat (SH-38)', region: 'AP Eastern Ghats', stateOrDistrict: 'Alluri Sitharama Raju, AP', lat: 18.235, lng: 83.005, vulnerableRoad: 'SH-38 Araku Valley Ghat Road & Kothavalasa Rail Line', historicalEvents: '6 rockfalls (2018–2024)', baseSlopeFallbackDeg: 18.5 },
  { id: 'lambasingi', name: 'Lambasingi–Chintapalli Ghat', region: 'AP Eastern Ghats', stateOrDistrict: 'Alluri Sitharama Raju, AP', lat: 17.819, lng: 82.491, vulnerableRoad: 'Narsipatnam–Chintapalli State Highway', historicalEvents: '4 slope slips (2020–2023)', baseSlopeFallbackDeg: 16.2 },
  { id: 'maredumilli', name: 'Maredumilli–Chinturu Hill Section', region: 'AP Eastern Ghats', stateOrDistrict: 'Polavaram / ASR, AP', lat: 17.615, lng: 81.708, vulnerableRoad: 'NH-365BB Bhadrachalam–Rampachodavaram Ghat', historicalEvents: '7 mudslides (2019–2024)', baseSlopeFallbackDeg: 15.8 },
  { id: 'tirumala', name: 'Tirumala Ghat Road (Alipiri–2nd Ghat)', region: 'AP Eastern Ghats', stateOrDistrict: 'Tirupati, AP', lat: 13.669, lng: 79.354, vulnerableRoad: 'Tirumala Pilgrim Up-Ghat Highway (boulder zones)', historicalEvents: '5 boulder slips (2021 Cyclone)', baseSlopeFallbackDeg: 19.4 },
  { id: 'indrakeeladri', name: 'Indrakeeladri & Mogalrajpuram Hills', region: 'AP Eastern Ghats', stateOrDistrict: 'NTR (Vijayawada), AP', lat: 16.515, lng: 80.606, vulnerableRoad: 'Kanaka Durga Ghat & Retaining Wall Settlements', historicalEvents: '4 urban hill rockfalls (2020–2024)', baseSlopeFallbackDeg: 14.0 },
  { id: 'sikkim-nh10', name: 'Gangtok–Chungthang NH-10 Belt', region: 'NER Corridor', stateOrDistrict: 'Sikkim (NER)', lat: 27.516, lng: 88.622, vulnerableRoad: 'NH-10 Teesta Valley Highway', historicalEvents: '22+ severe slips (GLOF & Monsoon)', baseSlopeFallbackDeg: 28.0 },
  { id: 'meghalaya-nh6', name: 'Sonapur Tunnel & Jowai NH-6 Hills', region: 'NER Corridor', stateOrDistrict: 'Meghalaya (NER)', lat: 25.106, lng: 92.362, vulnerableRoad: 'NH-6 Barak Valley Connectivity', historicalEvents: '18+ recurring mudslides', baseSlopeFallbackDeg: 24.5 },
  { id: 'assam-haflong', name: 'Haflong–Lumding Dima Hasao Hills', region: 'NER Corridor', stateOrDistrict: 'Assam (NER)', lat: 25.165, lng: 93.018, vulnerableRoad: 'Lumding–Silchar Hill Rail & NH-27', historicalEvents: '15+ monsoon track breaches', baseSlopeFallbackDeg: 22.0 }
];

const REPORTS_STORAGE_KEY = 'hero_landslide_field_reports_v1';

interface LandslideIntelligenceProps {
  onInspectIn3D?: (target: { id: string; name: string; lat: number; lng: number; kind: 'incident' | 'landmark'; description: string }) => void;
}

export const LandslideIntelligence: React.FC<LandslideIntelligenceProps> = ({ onInspectIn3D }) => {
  const [regionFilter, setRegionFilter] = useState<'ALL' | 'AP Eastern Ghats' | 'NER Corridor'>('ALL');
  const [selectedId, setSelectedId] = useState<string>('araku-ghat');
  const [weatherByZone, setWeatherByZone] = useState<Record<string, PointWeatherTelemetry>>({});
  const [terrainByZone, setTerrainByZone] = useState<Record<string, TerrainSample>>({});
  const [fieldReports, setFieldReports] = useState<FieldLandslideReport[]>([]);
  const [reportNote, setReportNote] = useState<string>('');
  const [reportSeverity, setReportSeverity] = useState<'High' | 'Moderate' | 'Observation'>('Moderate');
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(REPORTS_STORAGE_KEY);
      if (raw) setFieldReports(JSON.parse(raw));
    } catch {}
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [wList, tList] = await Promise.all([
        fetchBatchWeather(LANDSLIDE_CORRIDORS.map(z => ({ lat: z.lat, lng: z.lng }))).catch(() => []),
        Promise.all(LANDSLIDE_CORRIDORS.map(z => sampleTerrainAndSlope(z.lat, z.lng, 600)))
      ]);
      const wMap: Record<string, PointWeatherTelemetry> = {};
      const tMap: Record<string, TerrainSample> = {};
      LANDSLIDE_CORRIDORS.forEach((z, i) => {
        if (wList[i]) wMap[z.id] = wList[i];
        if (tList[i]) tMap[z.id] = tList[i];
      });
      setWeatherByZone(wMap);
      setTerrainByZone(tMap);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const visibleZones = useMemo(() => {
    return LANDSLIDE_CORRIDORS.filter(z => regionFilter === 'ALL' || z.region === regionFilter).map(z => {
      const w = weatherByZone[z.id];
      const t = terrainByZone[z.id];
      const slope = t && t.source === 'aws-terrarium' && t.slopeDegrees > 1 ? t.slopeDegrees : z.baseSlopeFallbackDeg;
      const rain72 = w?.next72hRainMm ?? 0;
      const soilPct = (w?.soilMoistureTop ?? 0.25) * 100;
      const risk = Math.min(100, Math.round((slope / 30) * 40 + (rain72 / 120) * 35 + (soilPct / 45) * 25));
      const tier = risk >= 70 ? 'CRITICAL' : risk >= 50 ? 'HIGH' : risk >= 30 ? 'MODERATE' : 'LOW';
      return { zone: z, weather: w, terrain: t, slope, rain72, soilPct, risk, tier };
    });
  }, [regionFilter, weatherByZone, terrainByZone]);

  const activeEval = useMemo(
    () => visibleZones.find(v => v.zone.id === selectedId) || visibleZones[0],
    [visibleZones, selectedId]
  );

  const handleAddFieldReport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportNote.trim() || !activeEval) return;
    const nextReport: FieldLandslideReport = {
      id: `ls-${Date.now()}`,
      zoneId: activeEval.zone.id,
      note: reportNote.trim(),
      severity: reportSeverity,
      lat: activeEval.zone.lat,
      lng: activeEval.zone.lng,
      reportedAt: Date.now()
    };
    const next = [nextReport, ...fieldReports];
    setFieldReports(next);
    setReportNote('');
    try {
      localStorage.setItem(REPORTS_STORAGE_KEY, JSON.stringify(next));
    } catch {}
  };

  const markers: MapMarkerSpec[] = useMemo(() => {
    const zoneMarkers: MapMarkerSpec[] = visibleZones.map(v => ({
      id: `ls-z-${v.zone.id}`,
      lat: v.zone.lat,
      lng: v.zone.lng,
      title: `${v.zone.name} (${v.tier})`,
      subtitle: `Risk ${v.risk}/100 • Slope ${v.slope.toFixed(1)}° • Soil ${v.soilPct.toFixed(0)}% • ${v.zone.vulnerableRoad}`,
      badge: `${v.risk}`,
      color: v.tier === 'CRITICAL' ? '#dc2626' : v.tier === 'HIGH' ? '#ea580c' : v.tier === 'MODERATE' ? '#f59e0b' : '#10b981',
      radius: v.zone.id === selectedId ? 14 : 11,
      pulse: v.tier === 'CRITICAL' || v.tier === 'HIGH',
      onClick: () => setSelectedId(v.zone.id)
    }));

    const reportMarkers: MapMarkerSpec[] = fieldReports.map(r => ({
      id: r.id,
      lat: r.lat,
      lng: r.lng,
      title: `Field Report (${r.severity})`,
      subtitle: `${r.note} • ${new Date(r.reportedAt).toLocaleString()}`,
      badge: 'RPT',
      color: r.severity === 'High' ? '#991b1b' : '#0284c7',
      radius: 9
    }));

    return [...zoneMarkers, ...reportMarkers];
  }, [visibleZones, fieldReports, selectedId]);

  const mapCenter: [number, number] =
    regionFilter === 'NER Corridor'
      ? [25.8, 90.8]
      : [activeEval?.zone.lat ?? 17.5, activeEval?.zone.lng ?? 81.8];

  return (
    <div className="space-y-5">
      <HUDPanel
        title="AI-Based Landslide Risk Monitoring (AP Eastern Ghats & NER)"
        subtitle="Terrain Slope (AWS DEM) + Soil Saturation + Rainfall Triggers + Historical Catalog + Geo-Tagged Field Reports"
        statusColor={activeEval?.tier === 'CRITICAL' ? 'red' : activeEval?.tier === 'HIGH' ? 'amber' : 'cyan'}
        headerRight={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-[10px] font-black uppercase">
              {(['ALL', 'AP Eastern Ghats', 'NER Corridor'] as const).map(reg => (
                <button
                  key={reg}
                  type="button"
                  onClick={() => setRegionFilter(reg)}
                  className={`px-2.5 py-1 rounded-lg cursor-pointer ${
                    regionFilter === reg ? 'bg-white text-sky-700 shadow-xs' : 'text-slate-500'
                  }`}
                >
                  {reg === 'ALL' ? 'All Zones' : reg}
                </button>
              ))}
            </div>
            {onInspectIn3D && activeEval && (
              <button
                type="button"
                onClick={() =>
                  onInspectIn3D({
                    id: activeEval.zone.id,
                    name: activeEval.zone.name,
                    lat: activeEval.zone.lat,
                    lng: activeEval.zone.lng,
                    kind: 'incident',
                    description: `Landslide Risk ${activeEval.risk}/100 • Slope ${activeEval.slope.toFixed(1)}° • ${activeEval.zone.vulnerableRoad}`
                  })
                }
                className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-[10px] font-black uppercase flex items-center gap-1 cursor-pointer"
              >
                <Compass className="w-3.5 h-3.5" />
                3D Slope
              </button>
            )}
            <button
              type="button"
              onClick={loadAll}
              className="p-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 cursor-pointer"
              title="Refresh Slope & Soil Telemetry"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        }
      >
        {activeEval && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
              <span className="text-[9px] font-black uppercase text-slate-400 block">ACTIVE CORRIDOR</span>
              <span className="font-black text-slate-800 block">{activeEval.zone.name}</span>
              <span className="text-[10px] text-slate-500">{activeEval.zone.stateOrDistrict}</span>
            </div>
            <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200">
              <span className="text-[9px] font-black uppercase text-emerald-700 block">SLOPE &amp; ELEVATION</span>
              <span className="text-base font-black font-mono text-emerald-800 flex items-center gap-1">
                <Mountain className="w-4 h-4" />
                {activeEval.slope.toFixed(1)}° • {activeEval.terrain?.elevationMeters ?? '--'}m
              </span>
            </div>
            <div className="p-3 rounded-2xl bg-sky-50 border border-sky-200">
              <span className="text-[9px] font-black uppercase text-sky-700 block">72H RAIN &amp; SOIL MOISTURE</span>
              <span className="text-base font-black font-mono text-sky-900">
                {activeEval.rain72}mm • {activeEval.soilPct.toFixed(0)}%
              </span>
            </div>
            <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200">
              <span className="text-[9px] font-black uppercase text-amber-700 block">SUSCEPTIBILITY &amp; HISTORY</span>
              <span className="text-base font-black text-amber-900">
                {activeEval.risk}/100 ({activeEval.tier})
              </span>
              <span className="text-[9.5px] text-amber-700 block">{activeEval.zone.historicalEvents}</span>
            </div>
          </div>
        )}
      </HUDPanel>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 h-[460px]">
          <IntelligenceLeafletMap
            center={mapCenter}
            zoom={regionFilter === 'NER Corridor' ? 6 : 7}
            baseStyle="topo"
            markers={markers}
          />
        </div>

        <HUDPanel title="Geo-Tagged Field Reports & Corridor List" subtitle="Add Slope Crack / Boulder Observation" className="h-[460px]">
          <div className="flex flex-col h-full gap-3 text-xs">
            <form onSubmit={handleAddFieldReport} className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-slate-600 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-sky-600" />
                  Log Geo-Tagged Field Report
                </span>
                <select
                  aria-label="Field report severity"
                  value={reportSeverity}
                  onChange={e => setReportSeverity(e.target.value as any)}
                  className="px-2 py-0.5 rounded-lg border border-slate-200 bg-white text-[10px] font-bold"
                >
                  <option value="Observation">Observation</option>
                  <option value="Moderate">Moderate Slip</option>
                  <option value="High">High Hazard</option>
                </select>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  placeholder={`Report near ${activeEval?.zone.name.split(' ')[0] || 'Ghat'}...`}
                  value={reportNote}
                  onChange={e => setReportNote(e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs focus:outline-none focus:border-sky-500"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-black uppercase text-[10px] flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Log
                </button>
              </div>
            </form>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {visibleZones.map(v => (
                <button
                  key={v.zone.id}
                  type="button"
                  onClick={() => setSelectedId(v.zone.id)}
                  className={`w-full text-left p-2.5 rounded-2xl border transition cursor-pointer ${
                    v.zone.id === selectedId
                      ? 'bg-sky-50 border-sky-300'
                      : 'bg-white border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-black text-slate-800">{v.zone.name}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[9px] font-black ${
                        v.tier === 'CRITICAL'
                          ? 'bg-red-100 text-red-700'
                          : v.tier === 'HIGH'
                            ? 'bg-orange-100 text-orange-700'
                            : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {v.risk} · {v.tier}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{v.zone.vulnerableRoad}</div>
                </button>
              ))}

              {fieldReports.length > 0 && (
                <div className="pt-2 border-t border-slate-200 space-y-1.5">
                  <span className="text-[9px] font-black uppercase text-slate-400 block">RECENT GEO-TAGGED REPORTS</span>
                  {fieldReports.slice(0, 5).map(r => (
                    <div key={r.id} className="p-2 rounded-xl bg-amber-50/70 border border-amber-200 text-[10.5px]">
                      <div className="font-bold text-slate-800 flex items-center gap-1">
                        <ShieldAlert className="w-3 h-3 text-amber-600" />
                        [{r.severity}] {r.note}
                      </div>
                      <div className="text-[9px] font-mono text-slate-500">
                        {r.lat.toFixed(3)}, {r.lng.toFixed(3)} • {new Date(r.reportedAt).toLocaleTimeString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </HUDPanel>
      </div>
    </div>
  );
};
