'use client';

import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Map as MapIcon,
  RotateCcw,
  Sliders
} from 'lucide-react';
import { EvaluatedUrbanSegment } from './StreetDrainageFeedPanel';

interface WaterloggingSimulatorCardProps {
  waterDepthM: number;
  onChangeWaterDepthM: (depth: number) => void;
  onResetScenario: () => void;
  onFocusImpactOnMap: () => void;
  segments: EvaluatedUrbanSegment[];
}

const SCENARIO_PRESETS = [
  { label: '0.1m Ref', value: 0.1 },
  { label: '0.5m Caution', value: 0.5 },
  { label: '1.0m Moderate', value: 1.0 },
  { label: '1.5m High', value: 1.5 },
  { label: '2.0m Severe', value: 2.0 }
];

export const WaterloggingSimulatorCard: React.FC<WaterloggingSimulatorCardProps> = ({
  waterDepthM,
  onChangeWaterDepthM,
  onResetScenario,
  onFocusImpactOnMap,
  segments
}) => {
  const blockedCount = segments.filter(s => s.status === 'IMPASSABLE').length;
  const cautionCount = segments.filter(s => s.status === 'CAUTION').length;
  const accessibleCount = segments.filter(s => s.status === 'OPEN').length;

  return (
    <section
      id="waterlogging-scenario-simulator"
      aria-label="Waterlogging Scenario Simulator"
      className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col justify-between gap-3"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-[#EEF4FD] border border-[#DCE7F7] text-[#0788C9] flex items-center justify-center flex-shrink-0">
            <Sliders className="w-4 h-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-extrabold text-[#0B193D] tracking-tight truncate">
              Waterlogging Scenario Simulator
            </h2>
            <p className="text-[11px] font-medium text-slate-500 truncate">
              Test depth scenarios &amp; recalculate corridor passability
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onResetScenario}
          disabled={waterDepthM === 0.1}
          className="px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-[#F5F8FC] disabled:opacity-40 text-[10.5px] font-bold text-[#0B193D] inline-flex items-center gap-1 cursor-pointer"
        >
          <RotateCcw className="w-3 h-3 text-[#0788C9]" aria-hidden="true" />
          <span>Reset</span>
        </button>
      </div>

      {/* Baseline vs Scenario + Dynamic Road Impact Summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="p-2.5 rounded-xl bg-[#EEF7FC] border border-[#CBE7F7]">
          <span className="text-[9.5px] font-bold uppercase text-[#0788C9] block">
            Simulated Depth
          </span>
          <span className="text-lg font-black font-mono text-[#0B193D] tabular-nums block mt-0.5">
            {waterDepthM.toFixed(1)} m
          </span>
          <span className="text-[9px] font-semibold text-slate-500 block">Scenario input</span>
        </div>

        <div className="p-2.5 rounded-xl bg-[#F5F8FC] border border-slate-200">
          <span className="text-[9.5px] font-bold uppercase text-slate-500 block">
            Live Sensor
          </span>
          <span className="text-sm font-extrabold font-mono text-slate-700 block mt-1">
            No Gauge
          </span>
          <span className="text-[9px] font-semibold text-slate-400 block">0.1m dry ref</span>
        </div>

        <div className="p-2.5 rounded-xl bg-[#F5F8FC] border border-slate-200 text-[10.5px] space-y-0.5">
          <span className="text-[9px] font-extrabold uppercase text-slate-400 block">
            Impact ({waterDepthM.toFixed(1)}m)
          </span>
          <div className="flex justify-between font-bold text-[#D93636]">
            <span>Blocked</span>
            <span className="font-mono">{blockedCount}</span>
          </div>
          <div className="flex justify-between font-bold text-[#B45309]">
            <span>Caution</span>
            <span className="font-mono">{cautionCount}</span>
          </div>
          <div className="flex justify-between font-bold text-[#16A477]">
            <span>Open</span>
            <span className="font-mono">{accessibleCount}</span>
          </div>
        </div>
      </div>

      {/* Synchronized Range Slider + Presets */}
      <div className="space-y-1.5">
        <label htmlFor="simulator-depth-range" className="sr-only">
          Scenario Waterlogging Depth in Metres
        </label>
        <input
          id="simulator-depth-range"
          type="range"
          min={0.1}
          max={2.5}
          step={0.1}
          value={waterDepthM}
          onChange={(e) => onChangeWaterDepthM(Number(e.target.value))}
          className="hero-range-slider"
          style={
            {
              '--attr-min': 0.1,
              '--attr-max': 2.5,
              '--control-value': waterDepthM,
              '--slider-fill-color': '#0788C9'
            } as React.CSSProperties
          }
        />

        <div className="flex flex-wrap gap-1">
          {SCENARIO_PRESETS.map(p => (
            <button
              key={p.value}
              type="button"
              onClick={() => onChangeWaterDepthM(p.value)}
              className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border cursor-pointer transition ${
                waterDepthM === p.value
                  ? 'bg-[#0788C9] border-[#0788C9] text-white'
                  : 'bg-[#F5F8FC] border-slate-200 text-slate-600 hover:border-[#0788C9]'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Map Focus Action */}
      <button
        type="button"
        onClick={onFocusImpactOnMap}
        className="w-full py-2 px-3 rounded-xl bg-white hover:bg-[#F5F8FC] border border-slate-200 hover:border-[#0788C9] text-xs font-bold text-[#0B193D] inline-flex items-center justify-center gap-1.5 transition cursor-pointer"
      >
        {blockedCount > 0 ? (
          <AlertTriangle className="w-3.5 h-3.5 text-[#D93636]" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="w-3.5 h-3.5 text-[#16A477]" aria-hidden="true" />
        )}
        <MapIcon className="w-3.5 h-3.5 text-[#0788C9]" aria-hidden="true" />
        <span>View Scenario Impact on Map</span>
      </button>
    </section>
  );
};
