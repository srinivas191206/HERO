'use client';

import React from 'react';
import { CloudRain, Compass, Mountain, RefreshCw, ShieldAlert } from 'lucide-react';
import { EvaluatedLandslideZone, LandslideRegionFilter } from './landslideTypes';

interface LandslideControlHeaderProps {
  regionFilter: LandslideRegionFilter;
  onRegionChange: (region: LandslideRegionFilter) => void;
  visibleZones: EvaluatedLandslideZone[];
  activeEval?: EvaluatedLandslideZone;
  selectedId: string;
  onSelectZone: (zoneId: string) => void;
  loading: boolean;
  onRefresh: () => void;
  onInspectIn3D?: () => void;
}

export const LandslideControlHeader: React.FC<LandslideControlHeaderProps> = ({
  regionFilter,
  onRegionChange,
  visibleZones,
  activeEval,
  selectedId,
  onSelectZone,
  loading,
  onRefresh,
  onInspectIn3D
}) => {
  const tierStyles = (() => {
    switch (activeEval?.tier) {
      case 'CRITICAL':
        return {
          card: 'bg-red-50/80 border-red-200',
          label: 'text-red-700',
          value: 'text-red-800',
          sub: 'text-red-700/80'
        };
      case 'HIGH':
        return {
          card: 'bg-orange-50/80 border-orange-200',
          label: 'text-orange-700',
          value: 'text-orange-800',
          sub: 'text-orange-700/80'
        };
      case 'MODERATE':
        return {
          card: 'bg-amber-50/80 border-amber-200',
          label: 'text-amber-700',
          value: 'text-amber-900',
          sub: 'text-amber-800/80'
        };
      default:
        return {
          card: 'bg-amber-50/60 border-amber-200',
          label: 'text-amber-700',
          value: 'text-amber-900',
          sub: 'text-amber-700/80'
        };
    }
  })();

  return (
    <section
      aria-label="Landslide Risk Monitoring Header and Key Telemetry"
      className="bg-white border border-slate-200/90 rounded-2xl shadow-xs p-4 space-y-4"
    >
      {/* Top Header Strip */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center shrink-0 text-sky-600">
            <Mountain className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-black tracking-tight text-slate-900 uppercase">
              AI-Based Landslide Risk Monitoring (AP Eastern Ghats &amp; NER)
            </h2>
            <p className="text-[11px] font-medium text-slate-500 mt-0.5">
              Terrain Slope (AWS DEM) • Soil Saturation • Rainfall Triggers • Historical Catalog • Geo-Tagged Field Reports
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div
            role="group"
            aria-label="Monitoring region filter"
            className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-[11px] font-bold"
          >
            {(['ALL', 'AP Eastern Ghats', 'NER Corridor'] as const).map(reg => {
              const active = regionFilter === reg;
              return (
                <button
                  key={reg}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onRegionChange(reg)}
                  className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                    active
                      ? 'bg-sky-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {reg === 'ALL' ? 'All Zones' : reg}
                </button>
              );
            })}
          </div>

          {onInspectIn3D && activeEval && (
            <button
              type="button"
              onClick={onInspectIn3D}
              className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer"
            >
              <Compass className="w-3.5 h-3.5" aria-hidden="true" />
              3D Slope
            </button>
          )}

          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            aria-label="Refresh Slope and Soil Telemetry"
            title="Refresh Slope & Soil Telemetry"
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-sky-600' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* 4-Card Operational Metrics Strip */}
      {activeEval && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {/* Card 1: Active Corridor / Zone Selector */}
          <div className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-200/90 flex flex-col justify-between gap-1.5 min-w-0">
            <label
              htmlFor="landslide-active-corridor-select"
              className="text-[10px] font-black uppercase tracking-wider text-slate-500"
            >
              Active Corridor / Monitoring Zone
            </label>
            <select
              id="landslide-active-corridor-select"
              value={selectedId}
              onChange={e => onSelectZone(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 cursor-pointer"
            >
              {visibleZones.map(v => (
                <option key={v.zone.id} value={v.zone.id}>
                  {v.zone.name} ({v.risk})
                </option>
              ))}
            </select>
            <span className="text-[11px] font-medium text-slate-500 truncate">
              {activeEval.zone.stateOrDistrict} • {activeEval.zone.vulnerableRoad}
            </span>
          </div>

          {/* Card 2: Slope & Elevation */}
          <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200/90 flex flex-col justify-between gap-1 min-w-0">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 flex items-center gap-1.5">
              <Mountain className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              Slope &amp; Elevation
            </span>
            <div className="text-lg font-black font-mono text-emerald-950 tracking-tight">
              {activeEval.slope.toFixed(1)}° <span className="text-emerald-600">•</span>{' '}
              {activeEval.terrain?.elevationMeters != null ? `${activeEval.terrain.elevationMeters} m` : '--'}
            </div>
            <span className="text-[11px] font-medium text-emerald-800/80 truncate">
              {activeEval.terrain?.source === 'aws-terrarium'
                ? 'Avg. terrain slope • Live AWS DEM'
                : 'Catalog slope • Elevation pending'}
            </span>
          </div>

          {/* Card 3: 72h Rainfall & Soil Moisture */}
          <div className="p-3.5 rounded-2xl bg-sky-50/70 border border-sky-200/90 flex flex-col justify-between gap-1 min-w-0">
            <span className="text-[10px] font-black uppercase tracking-wider text-sky-700 flex items-center gap-1.5">
              <CloudRain className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              72H Rainfall &amp; Soil Moisture
            </span>
            <div className="text-lg font-black font-mono text-sky-950 tracking-tight">
              {activeEval.rain72.toFixed(1)} mm <span className="text-sky-600">•</span>{' '}
              {activeEval.soilPct.toFixed(0)}%
            </div>
            <span className="text-[11px] font-medium text-sky-800/80 truncate">
              {activeEval.weather
                ? 'Open-Meteo 72h forecast • Topsoil VWC'
                : 'Awaiting Open-Meteo • Default soil baseline'}
            </span>
          </div>

          {/* Card 4: Susceptibility & History */}
          <div className={`p-3.5 rounded-2xl border flex flex-col justify-between gap-1 min-w-0 ${tierStyles.card}`}>
            <span className={`text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 ${tierStyles.label}`}>
              <ShieldAlert className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              Susceptibility &amp; History
            </span>
            <div className={`text-lg font-black font-mono tracking-tight ${tierStyles.value}`}>
              {activeEval.risk}/100 ({activeEval.tier})
            </div>
            <span className={`text-[11px] font-medium truncate ${tierStyles.sub}`}>
              {activeEval.zone.historicalEvents}
            </span>
          </div>
        </div>
      )}
    </section>
  );
};
