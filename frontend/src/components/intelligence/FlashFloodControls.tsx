'use client';

import React from 'react';
import {
  Box,
  CloudRain,
  Droplets,
  Gauge,
  MapPin,
  Mountain,
  RefreshCw,
  Sprout
} from 'lucide-react';
import { PointWeatherTelemetry } from '../../services/intelligence/OpenMeteoService';
import { TerrainSample } from '../../services/intelligence/TerrariumElevationService';

export type EnvFreshnessState = 'loading' | 'live' | 'delayed' | 'unavailable' | 'error';

export interface FlashFloodBasinOption {
  id: string;
  name: string;
  district: string;
  lat: number;
  lng: number;
}

interface FlashFloodControlsProps {
  basins: FlashFloodBasinOption[];
  selectedBasinId: string;
  activeBasin: FlashFloodBasinOption;
  onSelectBasin: (basinId: string) => void;
  rainSimBoostMm: number;
  onChangeRainSimBoostMm: (value: number) => void;
  activeWeather?: PointWeatherTelemetry;
  activeTerrain?: TerrainSample;
  weatherStatus: EnvFreshnessState;
  terrainStatus: EnvFreshnessState;
  lastSyncedLabel: string | null;
  loading: boolean;
  onRefresh: () => void;
  onInspectBasinIn3D?: () => void;
}

export const FlashFloodControls: React.FC<FlashFloodControlsProps> = ({
  basins,
  selectedBasinId,
  activeBasin,
  onSelectBasin,
  rainSimBoostMm,
  onChangeRainSimBoostMm,
  activeWeather,
  activeTerrain,
  weatherStatus,
  terrainStatus,
  lastSyncedLabel,
  loading,
  onRefresh,
  onInspectBasinIn3D
}) => {
  const statusBadge = (() => {
    if (loading && !activeWeather && !activeTerrain) {
      return {
        label: 'Syncing Telemetry',
        pillClass: 'bg-amber-50 border-amber-200 text-[#D99A28]',
        dotClass: 'bg-[#D99A28] animate-pulse'
      };
    }
    if (weatherStatus === 'error') {
      return {
        label: 'Weather Feed Error',
        pillClass: 'bg-red-50 border-red-200 text-[#D93636]',
        dotClass: 'bg-[#D93636]'
      };
    }
    if (weatherStatus === 'unavailable' || weatherStatus === 'delayed') {
      return {
        label: 'Partial Feed',
        pillClass: 'bg-amber-50 border-amber-200 text-[#D99A28]',
        dotClass: 'bg-[#D99A28]'
      };
    }
    return {
      label: 'Live Monitoring',
      pillClass: 'bg-emerald-50 border-emerald-200 text-[#16A477]',
      dotClass: 'bg-[#16A477] animate-pulse'
    };
  })();

  const topsoilPct =
    activeWeather?.soilMoistureTop != null ? (activeWeather.soilMoistureTop * 100).toFixed(1) : null;
  const rootPct =
    activeWeather?.soilMoistureRoot != null ? (activeWeather.soilMoistureRoot * 100).toFixed(1) : null;

  return (
    <section
      aria-label="Flash Flood Watershed Controls"
      className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden"
    >
      {/* Top Page Header */}
      <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[#EEF4FD] border border-[#DCE7F7] text-[#0788C9] flex items-center justify-center flex-shrink-0">
            <CloudRain className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-extrabold text-[#0B193D] tracking-tight truncate">
              Flash Flood Intelligence (Hilly &amp; Agency Regions)
            </h1>
            <p className="text-xs text-slate-500 font-medium truncate mt-0.5">
              Multi-source analysis: Open-Meteo rainfall + soil moisture + AWS terrain DEM slope + historical records
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold ${statusBadge.pillClass}`}
          >
            <span className={`w-2 h-2 rounded-full ${statusBadge.dotClass}`} aria-hidden="true" />
            <span>{statusBadge.label}</span>
          </span>

          {onInspectBasinIn3D && (
            <button
              type="button"
              onClick={onInspectBasinIn3D}
              className="px-3 py-1.5 rounded-xl bg-white hover:bg-[#F5F8FC] border border-slate-200 hover:border-[#0788C9] text-[#0B193D] text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer focus-visible:outline-2 focus-visible:outline-[#0788C9]"
            >
              <Box className="w-4 h-4 text-[#0788C9]" aria-hidden="true" />
              <span>Inspect Basin in 3D</span>
            </button>
          )}

          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            aria-label="Refresh watershed environmental telemetry"
            title="Refresh Open-Meteo rainfall, soil moisture & DEM telemetry"
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-[#F5F8FC] text-[#0B193D] transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-[#0788C9]"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#0788C9]' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* 4-Group Structured Control Strip */}
      <div className="p-4 sm:px-5 sm:py-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-4 items-stretch">
        {/* GROUP A — Watershed Selection */}
        <div className="xl:col-span-3 min-w-0 flex flex-col justify-center">
          <label
            htmlFor="ff-basin-select"
            className="text-[11px] font-bold text-[#0B193D] flex items-center gap-1.5 mb-1.5"
          >
            <MapPin className="w-3.5 h-3.5 text-[#0788C9] flex-shrink-0" aria-hidden="true" />
            <span>Watershed Selection</span>
          </label>
          <select
            id="ff-basin-select"
            value={selectedBasinId}
            onChange={(e) => onSelectBasin(e.target.value)}
            className="w-full px-3 py-2 bg-[#F5F8FC] hover:border-[#0788C9] focus:border-[#0788C9] focus:outline-none border border-slate-200 rounded-xl text-xs font-bold text-[#0B193D] cursor-pointer transition"
          >
            {basins.map(b => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.district})
              </option>
            ))}
          </select>
          <p className="text-[10px] font-semibold text-slate-500 mt-1 truncate">
            {activeBasin.district} District • {activeBasin.lat.toFixed(3)}°N, {activeBasin.lng.toFixed(3)}°E
          </p>
        </div>

        {/* GROUP B — Cloudburst Stress Test (Operator Scenario Input) */}
        <div className="xl:col-span-3 min-w-0 flex flex-col justify-center">
          <label
            htmlFor="ff-rain-sim"
            className="text-[11px] font-bold text-[#0B193D] flex items-center justify-between gap-2 mb-1"
          >
            <span className="inline-flex items-center gap-1.5 min-w-0">
              <Gauge className="w-3.5 h-3.5 text-[#0788C9] flex-shrink-0" aria-hidden="true" />
              <span className="truncate">Cloudburst Stress Test (+mm/3h)</span>
            </span>
            <span
              className={`font-mono text-sm font-black tabular-nums flex-shrink-0 ${
                rainSimBoostMm >= 80
                  ? 'text-[#D93636]'
                  : rainSimBoostMm >= 40
                    ? 'text-[#D99A28]'
                    : 'text-[#0788C9]'
              }`}
            >
              +{rainSimBoostMm} mm
            </span>
          </label>
          <input
            id="ff-rain-sim"
            type="range"
            min={0}
            max={120}
            step={10}
            value={rainSimBoostMm}
            aria-valuetext={`Plus ${rainSimBoostMm} millimetres in 3 hours simulated rainfall`}
            onChange={(e) => onChangeRainSimBoostMm(Number(e.target.value))}
            className="hero-range-slider"
            style={
              {
                '--attr-min': 0,
                '--attr-max': 120,
                '--control-value': rainSimBoostMm,
                '--slider-fill-color':
                  rainSimBoostMm >= 80 ? '#D93636' : rainSimBoostMm >= 40 ? '#D99A28' : '#0788C9'
              } as React.CSSProperties
            }
          />
          <div className="flex justify-between text-[10px] font-semibold text-slate-500">
            <span>Baseline (0 mm)</span>
            <span>Maximum (+120 mm)</span>
          </div>
        </div>

        {/* GROUP C — Terrain (DEM) Environmental Indicator */}
        <div className="xl:col-span-3 min-w-0 bg-[#EEF7FC] border border-[#CBE7F7] rounded-xl p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-[#0788C9] inline-flex items-center gap-1.5 truncate">
              <Mountain className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
              <span className="truncate">Terrain (DEM)</span>
            </span>
            <span
              className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                activeTerrain?.source === 'aws-terrarium'
                  ? 'bg-emerald-100 text-[#16A477]'
                  : terrainStatus === 'loading'
                    ? 'bg-sky-100 text-[#0788C9]'
                    : 'bg-amber-100 text-[#D99A28]'
              }`}
            >
              {activeTerrain?.source === 'aws-terrarium'
                ? 'AWS DEM'
                : terrainStatus === 'loading'
                  ? 'SYNC'
                  : 'FALLBACK'}
            </span>
          </div>
          <div className="mt-1">
            <span className="text-lg font-extrabold font-mono text-[#0B193D] tabular-nums block truncate">
              {activeTerrain
                ? `${activeTerrain.elevationMeters} m • ${activeTerrain.slopeDegrees}°`
                : 'Loading...'}
            </span>
            <span className="text-[10px] font-semibold text-slate-600 block truncate mt-0.5">
              Elevation / Avg. Basin Slope
            </span>
          </div>
        </div>

        {/* GROUP D — Soil Moisture Environmental Indicator */}
        <div className="xl:col-span-3 min-w-0 bg-[#ECFDF5] border border-[#BDEBD8] rounded-xl p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-[#16A477] inline-flex items-center gap-1.5 truncate">
              <Sprout className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
              <span className="truncate">Topsoil &amp; Root Moisture</span>
            </span>
            <span
              className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded inline-flex items-center gap-0.5 ${
                weatherStatus === 'live'
                  ? 'bg-emerald-100 text-[#16A477]'
                  : weatherStatus === 'loading'
                    ? 'bg-sky-100 text-[#0788C9]'
                    : 'bg-amber-100 text-[#D99A28]'
              }`}
            >
              <Droplets className="w-2.5 h-2.5" aria-hidden="true" />
              {weatherStatus === 'live' ? 'OBS' : weatherStatus === 'loading' ? 'SYNC' : 'N/A'}
            </span>
          </div>
          <div className="mt-1">
            <span className="text-lg font-extrabold font-mono text-[#0B193D] tabular-nums block truncate">
              {topsoilPct != null && rootPct != null
                ? `${topsoilPct}% / ${rootPct}%`
                : weatherStatus === 'loading'
                  ? 'Syncing...'
                  : 'Unavailable'}
            </span>
            <span className="text-[10px] font-semibold text-slate-600 block truncate mt-0.5">
              Topsoil (0–7cm) / Root (7–28cm){lastSyncedLabel ? ` • ${lastSyncedLabel}` : ''}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};
