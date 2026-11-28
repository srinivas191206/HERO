'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronRight,
  CloudRain,
  Info,
  Layers,
  Search,
  ShieldAlert,
  ShieldCheck
} from 'lucide-react';
import { PointWeatherTelemetry } from '../../services/intelligence/OpenMeteoService';
import { TerrainSample } from '../../services/intelligence/TerrariumElevationService';

export interface MatrixBasinEval {
  basin: {
    id: string;
    name: string;
    district: string;
    lat: number;
    lng: number;
    historicalCount: number;
    lastMajorEvent: string;
    catchmentSpanDeg: number;
  };
  weather?: PointWeatherTelemetry;
  terrain: TerrainSample;
  riskScore: number;
  riskTier: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';
  baselineScore: number;
  baselineTier: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';
}

export type MatrixSortKey = 'index' | 'rainfall' | 'slope' | 'events';
export type MatrixRiskFilter = 'all' | 'high' | 'moderate' | 'low';

interface CatchmentMatrixPanelProps {
  evaluations: MatrixBasinEval[];
  selectedBasinId: string;
  onSelectBasin: (basinId: string) => void;
  rainSimBoostMm: number;
  activeEval?: MatrixBasinEval;
}

export const CatchmentMatrixPanel: React.FC<CatchmentMatrixPanelProps> = ({
  evaluations,
  selectedBasinId,
  onSelectBasin,
  rainSimBoostMm,
  activeEval
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<MatrixSortKey>('index');
  const [riskFilter, setRiskFilter] = useState<MatrixRiskFilter>('all');
  const [showMethodologyTip, setShowMethodologyTip] = useState(false);

  const riskCounts = useMemo(() => {
    let high = 0;
    let moderate = 0;
    let low = 0;
    evaluations.forEach(ev => {
      if (ev.riskTier === 'CRITICAL' || ev.riskTier === 'HIGH') high += 1;
      else if (ev.riskTier === 'MODERATE') moderate += 1;
      else low += 1;
    });
    return { high, moderate, low };
  }, [evaluations]);

  const filteredAndSorted = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...evaluations]
      .filter(ev => {
        if (riskFilter === 'high' && ev.riskTier !== 'CRITICAL' && ev.riskTier !== 'HIGH') return false;
        if (riskFilter === 'moderate' && ev.riskTier !== 'MODERATE') return false;
        if (riskFilter === 'low' && ev.riskTier !== 'LOW') return false;

        if (!q) return true;
        return (
          ev.basin.name.toLowerCase().includes(q) ||
          ev.basin.district.toLowerCase().includes(q) ||
          ev.basin.id.toLowerCase().includes(q) ||
          ev.basin.lastMajorEvent.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (sortBy === 'rainfall') {
          const rA = (a.weather?.next24hRainMm ?? 0) + rainSimBoostMm;
          const rB = (b.weather?.next24hRainMm ?? 0) + rainSimBoostMm;
          return rB - rA;
        }
        if (sortBy === 'slope') {
          return b.terrain.slopeDegrees - a.terrain.slopeDegrees;
        }
        if (sortBy === 'events') {
          return b.basin.historicalCount - a.basin.historicalCount;
        }
        return b.riskScore - a.riskScore;
      });
  }, [evaluations, searchQuery, riskFilter, sortBy, rainSimBoostMm]);

  return (
    <aside
      aria-label="Catchment Multi-Source Matrix"
      className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col gap-3 h-[500px] xl:h-[540px]"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 flex-shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-[#EEF4FD] border border-[#DCE7F7] text-[#0788C9] flex items-center justify-center flex-shrink-0">
            <Layers className="w-4 h-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-extrabold text-[#0B193D] tracking-tight truncate">
              Catchment Multi-Source Matrix
            </h2>
            <p className="text-[11px] font-medium text-slate-500 truncate">
              Ranked by Flash Flood Index
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowMethodologyTip(prev => !prev)}
          aria-expanded={showMethodologyTip}
          aria-label="Explain Flash Flood Index scoring methodology"
          title="Flash Flood Index breakdown: Rainfall (40), Soil Moisture (30), Slope (20), Historical Events (10)"
          className="p-1.5 rounded-lg text-slate-400 hover:text-[#0788C9] hover:bg-[#F5F8FC] transition cursor-pointer"
        >
          <Info className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {showMethodologyTip && (
        <div className="px-3 py-2 rounded-xl bg-[#F5F8FC] border border-slate-200 text-[10.5px] text-slate-600 flex-shrink-0">
          <strong className="text-[#0B193D]">FFI Weighting (0–100):</strong> 3h Peak + Cloudburst Rain (40) • Topsoil Moisture (30) • DEM Slope (20) • Historical Events (10). Thresholds: Critical ≥70, High ≥50, Moderate ≥30.
        </div>
      )}

      {/* A. Risk Overview Summary Cards (dynamically calculated) */}
      <div className="grid grid-cols-3 gap-2 flex-shrink-0">
        <button
          type="button"
          onClick={() => setRiskFilter(prev => (prev === 'high' ? 'all' : 'high'))}
          className={`p-2 rounded-xl border text-left transition cursor-pointer ${
            riskFilter === 'high'
              ? 'bg-red-100/80 border-[#D93636] ring-1 ring-[#D93636]/40'
              : 'bg-[#FFF3F3] border-[#F8CCCC] hover:border-[#D93636]'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-[#D93636] flex-shrink-0" aria-hidden="true" />
            <span className="text-base font-extrabold font-mono text-[#D93636] tabular-nums leading-none">
              {String(riskCounts.high).padStart(2, '0')}
            </span>
          </div>
          <span className="text-[10px] font-bold text-[#D93636] block mt-1 truncate">
            High Risk
          </span>
        </button>

        <button
          type="button"
          onClick={() => setRiskFilter(prev => (prev === 'moderate' ? 'all' : 'moderate'))}
          className={`p-2 rounded-xl border text-left transition cursor-pointer ${
            riskFilter === 'moderate'
              ? 'bg-amber-100/80 border-[#D99A28] ring-1 ring-[#D99A28]/40'
              : 'bg-[#FFFBEB] border-[#FDE68A] hover:border-[#D99A28]'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-[#D99A28] flex-shrink-0" aria-hidden="true" />
            <span className="text-base font-extrabold font-mono text-[#B45309] tabular-nums leading-none">
              {String(riskCounts.moderate).padStart(2, '0')}
            </span>
          </div>
          <span className="text-[10px] font-bold text-[#B45309] block mt-1 truncate">
            Moderate
          </span>
        </button>

        <button
          type="button"
          onClick={() => setRiskFilter(prev => (prev === 'low' ? 'all' : 'low'))}
          className={`p-2 rounded-xl border text-left transition cursor-pointer ${
            riskFilter === 'low'
              ? 'bg-emerald-100/80 border-[#16A477] ring-1 ring-[#16A477]/40'
              : 'bg-[#ECFDF5] border-[#A7F3D0] hover:border-[#16A477]'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-[#16A477] flex-shrink-0" aria-hidden="true" />
            <span className="text-base font-extrabold font-mono text-[#16A477] tabular-nums leading-none">
              {String(riskCounts.low).padStart(2, '0')}
            </span>
          </div>
          <span className="text-[10px] font-bold text-[#16A477] block mt-1 truncate">
            Low Risk
          </span>
        </button>
      </div>

      {/* B & C. Search and Sorting Controls */}
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 flex-shrink-0">
        <search className="relative flex-1 min-w-[140px]">
          <label htmlFor="ff-matrix-search" className="sr-only">
            Search watershed or district
          </label>
          <Search
            className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            id="ff-matrix-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search watershed / location..."
            className="w-full pl-8 pr-2.5 py-1.5 bg-[#F5F8FC] border border-slate-200 rounded-xl text-xs font-medium text-[#0B193D] placeholder:text-slate-400 focus:outline-none focus:border-[#0788C9]"
          />
        </search>

        <div className="flex items-center gap-1 flex-shrink-0">
          <label htmlFor="ff-matrix-sort" className="sr-only">
            Sort watersheds
          </label>
          <select
            id="ff-matrix-sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as MatrixSortKey)}
            className="bg-[#F5F8FC] border border-slate-200 hover:border-[#0788C9] rounded-xl px-2.5 py-1.5 text-[11px] font-semibold text-[#0B193D] focus:outline-none focus:border-[#0788C9] cursor-pointer"
          >
            <option value="index">Sort: Flash Flood Index</option>
            <option value="rainfall">Sort: Highest Rainfall</option>
            <option value="slope">Sort: Steepest Slope</option>
            <option value="events">Sort: Historical Events</option>
          </select>
        </div>
      </div>

      {/* Column Headers */}
      <div className="grid grid-cols-12 gap-1.5 px-2.5 py-1 text-[9.5px] font-extrabold uppercase tracking-wider text-slate-400 border-b border-slate-100 flex-shrink-0">
        <span className="col-span-6">Watershed (Events)</span>
        <span className="col-span-2 text-right">Rain</span>
        <span className="col-span-1 text-right">Slope</span>
        <span className="col-span-3 text-right">Index</span>
      </div>

      {/* D. Scrollable Ranked Watershed Rows */}
      <div className="flex-1 overflow-y-auto overscroll-contain space-y-1.5 pr-1 min-h-0">
        {filteredAndSorted.length === 0 ? (
          <div className="h-full min-h-[140px] rounded-xl border border-dashed border-slate-200 bg-[#F5F8FC] flex flex-col items-center justify-center p-4 text-center gap-1">
            <p className="text-xs font-bold text-[#0B193D]">No matching watersheds</p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setRiskFilter('all');
              }}
              className="text-[11px] font-bold text-[#0788C9] hover:underline cursor-pointer"
            >
              Reset Search &amp; Filters
            </button>
          </div>
        ) : (
          filteredAndSorted.map(ev => {
            const isSelected = ev.basin.id === selectedBasinId;
            const totalRainMm = Math.round((ev.weather?.next24hRainMm ?? 0) + rainSimBoostMm);
            const tierColors =
              ev.riskTier === 'CRITICAL'
                ? 'bg-red-100 text-[#D93636] border-red-200'
                : ev.riskTier === 'HIGH'
                  ? 'bg-orange-100 text-orange-700 border-orange-200'
                  : ev.riskTier === 'MODERATE'
                    ? 'bg-amber-100 text-[#B45309] border-amber-200'
                    : 'bg-emerald-100 text-[#16A477] border-emerald-200';
            const barColor =
              ev.riskTier === 'CRITICAL'
                ? 'bg-[#D93636]'
                : ev.riskTier === 'HIGH'
                  ? 'bg-orange-500'
                  : ev.riskTier === 'MODERATE'
                    ? 'bg-[#D99A28]'
                    : 'bg-[#16A477]';

            return (
              <button
                key={ev.basin.id}
                type="button"
                onClick={() => onSelectBasin(ev.basin.id)}
                className={`w-full grid grid-cols-12 gap-1.5 items-center text-left p-2.5 rounded-xl border transition cursor-pointer relative overflow-hidden ${
                  isSelected
                    ? 'bg-[#EAF2FC] border-[#0788C9] shadow-2xs'
                    : 'bg-white border-slate-200 hover:bg-[#F5F8FC] hover:border-slate-300'
                }`}
              >
                <span className={`absolute left-0 top-0 bottom-0 w-1 ${barColor}`} aria-hidden="true" />
                <div className="col-span-6 min-w-0 pl-1">
                  <div className="text-xs font-bold text-[#0B193D] truncate">{ev.basin.name}</div>
                  <div className="text-[10px] font-medium text-slate-500 truncate mt-0.5">
                    {ev.basin.historicalCount} events ({ev.basin.lastMajorEvent})
                  </div>
                </div>

                <div className="col-span-2 text-right font-mono text-[11px] font-bold text-slate-700 tabular-nums">
                  <span className="inline-flex items-center justify-end gap-0.5">
                    <CloudRain className="w-3 h-3 text-[#0788C9]" aria-hidden="true" />
                    {totalRainMm}mm
                  </span>
                </div>

                <div className="col-span-1 text-right font-mono text-[11px] font-semibold text-slate-600 tabular-nums">
                  {ev.terrain.slopeDegrees}°
                </div>

                <div className="col-span-3 flex items-center justify-end gap-1">
                  <span className={`px-1.5 py-0.5 rounded-full border text-[9px] font-extrabold tabular-nums ${tierColors}`}>
                    {ev.riskScore} · {ev.riskTier}
                  </span>
                  <ChevronRight
                    className={`w-3.5 h-3.5 flex-shrink-0 ${
                      isSelected ? 'text-[#0788C9]' : 'text-slate-300'
                    }`}
                    aria-hidden="true"
                  />
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Early Warning Footer Strip */}
      {activeEval && activeEval.riskScore >= 50 && (
        <div className="p-2.5 rounded-xl bg-[#FFF3F3] border border-[#F8CCCC] text-[#991B1B] text-[10.5px] font-bold flex items-center gap-2 flex-shrink-0">
          <ShieldAlert className="w-4 h-4 text-[#D93636] flex-shrink-0" aria-hidden="true" />
          <span className="leading-snug">
            Early Warning: Issue hill-stream crossing alert &amp; pre-position boats near {activeEval.basin.district}.
          </span>
        </div>
      )}
    </aside>
  );
};
