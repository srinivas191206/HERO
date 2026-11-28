'use client';

import React from 'react';
import {
  Activity,
  AlertTriangle,
  Box,
  CalendarClock,
  CloudRain,
  FastForward,
  Info,
  MapPin,
  Pause,
  Play,
  RefreshCw,
  ShieldAlert,
  SkipBack,
  SkipForward
} from 'lucide-react';
import { ApDistrictMeta } from '../../utils/apDistricts';
import { RadarFrame } from '../../services/intelligence/RainViewerService';

export type ImdBand =
  | 'DRY / TRACE'
  | 'LIGHT'
  | 'MODERATE'
  | 'HEAVY'
  | 'VERY HEAVY'
  | 'EXTREMELY HEAVY';

export type ServiceFeedState = 'loading' | 'live' | 'unavailable' | 'error';

export interface RainRiskRow {
  meta: ApDistrictMeta;
  currentMm: number;
  peak3hMm: number;
  rain24hMm: number;
  rain72hMm: number;
  soilPct: number;
  imdBand: ImdBand;
  hasLiveForecast: boolean;
}

interface RainfallControlHeaderProps {
  rows: RainRiskRow[];
  activeRow?: RainRiskRow;
  selectedDist: string;
  onSelectDist: (district: string) => void;
  frames: RadarFrame[];
  pastFrameCount: number;
  frameIndex: number;
  isPlaying: boolean;
  playbackSpeedMs: number;
  onTogglePlay: () => void;
  onPrevFrame: () => void;
  onNextFrame: () => void;
  onSeekFrame: (index: number) => void;
  onJumpLatestFrame: () => void;
  onChangePlaybackSpeedMs: (ms: number) => void;
  radarStatus: ServiceFeedState;
  forecastStatus: ServiceFeedState;
  lastUpdatedLabel: string | null;
  loading: boolean;
  onRefresh: () => void;
  onJumpToWarnings: () => void;
  onInspectIn3D?: () => void;
}

export function getImdThresholdHint(band: ImdBand): string {
  switch (band) {
    case 'EXTREMELY HEAVY': return '≥ 204.5 mm / 24h';
    case 'VERY HEAVY': return '115.6–204.4 mm / 24h';
    case 'HEAVY': return '64.5–115.5 mm / 24h';
    case 'MODERATE': return '15.6–64.4 mm / 24h';
    case 'LIGHT': return '2.5–15.5 mm / 24h';
    default: return '< 2.5 mm / 24h';
  }
}

export const RainfallControlHeader: React.FC<RainfallControlHeaderProps> = ({
  rows,
  activeRow,
  selectedDist,
  onSelectDist,
  frames,
  pastFrameCount,
  frameIndex,
  isPlaying,
  playbackSpeedMs,
  onTogglePlay,
  onPrevFrame,
  onNextFrame,
  onSeekFrame,
  onJumpLatestFrame,
  onChangePlaybackSpeedMs,
  radarStatus,
  forecastStatus,
  lastUpdatedLabel,
  loading,
  onRefresh,
  onJumpToWarnings,
  onInspectIn3D
}) => {
  const currentFrame = frames[frameIndex];
  const latestPastIdx = Math.max(0, pastFrameCount - 1);
  const frameTimeStr = currentFrame
    ? new Date(currentFrame.time * 1000).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      })
    : null;
  const frameDateStr = currentFrame
    ? new Date(currentFrame.time * 1000).toLocaleDateString([], {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      })
    : null;
  const isNowcastFrame = currentFrame ? frameIndex >= pastFrameCount : false;

  const monitorBadge = (() => {
    if (loading && radarStatus === 'loading' && forecastStatus === 'loading') {
      return {
        label: 'Syncing Feeds...',
        pillClass: 'bg-amber-50 border-amber-200 text-[#D99A28]',
        dotClass: 'bg-[#D99A28] animate-pulse'
      };
    }
    if (radarStatus === 'error' && forecastStatus === 'error') {
      return {
        label: 'Feeds Offline',
        pillClass: 'bg-red-50 border-red-200 text-[#D93636]',
        dotClass: 'bg-[#D93636]'
      };
    }
    if (radarStatus !== 'live' || forecastStatus !== 'live') {
      return {
        label: 'Partial Monitoring',
        pillClass: 'bg-amber-50 border-amber-200 text-[#B45309]',
        dotClass: 'bg-[#D99A28]'
      };
    }
    return {
      label: isPlaying ? 'Radar Playing' : 'Monitoring Live',
      pillClass: 'bg-emerald-50 border-emerald-200 text-[#16A477]',
      dotClass: 'bg-[#16A477] animate-pulse'
    };
  })();

  const bandTheme = (() => {
    const band = activeRow?.imdBand || 'DRY / TRACE';
    if (band === 'EXTREMELY HEAVY' || band === 'VERY HEAVY' || band === 'HEAVY') {
      return 'bg-[#FFF3F3] border-[#F8CCCC] text-[#D93636]';
    }
    if (band === 'MODERATE') {
      return 'bg-[#EEF7FC] border-[#CBE7F7] text-[#0788C9]';
    }
    if (band === 'LIGHT') {
      return 'bg-[#ECFDF5] border-[#A7F3D0] text-[#16A477]';
    }
    return 'bg-[#ECFDF5] border-[#BDEBD8] text-[#16A477]';
  })();

  const maxFrameIdx = Math.max(0, frames.length - 1);

  return (
    <section
      aria-label="Rainfall & Inundation Controls"
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
              Rainfall &amp; Inundation Early Warning System
            </h1>
            <p className="text-xs text-slate-500 font-medium truncate mt-0.5">
              Live RainViewer precipitation radar + Open-Meteo 72h forecast + IMD rainfall classification
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold ${monitorBadge.pillClass}`}
          >
            <Activity className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
            <span>{monitorBadge.label}</span>
          </span>

          <button
            type="button"
            onClick={onJumpToWarnings}
            className="px-3 py-1.5 rounded-xl bg-white hover:bg-[#FFFBEB] border border-slate-200 hover:border-[#D99A28] text-[#0B193D] text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer focus-visible:outline-2 focus-visible:outline-[#0788C9]"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-[#D99A28]" aria-hidden="true" />
            <span>IMD Warnings</span>
          </button>

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
            aria-label="Refresh RainViewer radar and Open-Meteo forecasts"
            title="Refresh radar frames & 72h precipitation forecast"
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-[#F5F8FC] text-[#0B193D] transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-[#0788C9]"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#0788C9]' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Radar Playback Console + Selected District Summary */}
      <div className="p-4 sm:px-5 sm:py-4 grid grid-cols-1 xl:grid-cols-12 gap-4 items-center">
        {/* LEFT: RADAR PLAYBACK (RAINVIEWER) + DISTRICT PICKER */}
        <div className="xl:col-span-7 grid grid-cols-1 md:grid-cols-12 gap-3 items-center md:border-r md:border-slate-100 md:pr-4">
          <div className="md:col-span-8 space-y-2 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs font-extrabold text-[#0B193D] truncate">
                  Radar Playback (RainViewer)
                </span>
                <span
                  title="Streams live RainViewer radar mosaic timestamps (past archive + nowcast)"
                  className="text-slate-400"
                >
                  <Info className="w-3.5 h-3.5" aria-hidden="true" />
                </span>
              </div>

              <div className="flex items-center gap-2 text-[10px] font-bold flex-shrink-0">
                {frames.length > 0 ? (
                  <>
                    <span
                      className={`px-1.5 py-0.5 rounded uppercase ${
                        isNowcastFrame
                          ? 'bg-amber-100 text-[#B45309]'
                          : 'bg-sky-100 text-[#0788C9]'
                      }`}
                    >
                      {isNowcastFrame ? 'Nowcast' : 'Observed'} • {frameIndex + 1}/{frames.length}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        onChangePlaybackSpeedMs(playbackSpeedMs === 900 ? 500 : playbackSpeedMs === 500 ? 1300 : 900)
                      }
                      title="Toggle radar playback speed"
                      className="px-1.5 py-0.5 rounded bg-[#F5F8FC] border border-slate-200 text-[#0B193D] inline-flex items-center gap-0.5 cursor-pointer hover:border-[#0788C9]"
                    >
                      <FastForward className="w-2.5 h-2.5" aria-hidden="true" />
                      {playbackSpeedMs === 500 ? '1.8x' : playbackSpeedMs === 1300 ? '0.7x' : '1x'}
                    </button>
                  </>
                ) : (
                  <span className="px-2 py-0.5 rounded bg-amber-50 text-[#B45309]">
                    {radarStatus === 'loading' ? 'Loading radar frames...' : 'Radar Unavailable'}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
              <button
                type="button"
                onClick={onTogglePlay}
                disabled={frames.length <= 1}
                className="px-3.5 py-1.5 rounded-xl bg-[#0788C9] hover:bg-[#0671A8] disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition flex-shrink-0"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" aria-hidden="true" /> : <Play className="w-3.5 h-3.5" aria-hidden="true" />}
                <span>{isPlaying ? 'Pause' : 'Play'}</span>
              </button>

              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  type="button"
                  onClick={onPrevFrame}
                  disabled={frames.length <= 1}
                  aria-label="Previous radar frame"
                  title="Previous radar frame"
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-[#F5F8FC] disabled:opacity-40 text-[#0B193D] cursor-pointer"
                >
                  <SkipBack className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={onNextFrame}
                  disabled={frames.length <= 1}
                  aria-label="Next radar frame"
                  title="Next radar frame"
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-[#F5F8FC] disabled:opacity-40 text-[#0B193D] cursor-pointer"
                >
                  <SkipForward className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>

              <div className="flex-1 min-w-[120px]">
                <label htmlFor="radar-timeline-range" className="sr-only">
                  Radar playback timeline frame
                </label>
                <div className="flex justify-between text-[9.5px] font-semibold text-slate-400 mb-0.5">
                  <span>Historical</span>
                  <button
                    type="button"
                    onClick={onJumpLatestFrame}
                    disabled={frames.length === 0 || frameIndex === latestPastIdx}
                    className="text-[#0788C9] hover:underline disabled:text-slate-400 disabled:no-underline cursor-pointer"
                  >
                    Latest Frame
                  </button>
                </div>
                <input
                  id="radar-timeline-range"
                  type="range"
                  min={0}
                  max={maxFrameIdx}
                  value={Math.min(frameIndex, maxFrameIdx)}
                  disabled={frames.length === 0}
                  aria-valuetext={
                    frameTimeStr ? `Radar frame at ${frameTimeStr}` : 'Radar frames unavailable'
                  }
                  onChange={(e) => onSeekFrame(Number(e.target.value))}
                  className="hero-range-slider"
                  style={
                    {
                      '--attr-min': 0,
                      '--attr-max': Math.max(1, maxFrameIdx),
                      '--control-value': Math.min(frameIndex, maxFrameIdx),
                      '--slider-fill-color': '#0788C9'
                    } as React.CSSProperties
                  }
                />
              </div>

              <div className="text-right flex-shrink-0 pl-1">
                <span className="text-sm font-extrabold font-mono text-[#0B193D] tabular-nums block">
                  {frameTimeStr || '--:--'}
                </span>
                <span className="text-[9.5px] font-medium text-slate-400 block">
                  {frameDateStr || (radarStatus === 'loading' ? 'Syncing' : 'No frame')}
                </span>
              </div>
            </div>
          </div>

          {/* Selected District Selector */}
          <div className="md:col-span-4 min-w-0">
            <label
              htmlFor="rain-district-select"
              className="text-[11px] font-bold text-[#0B193D] inline-flex items-center gap-1 mb-1"
            >
              <MapPin className="w-3.5 h-3.5 text-[#0788C9] flex-shrink-0" aria-hidden="true" />
              <span>Selected District</span>
            </label>
            <select
              id="rain-district-select"
              value={selectedDist}
              onChange={(e) => onSelectDist(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-[#F5F8FC] border border-slate-200 hover:border-[#0788C9] focus:border-[#0788C9] focus:outline-none rounded-xl text-xs font-extrabold text-[#0B193D] cursor-pointer"
            >
              {rows.map(r => (
                <option key={r.meta.code} value={r.meta.district}>
                  {r.meta.district} ({r.meta.code})
                </option>
              ))}
            </select>
            <p className="text-[10px] font-medium text-slate-500 mt-1 truncate">
              {lastUpdatedLabel ? `Updated: ${lastUpdatedLabel}` : 'Awaiting forecast sync'}
            </p>
          </div>
        </div>

        {/* RIGHT: 3 RAINFALL SUMMARY CARDS */}
        {activeRow && (
          <div className="xl:col-span-5 grid grid-cols-3 gap-2.5 min-w-0">
            {/* 24h Rainfall */}
            <div className="bg-[#EEF7FC] border border-[#CBE7F7] rounded-xl p-2.5 flex flex-col justify-between min-w-0">
              <span className="text-[10px] font-bold text-[#0788C9] inline-flex items-center gap-1 truncate">
                <CloudRain className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                <span className="truncate">24h Rainfall</span>
              </span>
              <span className="text-lg sm:text-xl font-black font-mono text-[#0B193D] tabular-nums mt-0.5 truncate">
                {activeRow.hasLiveForecast
                  ? `${activeRow.rain24hMm} mm`
                  : forecastStatus === 'loading'
                    ? 'Syncing...'
                    : 'N/A'}
              </span>
              <span className="text-[9.5px] font-semibold text-slate-500 truncate">
                Open-Meteo 24h
              </span>
            </div>

            {/* 72h Forecast */}
            <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-xl p-2.5 flex flex-col justify-between min-w-0">
              <span className="text-[10px] font-bold text-[#B45309] inline-flex items-center gap-1 truncate">
                <CalendarClock className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                <span className="truncate">72h Forecast</span>
              </span>
              <span className="text-lg sm:text-xl font-black font-mono text-[#0B193D] tabular-nums mt-0.5 truncate">
                {activeRow.hasLiveForecast
                  ? `${activeRow.rain72hMm} mm`
                  : forecastStatus === 'loading'
                    ? 'Syncing...'
                    : 'N/A'}
              </span>
              <span className="text-[9.5px] font-semibold text-slate-500 truncate">
                Model cumulative
              </span>
            </div>

            {/* IMD Band */}
            <div
              title={getImdThresholdHint(activeRow.imdBand)}
              className={`border rounded-xl p-2.5 flex flex-col justify-between min-w-0 ${bandTheme}`}
            >
              <span className="text-[10px] font-bold inline-flex items-center gap-1 truncate">
                <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                <span className="truncate">IMD Band</span>
              </span>
              <span className="text-sm sm:text-base font-black tracking-tight mt-0.5 truncate">
                {activeRow.hasLiveForecast || forecastStatus !== 'loading'
                  ? activeRow.imdBand
                  : 'Syncing...'}
              </span>
              <span className="text-[9.5px] font-semibold opacity-80 truncate">
                {getImdThresholdHint(activeRow.imdBand)}
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
