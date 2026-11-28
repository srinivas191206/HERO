'use client';

import React, { useMemo, useState } from 'react';
import {
  ChevronRight,
  CloudRain,
  Droplets,
  Info,
  Layers,
  Search
} from 'lucide-react';
import {
  ImdBand,
  RainRiskRow,
  ServiceFeedState
} from './RainfallControlHeader';

export type RainSortKey = '72h' | '24h' | 'band' | 'district';
export type RainOverviewFilter = 'all' | 'heavy' | 'moderate' | 'light_dry';

interface DistrictRainfallForecastPanelProps {
  rows: RainRiskRow[];
  selectedDist: string;
  onSelectDist: (district: string) => void;
  forecastStatus: ServiceFeedState;
}

const BAND_RANK: Record<ImdBand, number> = {
  'EXTREMELY HEAVY': 6,
  'VERY HEAVY': 5,
  HEAVY: 4,
  MODERATE: 3,
  LIGHT: 2,
  'DRY / TRACE': 1
};

function getImdPillClass(band: ImdBand): string {
  switch (band) {
    case 'EXTREMELY HEAVY':
      return 'bg-red-900 text-white';
    case 'VERY HEAVY':
      return 'bg-[#D93636] text-white';
    case 'HEAVY':
      return 'bg-orange-600 text-white';
    case 'MODERATE':
      return 'bg-[#0788C9] text-white';
    case 'LIGHT':
      return 'bg-[#16A477] text-white';
    default:
      return 'bg-slate-600 text-white';
  }
}

export const DistrictRainfallForecastPanel: React.FC<DistrictRainfallForecastPanelProps> = ({
  rows,
  selectedDist,
  onSelectDist,
  forecastStatus
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [bandFilter, setBandFilter] = useState<ImdBand | 'ALL'>('ALL');
  const [overviewFilter, setOverviewFilter] = useState<RainOverviewFilter>('all');
  const [sortBy, setSortBy] = useState<RainSortKey>('72h');
  const [showThresholdInfo, setShowThresholdInfo] = useState(false);

  // Dynamic statewide classification summary from live district records
  const summaryCounts = useMemo(() => {
    let heavy = 0;
    let moderate = 0;
    let lightDry = 0;
    let unavailable = 0;

    rows.forEach(r => {
      if (!r.hasLiveForecast && forecastStatus !== 'live') {
        unavailable += 1;
        return;
      }
      if (r.imdBand === 'HEAVY' || r.imdBand === 'VERY HEAVY' || r.imdBand === 'EXTREMELY HEAVY') {
        heavy += 1;
      } else if (r.imdBand === 'MODERATE') {
        moderate += 1;
      } else {
        lightDry += 1;
      }
    });
    return { heavy, moderate, lightDry, unavailable };
  }, [rows, forecastStatus]);

  const filteredAndSorted = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...rows]
      .filter(r => {
        if (overviewFilter === 'heavy' && !['HEAVY', 'VERY HEAVY', 'EXTREMELY HEAVY'].includes(r.imdBand)) {
          return false;
        }
        if (overviewFilter === 'moderate' && r.imdBand !== 'MODERATE') {
          return false;
        }
        if (overviewFilter === 'light_dry' && r.imdBand !== 'LIGHT' && r.imdBand !== 'DRY / TRACE') {
          return false;
        }
        if (bandFilter !== 'ALL' && r.imdBand !== bandFilter) {
          return false;
        }
        if (!q) return true;
        return (
          r.meta.district.toLowerCase().includes(q) ||
          r.meta.peakMandal.toLowerCase().includes(q) ||
          r.meta.code.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (sortBy === '24h') return b.rain24hMm - a.rain24hMm;
        if (sortBy === 'band') {
          if (BAND_RANK[b.imdBand] !== BAND_RANK[a.imdBand]) {
            return BAND_RANK[b.imdBand] - BAND_RANK[a.imdBand];
          }
          return b.rain24hMm - a.rain24hMm;
        }
        if (sortBy === 'district') return a.meta.district.localeCompare(b.meta.district);
        return b.rain72hMm - a.rain72hMm;
      });
  }, [rows, searchQuery, overviewFilter, bandFilter, sortBy]);

  return (
    <aside
      aria-label="District Rainfall & Inundation Forecast"
      className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col gap-3 h-[520px] xl:h-[540px]"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 flex-shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-[#FFF3F3] border border-[#F8CCCC] text-[#D93636] flex items-center justify-center flex-shrink-0">
            <CloudRain className="w-4 h-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-extrabold text-[#0B193D] tracking-tight truncate">
              District Rainfall &amp; Inundation Forecast
            </h2>
            <p className="text-[11px] font-medium text-slate-500 truncate">
              72-Hour Cumulative Outlook — AP {rows.length} Districts
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowThresholdInfo(prev => !prev)}
          aria-expanded={showThresholdInfo}
          aria-label="Show IMD 24-hour rainfall thresholds"
          className="p-1.5 rounded-lg text-slate-400 hover:text-[#0788C9] hover:bg-[#F5F8FC] cursor-pointer"
        >
          <Info className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {showThresholdInfo && (
        <div className="px-3 py-2 rounded-xl bg-[#F5F8FC] border border-slate-200 text-[10.5px] text-slate-600 flex-shrink-0">
          <strong className="text-[#0B193D]">IMD 24h Classification:</strong> Extremely Heavy ≥204.5mm • Very Heavy ≥115.6mm • Heavy ≥64.5mm • Moderate ≥15.6mm • Light ≥2.5mm • Dry/Trace &lt;2.5mm.
        </div>
      )}

      {/* A. Statewide Rainfall Classification Summary (3 Cards) */}
      <div className="grid grid-cols-3 gap-2 flex-shrink-0">
        <button
          type="button"
          onClick={() => setOverviewFilter(prev => (prev === 'heavy' ? 'all' : 'heavy'))}
          className={`p-2 rounded-xl border text-left transition cursor-pointer ${
            overviewFilter === 'heavy'
              ? 'bg-red-100/80 border-[#D93636] ring-1 ring-[#D93636]/40'
              : 'bg-[#FFF3F3] border-[#F8CCCC] hover:border-[#D93636]'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <CloudRain className="w-3.5 h-3.5 text-[#D93636] flex-shrink-0" aria-hidden="true" />
            <span className="text-base font-extrabold font-mono text-[#D93636] tabular-nums leading-none">
              {forecastStatus === 'live' ? summaryCounts.heavy : '--'}
            </span>
          </div>
          <span className="text-[10px] font-bold text-[#D93636] block mt-1 truncate">
            Heavy (≥64.5mm)
          </span>
        </button>

        <button
          type="button"
          onClick={() => setOverviewFilter(prev => (prev === 'moderate' ? 'all' : 'moderate'))}
          className={`p-2 rounded-xl border text-left transition cursor-pointer ${
            overviewFilter === 'moderate'
              ? 'bg-amber-100/80 border-[#D99A28] ring-1 ring-[#D99A28]/40'
              : 'bg-[#FFFBEB] border-[#FDE68A] hover:border-[#D99A28]'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <Droplets className="w-3.5 h-3.5 text-[#D99A28] flex-shrink-0" aria-hidden="true" />
            <span className="text-base font-extrabold font-mono text-[#B45309] tabular-nums leading-none">
              {forecastStatus === 'live' ? summaryCounts.moderate : '--'}
            </span>
          </div>
          <span className="text-[10px] font-bold text-[#B45309] block mt-1 truncate">
            Moderate
          </span>
        </button>

        <button
          type="button"
          onClick={() => setOverviewFilter(prev => (prev === 'light_dry' ? 'all' : 'light_dry'))}
          className={`p-2 rounded-xl border text-left transition cursor-pointer ${
            overviewFilter === 'light_dry'
              ? 'bg-emerald-100/80 border-[#16A477] ring-1 ring-[#16A477]/40'
              : 'bg-[#ECFDF5] border-[#A7F3D0] hover:border-[#16A477]'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-[#16A477] flex-shrink-0" aria-hidden="true" />
            <span className="text-base font-extrabold font-mono text-[#16A477] tabular-nums leading-none">
              {forecastStatus === 'live' ? summaryCounts.lightDry : '--'}
            </span>
          </div>
          <span className="text-[10px] font-bold text-[#16A477] block mt-1 truncate">
            Light / Dry
          </span>
        </button>
      </div>

      {/* B, C, D. Search, IMD Filter & Sort */}
      <div className="space-y-2 flex-shrink-0">
        <search className="relative block">
          <label htmlFor="rain-district-search" className="sr-only">
            Search district or mandal
          </label>
          <Search
            className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            id="rain-district-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search district or mandal..."
            className="w-full pl-8 pr-2.5 py-1.5 bg-[#F5F8FC] border border-slate-200 rounded-xl text-xs font-medium text-[#0B193D] placeholder:text-slate-400 focus:outline-none focus:border-[#0788C9]"
          />
        </search>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="rain-imd-filter" className="sr-only">
              Filter by IMD rainfall band
            </label>
            <select
              id="rain-imd-filter"
              value={bandFilter}
              onChange={(e) => setBandFilter(e.target.value as ImdBand | 'ALL')}
              className="w-full bg-[#F5F8FC] border border-slate-200 hover:border-[#0788C9] rounded-xl px-2 py-1 text-[11px] font-semibold text-[#0B193D] focus:outline-none focus:border-[#0788C9] cursor-pointer"
            >
              <option value="ALL">IMD Band: All</option>
              <option value="EXTREMELY HEAVY">Extremely Heavy</option>
              <option value="VERY HEAVY">Very Heavy</option>
              <option value="HEAVY">Heavy</option>
              <option value="MODERATE">Moderate</option>
              <option value="LIGHT">Light</option>
              <option value="DRY / TRACE">Dry / Trace</option>
            </select>
          </div>

          <div>
            <label htmlFor="rain-sort-select" className="sr-only">
              Sort district rainfall records
            </label>
            <select
              id="rain-sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as RainSortKey)}
              className="w-full bg-[#F5F8FC] border border-slate-200 hover:border-[#0788C9] rounded-xl px-2 py-1 text-[11px] font-semibold text-[#0B193D] focus:outline-none focus:border-[#0788C9] cursor-pointer"
            >
              <option value="72h">Sort: 72h Forecast</option>
              <option value="24h">Sort: 24h Rainfall</option>
              <option value="band">Sort: IMD Severity</option>
              <option value="district">Sort: District Name</option>
            </select>
          </div>
        </div>
      </div>

      {/* E. Accessible District Forecast Table */}
      <div
        tabIndex={0}
        role="region"
        aria-label="District rainfall and IMD classification table"
        className="intel-table-wrapper flex-1 min-h-0 border border-slate-100 rounded-xl"
      >
        {filteredAndSorted.length === 0 ? (
          <div className="h-full min-h-[120px] flex flex-col items-center justify-center p-4 text-center gap-1 bg-[#F5F8FC]">
            <p className="text-xs font-bold text-[#0B193D]">No matching districts</p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setBandFilter('ALL');
                setOverviewFilter('all');
              }}
              className="text-[11px] font-bold text-[#0788C9] hover:underline cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <table className="w-full text-left text-xs border-separate border-spacing-0">
            <caption className="sr-only">
              District 24-hour and 72-hour rainfall forecast and IMD warning tier
            </caption>
            <thead className="bg-[#F5F8FC] text-[9.5px] font-extrabold uppercase tracking-wider text-slate-500">
              <tr>
                <th scope="col" className="py-2 px-2.5 border-b border-slate-200">District</th>
                <th scope="col" className="py-2 px-2 border-b border-slate-200 text-right">24h</th>
                <th scope="col" className="py-2 px-2 border-b border-slate-200 text-right">72h</th>
                <th scope="col" className="py-2 px-2 border-b border-slate-200 text-right">IMD Band</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAndSorted.map(r => {
                const isSelected = r.meta.district === selectedDist;
                return (
                  <tr
                    key={r.meta.code}
                    onClick={() => onSelectDist(r.meta.district)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectDist(r.meta.district);
                      }
                    }}
                    tabIndex={0}
                    aria-selected={isSelected}
                    className={`cursor-pointer transition ${
                      isSelected ? 'bg-[#EEF7FC]' : 'hover:bg-[#F5F8FC]'
                    }`}
                  >
                    <th
                      scope="row"
                      className={`py-2 px-2.5 font-bold text-[#0B193D] text-left sticky left-0 ${
                        isSelected ? 'bg-[#EEF7FC]' : 'bg-white'
                      }`}
                    >
                      <span className="truncate block max-w-[115px]">{r.meta.district}</span>
                    </th>
                    <td className="py-2 px-2 font-mono text-right font-bold text-[#0788C9] tabular-nums whitespace-nowrap">
                      {r.hasLiveForecast ? `${r.rain24hMm.toFixed(1)} mm` : '--'}
                    </td>
                    <td className="py-2 px-2 font-mono text-right font-extrabold text-[#0B193D] tabular-nums whitespace-nowrap">
                      {r.hasLiveForecast ? `${r.rain72hMm.toFixed(1)} mm` : '--'}
                    </td>
                    <td className="py-2 px-2 text-right whitespace-nowrap">
                      <span className="inline-flex items-center gap-0.5">
                        <span
                          className={`px-1.5 py-0.5 rounded-full text-[8.5px] font-extrabold uppercase ${getImdPillClass(r.imdBand)}`}
                        >
                          {r.imdBand}
                        </span>
                        <ChevronRight
                          className={`w-3 h-3 ${isSelected ? 'text-[#0788C9]' : 'text-slate-300'}`}
                          aria-hidden="true"
                        />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </aside>
  );
};
