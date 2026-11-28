'use client';

import React from 'react';
import {
  AlertTriangle,
  Compass,
  Droplets,
  ExternalLink,
  MapPin,
  RotateCcw,
  ShieldCheck,
  Users,
  Waves
} from 'lucide-react';
import { PointWeatherTelemetry } from '../../services/intelligence/OpenMeteoService';
import { TelemetryState } from './DamSimulationControls';

export type RiskSeverity = 'critical' | 'high' | 'moderate' | 'low';
export type SettlementSortKey = 'risk' | 'eta' | 'population';

export interface AssessedSettlement {
  index: number;
  name: string;
  lat: number;
  lng: number;
  distanceKm: number;
  population: number;
  criticalInfra: string;
  shelterName: string;
  shelterLat: number;
  shelterLng: number;
  etaMins: number;
  severity: RiskSeverity;
  severityRank: number;
}

interface DownstreamImpactPanelProps {
  river: string;
  damElevationLabel: string;
  weather: PointWeatherTelemetry | null;
  weatherStatus: TelemetryState;
  lastSyncedLabel: string | null;
  waveSpeedKmh: number;
  waveSeverity: RiskSeverity;
  settlements: AssessedSettlement[];
  sortBy: SettlementSortKey;
  onChangeSortBy: (sort: SettlementSortKey) => void;
  selectedSettlementName: string | null;
  onSelectSettlement: (settlement: AssessedSettlement) => void;
  onResetMapFocus?: () => void;
  onInspectSettlementIn3D?: (settlement: AssessedSettlement) => void;
}

const SEVERITY_STYLES: Record<
  RiskSeverity,
  {
    label: string;
    cardBorder: string;
    iconColor: string;
    etaPill: string;
    badge: string;
  }
> = {
  critical: {
    label: 'Critical',
    cardBorder: 'border-l-[#D93636]',
    iconColor: 'text-[#D93636]',
    etaPill: 'bg-red-50 text-[#D93636] border-red-200',
    badge: 'bg-red-100 text-[#D93636]'
  },
  high: {
    label: 'High',
    cardBorder: 'border-l-orange-500',
    iconColor: 'text-orange-600',
    etaPill: 'bg-orange-50 text-orange-700 border-orange-200',
    badge: 'bg-orange-100 text-orange-700'
  },
  moderate: {
    label: 'Moderate',
    cardBorder: 'border-l-[#D99A28]',
    iconColor: 'text-[#D99A28]',
    etaPill: 'bg-amber-50 text-[#B45309] border-amber-200',
    badge: 'bg-amber-100 text-[#B45309]'
  },
  low: {
    label: 'Low',
    cardBorder: 'border-l-[#16A477]',
    iconColor: 'text-[#16A477]',
    etaPill: 'bg-emerald-50 text-[#16A477] border-emerald-200',
    badge: 'bg-emerald-100 text-[#16A477]'
  }
};

export const DownstreamImpactPanel: React.FC<DownstreamImpactPanelProps> = ({
  river,
  damElevationLabel,
  weather,
  weatherStatus,
  lastSyncedLabel,
  waveSpeedKmh,
  waveSeverity,
  settlements,
  sortBy,
  onChangeSortBy,
  selectedSettlementName,
  onSelectSettlement,
  onResetMapFocus,
  onInspectSettlementIn3D
}) => {
  const velocityToneClass =
    waveSeverity === 'critical'
      ? 'bg-red-50 border-red-200 text-[#991B1B]'
      : waveSeverity === 'high'
        ? 'bg-orange-50 border-orange-200 text-orange-900'
        : 'bg-amber-50 border-amber-200 text-amber-900';

  const velocityIconClass =
    waveSeverity === 'critical'
      ? 'text-[#D93636]'
      : waveSeverity === 'high'
        ? 'text-orange-600'
        : 'text-[#D99A28]';

  return (
    <aside
      aria-label="Downstream Impact & Evacuation"
      className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col gap-3 h-[520px] xl:h-[580px]"
    >
      {/* Panel Header */}
      <div className="border-b border-slate-100 pb-2.5 flex items-start justify-between gap-2 flex-shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#0788C9] flex-shrink-0" aria-hidden="true" />
            <h2 className="text-sm font-extrabold text-[#0B193D] tracking-tight truncate">
              Downstream Impact &amp; Evacuation
            </h2>
          </div>
          <p className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wide mt-1 truncate">
            {river} • Dam Elev: {damElevationLabel} • Upstream 24h Rain:{' '}
            {weather ? `${weather.next24hRainMm} mm` : weatherStatus === 'loading' ? 'Syncing...' : 'N/A'}
          </p>
          {lastSyncedLabel && (
            <p className="text-[10px] font-medium text-slate-400 mt-0.5">
              Model synced {lastSyncedLabel}
            </p>
          )}
        </div>

        {selectedSettlementName && onResetMapFocus && (
          <button
            type="button"
            onClick={onResetMapFocus}
            title="Reset map back to full downstream corridor overview"
            className="px-2 py-1 rounded-lg bg-[#F5F8FC] hover:bg-slate-100 border border-slate-200 text-[10px] font-bold text-[#0788C9] inline-flex items-center gap-1 flex-shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" aria-hidden="true" />
            <span>Overview</span>
          </button>
        )}
      </div>

      {/* Flood Front Velocity Strip */}
      <div
        title="Estimated downstream flood wave speed computed from simulated downstream stage rise"
        className={`px-3 py-2 rounded-xl border flex items-center justify-between gap-2 text-xs font-bold flex-shrink-0 ${velocityToneClass}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Waves className={`w-4 h-4 flex-shrink-0 ${velocityIconClass}`} aria-hidden="true" />
          <span className="truncate">
            Flood Front Velocity: ~{waveSpeedKmh.toFixed(1)} km/h downstream
          </span>
        </div>
        <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/80">
          {SEVERITY_STYLES[waveSeverity].label}
        </span>
      </div>

      {/* Affected Settlements Subheader + Sort Control */}
      <div className="flex items-center justify-between gap-2 flex-shrink-0">
        <span className="text-xs font-extrabold text-[#0B193D]">
          Affected Settlements ({settlements.length})
        </span>
        <div className="flex items-center gap-1.5">
          <label htmlFor="settlement-sort" className="sr-only">
            Sort affected settlements
          </label>
          <select
            id="settlement-sort"
            value={sortBy}
            onChange={(e) => onChangeSortBy(e.target.value as SettlementSortKey)}
            className="bg-[#F5F8FC] border border-slate-200 hover:border-[#0788C9] rounded-lg px-2 py-1 text-[11px] font-semibold text-[#0B193D] focus:outline-none focus:border-[#0788C9] cursor-pointer"
          >
            <option value="risk">Highest Risk First</option>
            <option value="eta">Earliest Arrival (ETA)</option>
            <option value="population">Highest Population</option>
          </select>
        </div>
      </div>

      {/* Affected Settlements List */}
      <div className="flex-1 overflow-y-auto overscroll-contain space-y-2.5 pr-1 min-h-0">
        {settlements.length === 0 ? (
          <div className="h-full min-h-[180px] rounded-xl border border-dashed border-slate-200 bg-[#F5F8FC] flex flex-col items-center justify-center p-5 text-center gap-1.5">
            <Compass className="w-5 h-5 text-slate-400" aria-hidden="true" />
            <p className="text-xs font-bold text-[#0B193D]">
              No affected settlements identified
            </p>
            <p className="text-[11px] text-slate-500">
              Select another reservoir or check telemetry configuration.
            </p>
          </div>
        ) : (
          settlements.map((reg) => {
            const sevStyle = SEVERITY_STYLES[reg.severity];
            const isSelected = selectedSettlementName === reg.name;
            const hasVerifiedShelter = Boolean(reg.shelterName && reg.shelterName.trim());

            return (
              <article
                key={reg.name}
                className={`border border-slate-200 border-l-4 ${sevStyle.cardBorder} rounded-xl bg-white transition shadow-2xs ${
                  isSelected
                    ? 'ring-2 ring-[#0788C9]/40 border-[#0788C9] bg-[#F5F8FC]'
                    : 'hover:border-slate-300'
                }`}
              >
                {/* Interactive Selection Region (focuses map on existing marker/region) */}
                <button
                  type="button"
                  onClick={() => onSelectSettlement(reg)}
                  className="w-full text-left p-3 pb-2 space-y-1.5 cursor-pointer rounded-t-xl focus-visible:outline-2 focus-visible:outline-[#0788C9]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-1.5 min-w-0">
                      <AlertTriangle
                        className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${sevStyle.iconColor}`}
                        aria-hidden="true"
                      />
                      <span className="text-xs font-extrabold text-[#0B193D] leading-snug">
                        {reg.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${sevStyle.badge}`}
                      >
                        {sevStyle.label}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full border font-mono font-extrabold text-[10px] tabular-nums ${sevStyle.etaPill}`}
                      >
                        ETA {reg.etaMins} min
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-600">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-slate-400" aria-hidden="true" />
                      <strong>Distance:</strong> {reg.distanceKm} km
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="w-3 h-3 text-slate-400" aria-hidden="true" />
                      <strong>Pop:</strong> {reg.population.toLocaleString()}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-600 leading-snug">
                    <strong className="text-slate-700">Exposed Assets:</strong> {reg.criticalInfra}
                  </p>
                </button>

                {/* Evacuation Bar & 3D Inspection Action */}
                <div className="px-3 py-2 border-t border-slate-100 bg-emerald-50/40 rounded-b-xl flex items-center justify-between gap-2">
                  {hasVerifiedShelter ? (
                    <span className="text-[11px] font-bold text-[#16A477] inline-flex items-center gap-1.5 min-w-0 truncate">
                      <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                      <span className="truncate">Evacuate to: {reg.shelterName}</span>
                    </span>
                  ) : (
                    <span className="text-[11px] font-semibold text-slate-500 italic truncate">
                      Evacuation destination unassigned
                    </span>
                  )}

                  {onInspectSettlementIn3D && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onInspectSettlementIn3D(reg);
                      }}
                      className="text-[10px] font-extrabold uppercase tracking-wide text-[#0788C9] hover:text-[#0B193D] inline-flex items-center gap-1 flex-shrink-0 px-2 py-0.5 rounded-md hover:bg-white transition cursor-pointer"
                    >
                      <span>3D View</span>
                      <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </article>
            );
          })
        )}
      </div>

      {/* Footer Weather & Soil Context */}
      <div className="px-3 py-2 rounded-xl bg-[#F5F8FC] border border-slate-200 text-[10.5px] font-medium text-slate-600 flex items-center justify-between gap-2 flex-shrink-0">
        <span className="inline-flex items-center gap-1.5 truncate">
          <Droplets className="w-3.5 h-3.5 text-[#0788C9] flex-shrink-0" aria-hidden="true" />
          <span className="truncate">
            Soil saturation:{' '}
            {weather?.soilMoistureTop != null
              ? `${(weather.soilMoistureTop * 100).toFixed(1)}%`
              : weatherStatus === 'loading'
                ? 'Syncing...'
                : 'Unavailable'}{' '}
            • Wind {weather ? `${weather.windSpeedKmh} km/h` : '--'}
          </span>
        </span>
        <span
          className={`text-[9.5px] font-bold uppercase flex-shrink-0 ${
            weatherStatus === 'live'
              ? 'text-[#16A477]'
              : weatherStatus === 'loading'
                ? 'text-[#0788C9]'
                : 'text-[#D99A28]'
          }`}
        >
          {weatherStatus === 'live' ? 'Live' : weatherStatus === 'loading' ? 'Syncing' : 'Unavailable'}
        </span>
      </div>
    </aside>
  );
};
