'use client';

import React, { useMemo, useState } from 'react';
import { BarChart3, TrendingDown, TrendingUp } from 'lucide-react';
import { Incident } from '../../types';

interface IncidentTrendsCardProps {
  incidents: Incident[];
  referenceTimestamp: number;
  loading?: boolean;
}

interface TrendBucket {
  index: number;
  label: string;
  windowLabel: string;
  total: number;
  p1: number;
}

export const IncidentTrendsCard: React.FC<IncidentTrendsCardProps> = ({
  incidents,
  referenceTimestamp,
  loading = false
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const { buckets, current24Count, previous24Count, deltaPercent, hasComparisonBaseline, maxBucket } =
    useMemo(() => {
      const now = referenceTimestamp;
      const bucketMs = 2 * 60 * 60 * 1000; // Twelve 2-hour intervals over last 24h
      const start24 = now - 24 * 60 * 60 * 1000;
      const start48 = now - 48 * 60 * 60 * 1000;

      const list: TrendBucket[] = Array.from({ length: 12 }, (_, idx) => {
        const wStart = start24 + idx * bucketMs;
        const d = new Date(wStart);
        const h = d.getHours();
        const ampm = h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
        const wEnd = new Date(wStart + bucketMs);
        const endH = wEnd.getHours();
        const endAmPm =
          endH === 0 ? '12 AM' : endH < 12 ? `${endH} AM` : endH === 12 ? '12 PM' : `${endH - 12} PM`;
        return {
          index: idx,
          label: idx % 2 === 0 ? ampm : '',
          windowLabel: `${ampm} – ${endAmPm}`,
          total: 0,
          p1: 0
        };
      });

      let cur24 = 0;
      let prev24 = 0;

      if (now > 0) {
        incidents.forEach(inc => {
          const ts = Number(inc.timestamp);
          if (!Number.isFinite(ts)) return;
          if (ts >= start24 && ts <= now + 60_000) {
            cur24 += 1;
            const idx = Math.min(11, Math.max(0, Math.floor((ts - start24) / bucketMs)));
            list[idx].total += 1;
            if (inc.priority === 'P1') list[idx].p1 += 1;
          } else if (ts >= start48 && ts < start24) {
            prev24 += 1;
          }
        });
      }

      const maxVal = Math.max(1, ...list.map(b => b.total));
      const baselineValid = prev24 > 0;
      const pct = baselineValid ? Math.round(((cur24 - prev24) / prev24) * 100) : null;

      return {
        buckets: list,
        current24Count: cur24,
        previous24Count: prev24,
        deltaPercent: pct,
        hasComparisonBaseline: baselineValid,
        maxBucket: maxVal
      };
    }, [incidents, referenceTimestamp]);

  const activeTip = hoveredIdx !== null ? buckets[hoveredIdx] : null;
  const yAxisMax = Math.max(5, Math.ceil(maxBucket / 5) * 5);

  return (
    <section
      aria-label="Incident Trends Last 24 Hours"
      className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col gap-3"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <BarChart3 className="w-4 h-4 text-[#0E5AD6] flex-shrink-0" aria-hidden="true" />
          <h2 className="text-[13px] font-bold text-[#0B1C3D] truncate">
            Incident Trends{' '}
            <span className="font-medium text-slate-500">(Last 24 Hours)</span>
          </h2>
        </div>
        {activeTip && (
          <span className="text-[10px] font-mono font-bold text-[#0E5AD6] bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-md whitespace-nowrap">
            {activeTip.windowLabel}: {activeTip.total} ({activeTip.p1} P1)
          </span>
        )}
      </div>

      {loading && incidents.length === 0 ? (
        <div className="h-32 rounded-xl bg-slate-50 border border-slate-100 animate-pulse flex items-center justify-center text-xs text-slate-400">
          Calculating 24h incident buckets...
        </div>
      ) : (
        <div className="flex items-stretch gap-3">
          <div className="flex-1 min-w-0">
            <div className="relative h-28 flex items-end">
              <div className="flex flex-col justify-between h-24 pr-1.5 text-[9px] font-mono text-slate-400 select-none">
                <span>{yAxisMax}</span>
                <span>{Math.round(yAxisMax / 2)}</span>
                <span>0</span>
              </div>

              <div className="flex-1 h-24 border-b border-l border-slate-200 px-1.5 flex items-end gap-1 relative">
                {buckets.map((b, i) => {
                  const pctHeight = b.total > 0 ? Math.max(10, Math.round((b.total / yAxisMax) * 100)) : 4;
                  const isHighlighted = i === buckets.length - 1 || hoveredIdx === i;
                  return (
                    <button
                      key={b.index}
                      type="button"
                      onMouseEnter={() => setHoveredIdx(i)}
                      onMouseLeave={() => setHoveredIdx(null)}
                      onFocus={() => setHoveredIdx(i)}
                      onBlur={() => setHoveredIdx(null)}
                      aria-label={`${b.windowLabel}: ${b.total} incidents, ${b.p1} P1`}
                      className="flex-1 h-full flex items-end justify-center group cursor-pointer focus:outline-none"
                    >
                      <span
                        className={`w-full rounded-t-sm transition-all ${
                          b.total === 0
                            ? 'bg-slate-100'
                            : b.p1 > 0 && isHighlighted
                              ? 'bg-[#0E5AD6]'
                              : b.total > 0 && i >= 9
                                ? 'bg-[#0B3B8C]'
                                : isHighlighted
                                  ? 'bg-[#0E5AD6]'
                                  : 'bg-[#60A5FA]/70 group-hover:bg-[#0E5AD6]'
                        }`}
                        style={{ height: `${pctHeight}%` }}
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pl-5 pt-1.5 flex justify-between text-[9px] font-semibold text-slate-400 select-none">
              {buckets
                .filter((_, idx) => idx % 3 === 0)
                .map(b => (
                  <span key={b.index}>{b.windowLabel.split(' – ')[0]}</span>
                ))}
            </div>
          </div>

          <div className="w-24 flex-shrink-0 border-l border-slate-100 pl-3 flex flex-col justify-center">
            <span className="text-2xl font-black text-[#0B1C3D] leading-none tabular-nums">
              {current24Count}
            </span>
            <span className="text-[11px] font-semibold text-slate-600 mt-1">
              Total Incidents
            </span>

            {hasComparisonBaseline && deltaPercent !== null ? (
              <div className="mt-2.5">
                <span
                  className={`inline-flex items-center gap-0.5 text-xs font-extrabold ${
                    deltaPercent > 0 ? 'text-red-600' : 'text-emerald-600'
                  }`}
                >
                  {deltaPercent > 0 ? (
                    <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" />
                  ) : (
                    <TrendingDown className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  {deltaPercent > 0 ? `+${deltaPercent}%` : `${deltaPercent}%`}
                </span>
                <span className="block text-[10px] text-slate-400">vs. previous 24h ({previous24Count})</span>
              </div>
            ) : (
              <span className="mt-2.5 text-[10px] text-slate-400 leading-snug">
                {current24Count > 0
                  ? 'No incidents in prior 24h baseline'
                  : 'No incidents in last 48h'}
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
