'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CloudLightning, CloudRain, Compass, Pause, Play, RefreshCw } from 'lucide-react';
import { HUDPanel } from '../ui/HUDPanel';
import { IntelligenceLeafletMap, MapMarkerSpec } from './IntelligenceLeafletMap';
import { AP_DISTRICTS, ApDistrictMeta } from '../../utils/apDistricts';
import { fetchBatchWeather, PointWeatherTelemetry } from '../../services/intelligence/OpenMeteoService';
import { buildRadarTileUrl, fetchRainViewerRadar, RadarFrame } from '../../services/intelligence/RainViewerService';

interface RainRiskRow {
  meta: ApDistrictMeta;
  currentMm: number;
  peak3hMm: number;
  rain24hMm: number;
  rain72hMm: number;
  soilPct: number;
  imdBand: 'DRY / TRACE' | 'LIGHT' | 'MODERATE' | 'HEAVY' | 'VERY HEAVY' | 'EXTREMELY HEAVY';
}

function getImdRainBand(rain24h: number): RainRiskRow['imdBand'] {
  if (rain24h >= 204.5) return 'EXTREMELY HEAVY';
  if (rain24h >= 115.6) return 'VERY HEAVY';
  if (rain24h >= 64.5) return 'HEAVY';
  if (rain24h >= 15.6) return 'MODERATE';
  if (rain24h >= 2.5) return 'LIGHT';
  return 'DRY / TRACE';
}

function getImdColor(band: RainRiskRow['imdBand']): string {
  switch (band) {
    case 'EXTREMELY HEAVY': return '#991b1b';
    case 'VERY HEAVY': return '#dc2626';
    case 'HEAVY': return '#ea580c';
    case 'MODERATE': return '#0284c7';
    case 'LIGHT': return '#10b981';
    default: return '#64748b';
  }
}

interface RainfallIntelligenceProps {
  onInspectIn3D?: (target: { id: string; name: string; lat: number; lng: number; kind: 'incident' | 'station'; districtName?: string; description: string }) => void;
}

export const RainfallIntelligence: React.FC<RainfallIntelligenceProps> = ({ onInspectIn3D }) => {
  const [frames, setFrames] = useState<RadarFrame[]>([]);
  const [radarHost, setRadarHost] = useState<string>('https://tilecache.rainviewer.com');
  const [frameIndex, setFrameIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [weatherByDist, setWeatherByDist] = useState<Record<string, PointWeatherTelemetry>>({});
  const [selectedDist, setSelectedDist] = useState<string>('Eluru');
  const [loading, setLoading] = useState<boolean>(false);

  const loadFeeds = useCallback(async () => {
    setLoading(true);
    try {
      const [radar, batch] = await Promise.all([
        fetchRainViewerRadar().catch(() => null),
        fetchBatchWeather(AP_DISTRICTS.map(d => ({ lat: d.centerLat, lng: d.centerLng }))).catch(() => [])
      ]);
      if (radar) {
        const allFrames = [...radar.past, ...radar.nowcast];
        setRadarHost(radar.host);
        setFrames(allFrames);
        if (allFrames.length > 0) setFrameIndex(Math.max(0, radar.past.length - 1));
      }
      const map: Record<string, PointWeatherTelemetry> = {};
      AP_DISTRICTS.forEach((d, i) => {
        if (batch[i]) map[d.district] = batch[i];
      });
      setWeatherByDist(map);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFeeds();
  }, [loadFeeds]);

  useEffect(() => {
    if (!isPlaying || frames.length <= 1) return;
    const timer = setInterval(() => {
      setFrameIndex(prev => (prev + 1) % frames.length);
    }, 900);
    return () => clearInterval(timer);
  }, [isPlaying, frames.length]);

  const rows: RainRiskRow[] = useMemo(() => {
    return AP_DISTRICTS.map(meta => {
      const w = weatherByDist[meta.district];
      const rain24hMm = w?.next24hRainMm ?? 0;
      return {
        meta,
        currentMm: w?.precipitationMm ?? 0,
        peak3hMm: w?.peak3hRainMm ?? 0,
        rain24hMm,
        rain72hMm: w?.next72hRainMm ?? 0,
        soilPct: (w?.soilMoistureTop ?? 0.2) * 100,
        imdBand: getImdRainBand(rain24hMm)
      };
    });
  }, [weatherByDist]);

  const activeRow = useMemo(() => rows.find(r => r.meta.district === selectedDist) || rows[0], [rows, selectedDist]);
  const currentFrame = frames[frameIndex];
  const radarTileUrl = currentFrame ? buildRadarTileUrl(radarHost, currentFrame.path) : null;

  const markers: MapMarkerSpec[] = useMemo(() => {
    return rows.map(r => ({
      id: `rain-${r.meta.code}`,
      lat: r.meta.centerLat,
      lng: r.meta.centerLng,
      title: `${r.meta.district} (${r.imdBand})`,
      subtitle: `24h Forecast: ${r.rain24hMm}mm • 72h: ${r.rain72hMm}mm • Soil: ${r.soilPct.toFixed(0)}%`,
      badge: r.rain24hMm >= 1 ? `${r.rain24hMm.toFixed(0)}` : r.meta.code,
      color: getImdColor(r.imdBand),
      radius: r.meta.district === selectedDist ? 14 : 10,
      pulse: r.rain24hMm >= 64.5,
      onClick: () => setSelectedDist(r.meta.district)
    }));
  }, [rows, selectedDist]);

  const sortedRows = useMemo(() => [...rows].sort((a, b) => b.rain72hMm - a.rain72hMm), [rows]);

  return (
    <div className="space-y-5">
      <HUDPanel
        title="Rainfall & Inundation Early Warning System"
        subtitle="Live RainViewer Precipitation Radar + Open-Meteo 72h Forecast & IMD Rainfall Classification"
        statusColor={activeRow && activeRow.rain24hMm >= 64.5 ? 'red' : 'cyan'}
        headerRight={
          <div className="flex items-center gap-2">
            {onInspectIn3D && activeRow && (
              <button
                type="button"
                onClick={() =>
                  onInspectIn3D({
                    id: `rain-${activeRow.meta.code}`,
                    name: `${activeRow.meta.district} Rainfall Warning Zone`,
                    lat: activeRow.meta.centerLat,
                    lng: activeRow.meta.centerLng,
                    kind: 'incident',
                    districtName: activeRow.meta.district,
                    description: `IMD Band: ${activeRow.imdBand} • 72h Forecast: ${activeRow.rain72hMm}mm`
                  })
                }
                className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-[10px] font-black uppercase flex items-center gap-1 cursor-pointer"
              >
                <Compass className="w-3.5 h-3.5" />
                3D District
              </button>
            )}
            <button
              type="button"
              onClick={loadFeeds}
              className="p-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 cursor-pointer"
              title="Refresh Radar & Rain Forecast"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setIsPlaying(!isPlaying)}
              className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-black uppercase text-[10px] flex items-center gap-1.5 cursor-pointer"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {isPlaying ? 'Pause Radar' : 'Play Radar'}
            </button>
            <input
              aria-label="Radar time frame"
              type="range"
              min={0}
              max={Math.max(0, frames.length - 1)}
              value={frameIndex}
              onChange={e => {
                setIsPlaying(false);
                setFrameIndex(Number(e.target.value));
              }}
              className="w-40 cursor-pointer"
            />
            <span className="font-mono font-bold text-slate-600 text-[11px]">
              {currentFrame ? new Date(currentFrame.time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Loading radar...'}
            </span>
          </div>

          {activeRow && (
            <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold">
              <span className="px-3 py-1 rounded-xl bg-slate-100 border border-slate-200 text-slate-800">
                {activeRow.meta.district}: <span className="text-sky-700 font-mono">{activeRow.rain24hMm}mm / 24h</span>
              </span>
              <span className="px-3 py-1 rounded-xl bg-slate-100 border border-slate-200 text-slate-800">
                72h Total: <span className="text-indigo-700 font-mono">{activeRow.rain72hMm}mm</span>
              </span>
              <span className="px-3 py-1 rounded-xl bg-sky-50 border border-sky-200 text-sky-800">
                IMD Band: {activeRow.imdBand}
              </span>
            </div>
          )}
        </div>
      </HUDPanel>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 h-[460px]">
          <IntelligenceLeafletMap
            center={[15.95, 80.1]}
            zoom={7}
            radarTileUrl={radarTileUrl}
            markers={markers}
          />
        </div>

        <HUDPanel title="District Rainfall & Inundation Forecast" subtitle="72-Hour Cumulative Outlook" className="h-[460px]">
          <div tabIndex={0} role="region" aria-label="District rainfall risk table" className="intel-table-wrapper">
            <table className="w-full text-left text-xs border-collapse">
              <caption className="sr-only">District 24h and 72h rainfall forecast and IMD warning tier</caption>
              <thead className="bg-slate-50 border-b border-slate-200 text-[9px] font-black uppercase text-slate-500">
                <tr>
                  <th scope="col" className="py-2 px-2">District</th>
                  <th scope="col" className="py-2 px-2">24h</th>
                  <th scope="col" className="py-2 px-2">72h</th>
                  <th scope="col" className="py-2 px-2">Band</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedRows.map(r => (
                  <tr
                    key={r.meta.code}
                    onClick={() => setSelectedDist(r.meta.district)}
                    className={`cursor-pointer ${r.meta.district === selectedDist ? 'bg-sky-50' : 'hover:bg-slate-50'}`}
                  >
                    <td className="py-1.5 px-2 font-bold text-slate-800">{r.meta.district}</td>
                    <td className="py-1.5 px-2 font-mono text-sky-700">{r.rain24hMm}mm</td>
                    <td className="py-1.5 px-2 font-mono font-bold text-slate-700">{r.rain72hMm}mm</td>
                    <td className="py-1.5 px-2">
                      <span
                        className="px-1.5 py-0.5 rounded-full text-[9px] font-black text-white"
                        style={{ backgroundColor: getImdColor(r.imdBand) }}
                      >
                        {r.imdBand}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[10px] text-slate-600 flex items-center gap-2">
            <CloudLightning className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <span>
              Inundation Watch activates automatically where 24h rainfall ≥ 64.5 mm (IMD Heavy) or soil saturation exceeds 75%.
            </span>
          </div>
        </HUDPanel>
      </div>
    </div>
  );
};
