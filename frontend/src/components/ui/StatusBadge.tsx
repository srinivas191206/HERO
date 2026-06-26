import React from 'react';
import { OfficerStatus } from '../../types';

interface StatusBadgeProps {
  status: OfficerStatus;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const getBadgeColors = () => {
    switch (status) {
      case 'Available':
        return 'bg-tactical-green/10 border-tactical-green/35 text-emerald-600 shadow-[0_2px_4px_rgba(16,185,129,0.05)]';
      case 'Patrolling':
        return 'bg-tactical-cyan/10 border-tactical-cyan/35 text-sky-700 shadow-[0_2px_4px_rgba(2,132,199,0.05)]';
      case 'Assigned':
        return 'bg-tactical-blue/5 border-tactical-blue/20 text-tactical-blue shadow-[0_2px_4px_rgba(30,58,138,0.05)]';
      case 'Busy':
        return 'bg-tactical-amber/10 border-tactical-amber/35 text-amber-700 shadow-[0_2px_4px_rgba(245,158,11,0.05)]';
      case 'Emergency':
        return 'bg-tactical-red/10 border-tactical-red/45 text-tactical-red animate-pulse shadow-[0_2px_8px_rgba(239,68,68,0.1)] font-bold';
      case 'Lost Connection':
        return 'bg-orange-50 border-orange-200 text-orange-600 animate-led-blink';
      case 'Offline':
      default:
        return 'bg-slate-100 border-slate-200 text-slate-500';
    }
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-sm text-[10px] font-mono border uppercase tracking-wider ${getBadgeColors()}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current mr-1.5" />
      {status}
    </span>
  );
};
