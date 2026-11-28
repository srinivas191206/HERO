'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { CloudRain, Compass, Mountain, RefreshCw, ShieldAlert } from 'lucide-react';
import { HUDPanel } from '../ui/HUDPanel';
import { IntelligenceLeafletMap, MapMarkerSpec, MapPolygonSpec } from './IntelligenceLeafletMap';
import { fetchBatchWeather, PointWeatherTelemetry } from '../../services/intelligence/OpenMeteoService';
import { sampleTerrainAndSlope, TerrainSample } from '../../services/intelligence/TerrariumElevationService';

interface HillyBasin {
  id: string;
  name: string;
  district: string;
  lat: number;
  lng: number;
  historicalCount: number;
  lastMajorEvent: string;
  catchmentSpanDeg: number;
}

const AP_HILLY_BASINS: HillyBasin[] = [
  { id: 'araku', name: 'Araku Valley & Borra Streams', district: 'Alluri Sitharama Raju', lat: 18.3273, lng: 82.8775, historicalCount: 9, lastMajorEvent: 'Oct 2023 Cloudburst', catchmentSpanDeg: 0.08 },
  { id: 'paderu', name: 'Paderu Agency Matsyagadda Basin', district: 'Alluri Sitharama Raju', lat: 18.0833, lng: 82.6667, historicalCount: 11, lastMajorEvent: 'Sep 2022 Cyclone Surge', catchmentSpanDeg: 0.09 },
  { id: 'chintapalli', name: 'Chintapalli–Lambasingi Ridge', district: 'Alluri Sitharama Raju', lat: 17.8712, lng: 82.3536, historicalCount: 7, lastMajorEvent: 'Aug 2024 Orographic Rain', catchmentSpanDeg: 0.08 },
  { id: 'maredumilli', name: 'Maredumilli–Rampachodavaram Valleys', district: 'Polavaram / ASR', lat: 17.596, lng: 81.711, historicalCount: 12, lastMajorEvent: 'Jul 2024 Godavari Tributary Surge', catchmentSpanDeg: 0.09 },
  { id: 'seethampeta', name: 'Seethampeta–Vamsadhara Hills', district: 'Parvathipuram Manyam', lat: 18.678, lng: 83.751, historicalCount: 8, lastMajorEvent: 'Oct 2018 Titli Flash Flood', catchmentSpanDeg: 0.08 },
  { id: 'tirumala', name: 'Tirumala–Seshachalam Escarpment', district: 'Tirupati', lat: 13.6833, lng: 79.3472, historicalCount: 10, lastMajorEvent: 'Nov 2021 Swarnamukhi Flash Flood', catchmentSpanDeg: 0.07 },
  { id: 'horsley', name: 'Horsley Hills & Papagni Ravines', district: 'Annamayya', lat: 13.651, lng: 78.397, historicalCount: 5, lastMajorEvent: 'Nov 2021 Depression', catchmentSpanDeg: 0.07 },
  { id: 'veligonda', name: 'Veligonda–Nallamala Foothills', district: 'Markapuram / Prakasam', lat: 15.63, lng: 79.02, historicalCount: 6, lastMajorEvent: 'Sep 2020 Gundlakamma Surge', catchmentSpanDeg: 0.08 }
];

interface EvaluatedBasin {
  basin: HillyBasin;
  weather?: PointWeatherTelemetry;
  terrain: TerrainSample;
  riskScore: number;
  riskTier: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';
}

interface FlashFloodIntelligenceProps {
  onInspectIn3D?: (target: { id: string; name: string; lat: number; lng: number; kind: 'incident' | 'landmark'; description: string }) => void;
}

export const FlashFloodIntelligence: React.FC<FlashFloodIntelligenceProps> = ({ onInspectIn3D }) => {
  const [evaluations, setEvaluations] = useState<EvaluatedBasin[]>([]);
  const [selectedBasinId, setSelectedBasinId] = useState<string>('araku');
  const [rainSimBoostMm, setRainSimBoostMm] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [weatherList, terrainList] = await Promise.all([
        fetchBatchWeather(AP_HILLY_BASINS.map(b => ({ lat: b.lat, lng: b.lng }))).catch(() => []),
        Promise.all(AP_HILLY_BASINS.map(b => sampleTerrainAndSlope(b.lat, b.lng, 450)))
      ]);

      const next: EvaluatedBasin[] = AP_HILLY_BASINS.map((basin, idx) => {
        const weather = weatherList[idx];
        const terrain = terrainList[idx] || { elevationMeters: 450, slopeDegrees: 8, source: 'fallback' };
        const rainFactor = Math.min(40, (((weather?.peak3hRainMm ?? 0) + rainSimBoostMm) / 60) * 40);
        const soilFactor = Math.min(30, ((weather?.soilMoistureTop ?? 0.25) / 0.45) * 30);
        const slopeFactor = Math.min(20, (terrain.slopeDegrees / 22) * 20);
        const histFactor = Math.min(10, (basin.historicalCount / 12) * 10);
        const score = Math.round(rainFactor + soilFactor + slopeFactor + histFactor);
        const tier: EvaluatedBasin['riskTier'] =
          score >= 70 ? 'CRITICAL' : score >= 50 ? 'HIGH' : score >= 30 ? 'MODERATE' : 'LOW';
        return { basin, weather, terrain, riskScore: score, riskTier: tier };
      });
      setEvaluations(next);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rainSimBoostMm]);

  const activeEval = useMemo(
    () => evaluations.find(e => e.basin.id === selectedBasinId) || evaluations[0],
    [evaluations, selectedBasinId]
  );

  const { polygons, markers } = useMemo(() => {
    const polys: MapPolygonSpec[] = [];
    const mks: MapMarkerSpec[] = [];

    evaluations.forEach(ev => {
      const b = ev.basin;
      const color =
        ev.riskTier === 'CRITICAL' ? '#dc2626' :
        ev.riskTier === 'HIGH' ? '#ea580c' :
        ev.riskTier === 'MODERATE' ? '#f59e0b' : '#10b981';

      const s = b.catchmentSpanDeg;
      polys.push({
        id: `ff-poly-${b.id}`,
        positions: [
          [b.lat - s, b.lng - s],
          [b.lat - s * 0.4, b.lng + s],
          [b.lat + s, b.lng + s * 0.7],
          [b.lat + s * 0.6, b.lng - s]
        ],
        color,
        fillColor: color,
        fillOpacity: b.id === selectedBasinId ? 0.42 : 0.22,
        weight: b.id === selectedBasinId ? 3 : 1.5,
        title: `${b.name} (${ev.riskTier})`,
        subtitle: `Risk Score ${ev.riskScore}/100 • Slope ${ev.terrain.slopeDegrees}° • 24h Rain ${((ev.weather?.next24hRainMm ?? 0) + rainSimBoostMm).toFixed(1)} mm`,
        onClick: () => setSelectedBasinId(b.id)
      });

      mks.push({
        id: `ff-mk-${b.id}`,
        lat: b.lat,
        lng: b.lng,
        title: b.name,
        subtitle: `${b.district} • Score ${ev.riskScore}/100`,
        badge: `${ev.riskScore}`,
        color,
        radius: 12,
        pulse: ev.riskTier === 'CRITICAL',
        onClick: () => setSelectedBasinId(b.id)
      });
    });

    return { polygons: polys, markers: mks };
  }, [evaluations, selectedBasinId, rainSimBoostMm]);

  return (
    <div className="space-y-5">
      <HUDPanel
        title="Flash Flood Intelligence (Hilly & Agency Regions)"
        subtitle="Multi-Source Analysis: Open-Meteo Rainfall + Soil Moisture + AWS Terrarium DEM Slope + Historical Records"
        statusColor={activeEval?.riskTier === 'CRITICAL' ? 'red' : activeEval?.riskTier === 'HIGH' ? 'amber' : 'cyan'}
        headerRight={
          <div className="flex items-center gap-2">
            {onInspectIn3D && activeEval && (
              <button
                type="button"
                onClick={() =>
                  onInspectIn3D({
                    id: activeEval.basin.id,
                    name: activeEval.basin.name,
                    lat: activeEval.basin.lat,
                    lng: activeEval.basin.lng,
                    kind: 'incident',
                    description: `Flash Flood Risk ${activeEval.riskScore}/100 • Slope ${activeEval.terrain.slopeDegrees}°`
                  })
                }
                className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-[10px] font-black uppercase flex items-center gap-1 cursor-pointer"
              >
                <Compass className="w-3.5 h-3.5" />
                Inspect Basin in 3D
              </button>
            )}
            <button
              type="button"
              onClick={loadData}
              className="p-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 cursor-pointer"
              title="Refresh Multi-Source Telemetry"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs items-center">
          <div>
            <label htmlFor="ff-basin-select" className="text-[10px] font-black uppercase text-slate-500 block mb-1">
              Hilly Watershed Selection
            </label>
            <select
              id="ff-basin-select"
              value={selectedBasinId}
              onChange={e => setSelectedBasinId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 cursor-pointer"
            >
              {AP_HILLY_BASINS.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.district})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="ff-rain-sim" className="text-[10px] font-black uppercase text-slate-500 flex justify-between mb-1">
              <span>Cloudburst Stress Test (+mm/3h)</span>
              <span className="font-mono font-black text-sky-700">+{rainSimBoostMm} mm</span>
            </label>
            <input
              id="ff-rain-sim"
              type="range"
              min={0}
              max={120}
              step={10}
              value={rainSimBoostMm}
              onChange={e => setRainSimBoostMm(Number(e.target.value))}
              className="w-full cursor-pointer"
            />
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
            <span className="text-[9px] font-black uppercase text-slate-400 block">ELEVATION &amp; SLOPE (DEM)</span>
            <span className="text-sm font-black font-mono text-slate-800 flex items-center gap-1.5">
              <Mountain className="w-4 h-4 text-emerald-600" />
              {activeEval ? `${activeEval.terrain.elevationMeters}m • ${activeEval.terrain.slopeDegrees}°` : '--'}
            </span>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
            <span className="text-[9px] font-black uppercase text-slate-400 block">TOPSOIL &amp; ROOT MOISTURE</span>
            <span className="text-sm font-black font-mono text-sky-700">
              {activeEval?.weather?.soilMoistureTop != null
                ? `${(activeEval.weather.soilMoistureTop * 100).toFixed(1)}% / ${((activeEval.weather.soilMoistureRoot ?? 0) * 100).toFixed(1)}%`
                : 'Syncing...'}
            </span>
          </div>
        </div>
      </HUDPanel>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 h-[440px]">
          <IntelligenceLeafletMap
            center={[activeEval?.basin.lat ?? 17.5, activeEval?.basin.lng ?? 81.8]}
            zoom={8}
            baseStyle="topo"
            polygons={polygons}
            markers={markers}
          />
        </div>

        <HUDPanel title="Catchment Multi-Source Matrix" subtitle="Ranked by Flash Flood Index" className="h-[440px]">
          <div tabIndex={0} role="region" aria-label="Flash flood catchment risk scores" className="intel-table-wrapper">
            <table className="w-full text-left text-xs border-collapse">
              <caption className="sr-only">Multi-source flash flood risk table for Andhra Pradesh hilly basins</caption>
              <thead className="bg-slate-50 border-b border-slate-200 text-[9px] font-black uppercase text-slate-500">
                <tr>
                  <th scope="col" className="py-2 px-2">Watershed</th>
                  <th scope="col" className="py-2 px-2">Rain 24h</th>
                  <th scope="col" className="py-2 px-2">Slope</th>
                  <th scope="col" className="py-2 px-2">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...evaluations]
                  .sort((a, b) => b.riskScore - a.riskScore)
                  .map(ev => (
                    <tr
                      key={ev.basin.id}
                      onClick={() => setSelectedBasinId(ev.basin.id)}
                      className={`cursor-pointer transition ${
                        ev.basin.id === selectedBasinId ? 'bg-sky-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-2 px-2">
                        <div className="font-bold text-slate-800">{ev.basin.name}</div>
                        <div className="text-[10px] text-slate-400">
                          {ev.basin.historicalCount} events ({ev.basin.lastMajorEvent})
                        </div>
                      </td>
                      <td className="py-2 px-2 font-mono text-slate-700">
                        <span className="inline-flex items-center gap-1">
                          <CloudRain className="w-3 h-3 text-sky-500" />
                          {((ev.weather?.next24hRainMm ?? 0) + rainSimBoostMm).toFixed(0)}mm
                        </span>
                      </td>
                      <td className="py-2 px-2 font-mono text-slate-600">{ev.terrain.slopeDegrees}°</td>
                      <td className="py-2 px-2">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[9px] font-black ${
                            ev.riskTier === 'CRITICAL'
                              ? 'bg-red-100 text-red-700'
                              : ev.riskTier === 'HIGH'
                                ? 'bg-orange-100 text-orange-700'
                                : ev.riskTier === 'MODERATE'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {ev.riskScore} · {ev.riskTier}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {activeEval && activeEval.riskScore >= 50 && (
            <div className="mt-2 p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-[10.5px] font-bold flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-600 flex-shrink-0" />
              <span>Early Warning: Issue hill-stream crossing alert &amp; pre-position boats near {activeEval.basin.district}.</span>
            </div>
          )}
        </HUDPanel>
      </div>
    </div>
  );
};
