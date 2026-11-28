'use client';

import React, { useMemo, useState } from 'react';
import {
  Activity, ArrowRight, Cloud, RefreshCw, ShieldAlert, UserCheck, X
} from 'lucide-react';
import { AuditLog, DistrictSummary, Incident } from '../../types';

export interface ActivityEventItem {
  id: string;
  category: 'incident' | 'sync' | 'roster';
  title: string;
  description: string;
  districtId?: string | null;
  districtCode: string;
  incident?: Incident;
  timestamp: number;
  severity: 'critical' | 'warning' | 'ok' | 'info';
}

interface RecentActivityPanelProps {
  districts: DistrictSummary[];
  incidents: Incident[];
  auditLogs: AuditLog[];
  referenceTimestamp: number;
  loading?: boolean;
  onOpenDistrict: (districtId: string) => void;
  onOpenIncident: (incident: Incident) => void;
}

function formatRelativeTime(ts: number, referenceTs: number): string {
  if (!ts) return 'Unknown';
  if (!referenceTs) return new Date(ts).toLocaleTimeString();
  const diffSec = Math.max(0, Math.floor((referenceTs - ts) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(ts).toLocaleDateString();
}

export const RecentActivityPanel: React.FC<RecentActivityPanelProps> = ({
  districts,
  incidents,
  auditLogs,
  referenceTimestamp,
  loading = false,
  onOpenDistrict,
  onOpenIncident
}) => {
  const [filter, setFilter] = useState<'all' | 'incident' | 'sync' | 'roster'>('all');

  const districtById = useMemo(() => {
    const map = new Map<string, DistrictSummary>();
    districts.forEach(d => map.set(d.id, d));
    return map;
  }, [districts]);

  const events = useMemo<ActivityEventItem[]>(() => {
    const items: ActivityEventItem[] = [];

    incidents.slice(0, 20).forEach(inc => {
      const dist = inc.districtId ? districtById.get(inc.districtId) : undefined;
      const code = dist?.code || inc.districtId || 'STATE';
      const isP1 = inc.priority === 'P1';
      items.push({
        id: `inc-${inc.id}`,
        category: 'incident',
        title: `${isP1 ? 'SOS / Priority P1' : 'Incident Reported'} – ${code}`,
        description: `${inc.title} (${inc.status})`,
        districtId: inc.districtId,
        districtCode: code,
        incident: inc,
        timestamp: Number(inc.timestamp) || 0,
        severity: isP1 && inc.status !== 'Resolved' && inc.status !== 'Closed' ? 'critical' : 'warning'
      });
    });

    auditLogs.slice(0, 30).forEach(log => {
      const dist = log.districtId ? districtById.get(log.districtId) : undefined;
      const code = dist?.code || log.districtId || 'STATE';
      const lower = log.action.toLowerCase();
      const isRoster =
        lower.includes('assign') ||
        lower.includes('deploy') ||
        lower.includes('dispatch') ||
        lower.includes('officer');
      const isSync = lower.includes('sync') || lower.includes('bundle') || lower.includes('district');
      items.push({
        id: `aud-${log.id}`,
        category: isRoster ? 'roster' : isSync ? 'sync' : 'incident',
        title: isRoster
          ? `Personnel / Dispatch – ${code}`
          : isSync
            ? `District Sync – ${code}`
            : `Audit Event – ${code}`,
        description: log.action,
        districtId: log.districtId,
        districtCode: code,
        timestamp: Number(log.timestamp) || 0,
        severity: lower.includes('warning') || lower.includes('failed') ? 'warning' : 'info'
      });
    });

    districts.forEach(d => {
      if (d.lastSyncAt) {
        items.push({
          id: `sync-${d.id}-${d.lastSyncAt}`,
          category: 'sync',
          title: `District Sync – ${d.code}`,
          description: `${d.name} ${
            d.status === 'online' ? 'synchronized with State Cloud' : 'recorded last local sync'
          }`,
          districtId: d.id,
          districtCode: d.code,
          timestamp: Number(d.lastSyncAt),
          severity: d.status === 'online' ? 'ok' : 'warning'
        });
      }
    });

    items.sort((a, b) => b.timestamp - a.timestamp);
    return items;
  }, [districts, incidents, auditLogs, districtById]);

  const filtered = useMemo(
    () => (filter === 'all' ? events : events.filter(e => e.category === filter)),
    [events, filter]
  );

  const openModal = () => {
    const dlg = document.getElementById('hero-activity-dialog') as HTMLDialogElement | null;
    dlg?.showModal();
  };

  const navigateForEvent = (ev: ActivityEventItem) => {
    if (ev.incident) {
      onOpenIncident(ev.incident);
    } else if (ev.districtId) {
      onOpenDistrict(ev.districtId);
    }
  };

  const renderIcon = (ev: ActivityEventItem) => {
    if (ev.severity === 'critical') {
      return (
        <span className="w-8 h-8 rounded-full bg-red-50 border border-red-200 text-red-600 flex items-center justify-center flex-shrink-0">
          <ShieldAlert className="w-4 h-4" aria-hidden="true" />
        </span>
      );
    }
    if (ev.category === 'roster') {
      return (
        <span className="w-8 h-8 rounded-full bg-sky-50 border border-sky-200 text-[#0E5AD6] flex items-center justify-center flex-shrink-0">
          <UserCheck className="w-4 h-4" aria-hidden="true" />
        </span>
      );
    }
    return (
      <span
        className={`w-8 h-8 rounded-full border flex items-center justify-center flex-shrink-0 ${
          ev.severity === 'ok'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
            : 'bg-slate-50 border-slate-200 text-slate-600'
        }`}
      >
        <Cloud className="w-4 h-4" aria-hidden="true" />
      </span>
    );
  };

  return (
    <>
      <section
        aria-label="Recent Incidents and Activity"
        className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col h-full min-h-[300px]"
      >
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#0E5AD6]" aria-hidden="true" />
            <h2 className="text-sm font-bold text-[#0B1C3D]">Recent Incidents &amp; Activity</h2>
          </div>
          <button
            type="button"
            onClick={openModal}
            disabled={events.length === 0}
            className="text-xs font-bold text-[#0E5AD6] hover:underline disabled:opacity-40 inline-flex items-center gap-1 cursor-pointer"
          >
            <span>View All</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex items-center gap-1.5 py-2.5">
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'incident', label: 'Incidents' },
              { id: 'sync', label: 'Sync' },
              { id: 'roster', label: 'Roster' }
            ] as const
          ).map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition ${
                filter === tab.id
                  ? 'bg-[#EAF2FC] text-[#0E5AD6] border border-[#BFD8F8]'
                  : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 space-y-2.5 overflow-y-auto pr-1">
          {loading && events.length === 0 ? (
            <div className="py-10 flex flex-col items-center justify-center text-xs text-slate-400 gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-[#0E5AD6]" />
              <span>Loading real-time activity stream...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
              No recorded {filter === 'all' ? 'incidents or audit activity' : filter} events yet.
            </div>
          ) : (
            filtered.slice(0, 5).map(ev => {
              const clickable = Boolean(ev.incident || ev.districtId);
              return (
                <button
                  key={ev.id}
                  type="button"
                  disabled={!clickable}
                  onClick={() => navigateForEvent(ev)}
                  className={`w-full text-left flex items-start gap-3 p-2.5 rounded-xl border transition ${
                    clickable
                      ? 'border-slate-100 hover:border-[#BFD8F8] hover:bg-[#F7FAFF] cursor-pointer'
                      : 'border-slate-100 bg-white'
                  }`}
                >
                  {renderIcon(ev)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[#0B1C3D] truncate">{ev.title}</span>
                      <span className="text-[10px] font-medium text-slate-400 whitespace-nowrap">
                        {formatRelativeTime(ev.timestamp, referenceTimestamp)}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 truncate mt-0.5">{ev.description}</p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </section>

      <dialog
        id="hero-activity-dialog"
        aria-labelledby="activity-modal-title"
        closedby="any"
        className="m-auto w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl backdrop:bg-slate-950/50 backdrop:backdrop-blur-xs"
      >
        <div className="p-5 border-b border-slate-200 flex items-center justify-between gap-3">
          <div>
            <h1 id="activity-modal-title" className="text-base font-extrabold text-[#0B1C3D]">
              Statewide Operational Activity Log
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Real-time verified incident reports, district cloud syncs, and audit records
            </p>
          </div>
          <form method="dialog">
            <button
              type="submit"
              aria-label="Close activity log"
              className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </form>
        </div>

        <div className="p-4 max-h-[65vh] overflow-y-auto space-y-2">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500">No matching events.</p>
          ) : (
            filtered.map(ev => (
              <button
                key={ev.id}
                type="button"
                onClick={e => {
                  (e.currentTarget.closest('dialog') as HTMLDialogElement | null)?.close();
                  navigateForEvent(ev);
                }}
                className="w-full text-left flex items-start gap-3 p-3 rounded-xl border border-slate-200 hover:border-[#0E5AD6] hover:bg-[#F7FAFF] cursor-pointer transition"
              >
                {renderIcon(ev)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#0B1C3D]">{ev.title}</span>
                    <span className="text-[11px] font-mono text-slate-400">
                      {new Date(ev.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5 break-words">{ev.description}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </dialog>
    </>
  );
};
