'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { Shield, Key, RefreshCw, Smartphone, RadioTower, CheckCircle2, Lock, Settings } from 'lucide-react';
import { TacticalButton } from '../../components/ui/TacticalButton';

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, user, isLoading } = useAuth();
  
  const [badgeNumber, setBadgeNumber] = useState<string>('');
  const [pin, setPin] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [activeField, setActiveField] = useState<'badge' | 'pin'>('badge');
  const [isNfcScanning, setIsNfcScanning] = useState<boolean>(false);
  const [scanSuccess, setScanSuccess] = useState<boolean>(false);
  
  // Server IP custom overrides
  const [showServerIpConfig, setShowServerIpConfig] = useState<boolean>(false);
  const [customIp, setCustomIp] = useState<string>('');
  const [ipSavedMessage, setIpSavedMessage] = useState<string>('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setCustomIp(localStorage.getItem('tactical_server_ip') || '');
    }
  }, []);

  const saveServerIp = () => {
    if (typeof window !== 'undefined') {
      const cleanIp = customIp.trim();
      if (cleanIp) {
        localStorage.setItem('tactical_server_ip', cleanIp);
        setIpSavedMessage('✓ Server IP saved! Reloading...');
      } else {
        localStorage.removeItem('tactical_server_ip');
        setIpSavedMessage('✓ Reset to Default! Reloading...');
      }
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }
  };

  // Redirect if already logged in
  useEffect(() => {
    if (isAuthenticated && user) {
      if (user.role === 'dispatcher') {
        router.replace('/command');
      } else {
        router.replace('/officer');
      }
    }
  }, [isAuthenticated, user, router]);

  const handleKeypadPress = (val: string) => {
    setError(null);
    if (activeField === 'badge') {
      if (val === 'C') {
        setBadgeNumber('');
      } else if (val === 'E') {
        setActiveField('pin');
      } else {
        if (badgeNumber.length < 10) {
          setBadgeNumber(prev => prev + val);
        }
      }
    } else {
      if (val === 'C') {
        setPin('');
      } else if (val === 'E') {
        handleFormSubmit();
      } else {
        if (pin.length < 4) {
          setPin(prev => prev + val);
        }
      }
    }
  };

  const handleFormSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    if (!badgeNumber) {
      setError('Badge Number is required.');
      return;
    }
    if (!pin || pin.length < 4) {
      setError('A secure passcode of at least 4 characters is required.');
      return;
    }

    try {
      const loggedInUser = await login(badgeNumber, pin);
      if (loggedInUser.role === 'dispatcher') {
        router.push('/command');
      } else {
        router.push('/officer');
      }
    } catch (err: any) {
      setError(err.message || 'Invalid Badge credentials or Passcode.');
    }
  };

  const triggerNfcSimulation = () => {
    setError(null);
    setIsNfcScanning(true);
    setScanSuccess(false);
    
    // Simulate badge swipe scan after 1.5 seconds
    setTimeout(async () => {
      setScanSuccess(true);
      setTimeout(async () => {
        try {
          setBadgeNumber('p1');
          setPin('police');
          const loggedInUser = await login('p1', 'police');
          if (loggedInUser.role === 'dispatcher') {
            router.push('/command');
          } else {
            router.push('/officer');
          }
        } catch (err: any) {
          setError('NFC Badge authentication failed.');
          setIsNfcScanning(false);
          setScanSuccess(false);
        }
      }, 800);
    }, 1500);
  };

  const loadPreset = (presetBadge: string, presetPin: string) => {
    setError(null);
    setBadgeNumber(presetBadge);
    setPin(presetPin);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 bg-gradient-to-br from-slate-50 via-sky-50/30 to-slate-100 relative min-h-screen font-sans text-slate-800">
      {/* Dynamic India Tricolor Accent Line at the very top */}
      <div className="absolute top-0 left-0 right-0 h-1.5 flex z-20">
        <div className="flex-1 bg-[#FF9933] shadow-[0_0_12px_rgba(255,153,51,0.4)]" />
        <div className="flex-1 bg-white shadow-[0_0_12px_rgba(255,255,255,0.4)]" />
        <div className="flex-1 bg-[#138808] shadow-[0_0_12px_rgba(19,136,8,0.4)]" />
      </div>

      {/* Tactical grid background mesh */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.04] bg-[radial-gradient(circle_at_center,#94a3b8_1.5px,transparent_1.5px)] bg-[size:32px_32px]" />
      
      {/* Modern ambient glow spots */}
      <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-sky-500/5 rounded-full blur-[100px] pointer-events-none animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-indigo-500/5 rounded-full blur-[120px] pointer-events-none animate-pulse" />

      {/* Main glassmorphic login card */}
      <div className="w-full max-w-[430px] bg-white/80 border border-slate-200 rounded-3xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.1)] p-8 z-10 backdrop-blur-xl transition-all duration-300">
        
        {/* AP Police Logo & Branding Header */}
        <div className="flex flex-col items-center text-center mb-7">
          <div className="bg-white p-2.5 rounded-2xl border-2 border-amber-500/30 shadow-[0_8px_25px_rgba(245,158,11,0.1)] mb-4 relative group">
            <span className="absolute -inset-0.5 rounded-2xl bg-gradient-to-tr from-amber-500/15 to-sky-500/15 blur opacity-60 group-hover:opacity-100 transition duration-1000" />
            <img 
              src="/ap-police-logo.png" 
              className="w-18 h-18 object-contain relative z-10 animate-fadeIn" 
              alt="Andhra Pradesh Police Logo" 
            />
          </div>
          
          <h1 className="text-lg font-black text-slate-800 tracking-tight leading-none uppercase font-sans">
            HERO – Hybrid Emergency Response & Operations
          </h1>
          <span className="text-[10px] text-slate-500 font-extrabold mt-1.5 block uppercase tracking-widest leading-none">
            ఆంధ్రప్రదేశ్ రాష్ట్ర పోలీస్ / AP State Police Portal
          </span>
          
          <div className="mt-3.5 flex items-center gap-1.5 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-full text-[9px] font-mono font-bold text-slate-500 shadow-inner">
            <RadioTower className="w-3.5 h-3.5 text-sky-500 animate-pulse" />
            <span>SECURE OFFLINE MESHNET LINK</span>
          </div>
        </div>

        <form onSubmit={handleFormSubmit} className="space-y-4">
          
          {/* Inputs Section */}
          <div className="space-y-3">
            <div className="p-3.5 border border-slate-200 bg-slate-50 rounded-2xl focus-within:border-sky-500 focus-within:bg-sky-50 focus-within:shadow-[0_0_15px_rgba(14,165,233,0.1)] transition-all duration-200">
              <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1.5">
                Badge / User ID Code
              </label>
              <div className="flex items-center gap-3">
                <Shield className="w-4 h-4 text-slate-400 focus-within:text-sky-600" />
                <input
                  type="text"
                  placeholder="e.g. p1"
                  value={badgeNumber}
                  onChange={(e) => setBadgeNumber(e.target.value)}
                  className="w-full bg-transparent border-none outline-none text-base font-black font-mono text-slate-800 placeholder-slate-400 tracking-wider"
                  required
                />
              </div>
            </div>

            <div className="p-3.5 border border-slate-200 bg-slate-50 rounded-2xl focus-within:border-sky-500 focus-within:bg-sky-50 focus-within:shadow-[0_0_15px_rgba(14,165,233,0.1)] transition-all duration-200">
              <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1.5">
                Secure Passcode PIN
              </label>
              <div className="flex items-center gap-3">
                <Key className="w-4 h-4 text-slate-400 focus-within:text-sky-600" />
                <input
                  type="password"
                  placeholder="e.g. police"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  className="w-full bg-transparent border-none outline-none text-base font-black font-mono text-slate-800 placeholder-slate-400 tracking-wider"
                  required
                />
              </div>
            </div>
          </div>

          {/* Error message card */}
          {error && (
            <div className="p-3 border border-red-200 bg-red-50 text-red-600 font-sans text-xs text-center rounded-2xl font-bold flex items-center justify-center gap-2 animate-shake">
              <Lock className="w-4 h-4 flex-shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          {/* Submissions Section */}
          <div className="flex flex-col gap-2.5 pt-3 border-t border-slate-200">
            <TacticalButton
              type="submit"
              variant="primary"
              glow
              className="w-full text-xs py-3 rounded-2xl shadow-lg bg-gradient-to-r from-sky-600 to-sky-700 hover:from-sky-550 hover:to-sky-650 text-white font-extrabold uppercase tracking-wider cursor-pointer"
              disabled={isLoading || isNfcScanning}
            >
              {isLoading ? (
                <div className="flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  <span>DECRYPTING AUTHORIZATION...</span>
                </div>
              ) : (
                'SECURE LOG IN'
              )}
            </TacticalButton>

            <button
              type="button"
              onClick={triggerNfcSimulation}
              className="w-full text-[11px] font-extrabold text-slate-500 hover:text-slate-700 py-2.5 border border-slate-200 hover:border-slate-300 bg-slate-50 active:scale-98 transition rounded-2xl flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              disabled={isLoading || isNfcScanning}
            >
              <Smartphone className={`w-3.5 h-3.5 ${isNfcScanning ? 'text-sky-400 animate-bounce' : 'text-slate-500'}`} />
              <span>{isNfcScanning ? 'SCANNING CONTACTLESS BADGE...' : 'SIMULATE BADGE SCAN'}</span>
            </button>
          </div>

          {/* Preset Bypass Presets */}
          <div className="pt-4 border-t border-slate-200 flex flex-col gap-2">
            <span className="text-[9px] text-slate-400 font-black uppercase tracking-wider text-center">
              SYSTEM BYPASS PRESETS
            </span>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => loadPreset('admin', 'police')}
                className="flex-1 font-sans text-[9px] py-2 border border-slate-200 hover:border-sky-300 bg-slate-50 hover:bg-sky-50 text-slate-500 hover:text-sky-600 rounded-xl font-bold transition cursor-pointer text-center shadow-sm"
              >
                COMMAND CENTER (admin)
              </button>
              <button
                type="button"
                onClick={() => loadPreset('p1', 'police')}
                className="flex-1 font-sans text-[9px] py-2 border border-slate-200 hover:border-emerald-300 bg-slate-50 hover:bg-emerald-50 text-slate-500 hover:text-emerald-600 rounded-xl font-bold transition cursor-pointer text-center shadow-sm"
              >
                POLICE OFFICER (p1)
              </button>
            </div>
          </div>

          {/* Server Connection settings section */}
          <div className="pt-3 border-t border-slate-250 flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => setShowServerIpConfig(!showServerIpConfig)}
              className="text-[9px] text-slate-400 font-extrabold hover:text-slate-650 flex items-center justify-center gap-1 uppercase tracking-wider cursor-pointer py-1"
            >
              <Settings className="w-3 h-3 text-slate-400 animate-pulse" />
              <span>{showServerIpConfig ? 'Hide Connection Settings' : 'Connection Settings'}</span>
            </button>
            
            {showServerIpConfig && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 text-left">
                <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest block">
                  Tactical Server IP Address
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. 192.168.0.103"
                    value={customIp}
                    onChange={(e) => setCustomIp(e.target.value)}
                    className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-700 focus:outline-none focus:border-sky-500"
                  />
                  <button
                    type="button"
                    onClick={saveServerIp}
                    className="px-3 py-2 bg-sky-600 text-white text-[10px] font-black uppercase rounded-xl hover:bg-sky-700 active:scale-95 cursor-pointer transition-all"
                  >
                    Save
                  </button>
                </div>
                {ipSavedMessage && (
                  <span className="text-[8px] font-bold text-emerald-600 uppercase block tracking-wider">
                    {ipSavedMessage}
                  </span>
                )}
                <span className="text-[8px] text-slate-400 font-bold block leading-relaxed">
                  Default (Auto): {typeof window !== 'undefined' ? window.location.hostname : 'localhost'}
                </span>

                <div className="text-[9px] text-slate-500 leading-relaxed bg-amber-50/50 border border-amber-200 p-2.5 rounded-xl mt-2 font-sans space-y-1">
                  <span className="font-extrabold text-amber-700 uppercase block tracking-wide">💡 Local Network Connection Guide:</span>
                  <p>1. Ensure both phone and laptop are on the <b>same Wi-Fi</b> (e.g. Jio router).</p>
                  <p>2. Disable <b>Mobile Data / Cellular</b> on your phone so it routes locally.</p>
                  <p>3. If Android warns "No internet", select <b>"Keep Connected"</b>.</p>
                </div>
              </div>
            )}
          </div>

        </form>
      </div>

      {/* NFC Scan Simulation overlay */}
      {isNfcScanning && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur-md z-30 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-[340px] text-center shadow-2xl flex flex-col items-center gap-4 animate-scaleUp">
            {scanSuccess ? (
              <div className="bg-emerald-50 text-emerald-600 p-4 rounded-full border border-emerald-200 animate-bounce">
                <CheckCircle2 className="w-10 h-10" />
              </div>
            ) : (
              <div className="bg-sky-50 text-sky-600 p-4 rounded-full border border-sky-200 relative">
                <Smartphone className="w-10 h-10 animate-pulse" />
                <span className="absolute -inset-1.5 border border-sky-400/40 rounded-full animate-ping" />
              </div>
            )}
            <div>
              <h3 className="font-extrabold text-sm text-slate-800 uppercase tracking-wide">
                {scanSuccess ? 'Decryption Success' : 'Badge Scanning'}
              </h3>
              <p className="text-[11px] text-slate-500 leading-relaxed mt-1">
                {scanSuccess ? 'Badge key verified. Redirecting...' : 'Hold your police smart card against the screen reader...'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
