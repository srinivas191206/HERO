'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ChevronUp,
  CloudRain,
  Database,
  ShieldCheck,
  Waves
} from 'lucide-react';
import { Incident } from '../../types';
import { matchApDistrict } from '../../utils/apDistricts';
import { RainRiskRow, ServiceFeedState } from './RainfallControlHeader';

interface RainfallEarlyWarningPanelProps {
  rows: RainRiskRow[];
  activeRow?: RainRiskRow;
  incidents?: Incident[];
  radarStatus: ServiceFeedState;
  forecastStatus: ServiceFeedState;
  lastUpdatedLabel: string | null;
}

export const RainfallEarlyWarningPanel: React.FC<RainfallEarlyWarningPanelProps> = ({
  rows,
  activeRow,
  incidents = [],
  radarStatus,
  forecastStatus,
  lastUpdatedLabel
}) => {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsId = useId();
  const detailRegionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = detailRegionRef.current;
    if (!el || !('onbeforematch' in HTMLElement.prototype)) return;
    const onBeforeMatch = () => setDetailsOpen(true);
    el.addEventListener('beforematch', onBeforeMatch);
    return () => el.removeEventListener('beforematch', onBeforeMatch);
  }, []);

  const situation = useMemo(() => {
    const heavyDistricts = rows.filter(r => r.rain24hMm >= 64.5);
    const moderateDistricts = rows.filter(r => r.rain24hMm >= 15.6 && r.rain24hMm < 64.5);
    const wetSoilDistricts = rows.filter(r => r.soilPct >= 75);
    const inundationWatch = rows.filter(r => r.rain24hMm >= 64.5 || r.soilPct >= 75);
    const max24hRow = [...rows].sort((a, b) => b.rain24hMm - a.rain24hMm)[0];

    const floodRelatedIncidents = incidents.filter(inc => {
      const hay = `${inc.title} ${inc.description || ''}`.toLowerCase();
      return (
        inc.status !== 'Resolved' &&
        (hay.includes('flood') || hay.includes('rain') || hay.includes('water') || hay.includes('inundation'))
      );
    });

    const activeDistFloodIncidents = activeRow
      ? floodRelatedIncidents.filter(
          inc =>
            matchApDistrict(inc.districtId)?.district === activeRow.meta.district ||
            matchApDistrict(inc.title)?.district === activeRow.meta.district
        )
      : [];

    return {
      heavyDistricts,
      moderateDistricts,
      wetSoilDistricts,
      inundationWatch,
      max24hRow,
      floodRelatedIncidents,
      activeDistFloodIncidents
    };
  }, [rows, incidents, activeRow]);

  const hasWatchTrigger = situation.inundationWatch.length > 0;

  return (
    <section
      id="rainfall-early-warning-panel"
      aria-label="Rainfall & Inundation Early Warning Intelligence"
      className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden flex flex-col justify-between"
    >
      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-[#FFF3F3] border border-[#F8CCCC] text-[#D93636] flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-4 h-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-extrabold text-[#0B193D] tracking-tight truncate">
                Rainfall &amp; Inundation Early Warning Intelligence
              </h2>
              <p className="text-[11px] font-medium text-slate-500 truncate">
                Current rainfall situation, warning feed status &amp; inundation thresholds
              </p>
            </div>
          </div>

          <button
            type="button"
            aria-expanded={detailsOpen}
            aria-controls={detailsId}
            onClick={() => setDetailsOpen(prev => !prev)}
            className="px-3 py-1.5 rounded-xl bg-white hover:bg-[#F5F8FC] border border-slate-200 hover:border-[#0788C9] text-xs font-bold text-[#0B193D] inline-flex items-center gap-1.5 transition cursor-pointer"
          >
            <span>{detailsOpen ? 'Hide Details' : 'View Details'}</span>
            {detailsOpen ? (
              <ChevronUp className="w-3.5 h-3.5 text-[#0788C9]" aria-hidden="true" />
            ) : (
              <ArrowRight className="w-3.5 h-3.5 text-[#0788C9]" aria-hidden="true" />
            )}
          </button>
        </div>

        {/* Official Warning Feed Banner (Honest CAP / Bulletin Distinction) */}
        <div
          className={`p-3 rounded-xl border flex items-start gap-2.5 ${
            hasWatchTrigger
              ? 'bg-[#FFF3F3] border-[#F8CCCC]'
              : 'bg-[#ECFDF5] border-[#BDEBD8]'
          }`}
        >
          <ShieldCheck
            className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
              hasWatchTrigger ? 'text-[#D93636]' : 'text-[#16A477]'
            }`}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`text-xs font-extrabold ${
                  hasWatchTrigger ? 'text-[#D93636]' : 'text-[#065F46]'
                }`}
              >
                {hasWatchTrigger
                  ? `HERO Threshold Watch Active in ${situation.inundationWatch.length} District(s)`
                  : 'No External IMD Warning Bulletin Connected — Local Threshold Watch Clear'}
              </span>
              <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-600">
                Warning API Unavailable
              </span>
            </div>
            <p className="text-[11px] text-slate-700 mt-0.5 leading-snug">
              {forecastStatus !== 'live'
                ? 'Open-Meteo forecast feed is syncing or unavailable; unable to evaluate district thresholds.'
                : situation.heavyDistricts.length > 0
                  ? `${situation.heavyDistricts.length} district(s) forecast ≥64.5 mm/24h (${situation.heavyDistricts.map(d => d.meta.district).join(', ')}). Official IMD CAP bulletins are not directly linked.`
                  : 'No AP district is forecast ≥64.5 mm/24h (IMD Heavy). Live IMD CAP bulletins are not connected to this environment.'}
            </p>
          </div>
        </div>

        {/* 3 Context Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
          <div className="p-2.5 rounded-xl bg-[#F5F8FC] border border-slate-200">
            <span className="text-[10.5px] font-bold text-[#0B193D] inline-flex items-center gap-1.5">
              <CloudRain className="w-3.5 h-3.5 text-[#0788C9]" aria-hidden="true" />
              Current Situation
            </span>
            <p className="text-[11px] text-slate-600 mt-1 leading-snug">
              {forecastStatus !== 'live'
                ? 'Awaiting Open-Meteo rainfall sync.'
                : situation.max24hRow && situation.max24hRow.rain24hMm >= 2.5
                  ? `Peak 24h forecast: ${situation.max24hRow.meta.district} (${situation.max24hRow.rain24hMm.toFixed(1)} mm); ${situation.moderateDistricts.length} moderate district(s).`
                  : 'Dry / light isolated precipitation across AP 28 districts.'}
            </p>
          </div>

          <div className="p-2.5 rounded-xl bg-[#F5F8FC] border border-slate-200">
            <span className="text-[10.5px] font-bold text-[#0B193D] inline-flex items-center gap-1.5">
              <Waves className="w-3.5 h-3.5 text-[#0788C9]" aria-hidden="true" />
              Inundation Outlook
            </span>
            <p className="text-[11px] text-slate-600 mt-1 leading-snug">
              {hasWatchTrigger
                ? `${situation.inundationWatch.length} district(s) meet watch criteria (≥64.5mm or ≥75% topsoil saturation).`
                : 'No watch triggered (≥64.5mm/24h or ≥75% soil). Rainfall alone does not confirm flooding.'}
            </p>
          </div>

          <div className="p-2.5 rounded-xl bg-[#F5F8FC] border border-slate-200">
            <span className="text-[10.5px] font-bold text-[#0B193D] inline-flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-[#0788C9]" aria-hidden="true" />
              Connected Sources
            </span>
            <ul className="text-[10.5px] text-slate-600 mt-1 space-y-0.5">
              <li>• RainViewer Radar ({radarStatus === 'live' ? 'Live' : radarStatus})</li>
              <li>• Open-Meteo 72h ({forecastStatus === 'live' ? 'Live' : forecastStatus})</li>
              <li>• IMD Threshold Rules (Active)</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Expandable Details Disclosure */}
      <div
        id={detailsId}
        ref={detailRegionRef}
        hidden={!detailsOpen ? ('until-found' as unknown as boolean) : undefined}
      >
        <div className="px-4 pb-4 pt-3 border-t border-slate-100 bg-[#F5F8FC]/60 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-1.5">
            <h3 className="text-xs font-extrabold text-[#0B193D]">
              Selected District Watch Context — {activeRow?.meta.district || 'Andhra Pradesh'}
            </h3>
            {activeRow ? (
              <dl className="space-y-1 text-[11px]">
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Topsoil Moisture (0–7cm):</dt>
                  <dd className="font-mono font-bold text-[#0B193D]">
                    {activeRow.hasLiveForecast ? `${activeRow.soilPct.toFixed(1)}%` : 'Unavailable'}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">3h Peak Forecast Intensity:</dt>
                  <dd className="font-mono font-bold text-[#0B193D]">
                    {activeRow.hasLiveForecast ? `${activeRow.peak3hMm.toFixed(1)} mm` : 'Unavailable'}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Active Rain/Flood Incidents:</dt>
                  <dd className="font-mono font-bold text-[#0B193D]">
                    {situation.activeDistFloodIncidents.length}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Last Feed Sync:</dt>
                  <dd className="font-mono font-semibold text-slate-700">{lastUpdatedLabel || 'Pending'}</dd>
                </div>
              </dl>
            ) : null}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-1.5">
            <h3 className="text-xs font-extrabold text-[#0B193D]">
              Warning &amp; Historical Feed Status
            </h3>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Inundation screening activates automatically when 24h forecast rainfall ≥ 64.5 mm (IMD Heavy) or topsoil moisture exceeds 75%. Statewide active flood/rain incident count from HERO DB: <strong>{situation.floodRelatedIncidents.length}</strong>.
            </p>
            <p className="text-[10.5px] text-slate-500 leading-relaxed pt-1 border-t border-slate-100">
              External IMD official bulletin CAP APIs and district rainfall historical archives are not connected in this environment; all shown metrics come strictly from live RainViewer frames, Open-Meteo forecasts, and HERO operational records.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
