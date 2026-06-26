'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { HUDPanel } from '../../components/ui/HUDPanel';
import { TacticalButton } from '../../components/ui/TacticalButton';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { DisasterModeBanner } from '../../components/shared/DisasterModeBanner';
import { TacticalMap } from '../../components/shared/TacticalMap';
import { clientEventBus } from '../../services/events/EventBus';
import { 
  ShieldAlert, Activity, Users, Radio, MessageSquare, Database, 
  Map as MapIcon, Key, FileText, Settings, LogOut, RadioTower, 
  AlertTriangle, Navigation, Clock, ShieldCheck, HelpCircle, UserCheck, RefreshCw,
  Send, CheckCheck, BellOff, Camera
} from 'lucide-react';
import { User, Incident, AuditLog, Message } from '../../types';
import { clientCommunicationEngine } from '../../services/communication/CommunicationEngine';

interface TelemetryMetrics {
  total: number;
  online: number;
  offline: number;
  sos: number;
  incidents: number;
}

interface BackupRecommendation {
  officer: Omit<User, 'pinHash'>;
  distanceKm: number;
  estimatedResponseTimeMins: number;
  reason: string;
}

export default function CommandCenterDashboard() {
  const router = useRouter();
  const { user, logout, token, isAuthenticated, isLoading } = useAuth();
  const { isOnline, activeAlerts, clearAlerts } = useApp();

  const [activeTab, setActiveTab] = useState<string>('command');
  const [officers, setOfficers] = useState<User[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [evidenceLogs, setEvidenceLogs] = useState<any[]>([]);
  const [chatMessage, setChatMessage] = useState<string>('');
  const [metrics, setMetrics] = useState<TelemetryMetrics>({
    total: 0,
    online: 0,
    offline: 0,
    sos: 0,
    incidents: 0
  });

  // Selected incident & backup recommendation states
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [recommendations, setRecommendations] = useState<BackupRecommendation[]>([]);
  const [loadingRecommendations, setLoadingRecommendations] = useState<boolean>(false);
  const [dispatchSuccess, setDispatchSuccess] = useState<string | null>(null);
  const alarmAudioCtxRef = React.useRef<AudioContext | null>(null);
  const alarmOscRef = React.useRef<OscillatorNode | null>(null);
  const [isAlarmRinging, setIsAlarmRinging] = useState<boolean>(false);
  const alarmManuallyMutedRef = React.useRef<boolean>(false);

  const [broadcastText, setBroadcastText] = useState<string>('');

  // PTT State
  const [isPttActive, setIsPttActive] = useState<boolean>(false);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const audioChunksRef = React.useRef<Blob[]>([]);
  const isRecordingRequestedRef = React.useRef<boolean>(false);
  const pttStreamRef = React.useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        router.replace('/login');
      } else if (user?.role !== 'dispatcher') {
        router.replace('/officer');
      }
    }
  }, [isAuthenticated, user, isLoading, router]);

  const getBackendUrl = () => {
    if (typeof window !== 'undefined') {
      const savedIp = localStorage.getItem('tactical_server_ip');
      if (savedIp) {
        return `http://${savedIp}:5001`;
      }
      return `http://${window.location.hostname}:5001`;
    }
    return 'http://localhost:5001';
  };

  const playLoopingSiren = () => {
    if (typeof window === 'undefined') return;
    if (alarmAudioCtxRef.current) return;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      const audioCtx = new AudioCtx();
      alarmAudioCtxRef.current = audioCtx;

      const osc = audioCtx.createOscillator();
      const lfo = audioCtx.createOscillator();
      const lfoGain = audioCtx.createGain();
      const mainGain = audioCtx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.value = 650; // Base siren frequency

      lfo.frequency.value = 1.5; // Modulation speed wail cycle
      lfoGain.gain.value = 180; // Modulate frequency by +/- 180Hz

      mainGain.gain.value = 0.05; // Soft volume

      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      
      osc.connect(mainGain);
      mainGain.connect(audioCtx.destination);

      lfo.start();
      osc.start();

      alarmOscRef.current = osc;
      setIsAlarmRinging(true);
    } catch (err) {
      console.error('Failed to start looping siren:', err);
    }
  };

  const stopSiren = () => {
    try {
      if (alarmAudioCtxRef.current) {
        alarmAudioCtxRef.current.close();
        alarmAudioCtxRef.current = null;
      }
      alarmOscRef.current = null;
    } catch (_) {}
    setIsAlarmRinging(false);
  };

  const muteAlarm = () => {
    stopSiren();
    alarmManuallyMutedRef.current = true;
  };

  const handleResolveSOS = async (officerId: string) => {
    if (!token) return;
    try {
      const res = await fetch(`${getBackendUrl()}/api/officers/${officerId}/resolve-sos`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      if (res.ok) {
        fetchOperationsData();
      }
    } catch (err) {
      console.error('Failed to resolve SOS:', err);
    }
  };

  useEffect(() => {
    return () => {
      // Clean up siren on unmount
      try {
        if (alarmAudioCtxRef.current) {
          alarmAudioCtxRef.current.close();
        }
      } catch (_) {}
      // Clean up microphone stream
      if (pttStreamRef.current) {
        try {
          pttStreamRef.current.getTracks().forEach(track => track.stop());
        } catch (_) {}
      }
    };
  }, []);

  // Request Microphone Stream when entering Messages Tab (for PTT)
  useEffect(() => {
    if (activeTab === 'messages') {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ audio: true })
          .then(stream => {
            pttStreamRef.current = stream;
            console.log('[PTT] Command Center microphone stream warm and active.');
          })
          .catch(err => {
            console.warn('PTT microphone access blocked or failed:', err);
          });
      }
    } else {
      if (pttStreamRef.current) {
        try {
          pttStreamRef.current.getTracks().forEach(track => track.stop());
        } catch (_) {}
        pttStreamRef.current = null;
      }
    }
  }, [activeTab]);

  const fetchOperationsData = async () => {
    if (!token) return;
    try {
      const offResponse = await fetch(`${getBackendUrl()}/api/officers`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (offResponse.ok) {
        const data = await offResponse.json();
        setOfficers(data);
        
        const total = data.length;
        const online = data.filter((o: any) => o.status !== 'Offline').length;
        const offline = data.filter((o: any) => o.status === 'Offline').length;
        const sos = data.filter((o: any) => o.status === 'Emergency').length;
        
        setMetrics(prev => ({
          ...prev,
          total,
          online,
          offline,
          sos
        }));

        if (sos > 0) {
          if (!alarmManuallyMutedRef.current) {
            playLoopingSiren();
          }
        } else {
          stopSiren();
          alarmManuallyMutedRef.current = false;
        }
      }

      const incResponse = await fetch(`${getBackendUrl()}/api/incidents`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (incResponse.ok) {
        const data = await incResponse.json();
        setIncidents(data);
        setMetrics(prev => ({ ...prev, incidents: data.length }));

        // Update selected incident reference if it changed
        if (selectedIncident) {
          const fresh = data.find((i: Incident) => i.id === selectedIncident.id);
          if (fresh) setSelectedIncident(fresh);
        }
      }

      const auditResponse = await fetch(`${getBackendUrl()}/api/audit-logs`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (auditResponse.ok) {
        const data = await auditResponse.json();
        setAuditLogs(data);
      }

      const msgResponse = await fetch(`${getBackendUrl()}/api/messages`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (msgResponse.ok) {
        const data = await msgResponse.json();
        setChatMessages(data);
      }

      const evResponse = await fetch(`${getBackendUrl()}/api/evidence`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (evResponse.ok) {
        const data = await evResponse.json();
        setEvidenceLogs(data);
      }

    } catch (err) {
      console.error('Failed to sync dispatcher telemetry feeds:', err);
    }
  };

  // Poll database parameters
  useEffect(() => {
    if (!token) return;
    fetchOperationsData();
    const interval = setInterval(fetchOperationsData, 8000);
    return () => clearInterval(interval);
  }, [token, selectedIncident]);

  // Subscribe to real-time events on the mesh Event Bus
  useEffect(() => {
    const handleStatusChange = () => {
      fetchOperationsData();
    };

    const handleTelemetry = () => {
      fetchOperationsData();
    };

    const handleSos = () => {
      alarmManuallyMutedRef.current = false;
      fetchOperationsData();
      playLoopingSiren();
    };

    const handleMessageReceived = (msg: Message) => {
      setChatMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    };

    const handleEvidenceReceived = (ev: any) => {
      setEvidenceLogs(prev => {
        if (prev.some(e => e.id === ev.id)) return prev;
        const officer = officers.find(o => o.id === ev.officerId);
        const evWithOfficerName = {
          ...ev,
          officerName: officer ? officer.name : `Officer ID: ${ev.officerId}`
        };
        return [evWithOfficerName, ...prev];
      });
    };

    const handleVoiceStream = (data: any) => {
      if (user && data.senderId === user.id) return;
      
      // Play incoming chirp sound
      if (typeof window !== 'undefined' && window.AudioContext) {
        try {
          const audioCtx = new AudioContext();
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.frequency.setValueAtTime(600, audioCtx.currentTime);
          gain.gain.setValueAtTime(0.01, audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.08);
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start();
          osc.stop(audioCtx.currentTime + 0.08);
        } catch (_) {}
      }

      if (data.audioData.startsWith('MOCK_SPEECH:')) {
        const text = data.audioData.replace('MOCK_SPEECH:', '');
        if (typeof window !== 'undefined' && window.speechSynthesis) {
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.rate = 0.95;
          window.speechSynthesis.speak(utterance);
        }
      } else {
        const audio = new Audio(data.audioData);
        audio.play().catch(e => console.log('Audio playback failed:', e));
      }
    };

    const unsubStatus = clientEventBus.subscribe('officer:status_change', handleStatusChange);
    const unsubTelemetry = clientEventBus.subscribe('officer:telemetry', handleTelemetry);
    const unsubSos = clientEventBus.subscribe('sos:received', handleSos);
    const unsubMsg = clientEventBus.subscribe('message:received', handleMessageReceived);
    const unsubVoice = clientEventBus.subscribe('voice:stream_received', handleVoiceStream);
    const unsubEvidence = clientEventBus.subscribe('evidence:received', handleEvidenceReceived);

    return () => {
      unsubStatus();
      unsubTelemetry();
      unsubSos();
      unsubMsg();
      unsubVoice();
      unsubEvidence();
    };
  }, [officers]);

  // Fetch recommendations when incident is selected
  useEffect(() => {
    const fetchRecommendations = async () => {
      if (!selectedIncident || !token) {
        setRecommendations([]);
        return;
      }
      setLoadingRecommendations(true);
      try {
        const res = await fetch(`${getBackendUrl()}/api/incidents/${selectedIncident.id}/recommendations`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          // The endpoint returns details of recommendations, map if needed
          setRecommendations(data.recommendedOfficers || data);
        }
      } catch (err) {
        console.error('Failed to query recommendations:', err);
      } finally {
        setLoadingRecommendations(false);
      }
    };

    fetchRecommendations();
  }, [selectedIncident, token]);

  if (isLoading || !user || user.role !== 'dispatcher') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 font-sans text-xs uppercase tracking-widest text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin text-sky-600 mb-2" />
        <span>Authorizing Command Node Configs...</span>
      </div>
    );
  }

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const handleSelectIncidentId = (id: string | null) => {
    if (!id) {
      setSelectedIncident(null);
      return;
    }
    const inc = incidents.find(i => i.id === id);
    if (inc) setSelectedIncident(inc);
  };

  const handleDispatch = async (officerId: string, incidentId: string) => {
    if (!token) return;
    setDispatchSuccess(null);
    try {
      const res = await fetch(`${getBackendUrl()}/api/incidents/${incidentId}/dispatch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ assigneeId: officerId })
      });
      if (res.ok) {
        setDispatchSuccess(`Officer dispatched successfully.`);
        fetchOperationsData();
        setTimeout(() => setDispatchSuccess(null), 3000);
      } else {
        alert('Failed to dispatch officer.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleBroadcast = async () => {
    if (!chatMessage.trim()) return;
    try {
      const sent = await clientCommunicationEngine.sendMessage({
        senderId: user.id,
        recipientId: null,
        teamId: null,
        body: chatMessage,
        isBroadcast: true
      });
      setChatMessages(prev => [...prev, sent]);
      setChatMessage('');
    } catch (err) {
      console.error('Failed to dispatch broadcast message:', err);
    }
  };

  const handleForwardEvidence = async (ev: any) => {
    if (!user) return;
    try {
      await clientCommunicationEngine.sendMessage({
        senderId: user.id,
        recipientId: null,
        teamId: null,
        body: `HQ EVIDENCE FORWARD: ${ev.description} [HASH: ${ev.hash}]`,
        isBroadcast: true
      });
      setDispatchSuccess("Evidence forwarded to all units successfully.");
      setTimeout(() => setDispatchSuccess(null), 3000);
    } catch (err) {
      console.error("Failed to forward evidence:", err);
    }
  };

  // PTT Radio chirps & recording for HQ
  const handlePttStart = async () => {
    if (!user) return;
    setIsPttActive(true);
    isRecordingRequestedRef.current = true;
    if (typeof window !== "undefined" && window.AudioContext) {
      try {
        const audioCtx = new AudioContext();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.frequency.setValueAtTime(750, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.012, audioCtx.currentTime);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.04);
      } catch (_) {}
    }

    audioChunksRef.current = [];
    if (pttStreamRef.current) {
      try {
        const mediaRecorder = new MediaRecorder(pttStreamRef.current);
        mediaRecorderRef.current = mediaRecorder;
        
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onstop = () => {
          if (audioChunksRef.current.length > 0) {
            const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
            const reader = new FileReader();
            reader.readAsDataURL(audioBlob);
            reader.onloadend = () => {
              const base64Audio = reader.result as string;
              clientCommunicationEngine.sendVoiceChunk(user.id, base64Audio);
            };
          }
        };

        mediaRecorder.start();
      } catch (err) {
        console.warn("Failed to start MediaRecorder on pre-warmed stream:", err);
        mediaRecorderRef.current = null;
      }
    }
  };

  const handlePttEnd = () => {
    if (!user) return;
    setIsPttActive(false);
    isRecordingRequestedRef.current = false;
    if (typeof window !== "undefined" && window.AudioContext) {
      try {
        const audioCtx = new AudioContext();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.frequency.setValueAtTime(300, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.008, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.06);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.06);
      } catch (_) {}
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    } else {
      const synthText = `Command Headquarters transmitting on TACTICAL GLOBAL`;
      clientCommunicationEngine.sendVoiceChunk(user.id, `MOCK_SPEECH:${synthText}`);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-gradient-to-br from-slate-50 via-white to-sky-50/20 min-h-screen text-slate-800 font-sans relative">
      {/* Tricolor Government Flag Banner accent line at the top */}
      <div className="absolute top-0 left-0 right-0 h-1.5 flex z-30">
        <div className="flex-1 bg-[#FF9933]" />
        <div className="flex-1 bg-white" />
        <div className="flex-1 bg-[#138808]" />
      </div>
      
      {/* Warnings banner */}
      <DisasterModeBanner />

      {/* SECURE HEADER GAUGE */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-md px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm z-10 pt-5">
        <div className="flex items-center gap-3">
          <div className="bg-white p-1.5 rounded-xl border border-amber-200 shadow-[0_4px_12px_rgba(245,158,11,0.08)] flex-shrink-0">
            <img src="/ap-police-logo.png" className="w-9 h-9 object-contain" alt="AP Police Logo" />
          </div>
          <div>
            <h1 className="text-base uppercase font-black tracking-tight text-slate-800 flex items-center gap-2">
              Kurnool Command Center
              <span className="text-[9px] px-2 py-0.5 border border-sky-200 bg-sky-50 text-sky-600 font-bold uppercase tracking-wider rounded-full">
                HQ-CONTROL DECK
              </span>
            </h1>
            <p className="text-[10px] font-mono text-slate-500 leading-none mt-1.5 font-bold">
              OPERATOR: {user.name} ({user.badgeNumber}) • LINK: {isOnline ? 'WAN SECURE LINK' : 'LOCAL MESH ACTIVE'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-end sm:self-auto">
          {isAlarmRinging && (
            <button
              onClick={muteAlarm}
              className="px-3.5 py-1.5 text-[10px] font-extrabold border border-red-300 bg-red-500 hover:bg-red-600 text-white rounded-xl flex items-center gap-1.5 cursor-pointer shadow-lg shadow-red-200/60 animate-bounce transition-all duration-200"
            >
              <BellOff className="w-3.5 h-3.5" />
              MUTE ALARM
            </button>
          )}

          {activeAlerts.length > 0 && (
            <button
              onClick={() => {
                clearAlerts();
                muteAlarm();
              }}
              className="px-3.5 py-1.5 text-[10px] font-extrabold border border-red-200 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl flex items-center gap-1.5 animate-pulse cursor-pointer shadow-md transition-all duration-200"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
              DISMISS ({activeAlerts.length}) SOS ALERTS
            </button>
          )}
          
          <button 
            onClick={handleLogout}
            className="p-2 border border-slate-200 bg-white hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-xl transition cursor-pointer shadow-sm"
            title="Disconnect dispatcher terminal"
          >
            <LogOut className="w-4.5 h-4.5" />
          </button>
        </div>
      </header>

      {/* Dashboard Metrics Bar */}
      <section className="bg-white/60 border-b border-slate-200 px-6 py-4 grid grid-cols-2 sm:grid-cols-5 gap-4">
        {[
          { label: 'TOTAL FORCE', value: metrics.total, color: 'text-slate-800', desc: 'Registered Personnel' },
          { label: 'ACTIVE ONLINE', value: metrics.online, color: 'text-emerald-600', desc: 'Pings active' },
          { label: 'OFFLINE NODES', value: metrics.offline, color: 'text-slate-400', desc: 'Out of reach' },
          { label: 'SOS EMERGENCIES', value: metrics.sos, color: metrics.sos > 0 ? 'text-red-600 animate-pulse' : 'text-slate-400', desc: 'P1 calls active' },
          { label: 'ACTIVE INCIDENTS', value: metrics.incidents, color: 'text-amber-600', desc: 'Assigned / Open' }
        ].map((met, i) => (
          <div key={i} className="border border-slate-200 bg-white p-4 rounded-2xl flex flex-col justify-between shadow-sm hover:border-slate-300 hover:shadow-md transition duration-200">
            <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wider">{met.label}</span>
            <span className={`text-2xl font-black mt-1 ${met.color}`}>{met.value}</span>
            <span className="text-[9px] text-slate-500 mt-1.5 font-bold leading-none truncate">{met.desc}</span>
          </div>
        ))}
      </section>

      {/* Main Workspace */}
      <section className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        
        {/* Left Side Navigation Sidebar */}
        <aside className="w-full lg:w-64 border-b lg:border-b-0 lg:border-r border-slate-200 bg-white/60 flex flex-col justify-between p-4 shadow-sm z-10">
          <div className="space-y-1">
            <span className="text-[9px] text-slate-400 uppercase tracking-widest px-3 mb-2.5 block font-black">
              HQ TERMINAL CHANNELS
            </span>
            {[
              { id: 'command', label: 'Tactical HUD', icon: Activity },
              { id: 'map', label: 'Command Radar Map', icon: MapIcon },
              { id: 'officers', label: 'Personnel deployed', icon: Users },
              { id: 'incidents', label: 'Incident desk', icon: ShieldAlert },
              { id: 'messages', label: 'Group Chat Sync', icon: MessageSquare },
              { id: 'evidence', label: 'Evidence logs', icon: Camera },
              { id: 'audit', label: 'Security audit logs', icon: FileText }
            ].map(item => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setSelectedIncident(null);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider text-left transition cursor-pointer ${
                    activeTab === item.id 
                      ? 'bg-sky-50 text-sky-700 border-l-4 border-sky-500 shadow-[inset_0_0_12px_rgba(14,165,233,0.05)]' 
                      : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="hidden lg:block border-t border-slate-200 pt-4 space-y-2 text-[10px] font-bold text-slate-400">
            <div className="flex justify-between items-center">
              <span>SQLITE DB STATUS:</span>
              <span className="text-emerald-500 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_#10B981] animate-pulse" />
                ONLINE
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span>MESH NET CHANNELS:</span>
              <span className="text-sky-500">5 ACTIVE CHANNELS</span>
            </div>
          </div>
        </aside>

        {/* Center operational desk */}
        <main className="flex-1 p-4 md:p-6 overflow-y-auto space-y-6 bg-slate-50/50">
          
          {/* Active Alarms Drawers */}
          {activeAlerts.length > 0 && (
            <div className="border border-red-200 bg-red-50/60 p-4 rounded-2xl space-y-2.5 shadow-md relative overflow-hidden backdrop-blur-md">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs font-extrabold text-red-600 border-b border-red-200 pb-2">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-red-550 animate-bounce" />
                  <span>CRITICAL STATE EMERGENCY SOS ACTIVE</span>
                </div>
                
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  {isAlarmRinging && (
                    <button
                      onClick={muteAlarm}
                      className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl text-[10px] uppercase tracking-wider transition shadow cursor-pointer flex items-center gap-1 active:scale-95 z-10"
                    >
                      <BellOff className="w-3.5 h-3.5" />
                      Mute Siren
                    </button>
                  )}
                  <button
                    onClick={() => {
                      clearAlerts();
                      muteAlarm();
                    }}
                    className="px-3 py-1.5 bg-slate-100 border border-slate-200 hover:bg-slate-200 text-red-600 font-bold rounded-xl text-[10px] uppercase tracking-wider transition shadow cursor-pointer flex items-center gap-1 active:scale-95 z-10"
                  >
                    Dismiss Alerts
                  </button>
                </div>
              </div>
              <div className="space-y-1.5 pl-7 pt-1">
                {activeAlerts.map(alert => (
                  <div key={alert.id} className="text-xs text-slate-600">
                    <span className="text-red-600 font-black">[{alert.title}]</span> {alert.message}
                  </div>
                ))}
              </div>

              {/* Show officers in emergency and a cancel button for each */}
              {officers.filter(o => o.status === 'Emergency').length > 0 && (
                <div className="pl-7 pt-3 border-t border-red-200/50 space-y-2 mt-2">
                  <span className="text-[10px] uppercase font-black text-red-500 block">Personnel in Distress:</span>
                  <div className="flex flex-col gap-2">
                    {officers.filter(o => o.status === 'Emergency').map(off => (
                      <div key={off.id} className="flex items-center justify-between bg-white border border-red-100 p-2.5 rounded-xl">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping flex-shrink-0" />
                          <span className="font-extrabold text-slate-800">{off.name} ({off.badgeNumber})</span>
                        </div>
                        <button
                          onClick={() => handleResolveSOS(off.id)}
                          className="px-3 py-1.5 text-[9px] font-black border border-red-200 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg cursor-pointer transition active:scale-95"
                        >
                          CANCEL SOS
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 1: QUICK TACTICAL HUD */}
          {activeTab === 'command' && (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              
              {/* Map Panel */}
              <div className="xl:col-span-2">
                <HUDPanel title="Tactical Command Radar Map" subtitle="Pulsing GPS Telemetries" className="h-[430px]">
                  <TacticalMap 
                    officers={officers}
                    incidents={incidents}
                    selectedIncidentId={selectedIncident?.id}
                    onSelectIncident={handleSelectIncidentId}
                    onDispatchOfficer={handleDispatch}
                    isCommandCenter
                  />
                </HUDPanel>
              </div>

              {/* Sidebar recommendation & details workspace */}
              <div className="space-y-6">
                
                {/* Incident Dispatch Helper panel */}
                {selectedIncident ? (
                  <HUDPanel 
                    title="Incident Dispatch Helper" 
                    subtitle="AI Backup recommendations"
                    statusColor={selectedIncident.priority === 'P1' ? 'red' : 'amber'}
                  >
                    <div className="space-y-4">
                      {/* Summary */}
                      <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-xs space-y-1.5">
                        <div className="flex justify-between items-center font-bold">
                          <span className="text-slate-800 uppercase font-black">{selectedIncident.title}</span>
                          <span className={`px-2 py-0.5 border rounded-full text-[9px] font-bold ${
                            selectedIncident.priority === 'P1' ? 'border-red-200 bg-red-50 text-red-600' : 'border-amber-200 bg-amber-50 text-amber-600'
                          }`}>
                            {selectedIncident.priority}
                          </span>
                        </div>
                        <p className="text-slate-500 text-[11px] leading-relaxed italic">"{selectedIncident.description}"</p>
                        <div className="flex justify-between text-[10px] text-slate-400 pt-1.5 border-t border-slate-200">
                          <span>Status: {selectedIncident.status}</span>
                          <span>Reporter: {selectedIncident.reporterId}</span>
                        </div>
                      </div>

                      {dispatchSuccess && (
                        <div className="p-3 border border-emerald-200 bg-emerald-50 text-emerald-700 rounded-2xl text-xs font-bold text-center flex items-center justify-center gap-1.5 animate-fadeIn">
                          <ShieldCheck className="w-4 h-4" />
                          <span>{dispatchSuccess}</span>
                        </div>
                      )}

                      {/* Backup recommendations */}
                      <div className="space-y-2.5">
                        <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider block">
                          HEURISTIC BACKUP RECOMMENDATIONS
                        </span>

                        {loadingRecommendations ? (
                          <div className="flex items-center justify-center py-8 text-xs text-slate-500 gap-1.5">
                            <RefreshCw className="w-4 h-4 animate-spin text-sky-500" />
                            <span>Computing routing metrics...</span>
                          </div>
                        ) : recommendations.length === 0 ? (
                          <div className="text-center py-6 text-xs text-slate-500 italic">
                            No recommended officers available.
                          </div>
                        ) : (
                          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                            {recommendations.map((rec, idx) => (
                              <div key={idx} className="bg-slate-50 p-3 rounded-2xl border border-slate-200 flex flex-col justify-between gap-2.5 hover:border-slate-300 transition">
                                <div className="flex justify-between items-start">
                                  <div>
                                    <span className="font-bold text-slate-800 block text-xs">{rec.officer.name}</span>
                                    <span className="text-[9px] text-slate-500 font-bold block">{rec.officer.badgeNumber} • {rec.officer.status}</span>
                                  </div>
                                  <div className="text-right">
                                    <span className="text-emerald-600 font-black text-xs block">{rec.distanceKm.toFixed(2)} km</span>
                                    <span className="text-slate-500 text-[9px] font-bold block flex items-center justify-end gap-0.5">
                                      <Clock className="w-3.5 h-3.5" />
                                      {rec.estimatedResponseTimeMins} mins
                                    </span>
                                  </div>
                                </div>
                                <div className="text-[10px] text-slate-500 leading-tight italic">
                                  "{rec.reason}"
                                </div>
                                
                                {selectedIncident.status !== 'Dispatched' && (
                                  <button
                                    onClick={() => handleDispatch(rec.officer.id, selectedIncident.id)}
                                    className="w-full py-1.5 bg-sky-600 hover:bg-sky-550 text-white font-bold rounded-xl text-[10px] uppercase cursor-pointer active:scale-95 transition flex items-center justify-center gap-1 shadow-md"
                                  >
                                    <UserCheck className="w-3.5 h-3.5" />
                                    Dispatch Officer
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </HUDPanel>
                ) : (
                  <HUDPanel title="Operations Dispatch Assistant" subtitle="System Recommendations">
                    <div className="flex flex-col items-center justify-center py-12 text-center text-xs text-slate-400 font-bold uppercase tracking-wide gap-3">
                      <HelpCircle className="w-8 h-8 text-slate-300 animate-pulse" />
                      <span>Select active incident on map or list to assist dispatching</span>
                    </div>
                  </HUDPanel>
                )}
              </div>

              {/* Incidents desk list summary */}
              <div className="col-span-3">
                <HUDPanel title="Operational Incident Desk" subtitle="Active disaster reports">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                     {incidents.map(inc => (
                      <div 
                        key={inc.id} 
                        onClick={() => setSelectedIncident(inc)}
                        className={`border p-4 rounded-2xl font-mono space-y-2 relative shadow-md cursor-pointer transition ${
                            selectedIncident?.id === inc.id 
                            ? 'border-sky-400 bg-sky-50 shadow-[0_4px_20px_rgba(14,165,233,0.08)]' 
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="flex justify-between items-center text-[10px]">
                          <span className={`px-2 py-0.5 rounded-full font-bold ${
                            inc.priority === 'P1' ? 'bg-red-50 border border-red-200 text-red-600 animate-pulse' : 'bg-amber-50 border border-amber-200 text-amber-600'
                          }`}>
                            {inc.priority}
                          </span>
                          <span className="text-slate-500">{new Date(inc.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <h4 className="text-xs uppercase font-extrabold text-slate-800 mt-1 font-sans">{inc.title}</h4>
                        <p className="text-[10px] text-slate-500 line-clamp-2 leading-tight font-sans">"{inc.description}"</p>
                        
                        <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-[9px] text-slate-500 font-sans font-bold">
                          <span>REPORTER: {inc.reporterId}</span>
                          <span className="text-sky-600 font-extrabold uppercase">{inc.status}</span>
                        </div>
                      </div>
                    ))}
                    {incidents.length === 0 && (
                      <div className="col-span-3 text-center py-12 text-xs font-mono text-slate-400 uppercase">
                        No active dispatch incidents recorded.
                      </div>
                    )}
                  </div>
                </HUDPanel>
              </div>

            </div>
          )}

          {/* TAB 2: DETAILED OPERATIONS MAP */}
          {activeTab === 'map' && (
            <div className="h-[550px] animate-fadeIn">
              <TacticalMap 
                officers={officers}
                incidents={incidents}
                selectedIncidentId={selectedIncident?.id}
                onSelectIncident={handleSelectIncidentId}
                onDispatchOfficer={handleDispatch}
                isCommandCenter
              />
            </div>
          )}

          {/* TAB 3: PERSONNEL DEPLOYMENTS */}
          {activeTab === 'officers' && (
            <HUDPanel title="Deployed Field Personnel Registries" subtitle="Heartbeat tracking telemetry logs">
              <div className="overflow-hidden border border-slate-200 rounded-2xl bg-white shadow-sm">
                <table className="w-full text-left font-sans text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px] font-black">
                    <tr>
                      <th className="p-3.5">Badge ID</th>
                      <th className="p-3.5">Officer Name</th>
                      <th className="p-3.5">Sector Team</th>
                      <th className="p-3.5">Current Status</th>
                      <th className="p-3.5">Battery</th>
                      <th className="p-3.5">GPS coordinate</th>
                      <th className="p-3.5">Last Check-In</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700 font-mono">
                    {officers.map(off => (
                      <tr key={off.id} className="hover:bg-slate-50 transition duration-150">
                        <td className="p-3.5 font-bold text-sky-600 font-mono">{off.badgeNumber}</td>
                        <td className="p-3.5 text-slate-800 font-bold font-sans">{off.name}</td>
                        <td className="p-3.5 text-slate-400 font-sans">{off.teamName || 'Unassigned'}</td>
                        <td className="p-3.5"><StatusBadge status={off.status} /></td>
                        <td className="p-3.5 font-bold text-emerald-600 font-mono">{off.battery}%</td>
                        <td className="p-3.5 text-slate-450">
                          {off.location?.latitude && off.location?.longitude ? `${off.location.latitude.toFixed(4)}, ${off.location.longitude.toFixed(4)}` : 'UNKNOWN'}
                        </td>
                        <td className="p-3.5 text-slate-500 font-sans">
                          {off.lastHeartbeat ? new Date(off.lastHeartbeat).toLocaleTimeString() : 'Never'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </HUDPanel>
          )}

          {/* TAB 4: INCIDENT MANAGEMENT DESK */}
          {activeTab === 'incidents' && (
            <HUDPanel title="Full Incident Management Desk" subtitle="Critical operations timeline history">
              <div className="space-y-4">
                {incidents.map(inc => (
                  <div key={inc.id} className="border border-slate-200 bg-white p-5 rounded-2xl space-y-4 shadow-sm">
                    <div className="flex justify-between items-center border-b border-slate-200 pb-3">
                      <div className="flex items-center gap-2">
                        <span className={`px-2.5 py-0.5 border rounded-full font-bold text-xs ${
                          inc.priority === 'P1' ? 'bg-red-50 border-red-200 text-red-600' : 'bg-amber-50 border-amber-200 text-amber-600'
                        }`}>
                          {inc.priority}
                        </span>
                        <h3 className="text-sm font-black text-slate-800">{inc.title}</h3>
                      </div>
                      <span className="text-[10px] text-slate-500 font-bold">{new Date(inc.timestamp).toLocaleString()}</span>
                    </div>

                    <p className="text-xs text-slate-500 leading-relaxed italic bg-slate-50 p-3 rounded-2xl border border-slate-200">
                      "{inc.description}"
                    </p>

                    <div className="text-[11px] bg-slate-50 p-3.5 rounded-2xl space-y-2 border border-slate-200 font-mono">
                      <div className="text-[9px] text-slate-500 font-extrabold uppercase tracking-wider font-sans">CHRONOLOGICAL AUDIT LOG:</div>
                      {typeof inc.timeline === 'string' && JSON.parse(inc.timeline).map((evt: any, idx: number) => (
                        <div key={idx} className="flex justify-between text-slate-600 border-b border-slate-200 pb-1 last:border-0 last:pb-0">
                          <span>• {evt.event}</span>
                          <span className="text-slate-550 font-normal font-sans text-[10px]">
                            {new Date(evt.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {incidents.length === 0 && (
                  <div className="text-center py-16 text-xs text-slate-400 uppercase font-bold">
                    No active operations incidents recorded.
                  </div>
                )}
              </div>
            </HUDPanel>
          )}

          {/* TAB 5: GROUP BROADCAST MESSAGES */}
          {activeTab === 'messages' && (
            <HUDPanel title="Mesh Group Broadcasts Channels" subtitle="Emergency communication traffic logs">
              <div className="h-[430px] border border-slate-200 bg-white p-5 rounded-2xl flex flex-col justify-between gap-4 overflow-hidden shadow-sm">
                <div className="flex-1 overflow-y-auto space-y-3.5 pr-2 py-2 text-xs font-sans">
                  {chatMessages.length === 0 ? (
                    <div className="text-center py-12 text-slate-550 uppercase text-xs font-bold tracking-wide italic">
                      No communications recorded in this session.
                    </div>
                  ) : (
                    chatMessages.map(msg => {
                      const isMe = msg.senderId === user.id;
                      const sender = officers.find(o => o.id === msg.senderId);
                      const senderName = isMe 
                        ? 'HQ (YOU)' 
                        : (sender ? `Officer ${sender.name} (${sender.badgeNumber})` : `User ID: ${msg.senderId}`);
                      const isEmergency = msg.priority === 1;

                      return (
                        <div 
                          key={msg.id} 
                          className={`flex flex-col max-w-[85%] ${
                            isMe ? 'ml-auto items-end' : 'mr-auto items-start'
                          }`}
                        >
                          <span className="text-[9px] font-bold text-slate-500 mb-1">
                            {senderName} • {msg.isBroadcast ? 'Broadcast' : msg.teamId ? `Team Room` : 'Direct'}
                          </span>
                          <div className={`p-3.5 rounded-2xl leading-relaxed text-[12px] shadow-sm ${
                            isMe 
                              ? 'bg-gradient-to-br from-sky-500 to-sky-600 text-white rounded-tr-none shadow-sky-200/30' 
                              : isEmergency
                                ? 'bg-red-50 border border-red-200 text-red-700 rounded-tl-none animate-pulse'
                                : 'bg-slate-50 border border-slate-200 text-slate-700 rounded-tl-none'
                          }`}>
                            <p className="font-semibold">{msg.body}</p>
                          </div>
                          <div className="flex items-center gap-1.5 text-[8px] text-slate-550 mt-1.5 select-none font-bold font-mono">
                            <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                
                <div className="flex gap-2.5 border-t border-slate-200 pt-4 mt-3">
                  <input
                    type="text"
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    placeholder="Broadcast text message to all operational mesh nodes..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleBroadcast();
                    }}
                    className="flex-1 bg-white border border-slate-200 px-4 py-3 rounded-2xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-500 transition shadow-sm font-sans"
                  />
                  <button
                    onMouseDown={handlePttStart}
                    onMouseUp={handlePttEnd}
                    onTouchStart={handlePttStart}
                    onTouchEnd={handlePttEnd}
                    className={`p-3.5 rounded-xl text-white transition-all transform active:scale-95 shadow-md flex-shrink-0 ${
                      isPttActive 
                        ? "bg-red-500 shadow-red-500/50 animate-pulse" 
                        : "bg-amber-500 hover:bg-amber-600 shadow-amber-500/30"
                    }`}
                    title="Hold to Talk (PTT)"
                  >
                    <Radio className="w-4.5 h-4.5" />
                  </button>
                  <button
                    onClick={handleBroadcast}
                    className="p-3 bg-sky-600 hover:bg-sky-550 text-white rounded-2xl transition flex items-center justify-center cursor-pointer active:scale-95 shadow-md border-0"
                    title="Send Text Broadcast"
                  >
                    <Send className="w-4.5 h-4.5" />
                  </button>
                </div>
              </div>
            </HUDPanel>
          )}

          {/* TAB 6: SECURITY AUDITS */}
          {activeTab === 'audit' && (
            <HUDPanel title="Secure Cryptographic Audit Trail" subtitle="Central system transaction database">
              <div className="overflow-hidden border border-slate-200 rounded-2xl bg-white shadow-sm">
                <table className="w-full text-left font-sans text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px] font-black">
                    <tr>
                      <th className="p-3.5">Log Timestamp</th>
                      <th className="p-3.5">User Node</th>
                      <th className="p-3.5">Transaction logged</th>
                      <th className="p-3.5">IP Interface</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-600 font-mono">
                    {auditLogs.map((log, i) => (
                      <tr key={i} className="hover:bg-slate-900/15 transition duration-150">
                        <td className="p-3.5 text-slate-450 font-sans">{new Date(log.timestamp).toLocaleString()}</td>
                        <td className="p-3.5 font-bold text-sky-600">{log.userId || 'SYSTEM'}</td>
                        <td className="p-3.5 uppercase font-bold text-slate-800 font-sans">{log.action}</td>
                        <td className="p-3.5 text-slate-500">{log.ipAddress || 'local'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </HUDPanel>
          )}
          {/* TAB 7: FIELD EVIDENCE DECK */}
          {activeTab === 'evidence' && (
            <HUDPanel title="Cryptographic Field Evidence Deck" subtitle="Real-time synchronized field captures & hashes">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {evidenceLogs.map((ev) => (
                  <div key={ev.id} className="border border-slate-200 bg-white rounded-3xl overflow-hidden shadow-md flex flex-col justify-between hover:border-slate-350 transition duration-200">
                    <div className="relative aspect-video w-full bg-slate-105 flex items-center justify-center border-b border-slate-200">
                      {ev.filePath ? (
                        <img 
                          src={ev.filePath} 
                          alt={ev.description} 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="text-slate-400 text-xs font-mono font-bold uppercase tracking-wider">NO PREVIEW</div>
                      )}
                      <div className="absolute bottom-3 right-3 bg-slate-900/75 backdrop-blur-md px-2.5 py-1 rounded-xl text-[9px] font-mono text-emerald-400 font-bold border border-emerald-400/25 flex items-center gap-1 shadow-sm">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        SHA-256 VERIFIED
                      </div>
                    </div>
                    
                    <div className="p-4 space-y-3 flex-grow flex flex-col justify-between">
                      <div className="space-y-1">
                        <div className="flex justify-between items-center text-[9px] text-slate-450 font-bold font-mono">
                          <span className="text-sky-600 font-extrabold uppercase">OFFICER: {ev.officerName || `ID: ${ev.officerId}`}</span>
                          <span>{new Date(ev.timestamp).toLocaleString()}</span>
                        </div>
                        <p className="text-slate-800 font-sans text-xs font-bold line-clamp-2 mt-1">"{ev.description}"</p>
                      </div>

                      <div className="pt-3 border-t border-slate-150 space-y-2">
                        {ev.locationLat && ev.locationLng ? (
                          <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono font-bold">
                            <span>COORDINATES:</span>
                            <span className="text-slate-700">{ev.locationLat.toFixed(5)}, {ev.locationLng.toFixed(5)}</span>
                          </div>
                        ) : (
                          <div className="text-[10px] text-slate-400 italic">No GPS coordinates recorded.</div>
                        )}
                        
                        <div className="bg-slate-50 p-2 rounded-xl border border-slate-150 flex flex-col gap-0.5">
                          <span className="text-[7px] text-slate-400 font-bold block uppercase font-mono">INTEGRITY CHECK CHECKSUM</span>
                          <span className="text-[8px] font-mono text-slate-600 truncate block select-all" title={ev.hash}>{ev.hash}</span>
                        </div>
                        <button
                          onClick={() => handleForwardEvidence(ev)}
                          className="w-full mt-2 py-1.5 bg-sky-100 hover:bg-sky-200 text-sky-700 font-bold rounded-lg text-[9px] uppercase tracking-wider cursor-pointer active:scale-95 transition flex items-center justify-center gap-1.5 border border-sky-200"
                        >
                          <Send className="w-3 h-3" />
                          Forward Evidence to Officers
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {evidenceLogs.length === 0 && (
                  <div className="col-span-3 text-center py-16 text-xs text-slate-400 font-bold uppercase font-sans tracking-wide">
                    No field evidence files synced to this terminal.
                  </div>
                )}
              </div>
            </HUDPanel>
          )}

        </main>
      </section>

    </div>
  );
}
