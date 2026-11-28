'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Calendar, Clock, CloudRain, Droplets } from 'lucide-react';
import { PointWeatherTelemetry } from '../../services/intelligence/OpenMeteoService';
import { ServiceFeedState } from './RainfallControlHeader';

interface DistrictForecastTimelineCardProps {
  districtName: string;
  weather?: PointWeatherTelemetry;
  forecastStatus: ServiceFeedState;
  lastUpdatedLabel: string | null;
}

interface DaySummary {
  dayLabel: string;
  dateLabel: string;
  totalMm: number;
}

interface HourPoint {
  dateTime: string;
  label: string;
  mm: number;
}

export const DistrictForecastTimelineCard: React.FC<DistrictForecastTimelineCardProps> = ({
  districtName,
  weather,
  forecastStatus,
  lastUpdatedLabel
}) => {
  const [activeView, setActiveView] = useState<'day' | 'hourly'>('day');
  const dayPanelRef = useRef<HTMLDivElement>(null);
  const hourPanelRef = useRef<HTMLDivElement>(null);
  const dayTabId = useId();
  const hourTabId = useId();

  // Sync tab state if browser "Find in page" matches text inside inactive panel
  useEffect(() => {
    const dayEl = dayPanelRef.current;
    const hourEl = hourPanelRef.current;
    if (!dayEl || !hourEl || !('onbeforematch' in HTMLElement.prototype)) return;

    const onDayMatch = () => setActiveView('day');
    const onHourMatch = () => setActiveView('hourly');
    dayEl.addEventListener('beforematch', onDayMatch);
    hourEl.addEventListener('beforematch', onHourMatch);
    return () => {
      dayEl.removeEventListener('beforematch', onDayMatch);
      hourEl.removeEventListener('beforematch', onHourMatch);
    };
  }, []);

  const { daySummaries, hourlyPoints, expectedPeak } = useMemo(() => {
    if (!weather || !weather.hourlyTime.length) {
      return { daySummaries: [], hourlyPoints: [], expectedPeak: null };
    }

    const byDate = new Map<string, number>();
    const hours: HourPoint[] = [];
    let peakVal = 0;
    let peakTime = '';

    weather.hourlyTime.forEach((iso, idx) => {
      const mm = Number(weather.hourlyPrecipitationMm[idx] ?? 0);
      const dayKey = iso.slice(0, 10);
      byDate.set(dayKey, (byDate.get(dayKey) || 0) + mm);
      hours.push({
        dateTime: iso,
        label: iso.slice(11, 16),
        mm
      });
      if (mm > peakVal) {
        peakVal = mm;
        peakTime = iso;
      }
    });

    const days: DaySummary[] = Array.from(byDate.entries())
      .slice(0, 3)
      .map(([isoDate, sum], i) => {
        const parsed = new Date(`${isoDate}T00:00:00`);
        const dateLabel = Number.isNaN(parsed.getTime())
          ? isoDate
          : parsed.toLocaleDateString([], { day: '2-digit', month: 'short' });
        return {
          dayLabel: `Day ${i + 1}`,
          dateLabel,
          totalMm: Number(sum.toFixed(1))
        };
      });

    const formattedPeak =
      peakVal > 0 && peakTime
        ? {
            mm: Number(peakVal.toFixed(1)),
            when: `${peakTime.slice(8, 10)}/${peakTime.slice(5, 7)} • ${peakTime.slice(11, 16)} IST`
          }
        : null;

    return {
      daySummaries: days,
      hourlyPoints: hours,
      expectedPeak: formattedPeak
    };
  }, [weather]);

  const maxDayMm = Math.max(10, ...daySummaries.map(d => d.totalMm));
  const maxHourMm = Math.max(5, ...hourlyPoints.map(h => h.mm));

  return (
    <section
      aria-label={`District Rainfall Forecast Timeline for ${districtName}`}
      className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col justify-between gap-3"
    >
      {/* Header & Accessible Tablist */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-[#EEF4FD] border border-[#DCE7F7] text-[#0788C9] flex items-center justify-center flex-shrink-0">
            <CloudRain className="w-4 h-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-extrabold text-[#0B193D] tracking-tight truncate">
              District Rainfall Forecast Timeline — {districtName}
            </h2>
            <p className="text-[11px] font-medium text-slate-500 truncate">
              Day-wise and hourly rainfall forecast (Open-Meteo)
            </p>
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Forecast granularity selector"
          className="inline-flex bg-[#F5F8FC] p-0.5 rounded-xl border border-slate-200 text-xs font-bold flex-shrink-0"
        >
          <button
            id={dayTabId}
            type="button"
            role="tab"
            aria-selected={activeView === 'day'}
            onClick={() => setActiveView('day')}
            className={`relative px-3 py-1 rounded-lg cursor-pointer transition ${
              activeView === 'day'
                ? 'bg-[#0788C9] text-white'
                : 'text-slate-600 hover:text-[#0B193D]'
            }`}
          >
            Day-wise
          </button>
          <button
            id={hourTabId}
            type="button"
            role="tab"
            aria-selected={activeView === 'hourly'}
            onClick={() => setActiveView('hourly')}
            className={`relative px-3 py-1 rounded-lg cursor-pointer transition ${
              activeView === 'hourly'
                ? 'bg-[#0788C9] text-white'
                : 'text-slate-600 hover:text-[#0B193D]'
            }`}
          >
            Hourly
          </button>
        </div>
      </div>

      {/* Main Content + Right Summary Cards */}
      {daySummaries.length === 0 ? (
        <div className="h-[148px] rounded-xl border border-dashed border-slate-200 bg-[#F5F8FC] flex flex-col items-center justify-center p-4 text-center gap-1">
          <Clock className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <p className="text-xs font-bold text-[#0B193D]">
            {forecastStatus === 'loading'
              ? 'Loading Open-Meteo 72h forecast...'
              : '72-hour precipitation forecast unavailable'}
          </p>
          <p className="text-[11px] text-slate-500">
            {forecastStatus === 'loading'
              ? 'Syncing hourly precipitation series.'
              : 'No timestamped forecast values available for this district.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-stretch">
          {/* Chart Container */}
          <div className="md:col-span-8 min-w-0">
            {/* Day-wise Panel */}
            <div
              ref={dayPanelRef}
              role="tabpanel"
              aria-labelledby={dayTabId}
              tabIndex={activeView === 'day' ? 0 : undefined}
              hidden={activeView !== 'day' ? ('until-found' as unknown as boolean) : undefined}
            >
              <div className="h-[154px] rounded-xl border border-slate-100 bg-[#F5F8FC]/60 p-3 flex flex-col justify-end">
                <div className="grid grid-cols-3 gap-4 items-end h-[106px]">
                  {daySummaries.map(day => {
                    const barPct = day.totalMm > 0 ? Math.max(8, (day.totalMm / maxDayMm) * 100) : 0;
                    return (
                      <div key={day.dayLabel} className="flex flex-col items-center justify-end h-full gap-1">
                        <span className="text-[11px] font-mono font-extrabold text-[#0B193D] tabular-nums">
                          {day.totalMm.toFixed(1)} mm
                        </span>
                        <div className="w-full max-w-[54px] flex-1 flex items-end bg-slate-200/50 rounded-t-md overflow-hidden">
                          <div
                            className="w-full bg-[#0788C9] rounded-t-md transition-all"
                            style={{ height: `${barPct}%` }}
                          />
                        </div>
                        <div className="text-center leading-tight">
                          <span className="text-[10.5px] font-bold text-[#0B193D] block">
                            {day.dayLabel}
                          </span>
                          <span className="text-[9.5px] text-slate-500">({day.dateLabel})</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Hourly Panel */}
            <div
              ref={hourPanelRef}
              role="tabpanel"
              aria-labelledby={hourTabId}
              tabIndex={activeView === 'hourly' ? 0 : undefined}
              hidden={activeView !== 'hourly' ? ('until-found' as unknown as boolean) : undefined}
            >
              <div className="h-[154px] rounded-xl border border-slate-100 bg-[#F5F8FC]/60 p-3 flex flex-col justify-between">
                <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500">
                  <span>72h Hourly Precipitation (scroll horizontally)</span>
                  <span>Peak scale: {maxHourMm.toFixed(0)} mm/h</span>
                </div>
                <div className="flex items-end gap-1.5 overflow-x-auto pb-1 h-[106px]">
                  {hourlyPoints.map((pt, idx) => {
                    const barPct = pt.mm > 0 ? Math.max(8, (pt.mm / maxHourMm) * 100) : 2;
                    return (
                      <div
                        key={pt.dateTime}
                        title={`${pt.dateTime.replace('T', ' ')}: ${pt.mm.toFixed(1)} mm`}
                        className="flex flex-col items-center justify-end h-full min-w-[26px] flex-shrink-0 gap-1"
                      >
                        {pt.mm >= 0.5 && (
                          <span className="text-[8.5px] font-mono font-bold text-[#0788C9]">
                            {pt.mm.toFixed(1)}
                          </span>
                        )}
                        <div className="w-4 flex-1 flex items-end bg-slate-200/40 rounded-t">
                          <div
                            className={`w-full rounded-t ${
                              pt.mm >= 10
                                ? 'bg-[#D93636]'
                                : pt.mm >= 2.5
                                  ? 'bg-[#D99A28]'
                                  : pt.mm > 0
                                    ? 'bg-[#0788C9]'
                                    : 'bg-slate-300'
                            }`}
                            style={{ height: `${barPct}%` }}
                          />
                        </div>
                        <span className="text-[8.5px] font-mono text-slate-500">
                          {idx % 3 === 0 ? pt.label : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Right Summary Stack */}
          <div className="md:col-span-4 space-y-2 flex flex-col justify-between min-w-0">
            <div className="p-2.5 rounded-xl bg-[#F5F8FC] border border-slate-200">
              <span className="text-[10px] font-bold text-slate-500 inline-flex items-center gap-1">
                <Calendar className="w-3 h-3 text-[#0788C9]" aria-hidden="true" />
                Expected Peak
              </span>
              <span className="text-xs font-extrabold text-[#0B193D] block mt-0.5 truncate">
                {expectedPeak ? `${expectedPeak.mm} mm/h` : 'No significant rainfall'}
              </span>
              {expectedPeak && (
                <span className="text-[9.5px] font-mono text-slate-500 block truncate">
                  {expectedPeak.when}
                </span>
              )}
            </div>

            <div className="p-2.5 rounded-xl bg-[#F5F8FC] border border-slate-200">
              <span className="text-[10px] font-bold text-slate-500 inline-flex items-center gap-1">
                <Droplets className="w-3 h-3 text-[#0788C9]" aria-hidden="true" />
                Total (72h)
              </span>
              <span className="text-sm font-black font-mono text-[#0B193D] tabular-nums block mt-0.5">
                {(weather?.next72hRainMm ?? 0).toFixed(1)} mm
              </span>
            </div>

            <div className="p-2 rounded-xl bg-[#F5F8FC] border border-slate-200 flex items-center justify-between gap-2 text-[10px]">
              <span className="font-semibold text-slate-500 truncate">Forecast Updated</span>
              <span className="font-mono font-bold text-[#0B193D] flex-shrink-0">
                {lastUpdatedLabel || 'Pending'}
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
