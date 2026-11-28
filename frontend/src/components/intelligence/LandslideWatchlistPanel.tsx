'use client';

import React, { useState } from 'react';
import { Camera, ChevronDown, ChevronRight, MapPin, Mountain } from 'lucide-react';
import { EvaluatedLandslideZone, LandslideRiskTier } from './landslideTypes';

interface LandslideWatchlistPanelProps {
  visibleZones: EvaluatedLandslideZone[];
  selectedId: string;
  onSelectZone: (zoneId: string) => void;
  onOpenObservationModal: (zoneId?: string) => void;
  reportCountByZone: Record<string, number>;
}

function getTierBadgeClasses(tier: LandslideRiskTier): string {
  switch (tier) {
    case 'CRITICAL':
      return 'bg-red-100 text-red-700 border-red-200';
    case 'HIGH':
      return 'bg-orange-100 text-orange-700 border-orange-200';
    case 'MODERATE':
      return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'LOW':
    default:
      return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  }
}

export const LandslideWatchlistPanel: React.FC<LandslideWatchlistPanelProps> = ({
  visibleZones,
  selectedId,
  onSelectZone,
  onOpenObservationModal,
  reportCountByZone
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <section
      aria-label="Geo-Tagged Field Reports and Corridor Watchlist"
      className="bg-white border border-slate-200/90 rounded-2xl shadow-xs p-4 flex flex-col h-[500px] min-w-0"
    >
      <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-100">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center shrink-0 text-sky-600 mt-0.5">
            <MapPin className="w-4 h-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs sm:text-sm font-black text-slate-900 truncate">
              Geo-Tagged Field Reports &amp; Corridor Watchlist
            </h3>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Add Slope Crack / Boulder Observation
            </p>
          </div>
        </div>
        <span className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[10px] font-black text-slate-600 shrink-0">
          {visibleZones.length} Zones
        </span>
      </div>

      {/* Primary Action CTA matching reference screenshot */}
      <div className="py-3 shrink-0">
        <button
          type="button"
          onClick={() => onOpenObservationModal(selectedId)}
          className="w-full py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white font-black text-xs flex items-center justify-center gap-2 shadow-xs transition cursor-pointer"
        >
          <Camera className="w-4 h-4" aria-hidden="true" />
          Log Field Observation
        </button>
      </div>

      {/* Scrollable Corridor Watchlist */}
      <div className="flex-1 overflow-y-auto overscroll-contain space-y-2 pr-1">
        {visibleZones.map(v => {
          const isSelected = v.zone.id === selectedId;
          const isExpanded = expandedId === v.zone.id;
          const obsCount = reportCountByZone[v.zone.id] || 0;

          return (
            <div
              key={v.zone.id}
              className={`rounded-2xl border transition ${
                isSelected
                  ? 'bg-sky-50/70 border-sky-300 shadow-xs'
                  : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/70'
              }`}
            >
              <div className="p-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onSelectZone(v.zone.id)}
                  className="flex-1 text-left min-w-0 cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black text-slate-900 flex items-center gap-1.5 min-w-0">
                      <Mountain
                        className={`w-3.5 h-3.5 shrink-0 ${
                          v.tier === 'CRITICAL'
                            ? 'text-red-600'
                            : v.tier === 'HIGH'
                              ? 'text-orange-600'
                              : v.tier === 'MODERATE'
                                ? 'text-amber-600'
                                : 'text-emerald-600'
                        }`}
                        aria-hidden="true"
                      />
                      <span className="truncate">{v.zone.name}</span>
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full border text-[9px] font-black uppercase shrink-0 ${getTierBadgeClasses(
                        v.tier
                      )}`}
                    >
                      {v.risk} • {v.tier}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[10.5px] text-slate-500">
                    <span className="truncate">{v.zone.vulnerableRoad}</span>
                    {obsCount > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 font-bold text-[9px] shrink-0">
                        {obsCount} RPT
                      </span>
                    )}
                  </div>
                </button>

                <button
                  type="button"
                  aria-expanded={isExpanded}
                  aria-label={`${isExpanded ? 'Collapse' : 'Expand'} details for ${v.zone.name}`}
                  onClick={() => setExpandedId(prev => (prev === v.zone.id ? null : v.zone.id))}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer shrink-0"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="w-4 h-4" aria-hidden="true" />
                  )}
                </button>
              </div>

              {isExpanded && (
                <div className="px-3 pb-3 pt-2 border-t border-slate-200/70 text-[11px] space-y-2 bg-white/70 rounded-b-2xl">
                  <div className="grid grid-cols-3 gap-2 font-mono text-[10px]">
                    <div className="p-1.5 rounded-lg bg-slate-50 border border-slate-200/70">
                      <span className="text-slate-400 block">SLOPE</span>
                      <span className="font-bold text-slate-800">{v.slope.toFixed(1)}°</span>
                    </div>
                    <div className="p-1.5 rounded-lg bg-slate-50 border border-slate-200/70">
                      <span className="text-slate-400 block">RAIN 72H</span>
                      <span className="font-bold text-slate-800">{v.rain72.toFixed(1)} mm</span>
                    </div>
                    <div className="p-1.5 rounded-lg bg-slate-50 border border-slate-200/70">
                      <span className="text-slate-400 block">SOIL VWC</span>
                      <span className="font-bold text-slate-800">{v.soilPct.toFixed(0)}%</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[10.5px] text-slate-600">
                    <span className="truncate">{v.zone.historicalEvents}</span>
                    <button
                      type="button"
                      onClick={() => onOpenObservationModal(v.zone.id)}
                      className="text-sky-700 font-bold hover:underline shrink-0 cursor-pointer"
                    >
                      + Log Report
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
