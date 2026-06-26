import React from 'react';

interface HUDPanelProps {
  title: string;
  subtitle?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  statusColor?: 'cyan' | 'green' | 'amber' | 'red' | 'gray';
  className?: string;
}

export const HUDPanel: React.FC<HUDPanelProps> = ({
  title,
  subtitle,
  headerRight,
  children,
  statusColor = 'cyan',
  className = ''
}) => {
  const getLedColor = () => {
    switch (statusColor) {
      case 'green': return 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]';
      case 'amber': return 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]';
      case 'red': return 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)] animate-led-blink';
      case 'gray': return 'bg-slate-400';
      case 'cyan':
      default:
        return 'bg-sky-500 shadow-[0_0_8px_rgba(14,165,233,0.4)]';
    }
  };

  const getBorderColor = () => {
    switch (statusColor) {
      case 'red': return 'border-red-200 bg-red-50/30';
      case 'amber': return 'border-amber-200 bg-amber-50/30';
      case 'green': return 'border-emerald-200 bg-emerald-50/30';
      default:
        return 'border-slate-200 bg-white';
    }
  };

  return (
    <div className={`backdrop-blur-md border rounded-3xl p-5 flex flex-col justify-between overflow-hidden transition-all duration-300 shadow-lg shadow-slate-200/60 hover:border-slate-300 ${getBorderColor()} ${className}`}>
      
      {/* Header Area */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
        <div className="flex items-center gap-2.5">
          {/* Glowing status LED */}
          <span className={`w-2 h-2 rounded-full ${getLedColor()} transition-all duration-300`} />
          <div>
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-800 font-sans">
              {title}
            </h2>
            {subtitle && (
              <p className="text-[10px] text-slate-500 uppercase tracking-widest leading-none mt-1.5 font-bold">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {headerRight && <div className="text-xs text-slate-500">{headerRight}</div>}
      </div>

      {/* Panel contents */}
      <div className="flex-1 text-slate-600 text-sm">
        {children}
      </div>
    </div>
  );
};

