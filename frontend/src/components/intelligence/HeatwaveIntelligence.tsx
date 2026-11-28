'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { Compass, Flame, RefreshCw, ShieldAlert, Sun, Thermometer } from 'lucide-react';
import { HUDPanel } from '../ui/HUDPanel';
import { IntelligenceLeafletMap, MapMarkerSpec } from './IntelligenceLeafletMap';
import { AP_DISTRICTS, ApDistrictMeta } from '../../utils/apDistricts';
import { fetchBatchWeather, PointWeatherTelemetry } from '../../services/intelligence/OpenMeteoService';

interface DistrictHeatRow {
  meta: ApDistrictMeta;
  liveTempC: number;
  liveRh: number;
  heatIndexC: number;
  apsdmaPeakC: number;
  displayTempC: number;
  stressTier: 'NORMAL' | 'CAUTION' | 'EXTREME CAUTION' | 'DANGER' | 'EXTREME DANGER';
}

function getHeatTier(tempC: number): DistrictHeatRow['stressTier'] {
  if (tempC >= 46) return 'EXTREME DANGER';
  if (tempC >= 42) return 'DANGER';
  if (tempC >= 38) return 'EXTREME CAUTION';
  if (tempC >= 32) return 'CAUTION';
  return 'NORMAL';
}

function getHeatFillColor(tempC: number): string {
  if (tempC >= 45) return '#7f1d1d';
  if (tempC >= 43) return '#dc2626';
  if (tempC >= 41) return '#ea580c';
  if (tempC >= 38) return '#f59e0b';
  if (tempC >= 34) return '#fbbf24';
  return '#38bdf8';
}

interface HeatwaveIntelligenceProps {
  onInspectIn3D?: (target: { id: string; name: string; lat: number; lng: number; kind: 'station' | 'landmark'; districtName?: string; description: string }) => void;
}

export const HeatwaveIntelligence: React.FC<HeatwaveIntelligenceProps> = ({ onInspectIn3D }) => {
  const [geojsonData, setGeojsonData] = useState<any>(null);
  const [weatherByDist, setWeatherByDist] = useState<Record<string, PointWeatherTelemetry>>({});
  const [dataSourceMode, setDataSourceMode] = useState<'live' | 'apsdma'>('apsdma');
  const [selectedDist, setSelectedDist] = useState<string>('Eluru');
  const [loading, setLoading] = useState<boolean>(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    // Load local 28-district GeoJSON immediately so choropleth draws in <100ms
    if (!geojsonData) {
      fetch('/gis-3d/data/ap_districts.geojson')
        .then(r => (r.ok ? r.json() : null))
        .then(gj => {
          if (gj) setGeojsonData(gj);
        })
        .catch(() => {});
    }
    try {
      const batch = await fetchBatchWeather(AP_DISTRICTS.map(d => ({ lat: d.centerLat, lng: d.centerLng }))).catch(() => []);
      const map: Record<string, PointWeatherTelemetry> = {};
      AP_DISTRICTS.forEach((d, i) => {
        if (batch[i]) map[d.district] = batch[i];
      });
      setWeatherByDist(map);
    } finally {
      setLoading(false);
    }
  }, [geojsonData]);

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows: DistrictHeatRow[] = useMemo(() => {
    return AP_DISTRICTS.map(meta => {
      const w = weatherByDist[meta.district];
      const liveTempC = w?.temperatureC ?? 33.0;
      const liveRh = w?.relativeHumidity ?? 55;
      const heatIndexC = w?.apparentTemperatureC ?? liveTempC + 2.0;
      const apsdmaPeakC = meta.peakTmax ?? 40.0;
      const displayTempC = dataSourceMode === 'live' ? heatIndexC : apsdmaPeakC;
      return {
        meta,
        liveTempC,
        liveRh,
        heatIndexC,
        apsdmaPeakC,
        displayTempC,
        stressTier: getHeatTier(displayTempC)
      };
    });
  }, [weatherByDist, dataSourceMode]);

  const activeRow = useMemo(
    () => rows.find(r => r.meta.district === selectedDist) || rows[0],
    [rows, selectedDist]
  );

  const geojsonStyle = useCallback(
    (feature: any): L.PathOptions => {
      const distName = feature?.properties?.district;
      const row = rows.find(r => r.meta.district === distName);
      const temp = row?.displayTempC ?? feature?.properties?.peak_tmax ?? 38;
      const isSelected = distName === selectedDist;
      return {
        fillColor: getHeatFillColor(temp),
        fillOpacity: isSelected ? 0.65 : 0.42,
        color: isSelected ? '#0f172a' : '#ffffff',
        weight: isSelected ? 2.5 : 1
      };
    },
    [rows, selectedDist]
  );

  const onEachFeature = useCallback((feature: any, layer: L.Layer) => {
    const distName = feature?.properties?.district;
    if (!distName) return;
    layer.on('click', () => setSelectedDist(distName));
    layer.bindTooltip(`${distName} • Peak ${feature?.properties?.peak_tmax ?? '--'}°C (${feature?.properties?.peak_mandal || ''})`, {
      sticky: true
    });
  }, []);

  const markers: MapMarkerSpec[] = useMemo(() => {
    return rows
      .filter(r => r.meta.district === selectedDist || r.displayTempC >= 44)
      .map(r => ({
        id: `heat-${r.meta.code}`,
        lat: r.meta.centerLat,
        lng: r.meta.centerLng,
        title: `${r.meta.district} (${r.stressTier})`,
        subtitle: `Peak Mandal: ${r.meta.peakMandal} • Heat Index: ${r.heatIndexC.toFixed(1)}°C • APSDMA Peak: ${r.apsdmaPeakC}°C`,
        badge: `${r.displayTempC.toFixed(0)}°`,
        color: getHeatFillColor(r.displayTempC),
        radius: r.meta.district === selectedDist ? 14 : 11,
        pulse: r.displayTempC >= 44,
        onClick: () => setSelectedDist(r.meta.district)
      }));
  }, [rows, selectedDist]);

  const sortedRows = useMemo(() => [...rows].sort((a, b) => b.displayTempC - a.displayTempC), [rows]);

  return (
    <div className="space-y-5">
      <HUDPanel
        title="Heatwave & Human Thermal Stress Intelligence"
        subtitle="APSDMA 28-District Heatwave Baseline + Live Open-Meteo Apparent Temperature / Thermal Stress Index"
        statusColor={activeRow && activeRow.displayTempC >= 42 ? 'red' : 'amber'}
        headerRight={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-[10px] font-black uppercase">
              <button
                type="button"
                onClick={() => setDataSourceMode('apsdma')}
                className={`px-2.5 py-1 rounded-lg cursor-pointer ${dataSourceMode === 'apsdma' ? 'bg-white text-red-600 shadow-xs' : 'text-slate-500'}`}
              >
                APSDMA Peak
              </button>
              <button
                type="button"
                onClick={() => setDataSourceMode('live')}
                className={`px-2.5 py-1 rounded-lg cursor-pointer ${dataSourceMode === 'live' ? 'bg-white text-sky-700 shadow-xs' : 'text-slate-500'}`}
              >
                Live Heat Index
              </button>
            </div>
            {onInspectIn3D && activeRow && (
              <button
                type="button"
                onClick={() =>
                  onInspectIn3D({
                    id: activeRow.meta.code,
                    name: `${activeRow.meta.district} Thermal Monitoring HQ`,
                    lat: activeRow.meta.centerLat,
                    lng: activeRow.meta.centerLng,
                    kind: 'station',
                    districtName: activeRow.meta.district,
                    description: `Peak ${activeRow.apsdmaPeakC}°C (${activeRow.meta.peakMandal}) • Live Heat Index ${activeRow.heatIndexC.toFixed(1)}°C`
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
              onClick={loadAll}
              className="p-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 cursor-pointer"
              title="Refresh Live Thermal Feed"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        }
      >
        {activeRow && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
              <span className="text-[9px] font-black uppercase text-slate-400 block">SELECTED DISTRICT</span>
              <span className="text-sm font-black text-slate-800">{activeRow.meta.district}</span>
              <span className="text-[10px] text-slate-500 block">Hottest Mandal: {activeRow.meta.peakMandal}</span>
            </div>
            <div className="p-3 rounded-2xl bg-red-50 border border-red-200">
              <span className="text-[9px] font-black uppercase text-red-600 block">APSDMA PEAK TMAX</span>
              <span className="text-lg font-black font-mono text-red-700">{activeRow.apsdmaPeakC}°C</span>
            </div>
            <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200">
              <span className="text-[9px] font-black uppercase text-amber-700 block">LIVE TEMP / RH</span>
              <span className="text-lg font-black font-mono text-amber-800">
                {activeRow.liveTempC.toFixed(1)}°C <span className="text-xs font-bold">({activeRow.liveRh}%)</span>
              </span>
            </div>
            <div className="p-3 rounded-2xl bg-orange-50 border border-orange-200">
              <span className="text-[9px] font-black uppercase text-orange-700 block">HUMAN HEAT INDEX</span>
              <span className="text-lg font-black font-mono text-orange-800">{activeRow.heatIndexC.toFixed(1)}°C</span>
            </div>
            <div className="p-3 rounded-2xl bg-slate-900 text-white border border-slate-800">
              <span className="text-[9px] font-black uppercase text-sky-300 block">STRESS TIER</span>
              <span className="text-sm font-black flex items-center gap-1.5 mt-0.5">
                <Flame className="w-4 h-4 text-amber-400" />
                {activeRow.stressTier}
              </span>
            </div>
          </div>
        )}
      </HUDPanel>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 h-[460px]">
          <IntelligenceLeafletMap
            center={[15.95, 80.1]}
            zoom={7}
            geojsonData={geojsonData}
            geojsonStyle={geojsonStyle}
            onEachGeoJsonFeature={onEachFeature}
            markers={markers}
          />
        </div>

        <HUDPanel title="State Thermal Stress & Vulnerable Advisories" subtitle="28 Districts Live Ranking" className="h-[460px]">
          <div className="flex flex-col h-full gap-3">
            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[10.5px] space-y-1">
              <div className="font-black uppercase flex items-center gap-1.5 text-amber-800">
                <Sun className="w-3.5 h-3.5" />
                Vulnerable Population &amp; Field Force Guidance
              </div>
              <p className="leading-snug">
                {activeRow && activeRow.displayTempC >= 42
                  ? `HIGH THERMAL STRESS in ${activeRow.meta.district}: Rotate outdoor traffic/beat police every 90 mins (12:00–16:00 IST), activate ORS kiosks & cooling shelters near ${activeRow.meta.peakMandal}.`
                  : `Monitor midday UV & Heat Index in ${activeRow?.meta.district || 'AP'}; keep hydration kits active for field patrols & elderly wards.`}
              </p>
            </div>

            <div tabIndex={0} role="region" aria-label="Heatwave thermal ranking" className="intel-table-wrapper flex-1">
              <table className="w-full text-left text-xs border-collapse">
                <caption className="sr-only">Andhra Pradesh 28-district thermal stress table</caption>
                <thead className="bg-slate-50 border-b border-slate-200 text-[9px] font-black uppercase text-slate-500">
                  <tr>
                    <th scope="col" className="py-2 px-2">District</th>
                    <th scope="col" className="py-2 px-2">Peak Mandal</th>
                    <th scope="col" className="py-2 px-2">Live HI</th>
                    <th scope="col" className="py-2 px-2">APSDMA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedRows.map(r => (
                    <tr
                      key={r.meta.code}
                      onClick={() => setSelectedDist(r.meta.district)}
                      className={`cursor-pointer ${r.meta.district === selectedDist ? 'bg-red-50' : 'hover:bg-slate-50'}`}
                    >
                      <td className="py-1.5 px-2 font-bold text-slate-800">{r.meta.district}</td>
                      <td className="py-1.5 px-2 text-slate-500">{r.meta.peakMandal}</td>
                      <td className="py-1.5 px-2 font-mono font-bold text-sky-700">{r.heatIndexC.toFixed(1)}°</td>
                      <td className="py-1.5 px-2 font-mono font-black text-red-600">{r.apsdmaPeakC}°</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </HUDPanel>
      </div>
    </div>
  );
};
