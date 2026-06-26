import React from 'react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { ShieldAlert, SignalHigh, SignalZero } from 'lucide-react';

export const DisasterModeBanner: React.FC = () => {
  const { isDisasterMode, queueSize, isOnline } = useApp();
  const { isForcedOffline, simulateOfflineToggle } = useAuth();

  return (
    <div className="w-full flex flex-col select-none">
      {/* Simulation Dashboard Controls Bar */}
      <div className="bg-slate-100 border-b border-slate-200 px-4 py-1.5 flex items-center justify-between text-xs font-mono text-slate-600">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-tactical-green shadow-[0_0_6px_#10B981]' : 'bg-tactical-red shadow-[0_0_6px_#EF4444]'}`} />
            <span>LINK STATE: <span className={isOnline ? 'text-emerald-600 font-bold' : 'text-tactical-red font-bold'}>{isOnline ? 'CONNECTED' : 'DISCONNECT'}</span></span>
          </div>
          <div>
            OUTBOUND QUEUE: <span className="text-sky-700 font-bold">{queueSize} ITEMS</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span>BLACKOUT CONTROL:</span>
          <button
            onClick={() => simulateOfflineToggle(!isForcedOffline)}
            className={`px-2 py-0.5 border text-[10px] rounded-sm transition-all duration-150 uppercase font-bold flex items-center gap-1 cursor-pointer ${
              isForcedOffline 
                ? 'bg-tactical-red border-tactical-red text-white hover:bg-tactical-red/90' 
                : 'bg-white border-slate-200 hover:border-slate-400 text-slate-700'
            }`}
          >
            {isForcedOffline ? <SignalZero className="w-3 h-3" /> : <SignalHigh className="w-3 h-3" />}
            {isForcedOffline ? 'FORCE OFFLINE' : 'GO OFFLINE'}
          </button>
        </div>
      </div>

      {/* Flashing Light Disaster Banner */}
      {isDisasterMode && (
        <div className="w-full bg-tactical-red/5 border-b border-tactical-red/25 px-4 py-2 text-center flex items-center justify-center gap-2.5 shadow-[0_2px_8px_rgba(239,68,68,0.05)]">
          <ShieldAlert className="w-4 h-4 text-tactical-red animate-pulse" />
          <span className="font-mono text-xs uppercase tracking-wider text-tactical-red font-extrabold animate-led-blink">
            DISASTER MODE ACTIVE • WAN & CLOUD CHANNELS UNREACHABLE • EMERGENCY LOCAL MESH MESHNET ACTIVE
          </span>
        </div>
      )}
    </div>
  );
};
