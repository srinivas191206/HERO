'use client';

import React from 'react';
import { Cloud, Database, Network, Server } from 'lucide-react';
import { DistrictSummary, StateInfrastructureHealth } from '../../types';

interface InfrastructureHealthCardProps {
  districts: DistrictSummary[];
  health: StateInfrastructureHealth | null;
  isOnline: boolean;
  authMode: 'local' | 'cloud';
}

export const InfrastructureHealthCard: React.FC<InfrastructureHealthCardProps> = ({
  districts,
  health,
  isOnline,
  authMode
}) => {
  const onlineDistricts = districts.filter(d => d.status === 'online').length;
  const totalDistricts = districts.length;
  const activeOfficersOnline = districts.reduce((sum, d) => sum + d.onlineOfficers, 0);

  const cloudSyncTone =
    !isOnline || health?.status === 'Offline'
      ? 'red'
      : onlineDistricts === totalDistricts && totalDistricts > 0
        ? 'green'
        : 'amber';

  const serviceOk = Boolean(isOnline && health && health.status === 'Operational');
  const failedCount = health?.failedSyncTotal ?? 0;
  const pendingCount = health?.pendingSyncTotal ?? 0;

  const dataHealthLabel = !health
    ? 'Unchecked'
    : failedCount > 0
      ? `${failedCount} Sync Err`
      : pendingCount > 0
        ? `${pendingCount} Queued`
        : health.status === 'Operational'
          ? 'Verified'
          : health.status;

  const dataTone =
    !health || health.status === 'Offline' || failedCount > 0
      ? 'red'
      : pendingCount > 0 || health.status === 'Degraded'
        ? 'amber'
        : 'green';

  const cardColors = (tone: 'green' | 'amber' | 'red') =>
    tone === 'green'
      ? 'bg-emerald-50/70 border-emerald-200 text-emerald-700'
      : tone === 'amber'
        ? 'bg-amber-50/70 border-amber-200 text-amber-700'
        : 'bg-red-50/70 border-red-200 text-red-700';

  return (
    <section
      aria-label="System and Infrastructure Health"
      className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-[#0E5AD6]" aria-hidden="true" />
          <h2 className="text-[13px] font-bold text-[#0B1C3D]">System &amp; Infrastructure Health</h2>
        </div>
        {health?.latencyMs != null && (
          <span className="text-[10px] font-mono text-slate-400">
            {authMode === 'cloud' ? `Cloud ${health.latencyMs}ms` : 'Local Node'}
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {/* Cloud Sync */}
        <div className={`rounded-xl border p-2.5 text-center ${cardColors(cloudSyncTone)}`}>
          <Cloud className="w-4 h-4 mx-auto mb-1" aria-hidden="true" />
          <div className="text-[10px] font-bold text-slate-700 leading-tight">Cloud Sync</div>
          <div className="text-xs font-extrabold mt-0.5 tabular-nums">
            {onlineDistricts} / {totalDistricts} Online
          </div>
        </div>

        {/* Network Nodes */}
        <div
          className={`rounded-xl border p-2.5 text-center ${cardColors(
            serviceOk ? (totalDistricts > 0 ? 'green' : 'amber') : 'red'
          )}`}
        >
          <Network className="w-4 h-4 mx-auto mb-1" aria-hidden="true" />
          <div className="text-[10px] font-bold text-slate-700 leading-tight">Network Nodes</div>
          <div className="text-xs font-extrabold mt-0.5 tabular-nums">
            {totalDistricts} ({activeOfficersOnline} Units)
          </div>
        </div>

        {/* Data / Service Health */}
        <div className={`rounded-xl border p-2.5 text-center ${cardColors(dataTone)}`}>
          <Database className="w-4 h-4 mx-auto mb-1" aria-hidden="true" />
          <div className="text-[10px] font-bold text-slate-700 leading-tight">Data Health</div>
          <div className="text-xs font-extrabold mt-0.5">{dataHealthLabel}</div>
        </div>
      </div>
    </section>
  );
};
