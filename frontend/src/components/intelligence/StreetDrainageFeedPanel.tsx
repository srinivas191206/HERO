'use client';

import React from 'react';
import {
  AlertTriangle,
  ChevronRight,
  Droplets,
  MapPin,
  RotateCcw,
  Route,
  ShieldCheck
} from 'lucide-react';

export type SegmentAccessibilityStatus = 'IMPASSABLE' | 'CAUTION' | 'OPEN';

export interface EvaluatedUrbanSegment {
  id: string;
  name: string;
  role: 'drain_choke' | 'low_road' | 'safe_evac';
  thresholdDepthM: number;
  path: Array<[number, number]>;
  note: string;
  lat: number;
  lng: number;
  lengthKm: number;
  isFlooded: boolean;
  status: SegmentAccessibilityStatus;
}

interface StreetDrainageFeedPanelProps {
  hubCity: string;
  segments: EvaluatedUrbanSegment[];
  waterDepthM: number;
  selectedSegmentId: string | null;
  onInspectSegment: (segment: EvaluatedUrbanSegment) => void;
  onResetOverview?: () => void;
  lastSyncedLabel: string | null;
}

const ROLE_LABELS: Record<EvaluatedUrbanSegment['role'], string> = {
  low_road: 'Low-Lying / Underpass',
  drain_choke: 'Drainage Trunk Bottleneck',
  safe_evac: 'Elevated Safe Spine'
};

export const StreetDrainageFeedPanel: React.FC<StreetDrainageFeedPanelProps> = ({
  hubCity,
  segments,
  waterDepthM,
  selectedSegmentId,
  onInspectSegment,
  onResetOverview,
  lastSyncedLabel
}) => {
  return (
    <aside
      aria-label="Street Drainage & Emergency Route Feed"
      className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col gap-3 h-[500px] xl:h-[540px]"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5 flex-shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Droplets className="w-4 h-4 text-[#0788C9] flex-shrink-0" aria-hidden="true" />
            <h2 className="text-sm font-extrabold text-[#0B193D] tracking-tight truncate">
              Street Drainage &amp; Emergency Route Feed
            </h2>
          </div>
          <p className="text-[11px] font-medium text-slate-500 truncate mt-0.5">
            {hubCity}
          </p>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {selectedSegmentId && onResetOverview && (
            <button
              type="button"
              onClick={onResetOverview}
              className="px-2 py-0.5 rounded-lg bg-[#F5F8FC] hover:bg-slate-100 border border-slate-200 text-[10px] font-bold text-[#0788C9] inline-flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" aria-hidden="true" />
              Overview
            </button>
          )}
          <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[#16A477] text-[10px] font-bold">
            Live Status
          </span>
        </div>
      </div>

      {/* Location Cards */}
      <div className="flex-1 overflow-y-auto overscroll-contain space-y-2.5 pr-1 min-h-0">
        {segments.map(seg => {
          const isSelected = selectedSegmentId === seg.id;
          const cardTone =
            seg.status === 'IMPASSABLE'
              ? 'bg-[#FFF3F3] border-[#F8CCCC]'
              : seg.status === 'CAUTION'
                ? 'bg-[#FFFBEB] border-[#FDE68A]'
                : 'bg-[#ECFDF5] border-[#BDEBD8]';

          const badgeTone =
            seg.status === 'IMPASSABLE'
              ? 'bg-[#D93636] text-white'
              : seg.status === 'CAUTION'
                ? 'bg-[#D99A28] text-white'
                : 'bg-[#16A477] text-white';

          return (
            <button
              key={seg.id}
              type="button"
              onClick={() => onInspectSegment(seg)}
              className={`w-full text-left p-3 rounded-xl border transition space-y-1.5 cursor-pointer ${cardTone} ${
                isSelected ? 'ring-2 ring-[#0788C9]' : 'hover:shadow-2xs'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  {seg.status === 'IMPASSABLE' ? (
                    <AlertTriangle className="w-4 h-4 text-[#D93636] mt-0.5 flex-shrink-0" aria-hidden="true" />
                  ) : seg.status === 'CAUTION' ? (
                    <AlertTriangle className="w-4 h-4 text-[#D99A28] mt-0.5 flex-shrink-0" aria-hidden="true" />
                  ) : (
                    <ShieldCheck className="w-4 h-4 text-[#16A477] mt-0.5 flex-shrink-0" aria-hidden="true" />
                  )}
                  <div className="min-w-0">
                    <span className="text-xs font-extrabold text-[#0B193D] block leading-snug">
                      {seg.name}
                    </span>
                    <span className="text-[10px] font-semibold text-slate-500 block">
                      {ROLE_LABELS[seg.role]} • {seg.lengthKm.toFixed(1)} km path
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase ${badgeTone}`}>
                    {seg.status}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                </div>
              </div>

              <p className="text-[11px] text-slate-600 leading-snug">{seg.note}</p>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200/60 text-[10px] font-mono text-slate-600">
                <span>
                  Threshold: <strong>{seg.thresholdDepthM}m</strong> • Sim Depth:{' '}
                  <strong>{waterDepthM.toFixed(1)}m</strong>
                </span>
                <span className="font-sans font-bold text-[#0788C9] inline-flex items-center gap-0.5">
                  <MapPin className="w-3 h-3" aria-hidden="true" />
                  Inspect
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer Note */}
      <div className="p-2.5 rounded-xl bg-[#EEF7FC] border border-[#CBE7F7] text-[10.5px] text-[#0B193D] flex items-center gap-2 flex-shrink-0">
        <Route className="w-4 h-4 text-[#0788C9] flex-shrink-0" aria-hidden="true" />
        <span className="leading-snug">
          Street sensor depth gauges unavailable; passability above uses simulated depth ({waterDepthM.toFixed(1)}m)
          {lastSyncedLabel ? ` • Updated ${lastSyncedLabel}` : ''}.
        </span>
      </div>
    </aside>
  );
};
