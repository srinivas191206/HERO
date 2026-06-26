import React from 'react';

interface TacticalButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'warning' | 'success';
  size?: 'sm' | 'md' | 'lg';
  glow?: boolean;
  children: React.ReactNode;
}

export const TacticalButton: React.FC<TacticalButtonProps> = ({
  variant = 'primary',
  size = 'md',
  glow = false,
  children,
  className = '',
  disabled,
  onClick,
  ...props
}) => {
  const getVariantStyles = () => {
    if (disabled) {
      return 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed';
    }

    switch (variant) {
      case 'secondary':
        return 'bg-white hover:bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-700 hover:text-slate-900';
      
      case 'danger':
        return `bg-tactical-red border-tactical-red text-white hover:bg-tactical-red/90 ${
          glow ? 'shadow-[0_4px_12px_rgba(239,68,68,0.25)]' : ''
        }`;

      case 'warning':
        return `bg-tactical-amber border-tactical-amber text-slate-950 hover:bg-tactical-amber/90 ${
          glow ? 'shadow-[0_4px_12px_rgba(245,158,11,0.25)]' : ''
        }`;

      case 'success':
        return `bg-tactical-green border-tactical-green text-white hover:bg-tactical-green/90 ${
          glow ? 'shadow-[0_4px_12px_rgba(16,185,129,0.25)]' : ''
        }`;

      case 'primary':
      default:
        return `bg-tactical-cyan border-tactical-cyan text-white hover:bg-tactical-cyan/90 ${
          glow ? 'shadow-[0_4px_12px_rgba(2,132,199,0.25)]' : ''
        }`;
    }
  };

  const getSizeStyles = () => {
    switch (size) {
      case 'sm': return 'px-2.5 py-1 text-xs';
      case 'lg': return 'px-6 py-3 text-base';
      case 'md':
      default:
        return 'px-4 py-2 text-sm';
    }
  };

  const handleBtnClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    
    // Play sound click chirps
    if (typeof window !== 'undefined' && window.AudioContext) {
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(variant === 'danger' ? 440 : 880, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.1);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
      } catch (err) {}
    }

    if (onClick) onClick(e);
  };

  return (
    <button
      className={`border font-sans uppercase tracking-wider rounded-xl transition-all duration-200 outline-none flex items-center justify-center gap-2.5 font-bold cursor-pointer hover:-translate-y-[1px] active:translate-y-0 active:scale-98 shadow-sm ${getVariantStyles()} ${getSizeStyles()} ${className}`}
      onClick={handleBtnClick}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
};
