'use client';

import React, { useMemo, useState } from 'react';
import { ArrowRight, ChevronUp, Clock, TrendingUp } from 'lucide-react';
import { PointWeatherTelemetry } from '../../services/intelligence/OpenMeteoService';
import { ThermalFeedStatus } from './HeatwaveControlPanel';

interface DistrictThermalTrendCardProps {
  districtName: string;
  weather?: PointWeatherTelemetry;
  weatherStatus: ThermalFeedStatus;
}

interface TrendPoint {
  timeLabel: string;
  tempC: number;
  heatIndexC: number;
  rh: number | null;
}

export const DistrictThermalTrendCard: React.FC<DistrictThermalTrendCardProps> = ({
  districtName,
  weather,
  weatherStatus
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const series = useMemo<TrendPoint[]>(() => {
    if (!weather || !weather.hourlyTime.length || !weather.hourlyApparentTempC.length) {
      return [];
    }
    const todayPrefix = weather.hourlyTime[0]?.slice(0, 10);
    const items: TrendPoint[] = [];
    for (let i = 0; i < weather.hourlyTime.length; i += 1) {
      const t = weather.hourlyTime[i];
      if (!t || (todayPrefix && !t.startsWith(todayPrefix))) continue;
      const hi = weather.hourlyApparentTempC[i];
      const temp = weather.hourlyTemperatureC?.[i];
      const rh = weather.hourlyRelativeHumidity?.[i];
      if (typeof hi !== 'number') continue;
      items.push({
        timeLabel: t.slice(11, 16),
        tempC: typeof temp === 'number' && weather.hourlyTemperatureC.length > 0 ? temp : hi,
        heatIndexC: hi,
        rh: typeof rh === 'number' && weather.hourlyRelativeHumidity.length > 0 ? rh : null
      });
    }
    // Sample every 2 hours so 12 crisp points span 00:00..22:00 neatly
    return items.filter((_, idx) => idx % 2 === 0);
  }, [weather]);

  const { minVal, maxVal, tempPolyline, hiPolyline, coords } = useMemo(() => {
    if (series.length < 2) {
      return { minVal: 20, maxVal: 45, tempPolyline: '', hiPolyline: '', coords: [] };
    }
    const allTemps = series.flatMap(p => [p.tempC, p.heatIndexC]);
    const rawMin = Math.floor(Math.min(...allTemps) - 2);
    const rawMax = Math.ceil(Math.max(...allTemps) + 2);
    const span = Math.max(4, rawMax - rawMin);

    const w = 520;
    const h = 112;
    const padX = 26;
    const padY = 12;

    const ptCoords = series.map((pt, idx) => {
      const x = padX + (idx / (series.length - 1)) * (w - padX * 2);
      const yTemp = padY + (1 - (pt.tempC - rawMin) / span) * (h - padY * 2);
      const yHi = padY + (1 - (pt.heatIndexC - rawMin) / span) * (h - padY * 2);
      return { x, yTemp, yHi, pt };
    });

    return {
      minVal: rawMin,
      maxVal: rawMax,
      tempPolyline: ptCoords.map(c => `${c.x.toFixed(1)},${c.yTemp.toFixed(1)}`).join(' '),
      hiPolyline: ptCoords.map(c => `${c.x.toFixed(1)},${c.yHi.toFixed(1)}`).join(' '),
      coords: ptCoords
    };
  }, [series]);

  const activePoint = hoveredIdx != null ? series[hoveredIdx] : series[series.length - 1] || null;
  const hasRealTempSeries = Boolean(weather?.hourlyTemperatureC && weather.hourlyTemperatureC.length > 0);

  return (
    <section
      aria-label={`District Thermal Trend for ${districtName}`}
      className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col justify-between gap-2.5"
    >
      {/* Header & Legend */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-[#EEF4FD] border border-[#DCE7F7] text-[#0788C9] flex items-center justify-center flex-shrink-0">
            <TrendingUp className="w-4 h-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-extrabold text-[#0B193D] tracking-tight truncate">
              District Thermal Trend — {districtName}
            </h2>
            <p className="text-[11px] font-medium text-slate-500 truncate">
              Hourly Open-Meteo temperature &amp; apparent heat index (IST today)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-[10.5px] font-semibold text-slate-600">
          {hasRealTempSeries && (
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#D93636]" aria-hidden="true" />
              Temp (°C)
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-[#E58A28]" aria-hidden="true" />
            Heat Index (°C)
          </span>
          {series.length > 0 && (
            <button
              type="button"
              onClick={() => setShowTable(prev => !prev)}
              aria-expanded={showTable}
              className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-[#F5F8FC] text-[#0B193D] font-bold inline-flex items-center gap-1 cursor-pointer"
            >
              <span>{showTable ? 'Chart' : 'View Details'}</span>
              {showTable ? (
                <ChevronUp className="w-3 h-3 text-[#0788C9]" aria-hidden="true" />
              ) : (
                <ArrowRight className="w-3 h-3 text-[#0788C9]" aria-hidden="true" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Body: Loading / Empty / Live Chart / Hourly Table */}
      {series.length < 2 ? (
        <div className="h-[135px] rounded-xl border border-dashed border-slate-200 bg-[#F5F8FC] flex flex-col items-center justify-center p-4 text-center gap-1">
          <Clock className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <p className="text-xs font-bold text-[#0B193D]">
            {weatherStatus === 'loading'
              ? 'Loading Open-Meteo hourly observations...'
              : 'Hourly thermal series unavailable'}
          </p>
          <p className="text-[11px] text-slate-500">
            {weatherStatus === 'loading'
              ? 'Fetching today’s IST time-series measurements.'
              : 'No live hourly readings returned; check Open-Meteo connectivity or refresh.'}
          </p>
        </div>
      ) : showTable ? (
        <div className="max-h-[150px] overflow-y-auto border border-slate-100 rounded-xl">
          <table className="w-full text-left text-[11px] border-collapse">
            <thead className="bg-[#F5F8FC] text-[9.5px] font-extrabold uppercase text-slate-500 sticky top-0">
              <tr>
                <th className="py-1.5 px-2.5">IST Time</th>
                {hasRealTempSeries && <th className="py-1.5 px-2.5 text-right">Temp (°C)</th>}
                <th className="py-1.5 px-2.5 text-right">Heat Index (°C)</th>
                <th className="py-1.5 px-2.5 text-right">RH (%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {series.map(pt => (
                <tr key={pt.timeLabel}>
                  <td className="py-1 px-2.5 font-sans font-semibold text-slate-700">{pt.timeLabel}</td>
                  {hasRealTempSeries && (
                    <td className="py-1 px-2.5 text-right text-[#D93636] font-bold">
                      {pt.tempC.toFixed(1)}°C
                    </td>
                  )}
                  <td className="py-1 px-2.5 text-right text-[#E58A28] font-bold">
                    {pt.heatIndexC.toFixed(1)}°C
                  </td>
                  <td className="py-1 px-2.5 text-right text-slate-600">
                    {pt.rh != null ? `${pt.rh}%` : '--'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-1.5">
          <svg
            viewBox="0 0 520 128"
            className="w-full h-[126px] overflow-visible"
            role="img"
            aria-label={`Hourly temperature and heat index chart for ${districtName}`}
          >
            {/* Horizontal grid lines */}
            {[0, 0.5, 1].map((t, i) => {
              const y = 12 + t * 88;
              const val = Math.round(maxVal - t * (maxVal - minVal));
              return (
                <g key={i}>
                  <line
                    x1="26"
                    x2="494"
                    y1={y}
                    y2={y}
                    stroke="#E2E8F0"
                    strokeDasharray="3 3"
                    strokeWidth="1"
                  />
                  <text x="20" y={y + 3} textAnchor="end" fontSize="9" fill="#64748B">
                    {val}
                  </text>
                </g>
              );
            })}

            {/* Series lines */}
            <polyline
              fill="none"
              stroke="#E58A28"
              strokeWidth="2.2"
              strokeLinejoin="round"
              points={hiPolyline}
            />
            {hasRealTempSeries && (
              <polyline
                fill="none"
                stroke="#D93636"
                strokeWidth="2.2"
                strokeLinejoin="round"
                points={tempPolyline}
              />
            )}

            {/* Data points & X labels */}
            {coords.map((c, idx) => (
              <g
                key={c.pt.timeLabel}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                className="cursor-pointer"
              >
                <circle
                  cx={c.x}
                  cy={c.yHi}
                  r={hoveredIdx === idx ? 4.5 : 2.8}
                  fill="#E58A28"
                  stroke="#FFFFFF"
                  strokeWidth="1.2"
                />
                {hasRealTempSeries && (
                  <circle
                    cx={c.x}
                    cy={c.yTemp}
                    r={hoveredIdx === idx ? 4.5 : 2.8}
                    fill="#D93636"
                    stroke="#FFFFFF"
                    strokeWidth="1.2"
                  />
                )}
                {idx % 2 === 0 && (
                  <text x={c.x} y="122" textAnchor="middle" fontSize="9" fill="#64748B">
                    {c.pt.timeLabel}
                  </text>
                )}
              </g>
            ))}
          </svg>

          {activePoint && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1 rounded-lg bg-[#F5F8FC] border border-slate-100 text-[10.5px] font-mono text-slate-700">
              <span className="font-sans font-bold text-[#0B193D]">
                {activePoint.timeLabel} IST
              </span>
              <span className="flex items-center gap-3">
                {hasRealTempSeries && (
                  <span>
                    Temp: <strong className="text-[#D93636]">{activePoint.tempC.toFixed(1)}°C</strong>
                  </span>
                )}
                <span>
                  Heat Index: <strong className="text-[#C2410C]">{activePoint.heatIndexC.toFixed(1)}°C</strong>
                </span>
                {activePoint.rh != null && (
                  <span>
                    RH: <strong>{activePoint.rh}%</strong>
                  </span>
                )}
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
