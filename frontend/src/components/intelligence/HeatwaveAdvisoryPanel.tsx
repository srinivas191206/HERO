'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronRight,
  Search,
  ShieldCheck,
  Sun,
  Thermometer
} from 'lucide-react';
import { DistrictHeatRow, ThermalFeedStatus } from './HeatwaveControlPanel';

export type HeatSortKey = 'live_hi' | 'apsdma_peak' | 'stress_tier' | 'personnel';
export type HeatRiskFilter = 'all' | 'critical' | 'high' | 'normal';

interface HeatwaveAdvisoryPanelProps {
  rows: DistrictHeatRow[];
  activeRow?: DistrictHeatRow;
  selectedDist: string;
  onSelectDist: (district: string) => void;
  dataSourceMode: 'live' | 'apsdma';
  weatherStatus: ThermalFeedStatus;
  lastSyncedLabel: string | null;
}

const TIER_RANK: Record<DistrictHeatRow['stressTier'], number> = {
  'EXTREME DANGER': 5,
  DANGER: 4,
  'EXTREME CAUTION': 3,
  CAUTION: 2,
  NORMAL: 1
};

export const HeatwaveAdvisoryPanel: React.FC<HeatwaveAdvisoryPanelProps> = ({
  rows,
  activeRow,
  selectedDist,
  onSelectDist,
  dataSourceMode,
  weatherStatus,
  lastSyncedLabel
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<HeatSortKey>(
    dataSourceMode === 'live' ? 'live_hi' : 'apsdma_peak'
  );
  const [riskFilter, setRiskFilter] = useState<HeatRiskFilter>('all');

  // Dynamic risk counts across all 28 districts using existing stress tiers
  const summaryCounts = useMemo(() => {
    let critical = 0;
    let high = 0;
    let normal = 0;
    rows.forEach(r => {
      if (r.stressTier === 'DANGER' || r.stressTier === 'EXTREME DANGER') critical += 1;
      else if (r.stressTier === 'CAUTION' || r.stressTier === 'EXTREME CAUTION') high += 1;
      else normal += 1;
    });
    return { critical, high, normal };
  }, [rows]);

  const filteredAndSorted = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...rows]
      .filter(r => {
        if (riskFilter === 'critical' && r.stressTier !== 'DANGER' && r.stressTier !== 'EXTREME DANGER') {
          return false;
        }
        if (riskFilter === 'high' && r.stressTier !== 'CAUTION' && r.stressTier !== 'EXTREME CAUTION') {
          return false;
        }
        if (riskFilter === 'normal' && r.stressTier !== 'NORMAL') {
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
        if (sortBy === 'live_hi') return b.heatIndexC - a.heatIndexC;
        if (sortBy === 'apsdma_peak') return b.apsdmaPeakC - a.apsdmaPeakC;
        if (sortBy === 'personnel') return b.verifiedOfficerCount - a.verifiedOfficerCount;
        if (TIER_RANK[b.stressTier] !== TIER_RANK[a.stressTier]) {
          return TIER_RANK[b.stressTier] - TIER_RANK[a.stressTier];
        }
        return b.displayTempC - a.displayTempC;
      });
  }, [rows, searchQuery, riskFilter, sortBy]);

  const isCriticalActive = Boolean(activeRow && activeRow.displayTempC >= 42);

  return (
    <aside
      aria-label="State Thermal Stress & Vulnerable Advisories"
      className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col gap-3 h-[520px] xl:h-[540px]"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 flex-shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-[#FFF3F3] border border-[#F8CCCC] text-[#D93636] flex items-center justify-center flex-shrink-0">
            <Thermometer className="w-4 h-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-extrabold text-[#0B193D] tracking-tight truncate">
              State Thermal Stress &amp; Vulnerable Advisories
            </h2>
            <p className="text-[11px] font-medium text-slate-500 truncate">
              {rows.length} Districts • Ranking by {dataSourceMode === 'live' ? 'Live Heat Index' : 'APSDMA Baseline'}
            </p>
          </div>
        </div>
      </div>

      {/* A. Thermal Advisory Card */}
      <div
        className={`p-3 rounded-xl border text-xs space-y-1.5 flex-shrink-0 ${
          isCriticalActive
            ? 'bg-[#FFFBEB] border-[#FDE68A] text-amber-950'
            : 'bg-[#F5F8FC] border-slate-200 text-slate-800'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-extrabold text-[11px] inline-flex items-center gap-1.5 text-[#B45309]">
            <Sun className="w-3.5 h-3.5 text-[#D99A28] flex-shrink-0" aria-hidden="true" />
            Vulnerable Population &amp; Field Force Guidance
          </span>
          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-600 flex-shrink-0">
            Informational SOP
          </span>
        </div>
        <p className="text-[11px] leading-relaxed font-medium">
          {isCriticalActive && activeRow
            ? `${activeRow.stressTier} in ${activeRow.meta.district}: Rotate outdoor traffic/beat police every 90 mins (12:00–16:00 IST), activate ORS kiosks & cooling shelters near ${activeRow.meta.peakMandal}.`
            : `Monitor midday UV & Heat Index in ${activeRow?.meta.district || 'Andhra Pradesh'}; keep hydration kits active for field patrols & vulnerable elderly wards.`}
        </p>
        <div className="flex items-center justify-between text-[10px] text-slate-500 pt-0.5">
          <span>
            Source: Internal HERO SOP ({activeRow?.meta.district})
          </span>
          <span>
            {weatherStatus === 'live' && lastSyncedLabel
              ? `Updated ${lastSyncedLabel}`
              : weatherStatus === 'loading'
                ? 'Syncing...'
                : 'Using baseline mode'}
          </span>
        </div>
      </div>

      {/* B. Dynamic District Risk Summary (3 Cards) */}
      <div className="grid grid-cols-3 gap-2 flex-shrink-0">
        <button
          type="button"
          onClick={() => setRiskFilter(prev => (prev === 'critical' ? 'all' : 'critical'))}
          className={`p-2 rounded-xl border text-left transition cursor-pointer ${
            riskFilter === 'critical'
              ? 'bg-red-100/80 border-[#D93636] ring-1 ring-[#D93636]/40'
              : 'bg-[#FFF3F3] border-[#F8CCCC] hover:border-[#D93636]'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-[#D93636] flex-shrink-0" aria-hidden="true" />
            <span className="text-base font-extrabold font-mono text-[#D93636] tabular-nums leading-none">
              {String(summaryCounts.critical).padStart(2, '0')}
            </span>
          </div>
          <span className="text-[10px] font-bold text-[#D93636] block mt-1 truncate">
            Critical Districts
          </span>
        </button>

        <button
          type="button"
          onClick={() => setRiskFilter(prev => (prev === 'high' ? 'all' : 'high'))}
          className={`p-2 rounded-xl border text-left transition cursor-pointer ${
            riskFilter === 'high'
              ? 'bg-amber-100/80 border-[#D99A28] ring-1 ring-[#D99A28]/40'
              : 'bg-[#FFFBEB] border-[#FDE68A] hover:border-[#D99A28]'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <Sun className="w-3.5 h-3.5 text-[#D99A28] flex-shrink-0" aria-hidden="true" />
            <span className="text-base font-extrabold font-mono text-[#B45309] tabular-nums leading-none">
              {String(summaryCounts.high).padStart(2, '0')}
            </span>
          </div>
          <span className="text-[10px] font-bold text-[#B45309] block mt-1 truncate">
            High Stress
          </span>
        </button>

        <button
          type="button"
          onClick={() => setRiskFilter(prev => (prev === 'normal' ? 'all' : 'normal'))}
          className={`p-2 rounded-xl border text-left transition cursor-pointer ${
            riskFilter === 'normal'
              ? 'bg-emerald-100/80 border-[#16A477] ring-1 ring-[#16A477]/40'
              : 'bg-[#ECFDF5] border-[#A7F3D0] hover:border-[#16A477]'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-[#16A477] flex-shrink-0" aria-hidden="true" />
            <span className="text-base font-extrabold font-mono text-[#16A477] tabular-nums leading-none">
              {String(summaryCounts.normal).padStart(2, '0')}
            </span>
          </div>
          <span className="text-[10px] font-bold text-[#16A477] block mt-1 truncate">
            Normal
          </span>
        </button>
      </div>

      {/* C & D. Search and Sort */}
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 flex-shrink-0">
        <search className="relative flex-1 min-w-[140px]">
          <label htmlFor="hw-district-search" className="sr-only">
            Search district or mandal
          </label>
          <Search
            className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            id="hw-district-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search district or mandal..."
            className="w-full pl-8 pr-2.5 py-1.5 bg-[#F5F8FC] border border-slate-200 rounded-xl text-xs font-medium text-[#0B193D] placeholder:text-slate-400 focus:outline-none focus:border-[#0788C9]"
          />
        </search>

        <div className="flex items-center gap-1 flex-shrink-0">
          <label htmlFor="hw-district-sort" className="sr-only">
            Sort districts
          </label>
          <select
            id="hw-district-sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as HeatSortKey)}
            className="bg-[#F5F8FC] border border-slate-200 hover:border-[#0788C9] rounded-xl px-2.5 py-1.5 text-[11px] font-semibold text-[#0B193D] focus:outline-none focus:border-[#0788C9] cursor-pointer"
          >
            <option value="live_hi">Sort: Live Heat Index</option>
            <option value="apsdma_peak">Sort: APSDMA Peak Tmax</option>
            <option value="stress_tier">Sort: Thermal Stress Tier</option>
            <option value="personnel">Sort: Field Personnel</option>
          </select>
        </div>
      </div>

      {/* E. Accessible Scrollable District Ranking Table */}
      <div
        tabIndex={0}
        role="region"
        aria-label="Heatwave thermal ranking across 28 Andhra Pradesh districts"
        className="intel-table-wrapper flex-1 min-h-0 border border-slate-100 rounded-xl"
      >
        {filteredAndSorted.length === 0 ? (
          <div className="h-full min-h-[120px] flex flex-col items-center justify-center p-4 text-center gap-1 bg-[#F5F8FC]">
            <p className="text-xs font-bold text-[#0B193D]">No matching districts</p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setRiskFilter('all');
              }}
              className="text-[11px] font-bold text-[#0788C9] hover:underline cursor-pointer"
            >
              Reset Filter
            </button>
          </div>
        ) : (
          <table className="w-full text-left text-xs border-separate border-spacing-0">
            <caption className="sr-only">
              Andhra Pradesh 28-district thermal stress ranking table
            </caption>
            <thead className="bg-[#F5F8FC] text-[9.5px] font-extrabold uppercase tracking-wider text-slate-500">
              <tr>
                <th scope="col" className="py-2 px-2.5 border-b border-slate-200">District</th>
                <th scope="col" className="py-2 px-2 border-b border-slate-200">Peak Mandal</th>
                <th scope="col" className="py-2 px-2 border-b border-slate-200 text-right">Live HI</th>
                <th scope="col" className="py-2 px-2 border-b border-slate-200 text-right">APSDMA</th>
                <th scope="col" className="py-2 px-2 border-b border-slate-200 text-right">Tier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAndSorted.map(r => {
                const isSelected = r.meta.district === selectedDist;
                const tierBadge =
                  r.stressTier === 'EXTREME DANGER' || r.stressTier === 'DANGER'
                    ? 'bg-red-100 text-[#D93636]'
                    : r.stressTier === 'EXTREME CAUTION' || r.stressTier === 'CAUTION'
                      ? 'bg-amber-100 text-[#B45309]'
                      : 'bg-emerald-100 text-[#16A477]';

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
                      isSelected ? 'bg-[#FFF3F3]' : 'hover:bg-[#F5F8FC]'
                    }`}
                  >
                    <th
                      scope="row"
                      className={`py-2 px-2.5 font-bold text-[#0B193D] text-left sticky left-0 ${
                        isSelected ? 'bg-[#FFF3F3]' : 'bg-white'
                      }`}
                    >
                      <span className="truncate block max-w-[115px]">{r.meta.district}</span>
                    </th>
                    <td className="py-2 px-2 text-[11px] text-slate-600">
                      <span className="truncate block max-w-[90px]">{r.meta.peakMandal}</span>
                    </td>
                    <td className="py-2 px-2 font-mono font-bold text-right text-[#0788C9] tabular-nums">
                      {r.hasLiveWeather ? `${r.heatIndexC.toFixed(1)}°` : '--'}
                    </td>
                    <td className="py-2 px-2 font-mono font-black text-right text-[#D93636] tabular-nums">
                      {r.apsdmaPeakC.toFixed(1)}°
                    </td>
                    <td className="py-2 px-2 text-right whitespace-nowrap">
                      <span className="inline-flex items-center gap-0.5">
                        <span className={`px-1.5 py-0.5 rounded-full text-[8.5px] font-extrabold uppercase ${tierBadge}`}>
                          {r.stressTier === 'EXTREME DANGER'
                            ? 'EXTREME'
                            : r.stressTier === 'EXTREME CAUTION'
                              ? 'EXT. CAUT'
                              : r.stressTier}
                        </span>
                        <ChevronRight
                          className={`w-3 h-3 ${isSelected ? 'text-[#D93636]' : 'text-slate-300'}`}
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
