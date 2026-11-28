'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import {
  ArrowRight,
  Building2,
  ChevronRight,
  ChevronUp,
  Clock,
  Droplets,
  Hospital,
  ShieldAlert,
  Waves
} from 'lucide-react';
import { TacticalFacility3D } from '../../utils/apDistricts';
import { EvaluatedUrbanSegment } from './StreetDrainageFeedPanel';

export interface VerifiedHospitalFacility {
  name: string;
  address?: string;
  emergency?: string;
  lat: number;
  lng: number;
}

interface DrainageInfrastructurePanelProps {
  hubCity: string;
  drainCapacityMmHr: number;
  liveRainMm: number | null;
  segments: EvaluatedUrbanSegment[];
  tacticalFacilities: TacticalFacility3D[];
  verifiedHospitals: VerifiedHospitalFacility[];
  lastSyncedLabel: string | null;
  onFocusCoordinate: (lat: number, lng: number) => void;
}

export const DrainageInfrastructurePanel: React.FC<DrainageInfrastructurePanelProps> = ({
  hubCity,
  drainCapacityMmHr,
  liveRainMm,
  segments,
  tacticalFacilities,
  verifiedHospitals,
  lastSyncedLabel,
  onFocusCoordinate
}) => {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsId = useId();
  const detailRegionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = detailRegionRef.current;
    if (!el || !('onbeforematch' in HTMLElement.prototype)) return;
    const onBeforeMatch = () => setDetailsOpen(true);
    el.addEventListener('beforematch', onBeforeMatch);
    return () => el.removeEventListener('beforematch', onBeforeMatch);
  }, []);

  const bottlenecks = segments.filter(
    s => s.role === 'low_road' || s.role === 'drain_choke'
  );
  const activeBottlenecks = bottlenecks.filter(s => s.status !== 'OPEN');
  const isElevatedDrainStress = liveRainMm != null && liveRainMm >= drainCapacityMmHr;

  const policeStationsCount = tacticalFacilities.filter(f => f.kind === 'station').length;
  const shelterCount = tacticalFacilities.filter(f => f.kind === 'shelter').length;

  return (
    <section
      id="drainage-infrastructure-panel"
      aria-label="Drainage & Critical Infrastructure"
      className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden flex flex-col justify-between"
    >
      <div className="p-4 space-y-2.5 flex-1 flex flex-col justify-between">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-[#EEF4FD] border border-[#DCE7F7] text-[#0788C9] flex items-center justify-center flex-shrink-0">
              <Building2 className="w-4 h-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-extrabold text-[#0B193D] tracking-tight truncate">
                Drainage &amp; Critical Infrastructure
              </h2>
              <p className="text-[11px] font-medium text-slate-500 truncate">
                Drainage performance, bottlenecks &amp; facilities
              </p>
            </div>
          </div>

          <button
            type="button"
            aria-expanded={detailsOpen}
            aria-controls={detailsId}
            onClick={() => setDetailsOpen(prev => !prev)}
            className="px-2.5 py-1 rounded-xl bg-white hover:bg-[#F5F8FC] border border-slate-200 hover:border-[#0788C9] text-[11px] font-bold text-[#0B193D] inline-flex items-center gap-1 cursor-pointer flex-shrink-0"
          >
            <span>{detailsOpen ? 'Hide' : 'Details'}</span>
            {detailsOpen ? (
              <ChevronUp className="w-3 h-3 text-[#0788C9]" aria-hidden="true" />
            ) : (
              <ArrowRight className="w-3 h-3 text-[#0788C9]" aria-hidden="true" />
            )}
          </button>
        </div>

        {/* Structured Status Rows */}
        <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl bg-[#F5F8FC]/60 text-xs">
          <div className="px-3 py-2 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 font-semibold text-slate-700">
              <Waves className="w-3.5 h-3.5 text-[#0788C9]" aria-hidden="true" />
              Drainage Status
            </span>
            <span
              className={`font-bold text-[11px] ${
                isElevatedDrainStress ? 'text-[#D93636]' : 'text-[#16A477]'
              }`}
            >
              {isElevatedDrainStress ? 'Elevated Runoff' : 'Operational'} ({drainCapacityMmHr} mm/hr)
            </span>
          </div>

          <button
            type="button"
            onClick={() => setDetailsOpen(prev => !prev)}
            className="w-full px-3 py-2 flex items-center justify-between gap-2 text-left hover:bg-white cursor-pointer transition"
          >
            <span className="inline-flex items-center gap-2 font-semibold text-slate-700">
              <ShieldAlert className="w-3.5 h-3.5 text-[#D99A28]" aria-hidden="true" />
              Drainage Bottlenecks
            </span>
            <span className="inline-flex items-center gap-1 font-bold text-[11px] text-[#D93636]">
              {activeBottlenecks.length > 0
                ? `${activeBottlenecks.length} Affected`
                : `${bottlenecks.length} Monitored`}
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
            </span>
          </button>

          <button
            type="button"
            onClick={() => setDetailsOpen(prev => !prev)}
            className="w-full px-3 py-2 flex items-center justify-between gap-2 text-left hover:bg-white cursor-pointer transition"
          >
            <span className="inline-flex items-center gap-2 font-semibold text-slate-700">
              <Hospital className="w-3.5 h-3.5 text-[#0788C9]" aria-hidden="true" />
              Critical Facilities
            </span>
            <span className="inline-flex items-center gap-1 font-bold text-[11px] text-[#0788C9]">
              Hosp ({verifiedHospitals.length > 0 ? verifiedHospitals.length : 'N/A'}), Pol ({policeStationsCount}), Shelter ({shelterCount})
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
            </span>
          </button>

          <div className="px-3 py-2 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 font-semibold text-slate-700">
              <Clock className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
              Last Updated
            </span>
            <span className="font-mono font-bold text-[11px] text-[#0B193D]">
              {lastSyncedLabel ? `${lastSyncedLabel} (Open-Meteo)` : 'Awaiting sync'}
            </span>
          </div>
        </div>
      </div>

      {/* Expandable Details Disclosure */}
      <div
        id={detailsId}
        ref={detailRegionRef}
        hidden={!detailsOpen ? ('until-found' as unknown as boolean) : undefined}
      >
        <div className="px-4 pb-4 pt-3 border-t border-slate-100 bg-[#F5F8FC]/80 space-y-2.5 text-xs">
          <div>
            <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-[#0B193D] mb-1">
              Drainage Bottleneck Zones — {hubCity}
            </h3>
            <ul className="space-y-1">
              {bottlenecks.map(b => (
                <li key={b.id} className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
                  <span className="font-semibold text-[#0B193D] truncate">{b.name}</span>
                  <button
                    type="button"
                    onClick={() => onFocusCoordinate(b.lat, b.lng)}
                    className="text-[10px] font-bold text-[#0788C9] hover:underline flex-shrink-0 cursor-pointer"
                  >
                    Focus ({b.thresholdDepthM}m limit)
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-[#0B193D] mb-1 flex items-center gap-1">
              <Droplets className="w-3 h-3 text-[#0788C9]" aria-hidden="true" />
              Verified HERO &amp; GeoJSON Facilities
            </h3>
            <ul className="space-y-1 max-h-36 overflow-y-auto">
              {tacticalFacilities.map(f => (
                <li key={f.id} className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
                  <span className="truncate font-semibold text-slate-700">{f.name}</span>
                  <button
                    type="button"
                    onClick={() => onFocusCoordinate(f.lat, f.lng)}
                    className="text-[10px] font-bold text-[#0788C9] hover:underline flex-shrink-0 cursor-pointer"
                  >
                    Map
                  </button>
                </li>
              ))}
              {verifiedHospitals.map(h => (
                <li key={h.name} className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
                  <span className="truncate font-semibold text-[#D93636]">{h.name}</span>
                  <button
                    type="button"
                    onClick={() => onFocusCoordinate(h.lat, h.lng)}
                    className="text-[10px] font-bold text-[#0788C9] hover:underline flex-shrink-0 cursor-pointer"
                  >
                    Map
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
};
