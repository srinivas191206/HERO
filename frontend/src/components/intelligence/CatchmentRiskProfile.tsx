'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import {
  ArrowRight,
  ChevronUp,
  Clock,
  Droplets,
  History,
  MapPin,
  Mountain,
  Sprout,
  TrendingUp
} from 'lucide-react';
import { MatrixBasinEval } from './CatchmentMatrixPanel';
import { EnvFreshnessState } from './FlashFloodControls';

interface CatchmentRiskProfileProps {
  activeEval?: MatrixBasinEval;
  rainSimBoostMm: number;
  weatherStatus: EnvFreshnessState;
  terrainStatus: EnvFreshnessState;
  lastSyncedLabel: string | null;
}

export const CatchmentRiskProfile: React.FC<CatchmentRiskProfileProps> = ({
  activeEval,
  rainSimBoostMm,
  weatherStatus,
  terrainStatus,
  lastSyncedLabel
}) => {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsId = useId();
  const detailRegionRef = useRef<HTMLDivElement>(null);

  // Sync disclosure state when browser "Find in page" expands hidden="until-found" content
  useEffect(() => {
    const el = detailRegionRef.current;
    if (!el) return;
    if (!('onbeforematch' in HTMLElement.prototype)) return;

    const handleBeforeMatch = () => {
      setDetailsOpen(true);
    };
    el.addEventListener('beforematch', handleBeforeMatch);
    return () => el.removeEventListener('beforematch', handleBeforeMatch);
  }, []);

  if (!activeEval) {
    return (
      <section
        aria-label="Catchment Risk Profile"
        className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs text-xs text-slate-500"
      >
        Select a watershed from the Catchment Multi-Source Matrix to view its detailed profile.
      </section>
    );
  }

  const { basin, weather, terrain, riskScore, riskTier, baselineScore, baselineTier } = activeEval;
  const topsoilPct = weather?.soilMoistureTop != null ? `${(weather.soilMoistureTop * 100).toFixed(1)}%` : 'Unavailable';
  const rootPct = weather?.soilMoistureRoot != null ? `${(weather.soilMoistureRoot * 100).toFixed(1)}%` : 'Unavailable';

  const scoreBarColor =
    riskTier === 'CRITICAL'
      ? 'bg-[#D93636]'
      : riskTier === 'HIGH'
        ? 'bg-orange-500'
        : riskTier === 'MODERATE'
          ? 'bg-[#D99A28]'
          : 'bg-[#16A477]';

  const scoreTextColor =
    riskTier === 'CRITICAL'
      ? 'text-[#D93636]'
      : riskTier === 'HIGH'
        ? 'text-orange-600'
        : riskTier === 'MODERATE'
          ? 'text-[#B45309]'
          : 'text-[#16A477]';

  const tierPillClass =
    riskTier === 'CRITICAL'
      ? 'bg-red-100 text-[#D93636]'
      : riskTier === 'HIGH'
        ? 'bg-orange-100 text-orange-700'
        : riskTier === 'MODERATE'
          ? 'bg-amber-100 text-[#B45309]'
          : 'bg-emerald-100 text-[#16A477]';

  // Exact component contributions using the preserved FFI weights
  const rainFactor = Math.round(Math.min(40, (((weather?.peak3hRainMm ?? 0) + rainSimBoostMm) / 60) * 40));
  const soilFactor = Math.round(Math.min(30, ((weather?.soilMoistureTop ?? 0.25) / 0.45) * 30));
  const slopeFactor = Math.round(Math.min(20, (terrain.slopeDegrees / 22) * 20));
  const histFactor = Math.round(Math.min(10, (basin.historicalCount / 12) * 10));
  const scenarioDelta = riskScore - baselineScore;

  return (
    <section
      aria-label="Catchment Risk Profile"
      className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden"
    >
      {/* Main Horizontal Summary Row */}
      <div className="px-4 sm:px-5 py-3.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4 items-center">
        {/* Selected Watershed */}
        <div className="lg:col-span-3 flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[#EEF4FD] border border-[#DCE7F7] text-[#0788C9] flex items-center justify-center flex-shrink-0">
            <MapPin className="w-4 h-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Catchment Risk Profile
            </span>
            <h2 className="text-sm font-extrabold text-[#0B193D] truncate">{basin.name}</h2>
            <p className="text-[11px] font-medium text-slate-500 truncate">{basin.district} District</p>
          </div>
        </div>

        {/* Flash Flood Index */}
        <div className="lg:col-span-2 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Flash Flood Index
            </span>
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${tierPillClass}`}>
              {riskTier}
            </span>
          </div>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className={`text-xl font-black font-mono tabular-nums ${scoreTextColor}`}>
              {riskScore}
            </span>
            <span className="text-xs font-bold text-slate-400 font-mono">/ 100</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden mt-1.5" aria-hidden="true">
            <div
              className={`h-full rounded-full transition-all ${scoreBarColor}`}
              style={{ width: `${Math.min(100, Math.max(4, riskScore))}%` }}
            />
          </div>
        </div>

        {/* Elevation */}
        <div className="lg:col-span-2 min-w-0 flex items-center gap-2.5 lg:border-l lg:border-slate-100 lg:pl-4">
          <Mountain className="w-4 h-4 text-slate-400 flex-shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Elevation
            </span>
            <span className="text-sm font-extrabold font-mono text-[#0B193D] tabular-nums">
              {terrain.elevationMeters} m
            </span>
            <span className="text-[9.5px] text-slate-500 block">
              {terrain.source === 'aws-terrarium' ? 'AWS Terrarium' : 'Fallback DEM'}
            </span>
          </div>
        </div>

        {/* Avg Slope */}
        <div className="lg:col-span-1 min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            Avg. Slope
          </span>
          <span className="text-sm font-extrabold font-mono text-[#0B193D] tabular-nums">
            {terrain.slopeDegrees}°
          </span>
        </div>

        {/* Topsoil & Root Moisture */}
        <div className="lg:col-span-2 grid grid-cols-2 gap-2 lg:border-l lg:border-slate-100 lg:pl-4 min-w-0">
          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Droplets className="w-3 h-3 text-[#0788C9]" aria-hidden="true" />
              Topsoil
            </span>
            <span className="text-sm font-extrabold font-mono text-[#0B193D] tabular-nums block truncate">
              {topsoilPct}
            </span>
          </div>
          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Sprout className="w-3 h-3 text-[#16A477]" aria-hidden="true" />
              Root
            </span>
            <span className="text-sm font-extrabold font-mono text-[#0B193D] tabular-nums block truncate">
              {rootPct}
            </span>
          </div>
        </div>

        {/* View Details Action */}
        <div className="lg:col-span-2 flex justify-start lg:justify-end">
          <button
            type="button"
            aria-expanded={detailsOpen}
            aria-controls={detailsId}
            onClick={() => setDetailsOpen(prev => !prev)}
            className="px-3.5 py-2 rounded-xl bg-white hover:bg-[#F5F8FC] border border-slate-200 hover:border-[#0788C9] text-xs font-bold text-[#0B193D] inline-flex items-center gap-1.5 transition cursor-pointer focus-visible:outline-2 focus-visible:outline-[#0788C9]"
          >
            <span>{detailsOpen ? 'Hide Details' : 'View Details'}</span>
            {detailsOpen ? (
              <ChevronUp className="w-3.5 h-3.5 text-[#0788C9]" aria-hidden="true" />
            ) : (
              <ArrowRight className="w-3.5 h-3.5 text-[#0788C9]" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Expandable Detail Drawer (Searchable with hidden="until-found") */}
      <div
        id={detailsId}
        ref={detailRegionRef}
        hidden={!detailsOpen ? ('until-found' as unknown as boolean) : undefined}
      >
        <div className="px-4 sm:px-5 pb-4 pt-3 border-t border-slate-100 bg-[#F5F8FC]/60 grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs">
          {/* Column 1: Factor Breakdown & Baseline vs Scenario Comparison */}
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-extrabold text-[#0B193D] inline-flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-[#0788C9]" aria-hidden="true" />
                  Scenario Comparison &amp; Factors
                </h3>
                <span className="text-[9.5px] font-bold uppercase px-1.5 py-0.5 rounded bg-sky-50 text-[#0788C9]">
                  {rainSimBoostMm > 0 ? `+${rainSimBoostMm}mm Sim` : 'Observed'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded-lg bg-[#F5F8FC] border border-slate-200">
                  <span className="text-[9.5px] font-bold uppercase text-slate-500 block">
                    Baseline (0 mm)
                  </span>
                  <span className="text-sm font-black font-mono text-[#0B193D] tabular-nums">
                    {baselineScore} / 100
                  </span>
                  <span className="text-[9.5px] font-semibold text-slate-500 block">{baselineTier}</span>
                </div>
                <div className="p-2 rounded-lg bg-[#FFF8EB] border border-amber-200">
                  <span className="text-[9.5px] font-bold uppercase text-amber-800 block">
                    Stress (+{rainSimBoostMm} mm)
                  </span>
                  <span className={`text-sm font-black font-mono tabular-nums ${scoreTextColor}`}>
                    {riskScore} / 100
                  </span>
                  <span className="text-[9.5px] font-semibold text-amber-800 block">
                    {scenarioDelta > 0 ? `+${scenarioDelta} pts delta` : 'No offset applied'}
                  </span>
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] pt-1 border-t border-slate-100">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Rain (40 max):</dt>
                  <dd className="font-mono font-bold text-[#0B193D]">{rainFactor}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Soil (30 max):</dt>
                  <dd className="font-mono font-bold text-[#0B193D]">{soilFactor}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Slope (20 max):</dt>
                  <dd className="font-mono font-bold text-[#0B193D]">{slopeFactor}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">History (10 max):</dt>
                  <dd className="font-mono font-bold text-[#0B193D]">{histFactor}</dd>
                </div>
              </dl>
            </div>

            {/* Column 2: Historical Event Intelligence */}
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-extrabold text-[#0B193D] inline-flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-[#D99A28]" aria-hidden="true" />
                  Historical Event Intelligence
                </h3>
                <span className="text-[9.5px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-50 text-[#B45309]">
                  {basin.historicalCount} Recorded
                </span>
              </div>

              <ol className="relative border-l-2 border-slate-200 ml-2 pl-3 space-y-2.5">
                <li>
                  <span
                    className="w-2 h-2 rounded-full bg-[#D99A28] absolute -left-[5px] top-1.5"
                    aria-hidden="true"
                  />
                  <div className="text-xs font-bold text-[#0B193D]">{basin.lastMajorEvent}</div>
                  <div className="text-[10.5px] text-slate-600 mt-0.5">
                    District: {basin.district} • Total recorded events: {basin.historicalCount}
                  </div>
                </li>
              </ol>

              <p className="text-[10.5px] text-slate-500 leading-relaxed pt-1 border-t border-slate-100">
                Historical dataset currently exposes latest headline event &amp; cumulative basin count for this catchment.
              </p>
            </div>

            {/* Column 3: Environmental Sources & Timestamps */}
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-extrabold text-[#0B193D] inline-flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[#16A477]" aria-hidden="true" />
                  Environmental Readings &amp; Sources
                </h3>
                <span className="text-[9.5px] font-bold text-slate-500">
                  {lastSyncedLabel ? `Synced ${lastSyncedLabel}` : 'Pending sync'}
                </span>
              </div>

              <dl className="space-y-1 text-[11px]">
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Open-Meteo Peak 3h Rain:</dt>
                  <dd className="font-mono font-bold text-[#0B193D]">
                    {weather ? `${weather.peak3hRainMm} mm` : weatherStatus === 'loading' ? 'Syncing...' : 'Unavailable'}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Open-Meteo 24h / 72h Rain:</dt>
                  <dd className="font-mono font-bold text-[#0B193D]">
                    {weather ? `${weather.next24hRainMm} / ${weather.next72hRainMm} mm` : 'Unavailable'}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Coordinates / Span:</dt>
                  <dd className="font-mono font-semibold text-slate-700">
                    {basin.lat.toFixed(3)}°N, {basin.lng.toFixed(3)}°E (±{basin.catchmentSpanDeg}°)
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">DEM Source Status:</dt>
                  <dd className="font-semibold text-slate-700">
                    {terrain.source === 'aws-terrarium'
                      ? 'AWS Terrarium z11'
                      : terrainStatus === 'loading'
                        ? 'Syncing...'
                        : 'Static Fallback'}
                  </dd>
                </div>
              </dl>
            </div>
        </div>
      </div>
    </section>
  );
};
