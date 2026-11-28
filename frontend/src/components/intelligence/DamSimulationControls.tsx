'use client';

import React from 'react';
import {
  Activity,
  Box,
  Gauge,
  Landmark,
  Layers,
  RefreshCw,
  Waves
} from 'lucide-react';
import { RiverDischargeTelemetry } from '../../services/intelligence/OpenMeteoService';

export interface ReservoirOption {
  id: string;
  name: string;
  river: string;
  district: string;
  frlMeters: number;
  capacityTmc: number;
}

export type TelemetryState = 'loading' | 'live' | 'delayed' | 'unavailable' | 'error';

interface DamSimulationControlsProps {
  dams: ReservoirOption[];
  selectedDamId: string;
  activeDam: ReservoirOption;
  onSelectDam: (damId: string) => void;
  breachRatio: number;
  onChangeBreachRatio: (value: number) => void;
  surgeMeters: number;
  onChangeSurgeMeters: (value: number) => void;
  discharge: RiverDischargeTelemetry | null;
  glofasStatus: TelemetryState;
  glofasError: string | null;
  simulatedPeakCumecs: number;
  affectedPopTotal: number;
  loading: boolean;
  onRefresh: () => void;
  onInspectDamIn3D?: () => void;
}

export const DamSimulationControls: React.FC<DamSimulationControlsProps> = ({
  dams,
  selectedDamId,
  activeDam,
  onSelectDam,
  breachRatio,
  onChangeBreachRatio,
  surgeMeters,
  onChangeSurgeMeters,
  discharge,
  glofasStatus,
  glofasError,
  simulatedPeakCumecs,
  affectedPopTotal,
  loading,
  onRefresh,
  onInspectDamIn3D
}) => {
  const modelStatusMeta = (() => {
    if (loading && !discharge) {
      return {
        label: 'Running Model',
        badgeClass: 'bg-amber-50 border-amber-200 text-[#D99A28]',
        dotClass: 'bg-[#D99A28] animate-pulse'
      };
    }
    if (glofasStatus === 'error') {
      return {
        label: 'Telemetry Offline',
        badgeClass: 'bg-red-50 border-red-200 text-[#D93636]',
        dotClass: 'bg-[#D93636]'
      };
    }
    if (glofasStatus === 'unavailable' || glofasStatus === 'delayed') {
      return {
        label: 'Model Ready (Partial Feed)',
        badgeClass: 'bg-amber-50 border-amber-200 text-[#D99A28]',
        dotClass: 'bg-[#D99A28]'
      };
    }
    return {
      label: 'Live Model',
      badgeClass: 'bg-emerald-50 border-emerald-200 text-[#16A477]',
      dotClass: 'bg-[#16A477] animate-pulse'
    };
  })();

  const breachColor =
    breachRatio >= 75 ? '#D93636' : breachRatio >= 50 ? '#EA580C' : '#0788C9';

  return (
    <section
      aria-label="Dam Break Simulation Controls"
      className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden"
    >
      {/* Main Page Header */}
      <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[#EEF4FD] border border-[#DCE7F7] text-[#0788C9] flex items-center justify-center flex-shrink-0">
            <Waves className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-extrabold text-[#0B193D] tracking-tight truncate">
              Dam Break &amp; Inundation Intelligence
            </h1>
            <p className="text-xs text-slate-500 font-medium truncate mt-0.5">
              Hydrodynamic breach modelling, downstream arrival &amp; evacuation planning (Open-Meteo GLOFAS + AWS DEM)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold ${modelStatusMeta.badgeClass}`}
          >
            <span className={`w-2 h-2 rounded-full ${modelStatusMeta.dotClass}`} aria-hidden="true" />
            <span>{modelStatusMeta.label}</span>
          </span>

          {onInspectDamIn3D && (
            <button
              type="button"
              onClick={onInspectDamIn3D}
              className="px-3 py-1.5 rounded-xl bg-white hover:bg-[#F5F8FC] border border-slate-200 hover:border-[#0788C9] text-[#0B193D] text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer focus-visible:outline-2 focus-visible:outline-[#0788C9]"
            >
              <Box className="w-4 h-4 text-[#0788C9]" aria-hidden="true" />
              <span>Inspect Dam in 3D</span>
            </button>
          )}

          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            aria-label="Refresh hydrological telemetry"
            title="Refresh GLOFAS river discharge & upstream weather"
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-[#F5F8FC] text-[#0B193D] transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-[#0788C9]"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#0788C9]' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* 4-Group Simulation Control Workspace */}
      <div className="p-4 sm:px-5 sm:py-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-4 items-center">
        {/* GROUP A — Target Reservoir / Barrage */}
        <div className="xl:col-span-3 min-w-0">
          <label
            htmlFor="dam-select"
            className="text-[11px] font-bold text-[#0B193D] flex items-center gap-1.5 mb-1.5"
          >
            <Landmark className="w-3.5 h-3.5 text-[#0788C9] flex-shrink-0" aria-hidden="true" />
            <span>Target Reservoir / Barrage</span>
          </label>
          <select
            id="dam-select"
            value={selectedDamId}
            onChange={(e) => onSelectDam(e.target.value)}
            className="w-full px-3 py-2 bg-[#F5F8FC] hover:border-[#0788C9] focus:border-[#0788C9] focus:outline-none border border-slate-200 rounded-xl text-xs font-bold text-[#0B193D] cursor-pointer transition"
          >
            {dams.map(d => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.district})
              </option>
            ))}
          </select>
          <p className="text-[10px] font-semibold text-slate-500 mt-1 truncate">
            {activeDam.river} • FRL {activeDam.frlMeters} m • {activeDam.capacityTmc} TMC
          </p>
        </div>

        {/* GROUP B — Gate / Breach Scenario */}
        <div className="xl:col-span-3 min-w-0">
          <label
            htmlFor="breach-range"
            className="text-[11px] font-bold text-[#0B193D] flex items-center justify-between gap-2 mb-1"
          >
            <span className="inline-flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5 text-[#0788C9] flex-shrink-0" aria-hidden="true" />
              <span>Gate / Breach Scenario</span>
            </span>
            <span
              className={`font-mono text-sm font-black tabular-nums ${
                breachRatio >= 75
                  ? 'text-[#D93636]'
                  : breachRatio >= 50
                    ? 'text-orange-600'
                    : 'text-[#0788C9]'
              }`}
            >
              {breachRatio}%
            </span>
          </label>
          <input
            id="breach-range"
            type="range"
            min={15}
            max={100}
            step={5}
            value={breachRatio}
            aria-valuetext={`${breachRatio} percent breach opening`}
            onChange={(e) => onChangeBreachRatio(Number(e.target.value))}
            className="hero-range-slider"
            style={
              {
                '--attr-min': 15,
                '--attr-max': 100,
                '--control-value': breachRatio,
                '--slider-fill-color': breachColor
              } as React.CSSProperties
            }
          />
          <div className="flex justify-between text-[10px] font-semibold text-slate-500">
            <span>Spillway Release (15%)</span>
            <span>Full Breach (100%)</span>
          </div>
        </div>

        {/* GROUP C — Downstream Stage Rise */}
        <div className="xl:col-span-3 min-w-0">
          <label
            htmlFor="surge-range"
            className="text-[11px] font-bold text-[#0B193D] flex items-center justify-between gap-2 mb-1"
          >
            <span className="inline-flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-[#0788C9] flex-shrink-0" aria-hidden="true" />
              <span>Downstream Stage Rise</span>
            </span>
            <span className="font-mono text-sm font-black text-[#0788C9] tabular-nums">
              +{surgeMeters.toFixed(1)} m
            </span>
          </label>
          <input
            id="surge-range"
            type="range"
            min={2}
            max={18}
            step={0.5}
            value={surgeMeters}
            aria-valuetext={`Plus ${surgeMeters.toFixed(1)} metres downstream stage rise`}
            onChange={(e) => onChangeSurgeMeters(Number(e.target.value))}
            className="hero-range-slider"
            style={
              {
                '--attr-min': 2,
                '--attr-max': 18,
                '--control-value': surgeMeters,
                '--slider-fill-color': '#0788C9'
              } as React.CSSProperties
            }
          />
          <div className="flex justify-between text-[10px] font-semibold text-slate-500">
            <span>+2m Watch</span>
            <span>+18m Catastrophic</span>
          </div>
        </div>

        {/* GROUP D — Hydrological Indicators (Observed vs Simulated) */}
        <div className="xl:col-span-3 md:col-span-2 grid grid-cols-2 gap-2.5 min-w-0">
          {/* Card 1: Observed GLOFAS Telemetry */}
          <div
            title={glofasError || 'Observed river discharge from Open-Meteo GLOFAS hydrological API'}
            className="bg-[#EEF7FC] border border-[#CBE7F7] rounded-xl p-2.5 flex flex-col justify-between min-w-0"
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-bold text-[#0788C9] inline-flex items-center gap-1 truncate">
                <Waves className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                <span className="truncate">Live GLOFAS Flow</span>
              </span>
              <span
                className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                  glofasStatus === 'live'
                    ? 'bg-emerald-100 text-[#16A477]'
                    : glofasStatus === 'loading'
                      ? 'bg-sky-100 text-[#0788C9]'
                      : 'bg-amber-100 text-[#D99A28]'
                }`}
              >
                {glofasStatus === 'live'
                  ? 'LIVE'
                  : glofasStatus === 'loading'
                    ? 'SYNC'
                    : 'STALE'}
              </span>
            </div>
            <div className="mt-1">
              <span className="text-base sm:text-lg font-extrabold font-mono text-[#0B193D] tabular-nums block truncate">
                {loading && !discharge
                  ? 'Syncing...'
                  : glofasStatus === 'error' || glofasStatus === 'unavailable' || !discharge
                    ? 'Unavailable'
                    : `${discharge.currentDischarge.toFixed(1)} m³/s`}
              </span>
              <span className="text-[10px] font-semibold text-slate-600 block truncate mt-0.5">
                {discharge
                  ? `7d peak: ${discharge.peak7dDischarge.toFixed(1)} m³/s`
                  : glofasError
                    ? 'GLOFAS feed unreachable'
                    : 'Awaiting feed'}
              </span>
            </div>
          </div>

          {/* Card 2: Model-Generated Simulated Surge */}
          <div
            title="Hydrodynamic breach scenario estimate calculated from reservoir capacity, gate opening %, and stage rise"
            className="bg-[#FFF3F3] border border-[#F8CCCC] rounded-xl p-2.5 flex flex-col justify-between min-w-0"
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-bold text-[#D93636] inline-flex items-center gap-1 truncate">
                <Activity className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                <span className="truncate">Simulated Surge</span>
              </span>
              <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-red-100 text-[#D93636]">
                MODEL
              </span>
            </div>
            <div className="mt-1">
              <span className="text-base sm:text-lg font-extrabold font-mono text-[#D93636] tabular-nums block truncate">
                {simulatedPeakCumecs.toLocaleString()} m³/s
              </span>
              <span className="text-[10px] font-semibold text-[#D93636]/90 block truncate mt-0.5">
                Est. exposed: ~{affectedPopTotal.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
