'use client';

import React from 'react';
import {
  Activity,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Clock,
  CloudRain,
  Database,
  Droplets,
  Layers,
  Mountain,
  Users
} from 'lucide-react';
import { CoordinatedLandslideItem, EvaluatedLandslideZone, LandslideRiskTier } from './landslideTypes';

interface LandslideAnalyticsRowProps {
  activeEval?: EvaluatedLandslideZone;
  coordinatedItems: CoordinatedLandslideItem[];
  lastUpdatedAt: number | null;
  loading: boolean;
  onOpenCoordModal: (itemKey?: string) => void;
}

function getTierColor(tier?: LandslideRiskTier): string {
  switch (tier) {
    case 'CRITICAL':
      return '#dc2626';
    case 'HIGH':
      return '#ea580c';
    case 'MODERATE':
      return '#f59e0b';
    case 'LOW':
    default:
      return '#10b981';
  }
}

function getTierTextClass(tier?: LandslideRiskTier): string {
  switch (tier) {
    case 'CRITICAL':
      return 'text-red-700';
    case 'HIGH':
      return 'text-orange-700';
    case 'MODERATE':
      return 'text-amber-700';
    case 'LOW':
    default:
      return 'text-emerald-700';
  }
}

function getStatusPillClass(status: string): string {
  const s = status.toLowerCase();
  if (s === 'verified' || s === 'resolved' || s === 'closed') {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
  if (s === 'dispatched' || s === 'field check') {
    return 'bg-sky-50 text-sky-700 border-sky-200';
  }
  if (s === 'open') {
    return 'bg-red-50 text-red-700 border-red-200';
  }
  return 'bg-amber-50 text-amber-800 border-amber-200';
}

export const LandslideAnalyticsRow: React.FC<LandslideAnalyticsRowProps> = ({
  activeEval,
  coordinatedItems,
  lastUpdatedAt,
  loading,
  onOpenCoordModal
}) => {
  const risk = activeEval?.risk ?? 0;
  const tier = activeEval?.tier ?? 'LOW';
  const strokeColor = getTierColor(tier);

  // Exact formula component contributions:
  // risk = Math.min(100, Math.round((slope / 30) * 40 + (rain72 / 120) * 35 + (soilPct / 45) * 25))
  const slopePts = activeEval ? Math.min(40, Math.round((activeEval.slope / 30) * 40)) : 0;
  const slopePct = activeEval ? Math.min(100, Math.round((activeEval.slope / 30) * 100)) : 0;

  const rainPts = activeEval ? Math.min(35, Math.round((activeEval.rain72 / 120) * 35)) : 0;
  const rainPct = activeEval ? Math.min(100, Math.round((activeEval.rain72 / 120) * 100)) : 0;

  const soilPts = activeEval ? Math.min(25, Math.round((activeEval.soilPct / 45) * 25)) : 0;
  const soilNormPct = activeEval ? Math.min(100, Math.round((activeEval.soilPct / 45) * 100)) : 0;

  const hasDemLive = activeEval?.terrain?.source === 'aws-terrarium';
  const hasWeatherLive = Boolean(activeEval?.weather);
  const liveFeedCount = (hasDemLive ? 1 : 0) + (hasWeatherLive ? 1 : 0);

  // Semi-circular SVG gauge geometry (r = 64, circumference = pi * 64 ≈ 201.06)
  const radius = 64;
  const semiCircumference = Math.PI * radius;
  const filledLength = (Math.max(0, Math.min(100, risk)) / 100) * semiCircumference;

  return (
    <section
      aria-label="Landslide Analytics and Response Coordination"
      className="grid grid-cols-1 lg:grid-cols-12 gap-5"
    >
      {/* Left: Landslide Risk Factor Analysis */}
      <div className="lg:col-span-4 bg-white border border-slate-200/90 rounded-2xl shadow-xs p-4 flex flex-col justify-between gap-4 min-w-0">
        <div className="flex items-start gap-2.5 border-b border-slate-100 pb-3">
          <div className="w-8 h-8 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center shrink-0 text-sky-600">
            <BarChart3 className="w-4 h-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs sm:text-sm font-black text-slate-900">
              Landslide Risk Factor Analysis
            </h3>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 truncate">
              Formula breakdown for {activeEval?.zone.name || 'Selected Corridor'}
            </p>
          </div>
        </div>

        <div className="space-y-3.5 text-xs">
          {/* Factor 1: Slope */}
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-slate-700 flex items-center gap-1.5">
                <Mountain className="w-3.5 h-3.5 text-sky-600 shrink-0" aria-hidden="true" />
                Terrain Slope <span className="text-[10px] text-slate-400 font-medium">(max 40 pts)</span>
              </span>
              <span className="font-mono font-black text-slate-900 text-[11px]">
                +{slopePts}/40 <span className="text-slate-400 font-normal">({activeEval?.slope.toFixed(1) ?? '--'}°)</span>
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-sky-500 transition-all duration-300"
                style={{ width: `${slopePct}%` }}
              />
            </div>
          </div>

          {/* Factor 2: 72h Rainfall */}
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-slate-700 flex items-center gap-1.5">
                <CloudRain className="w-3.5 h-3.5 text-cyan-600 shrink-0" aria-hidden="true" />
                Rainfall Intensity (72h) <span className="text-[10px] text-slate-400 font-medium">(max 35 pts)</span>
              </span>
              <span className="font-mono font-black text-slate-900 text-[11px]">
                +{rainPts}/35 <span className="text-slate-400 font-normal">({activeEval?.rain72.toFixed(1) ?? '0.0'}mm)</span>
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-cyan-500 transition-all duration-300"
                style={{ width: `${rainPct}%` }}
              />
            </div>
          </div>

          {/* Factor 3: Soil Saturation */}
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-slate-700 flex items-center gap-1.5">
                <Droplets className="w-3.5 h-3.5 text-indigo-600 shrink-0" aria-hidden="true" />
                Soil Saturation <span className="text-[10px] text-slate-400 font-medium">(max 25 pts)</span>
              </span>
              <span className="font-mono font-black text-slate-900 text-[11px]">
                +{soilPts}/25 <span className="text-slate-400 font-normal">({activeEval?.soilPct.toFixed(0) ?? '--'}%)</span>
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-indigo-500 transition-all duration-300"
                style={{ width: `${soilNormPct}%` }}
              />
            </div>
          </div>

          {/* Historical Catalog Context (Unweighted Reference) */}
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-slate-700 flex items-center gap-1.5 text-[11px]">
                <Layers className="w-3.5 h-3.5 text-amber-600 shrink-0" aria-hidden="true" />
                Historical Catalog Reference
              </span>
              <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[9px] font-bold uppercase text-slate-500">
                Catalog Context
              </span>
            </div>
            <p className="text-[11px] font-semibold text-slate-800">
              {activeEval?.zone.historicalEvents || 'No recorded corridor catalog entry'}
            </p>
            <p className="text-[10px] text-slate-500 truncate">
              Corridor asset: {activeEval?.zone.vulnerableRoad || '--'}
            </p>
          </div>
        </div>
      </div>

      {/* Center: Corridor Risk Summary */}
      <div className="lg:col-span-3 bg-white border border-slate-200/90 rounded-2xl shadow-xs p-4 flex flex-col justify-between gap-3 min-w-0">
        <div className="flex items-start gap-2.5 border-b border-slate-100 pb-3">
          <div className="w-8 h-8 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center shrink-0 text-sky-600">
            <Activity className="w-4 h-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs sm:text-sm font-black text-slate-900">
              Corridor Risk Summary
            </h3>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 truncate">
              Telemetry Assessment ({activeEval?.zone.id.toUpperCase() || '--'})
            </p>
          </div>
        </div>

        {/* Semi-circular Radial Gauge */}
        <div className="flex flex-col items-center justify-center py-1">
          <svg
            viewBox="0 0 160 96"
            className="w-44 h-24 overflow-visible"
            role="img"
            aria-label={`Landslide risk gauge showing ${risk} out of 100 (${tier} Risk)`}
          >
            {/* Background track arc */}
            <path
              d="M 16 82 A 64 64 0 0 1 144 82"
              fill="none"
              stroke="#e2e8f0"
              strokeWidth="12"
              strokeLinecap="round"
            />
            {/* Active value arc */}
            <path
              d="M 16 82 A 64 64 0 0 1 144 82"
              fill="none"
              stroke={strokeColor}
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={`${filledLength} ${semiCircumference}`}
            />
            <text
              x="80"
              y="66"
              textAnchor="middle"
              className="fill-slate-900 font-mono text-[22px] font-black"
            >
              {risk}
              <tspan className="fill-slate-400 text-[12px] font-bold">/100</tspan>
            </text>
            <text
              x="80"
              y="84"
              textAnchor="middle"
              fill={strokeColor}
              className="text-[10px] font-black uppercase tracking-wider"
            >
              {tier} RISK
            </text>
          </svg>
        </div>

        {/* Verified Metadata List */}
        <dl className="space-y-2 text-[11px] border-t border-slate-100 pt-3">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-slate-500 font-medium flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
              Risk Tier
            </dt>
            <dd className={`font-black uppercase ${getTierTextClass(tier)}`}>{tier}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-slate-500 font-medium flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-sky-600 shrink-0" aria-hidden="true" />
              Live Sensor Feeds
            </dt>
            <dd className="font-mono font-bold text-slate-800">{liveFeedCount}/2 Live</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-slate-500 font-medium flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
              Last Updated
            </dt>
            <dd className="font-mono font-semibold text-slate-700 text-[10.5px]">
              {loading
                ? 'Refreshing...'
                : lastUpdatedAt
                  ? new Date(lastUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                  : '--'}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-slate-500 font-medium shrink-0">Data Source</dt>
            <dd className="font-semibold text-slate-700 text-right truncate">
              {[
                hasDemLive ? 'AWS DEM' : 'Slope Fallback',
                hasWeatherLive ? 'Open-Meteo' : 'Baseline Weather'
              ].join(' + ')}
            </dd>
          </div>
        </dl>
      </div>

      {/* Right: Field Intelligence & Response Coordination */}
      <div className="lg:col-span-5 bg-white border border-slate-200/90 rounded-2xl shadow-xs p-4 flex flex-col justify-between gap-3 min-w-0">
        <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center shrink-0 text-sky-600">
              <ClipboardList className="w-4 h-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs sm:text-sm font-black text-slate-900">
                Field Intelligence &amp; Response Coordination
              </h3>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 truncate">
                Recent Field Reports, Backend Incidents &amp; Status
              </p>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[10px] font-black text-slate-600 shrink-0">
            {coordinatedItems.length} Records
          </span>
        </div>

        {/* Accessible Responsive Table */}
        <div
          tabIndex={0}
          role="region"
          aria-label="Field Intelligence and Response Coordination table"
          className="flex-1 max-h-[210px] overflow-auto rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
        >
          {coordinatedItems.length === 0 ? (
            <div className="h-full min-h-[150px] flex flex-col items-center justify-center text-center p-4 text-xs text-slate-500">
              <ClipboardList className="w-6 h-6 text-slate-300 mb-1.5" aria-hidden="true" />
              <p className="font-bold text-slate-700">No field observations or landslide incidents yet</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Use &ldquo;Log Field Observation&rdquo; above to record geo-tagged cracks, rockfalls, or slips.
              </p>
            </div>
          ) : (
            <table className="w-full text-left border-separate border-spacing-0 text-[11px]">
              <caption className="sr-only">
                Geo-tagged landslide field observations and backend incidents requiring review or dispatch
              </caption>
              <thead className="sticky top-0 bg-slate-50 z-10 text-[10px] font-black uppercase text-slate-500">
                <tr>
                  <th scope="col" className="px-2.5 py-2 border-b border-slate-200 whitespace-nowrap">
                    Report / ID
                  </th>
                  <th scope="col" className="px-2.5 py-2 border-b border-slate-200 whitespace-nowrap">
                    Location / Corridor
                  </th>
                  <th scope="col" className="px-2.5 py-2 border-b border-slate-200 whitespace-nowrap">
                    Observation
                  </th>
                  <th scope="col" className="px-2.5 py-2 border-b border-slate-200 whitespace-nowrap">
                    Status
                  </th>
                  <th scope="col" className="px-2.5 py-2 border-b border-slate-200 whitespace-nowrap text-right">
                    Updated
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {coordinatedItems.map(item => (
                  <tr
                    key={item.key}
                    onClick={() => onOpenCoordModal(item.key)}
                    className="hover:bg-sky-50/60 transition cursor-pointer"
                  >
                    <td className="px-2.5 py-2 border-b border-slate-100 font-mono font-bold text-slate-800 whitespace-nowrap">
                      {item.displayId}
                    </td>
                    <td className="px-2.5 py-2 border-b border-slate-100 font-semibold text-slate-700 max-w-[140px] truncate">
                      {item.locationLabel}
                    </td>
                    <td className="px-2.5 py-2 border-b border-slate-100 text-slate-600 max-w-[160px] truncate">
                      {item.observation}
                    </td>
                    <td className="px-2.5 py-2 border-b border-slate-100 whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full border text-[9.5px] font-black uppercase ${getStatusPillClass(
                          item.statusLabel
                        )}`}
                      >
                        {item.statusLabel}
                      </span>
                    </td>
                    <td className="px-2.5 py-2 border-b border-slate-100 text-right font-mono text-[10px] text-slate-500 whitespace-nowrap">
                      {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Bottom Coordination Action Button */}
        <button
          type="button"
          onClick={() => onOpenCoordModal(coordinatedItems[0]?.key)}
          className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-sky-50 border border-sky-300 text-sky-700 font-black text-xs flex items-center justify-center gap-2 transition cursor-pointer"
        >
          <Users className="w-4 h-4" aria-hidden="true" />
          Coordinate Response / Assign Field Team
        </button>
      </div>
    </section>
  );
};
