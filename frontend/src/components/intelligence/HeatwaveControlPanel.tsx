'use client';

import React from 'react';
import {
  AlertTriangle,
  Box,
  Flame,
  MapPin,
  RefreshCw,
  Sun,
  Thermometer,
  Users
} from 'lucide-react';
import { ApDistrictMeta } from '../../utils/apDistricts';

export type HeatStressTier =
  | 'NORMAL'
  | 'CAUTION'
  | 'EXTREME CAUTION'
  | 'DANGER'
  | 'EXTREME DANGER';

export type ThermalFeedStatus = 'loading' | 'live' | 'delayed' | 'unavailable' | 'error';

export interface DistrictHeatRow {
  meta: ApDistrictMeta;
  liveTempC: number;
  liveRh: number;
  heatIndexC: number;
  apsdmaPeakC: number;
  displayTempC: number;
  stressTier: HeatStressTier;
  hasLiveWeather: boolean;
  verifiedOfficerCount: number;
}

interface HeatwaveControlPanelProps {
  rows: DistrictHeatRow[];
  activeRow?: DistrictHeatRow;
  selectedDist: string;
  onSelectDist: (district: string) => void;
  dataSourceMode: 'live' | 'apsdma';
  onChangeDataSourceMode: (mode: 'live' | 'apsdma') => void;
  weatherStatus: ThermalFeedStatus;
  lastSyncedLabel: string | null;
  loading: boolean;
  onRefresh: () => void;
  onInspectIn3D?: () => void;
}

export const HeatwaveControlPanel: React.FC<HeatwaveControlPanelProps> = ({
  rows,
  activeRow,
  selectedDist,
  onSelectDist,
  dataSourceMode,
  onChangeDataSourceMode,
  weatherStatus,
  lastSyncedLabel,
  loading,
  onRefresh,
  onInspectIn3D
}) => {
  const statusIndicator = (() => {
    if (loading && weatherStatus === 'loading') {
      return {
        label: 'Syncing Thermal Feed',
        pillClass: 'bg-amber-50 border-amber-200 text-[#D99A28]',
        icon: Thermometer
      };
    }
    if (weatherStatus === 'error' && dataSourceMode === 'live') {
      return {
        label: 'Live Feed Error',
        pillClass: 'bg-red-50 border-red-200 text-[#D93636]',
        icon: AlertTriangle
      };
    }
    if (activeRow && (activeRow.stressTier === 'DANGER' || activeRow.stressTier === 'EXTREME DANGER')) {
      return {
        label: 'High Thermal Stress',
        pillClass: 'bg-[#FFF3F3] border-[#F8CCCC] text-[#D93636]',
        icon: AlertTriangle
      };
    }
    if (activeRow && (activeRow.stressTier === 'CAUTION' || activeRow.stressTier === 'EXTREME CAUTION')) {
      return {
        label: 'Elevated Thermal Watch',
        pillClass: 'bg-amber-50 border-amber-200 text-[#B45309]',
        icon: Sun
      };
    }
    return {
      label: 'Normal Monitoring',
      pillClass: 'bg-emerald-50 border-emerald-200 text-[#16A477]',
      icon: Thermometer
    };
  })();

  const StatusIcon = statusIndicator.icon;
  const activeTier = activeRow?.stressTier || 'NORMAL';

  return (
    <section
      aria-label="Heatwave Intelligence Control Panel"
      className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden"
    >
      {/* Page Header Row */}
      <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[#FFF3F3] border border-[#F8CCCC] text-[#D93636] flex items-center justify-center flex-shrink-0">
            <Thermometer className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-extrabold text-[#0B193D] tracking-tight truncate">
              Heatwave &amp; Human Thermal Stress Intelligence
            </h1>
            <p className="text-xs text-slate-500 font-medium truncate mt-0.5">
              APSDMA 28-District Heatwave Baseline + Live Temperature / Humidity + Human Heat Index
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold ${statusIndicator.pillClass}`}
          >
            <StatusIcon className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
            <span>{statusIndicator.label}</span>
          </span>

          <div
            role="group"
            aria-label="Thermal Map Data Layer Mode"
            className="inline-flex bg-[#F5F8FC] p-0.5 rounded-xl border border-slate-200 text-xs font-bold"
          >
            <button
              type="button"
              onClick={() => onChangeDataSourceMode('apsdma')}
              aria-pressed={dataSourceMode === 'apsdma'}
              className={`px-3 py-1 rounded-lg cursor-pointer transition ${
                dataSourceMode === 'apsdma'
                  ? 'bg-white text-[#D93636] shadow-2xs border border-slate-200/80'
                  : 'text-slate-500 hover:text-[#0B193D]'
              }`}
            >
              APSDMA Peak
            </button>
            <button
              type="button"
              onClick={() => onChangeDataSourceMode('live')}
              aria-pressed={dataSourceMode === 'live'}
              className={`px-3 py-1 rounded-lg cursor-pointer transition ${
                dataSourceMode === 'live'
                  ? 'bg-white text-[#0788C9] shadow-2xs border border-slate-200/80'
                  : 'text-slate-500 hover:text-[#0B193D]'
              }`}
            >
              Live Heat Index
            </button>
          </div>

          {onInspectIn3D && activeRow && (
            <button
              type="button"
              onClick={onInspectIn3D}
              className="px-3 py-1.5 rounded-xl bg-white hover:bg-[#F5F8FC] border border-slate-200 hover:border-[#0788C9] text-[#0B193D] text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer focus-visible:outline-2 focus-visible:outline-[#0788C9]"
            >
              <Box className="w-4 h-4 text-[#0788C9]" aria-hidden="true" />
              <span>3D District</span>
            </button>
          )}

          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            aria-label="Refresh live thermal telemetry"
            title="Refresh Open-Meteo 28-district temperature & humidity observations"
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-[#F5F8FC] text-[#0B193D] transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-[#0788C9]"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#0788C9]' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* 5-Element Thermal Intelligence Strip */}
      {activeRow && (
        <div className="p-4 sm:px-5 sm:py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-stretch">
          {/* A. Selected District Selector */}
          <div className="p-3 rounded-xl bg-[#F5F8FC] border border-slate-200 flex flex-col justify-between min-w-0">
            <label
              htmlFor="hw-district-select"
              className="text-[10.5px] font-bold text-[#0B193D] inline-flex items-center gap-1.5 mb-1.5"
            >
              <MapPin className="w-3.5 h-3.5 text-[#0788C9] flex-shrink-0" aria-hidden="true" />
              <span>Selected District</span>
            </label>
            <select
              id="hw-district-select"
              value={selectedDist}
              onChange={(e) => onSelectDist(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-white border border-slate-200 hover:border-[#0788C9] focus:border-[#0788C9] focus:outline-none rounded-lg text-xs font-extrabold text-[#0B193D] cursor-pointer"
            >
              {rows.map(r => (
                <option key={r.meta.code} value={r.meta.district}>
                  {r.meta.district} ({r.meta.code})
                </option>
              ))}
            </select>
            <span className="text-[10.5px] font-medium text-slate-500 mt-1.5 block truncate">
              Hottest Mandal: <strong className="text-slate-700">{activeRow.meta.peakMandal}</strong>
            </span>
          </div>

          {/* B. APSDMA Peak Tmax (Official Baseline) */}
          <div className="p-3 rounded-xl bg-[#FFF3F3] border border-[#F8CCCC] flex flex-col justify-between min-w-0">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#D93636] inline-flex items-center gap-1 truncate">
                <Thermometer className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                APSDMA Peak Tmax
              </span>
              <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-100 text-[#D93636]">
                BASELINE
              </span>
            </div>
            <span className="text-2xl font-black font-mono text-[#D93636] tabular-nums mt-1">
              {activeRow.apsdmaPeakC.toFixed(1)}°C
            </span>
            <span className="text-[10.5px] font-semibold text-slate-600 truncate">
              Official district baseline
            </span>
          </div>

          {/* C. Live Temp / RH (Observed Open-Meteo) */}
          <div className="p-3 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] flex flex-col justify-between min-w-0">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#B45309] inline-flex items-center gap-1 truncate">
                <Sun className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                Live Temp / RH
              </span>
              <span
                className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                  activeRow.hasLiveWeather
                    ? 'bg-emerald-100 text-[#16A477]'
                    : weatherStatus === 'loading'
                      ? 'bg-sky-100 text-[#0788C9]'
                      : 'bg-amber-100 text-[#B45309]'
                }`}
              >
                {activeRow.hasLiveWeather ? 'LIVE' : weatherStatus === 'loading' ? 'SYNC' : 'N/A'}
              </span>
            </div>
            <div className="mt-1">
              {activeRow.hasLiveWeather ? (
                <span className="text-2xl font-black font-mono text-[#0B193D] tabular-nums">
                  {activeRow.liveTempC.toFixed(1)}°C{' '}
                  <span className="text-xs font-bold text-slate-600">({activeRow.liveRh}%)</span>
                </span>
              ) : (
                <span className="text-base font-extrabold font-mono text-amber-800">
                  {weatherStatus === 'loading' ? 'Syncing...' : 'Unavailable'}
                </span>
              )}
            </div>
            <span className="text-[10.5px] font-semibold text-slate-600 truncate">
              Open-Meteo {lastSyncedLabel ? `• ${lastSyncedLabel}` : 'observation'}
            </span>
          </div>

          {/* D. Human Heat Index (Apparent Temperature) */}
          <div className="p-3 rounded-xl bg-[#FFF7ED] border border-[#FED7AA] flex flex-col justify-between min-w-0">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#C2410C] inline-flex items-center gap-1 truncate">
                <Users className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                Human Heat Index
              </span>
              <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-orange-100 text-[#C2410C]">
                DERIVED
              </span>
            </div>
            <div className="mt-1">
              {activeRow.hasLiveWeather ? (
                <span className="text-2xl font-black font-mono text-[#C2410C] tabular-nums">
                  {activeRow.heatIndexC.toFixed(1)}°C
                </span>
              ) : (
                <span className="text-base font-extrabold font-mono text-[#C2410C]">
                  {weatherStatus === 'loading' ? 'Syncing...' : 'Unavailable'}
                </span>
              )}
            </div>
            <span className="text-[10.5px] font-semibold text-slate-600 truncate">
              Apparent temperature
            </span>
          </div>

          {/* E. Stress Tier (Primary Navy Card) */}
          <div className="p-3 rounded-xl bg-[#0B193D] text-white border border-slate-800 flex flex-col justify-between min-w-0">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-sky-300">
                Stress Tier
              </span>
              <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-white/10 text-slate-200">
                {dataSourceMode === 'live' ? 'LIVE' : 'PEAK'}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1 min-w-0">
              <Flame
                className={`w-5 h-5 flex-shrink-0 ${
                  activeTier === 'EXTREME DANGER' || activeTier === 'DANGER'
                    ? 'text-amber-400'
                    : activeTier === 'EXTREME CAUTION' || activeTier === 'CAUTION'
                      ? 'text-yellow-300'
                      : 'text-emerald-400'
                }`}
                aria-hidden="true"
              />
              <span className="text-lg font-black tracking-tight truncate">{activeTier}</span>
            </div>
            <span className="text-[10.5px] font-medium text-slate-300 truncate">
              {activeRow.displayTempC >= 42
                ? `Thermal warning (${activeRow.displayTempC.toFixed(1)}°C)`
                : `Active index ${activeRow.displayTempC.toFixed(1)}°C`}
            </span>
          </div>
        </div>
      )}
    </section>
  );
};
