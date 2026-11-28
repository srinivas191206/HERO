'use client';

import React from 'react';
import {
  Activity,
  AlertTriangle,
  CloudRain,
  Compass,
  Droplets,
  Gauge,
  MapPin,
  RefreshCw,
  RotateCcw,
  Route,
  Sliders,
  Waves
} from 'lucide-react';
import { PointWeatherTelemetry } from '../../services/intelligence/OpenMeteoService';

export type UrbanTelemetryStatus = 'loading' | 'live' | 'unavailable' | 'error';

export interface UrbanCorridorOption {
  id: string;
  city: string;
  drainCapacityMmHr: number;
}

interface UrbanFloodControlsProps {
  hubs: UrbanCorridorOption[];
  selectedCityId: string;
  activeHub: UrbanCorridorOption;
  onSelectCity: (cityId: string) => void;
  waterDepthM: number;
  onChangeWaterDepthM: (depth: number) => void;
  onResetScenario: () => void;
  weather: PointWeatherTelemetry | null;
  weatherStatus: UrbanTelemetryStatus;
  microElevM: number | null;
  terrainSource: 'aws-terrarium' | 'fallback';
  floodedCount: number;
  safeCount: number;
  lastSyncedLabel: string | null;
  loading: boolean;
  onRefresh: () => void;
  onJumpToSimulator: () => void;
  onJumpToDrainage: () => void;
  onInspectIn3D?: () => void;
}

export const UrbanFloodControls: React.FC<UrbanFloodControlsProps> = ({
  hubs,
  selectedCityId,
  activeHub,
  onSelectCity,
  waterDepthM,
  onChangeWaterDepthM,
  onResetScenario,
  weather,
  weatherStatus,
  microElevM,
  terrainSource,
  floodedCount,
  safeCount,
  lastSyncedLabel,
  loading,
  onRefresh,
  onJumpToSimulator,
  onJumpToDrainage,
  onInspectIn3D
}) => {
  const statusBadge = (() => {
    if (loading && weatherStatus === 'loading') {
      return {
        label: 'Syncing Feeds',
        pillClass: 'bg-amber-50 border-amber-200 text-[#D99A28]'
      };
    }
    if (weatherStatus === 'error') {
      return {
        label: 'Telemetry Offline',
        pillClass: 'bg-red-50 border-red-200 text-[#D93636]'
      };
    }
    if (floodedCount >= 2) {
      return {
        label: 'Monitoring Live • Alert',
        pillClass: 'bg-[#FFF3F3] border-[#F8CCCC] text-[#D93636]'
      };
    }
    return {
      label: 'Monitoring Live',
      pillClass: 'bg-emerald-50 border-emerald-200 text-[#16A477]'
    };
  })();

  return (
    <section
      aria-label="Urban Flood Operations Control Center"
      className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden"
    >
      {/* Top Page Header */}
      <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[#EEF4FD] border border-[#DCE7F7] text-[#0788C9] flex items-center justify-center flex-shrink-0">
            <Waves className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-extrabold text-[#0B193D] tracking-tight truncate">
              Urban Flood Nowcasting System
            </h1>
            <p className="text-xs text-slate-500 font-medium truncate mt-0.5">
              Street-level waterlogging, drainage capacity, micro-topography &amp; emergency route identification
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold ${statusBadge.pillClass}`}
          >
            <Activity className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
            <span>{statusBadge.label}</span>
          </span>

          <button
            type="button"
            onClick={onJumpToSimulator}
            className="px-3 py-1.5 rounded-xl bg-white hover:bg-[#F5F8FC] border border-slate-200 hover:border-[#0788C9] text-[#0B193D] text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer"
          >
            <Sliders className="w-3.5 h-3.5 text-[#0788C9]" aria-hidden="true" />
            <span>Scenario Simulator</span>
          </button>

          <button
            type="button"
            onClick={onJumpToDrainage}
            className="px-3 py-1.5 rounded-xl bg-white hover:bg-[#F5F8FC] border border-slate-200 hover:border-[#0788C9] text-[#0B193D] text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer"
          >
            <Droplets className="w-3.5 h-3.5 text-[#0788C9]" aria-hidden="true" />
            <span>Drainage Network</span>
          </button>

          {onInspectIn3D && (
            <button
              type="button"
              onClick={onInspectIn3D}
              className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer"
            >
              <Compass className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Safe Floor 3D</span>
            </button>
          )}

          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            aria-label="Refresh urban rainfall and DEM data"
            title="Refresh Open-Meteo precipitation & AWS DEM elevation"
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-[#F5F8FC] text-[#0B193D] transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#0788C9]' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* 5-Group Top Control Center */}
      <div className="p-4 sm:px-5 sm:py-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-3.5 items-stretch">
        {/* A. Municipal Corridor Selector */}
        <div className="xl:col-span-3 min-w-0 flex flex-col justify-center">
          <label
            htmlFor="urban-city-select"
            className="text-[11px] font-bold text-[#0B193D] flex items-center gap-1.5 mb-1.5"
          >
            <MapPin className="w-3.5 h-3.5 text-[#0788C9] flex-shrink-0" aria-hidden="true" />
            <span>Municipal Corridor / Monitoring Zone</span>
          </label>
          <select
            id="urban-city-select"
            value={selectedCityId}
            onChange={(e) => onSelectCity(e.target.value)}
            className="w-full px-3 py-2 bg-[#F5F8FC] border border-slate-200 hover:border-[#0788C9] focus:border-[#0788C9] focus:outline-none rounded-xl text-xs font-bold text-[#0B193D] cursor-pointer"
          >
            {hubs.map(u => (
              <option key={u.id} value={u.id}>
                {u.city}
              </option>
            ))}
          </select>
          <p className="text-[10px] font-semibold text-slate-500 mt-1 truncate">
            DEM micro-elev: {microElevM != null ? `${microElevM} m AMSL` : '--'} ({terrainSource === 'aws-terrarium' ? 'AWS DEM' : 'Ref'})
          </p>
        </div>

        {/* B. Waterlogging Scenario Depth */}
        <div className="xl:col-span-3 min-w-0 flex flex-col justify-center">
          <div className="flex items-center justify-between gap-2 mb-1">
            <label
              htmlFor="urban-depth-slider"
              className="text-[11px] font-bold text-[#0B193D] inline-flex items-center gap-1.5 min-w-0"
            >
              <Gauge className="w-3.5 h-3.5 text-[#0788C9] flex-shrink-0" aria-hidden="true" />
              <span className="truncate">Waterlogging Scenario Depth</span>
            </label>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className="font-mono text-sm font-black text-[#0B193D] tabular-nums">
                {waterDepthM.toFixed(1)} m
              </span>
              {waterDepthM !== 0.1 && (
                <button
                  type="button"
                  onClick={onResetScenario}
                  title="Reset scenario depth to 0.1 m reference"
                  className="p-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          <input
            id="urban-depth-slider"
            type="range"
            min={0.1}
            max={2.5}
            step={0.1}
            value={waterDepthM}
            aria-valuetext={`${waterDepthM.toFixed(1)} metres simulated waterlogging depth`}
            onChange={(e) => onChangeWaterDepthM(Number(e.target.value))}
            className="hero-range-slider"
            style={
              {
                '--attr-min': 0.1,
                '--attr-max': 2.5,
                '--control-value': waterDepthM,
                '--slider-fill-color':
                  waterDepthM >= 1.2 ? '#D93636' : waterDepthM >= 0.7 ? '#0788C9' : '#16A477'
              } as React.CSSProperties
            }
          />
          <div className="flex justify-between text-[9.5px] font-semibold text-slate-500">
            <span>Simulated (0.1–2.5 m)</span>
            <span className="text-[#0788C9]">Not live gauge data</span>
          </div>
        </div>

        {/* C. Drainage Capacity & Live Rainfall */}
        <div className="xl:col-span-4 md:col-span-2 grid grid-cols-2 gap-2.5 min-w-0">
          <div className="bg-[#EEF7FC] border border-[#CBE7F7] rounded-xl p-2.5 flex flex-col justify-between min-w-0">
            <span className="text-[10px] font-bold text-[#0788C9] inline-flex items-center gap-1 truncate">
              <Waves className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
              Drainage Capacity
            </span>
            <span className="text-base sm:text-lg font-black font-mono text-[#0B193D] tabular-nums mt-0.5 truncate">
              {activeHub.drainCapacityMmHr} mm/hr
            </span>
            <span className="text-[9.5px] font-semibold text-slate-600 truncate">
              Design storm trunk
            </span>
          </div>

          <div className="bg-[#F5F8FC] border border-slate-200 rounded-xl p-2.5 flex flex-col justify-between min-w-0">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-bold text-[#0B193D] inline-flex items-center gap-1 truncate">
                <CloudRain className="w-3.5 h-3.5 text-[#0788C9] flex-shrink-0" aria-hidden="true" />
                Live Rainfall
              </span>
              <span
                className={`text-[8.5px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                  weatherStatus === 'live'
                    ? 'bg-emerald-100 text-[#16A477]'
                    : 'bg-amber-100 text-[#B45309]'
                }`}
              >
                {weatherStatus === 'live' ? 'OBS' : weatherStatus === 'loading' ? 'SYNC' : 'N/A'}
              </span>
            </div>
            <span className="text-base sm:text-lg font-black font-mono text-[#0B193D] tabular-nums mt-0.5 truncate">
              {weather ? `${weather.precipitationMm} mm` : weatherStatus === 'loading' ? 'Syncing...' : 'Unavailable'}
            </span>
            <span className="text-[9.5px] font-semibold text-slate-500 truncate">
              {lastSyncedLabel ? `Open-Meteo • ${lastSyncedLabel}` : 'Current observation'}
            </span>
          </div>
        </div>

        {/* D & E. Flooded Roads vs Safe Routes */}
        <div className="xl:col-span-2 grid grid-cols-2 gap-2 min-w-0">
          <div className="bg-[#FFF3F3] border border-[#F8CCCC] rounded-xl p-2.5 flex flex-col justify-center items-center text-center">
            <span className="text-[9.5px] font-extrabold uppercase text-[#D93636] inline-flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" aria-hidden="true" />
              Flooded
            </span>
            <span className="text-xl font-black font-mono text-[#D93636] tabular-nums leading-tight mt-0.5">
              {floodedCount}
            </span>
            <span className="text-[9px] font-semibold text-[#D93636]/80">Blocked segs</span>
          </div>

          <div className="bg-[#ECFDF5] border border-[#BDEBD8] rounded-xl p-2.5 flex flex-col justify-center items-center text-center">
            <span className="text-[9.5px] font-extrabold uppercase text-[#16A477] inline-flex items-center gap-1">
              <Route className="w-3 h-3" aria-hidden="true" />
              Safe
            </span>
            <span className="text-xl font-black font-mono text-[#16A477] tabular-nums leading-tight mt-0.5">
              {safeCount}
            </span>
            <span className="text-[9px] font-semibold text-[#16A477]/80">Open segs</span>
          </div>
        </div>
      </div>
    </section>
  );
};
