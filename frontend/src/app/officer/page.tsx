'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { TacticalButton } from '../../components/ui/TacticalButton';
import { TacticalMap } from '../../components/shared/TacticalMap';
import { clientCommunicationEngine } from '../../services/communication/CommunicationEngine';
import { clientEventBus } from '../../services/events/EventBus';
import { EvidencePipeline } from '../../services/evidence/EvidencePipeline';
import { localDb } from '../../services/queue/OfflineDatabase';
import { 
  Radio, ShieldAlert, MessageSquare, Camera, LogOut, 
  MapPin, Battery, Server, User as UserIcon, Users, RefreshCw,
  Activity, Shield, Wifi, Send, CheckCheck, ChevronRight, AlertTriangle,
  Compass, HardDrive, Cpu, RadioTower, Map as MapIcon, Sliders, Settings
} from 'lucide-react';
import { OfficerStatus, Message, Evidence, User, Incident } from '../../types';

export default function OfficerDashboard() {
  const router = useRouter();
  const { user, logout, token, isAuthenticated, isLoading } = useAuth();
  const { isOnline, queueSize, triggerLocalSOS, currentLocation, setCurrentLocation } = useApp();
  
  const [activeTab, setActiveTab] = useState<'home' | 'map' | 'ptt' | 'messages' | 'evidence'>('home');
  const [isPttActive, setIsPttActive] = useState<boolean>(false);
  const [officerStatus, setOfficerStatus] = useState<OfficerStatus>('Available');
  const [localBattery, setLocalBattery] = useState<number>(94);
  const [radioChannel, setRadioChannel] = useState<'Alpha' | 'Bravo' | 'Charlie' | 'Delta' | 'Command'>('Alpha');
  const [showSettings, setShowSettings] = useState<boolean>(false);
  
  const [waveHeights, setWaveHeights] = useState<number[]>([12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const isRecordingRequestedRef = useRef<boolean>(false);
  const pttStreamRef = useRef<MediaStream | null>(null);

  // Operational personnel and incidents list
  const [peers, setPeers] = useState<User[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);

  // Chat State
  const [chatMessage, setChatMessage] = useState<string>('');
  const [selectedRecipient, setSelectedRecipient] = useState<string>('all');
  const [chatMessages, setChatMessages] = useState<Message[]>([
    {
      id: 'm1',
      senderId: 'u_disp1',
      recipientId: null,
      teamId: 't1',
      body: 'DISPATCH (D101): Alpha Team, verify location coordinate check near Kurnool Fort.',
      priority: 5,
      timestamp: Date.now() - 3600000,
      isBroadcast: true
    }
  ]);

  // Evidence state
  const [evidenceList, setEvidenceList] = useState<Evidence[]>([]);
  const [evidenceDesc, setEvidenceDesc] = useState<string>('');
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [capturedThumbnail, setCapturedThumbnail] = useState<string | null>(null);

  // Time state
  const [currentTime, setCurrentTime] = useState<string>('00:00');

  // Slide-to-SOS state
  const [sliderVal, setSliderVal] = useState<number>(0);

  // Live video stream hooks
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);

  // Track time clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hrs = String(now.getHours()).padStart(2, '0');
      const mins = String(now.getMinutes()).padStart(2, '0');
      setCurrentTime(`${hrs}:${mins}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  // Heartbeat sender daemon (Sends telemetry every 10s if logged in)
  useEffect(() => {
    if (!user || user.role !== 'officer') return;

    // Send immediate heartbeat on startup
    const sendPing = () => {
      if (!currentLocation) return;
      
      // Simulate minor location drift to represent walking/patrolling
      const driftLat = (Math.random() - 0.5) * 0.0003;
      const driftLng = (Math.random() - 0.5) * 0.0003;
      
      const nextLat = currentLocation.lat + driftLat;
      const nextLng = currentLocation.lng + driftLng;
      const nextHeading = Math.floor(Math.random() * 360);

      setCurrentLocation({ lat: nextLat, lng: nextLng, heading: nextHeading });

      clientCommunicationEngine.sendLocation(
        user.id,
        localBattery,
        officerStatus,
        isOnline ? 'LTE/Wi-Fi' : 'Offline local mesh',
        {
          lat: nextLat,
          lng: nextLng,
          heading: nextHeading,
          speed: 4, // 4 km/h walking speed
          accuracy: 5 // 5m GPS accuracy
        }
      );
    };

    sendPing();

    const heartbeatTimer = setInterval(sendPing, 10000); // 10 seconds interval

    return () => clearInterval(heartbeatTimer);
  }, [user, isOnline, officerStatus, localBattery]);

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

  // Fetch operational telemetry from API if online
  const fetchTelemetry = async () => {
    if (!token || !isOnline) return;
    try {
      const peersRes = await fetch(`${getBackendUrl()}/api/officers`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (peersRes.ok) {
        const data = await peersRes.json();
        setPeers(data.filter((u: User) => u.id !== user?.id));
      }

      const incRes = await fetch(`${getBackendUrl()}/api/incidents`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (incRes.ok) {
        const data = await incRes.json();
        setIncidents(data);
      }
    } catch (err) {
      console.warn('Could not pull online telemetry logs, continuing offline mode', err);
    }
  };

  useEffect(() => {
    fetchTelemetry();
    if (isOnline) {
      const pollTimer = setInterval(fetchTelemetry, 10000);
      return () => clearInterval(pollTimer);
    }
  }, [token, isOnline]);

  // Sync state & messages list on startup
  useEffect(() => {
    const loadCache = async () => {
      try {
        const cachedMsgs = await localDb.cachedMessages.orderBy('timestamp').toArray();
        if (cachedMsgs.length > 0) {
          setChatMessages(cachedMsgs);
        }
        const cachedEv = await localDb.cachedEvidence.orderBy('timestamp').reverse().toArray();
        setEvidenceList(cachedEv);
      } catch (err) {
        console.warn('[OfficerDashboard] Failed to load cached telemetry data:', err);
      }
    };
    loadCache();
  }, [activeTab]);

  const playChirp = (frequency = 600, duration = 0.08) => {
    if (typeof window !== 'undefined' && window.AudioContext) {
      try {
        const audioCtx = new AudioContext();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.01, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
      } catch (_) {}
    }
  };

  // Event Bus listeners for Socket.IO updates
  useEffect(() => {
    const unsubMsg = clientEventBus.subscribe('message:received', (msg: Message) => {
      setChatMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    });

    const unsubAck = clientEventBus.subscribe('message:synced', () => {
      localDb.cachedMessages.orderBy('timestamp').toArray().then(setChatMessages);
    });

    const handleVoiceStream = (data: any) => {
      if (user && data.senderId === user.id) return;
      playChirp(600, 0.08);
      if (data.audioData.startsWith('MOCK_SPEECH:')) {
        const text = data.audioData.replace('MOCK_SPEECH:', '');
        if (typeof window !== 'undefined' && window.speechSynthesis) {
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.rate = 0.95;
          window.speechSynthesis.speak(utterance);
        }
      } else {
        const audio = new Audio(data.audioData);
        audio.play().catch(e => console.log('Audio play failed:', e));
      }
    };

    const unsubVoice = clientEventBus.subscribe('voice:stream_received', handleVoiceStream);

    const handleStatusChange = (data: any) => {
      if (user && data.userId === user.id) {
        setOfficerStatus(data.status);
      }
    };
    const unsubStatus = clientEventBus.subscribe('officer:status_change', handleStatusChange);

    return () => {
      unsubMsg();
      unsubAck();
      unsubVoice();
      unsubStatus();
    };
  }, [user]);

  // Request Camera Stream when entering Evidence Tab
  useEffect(() => {
    if (activeTab === 'evidence') {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
          .then(stream => {
            setMediaStream(stream);
            if (videoRef.current) {
              videoRef.current.srcObject = stream;
            }
          })
          .catch(err => {
            console.warn('Camera blocked or unavailable, using fallback mockup', err);
          });
      } else {
        console.warn('navigator.mediaDevices.getUserMedia is unavailable in this origin/context.');
      }
    } else {
      if (mediaStream) {
        try {
          mediaStream.getTracks().forEach(track => track.stop());
        } catch (_) {}
        setMediaStream(null);
      }
    }

    return () => {
      if (mediaStream) {
        try {
          mediaStream.getTracks().forEach(track => track.stop());
        } catch (_) {}
      }
    };
  }, [activeTab]);

  // Request Microphone Stream when entering Radio/PTT Tab
  useEffect(() => {
    if (activeTab === 'ptt') {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ audio: true })
          .then(stream => {
            pttStreamRef.current = stream;
            console.log('[PTT] Microphone stream warm and active.');
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

    return () => {
      if (pttStreamRef.current) {
        try {
          pttStreamRef.current.getTracks().forEach(track => track.stop());
        } catch (_) {}
      }
    };
  }, [activeTab]);

  // Handle PTT Voice Chirp waves bounce interval
  useEffect(() => {
    if (isPttActive) {
      const timer = setInterval(() => {
        setWaveHeights(Array.from({ length: 11 }, () => Math.floor(Math.random() * 30) + 10));
      }, 70);
      return () => clearInterval(timer);
    } else {
      setWaveHeights([12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12]);
    }
  }, [isPttActive]);

  // Redirect if not logged in
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading || !user) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 font-sans text-xs uppercase tracking-widest text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin text-sky-600 mb-2" />
        <span>Syncing terminal credentials...</span>
      </div>
    );
  }

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSliderVal(parseInt(e.target.value));
  };

  const handleSliderRelease = () => {
    if (sliderVal >= 90) {
      setSliderVal(100);
      executeSOS();
    } else {
      setSliderVal(0);
    }
  };

  const executeSOS = async () => {
    setOfficerStatus('Emergency');
    
    // Play dual oscillator siren chirps
    if (typeof window !== 'undefined' && window.AudioContext) {
      try {
        const audioCtx = new AudioContext();
        const osc1 = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(800, audioCtx.currentTime);
        osc1.frequency.linearRampToValueAtTime(1000, audioCtx.currentTime + 0.3);
        
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(805, audioCtx.currentTime);
        
        gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.6);
        
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc1.start();
        osc2.start();
        osc1.stop(audioCtx.currentTime + 0.6);
        osc2.stop(audioCtx.currentTime + 0.6);
      } catch (_) {}
    }

    try {
      await triggerLocalSOS();
    } catch (err) {
      console.log('SOS queued locally');
    }

    setTimeout(() => {
      setSliderVal(0);
    }, 2500);
  };

  // Real-time messaging transmission enqueuing
  const handleSendMessage = async () => {
    if (!chatMessage.trim()) return;

    try {
      const isDirect = selectedRecipient !== 'all';
      const sent = await clientCommunicationEngine.sendMessage({
        senderId: user.id,
        recipientId: isDirect ? selectedRecipient : null,
        teamId: isDirect ? null : 't1',
        body: chatMessage,
        isBroadcast: false
      });

      setChatMessages(prev => [...prev, sent]);
      setChatMessage('');

      // Click sound chirp
      if (typeof window !== 'undefined' && window.AudioContext) {
        try {
          const audioCtx = new AudioContext();
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.frequency.setValueAtTime(1200, audioCtx.currentTime);
          gain.gain.setValueAtTime(0.015, audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.05);
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start();
          osc.stop(audioCtx.currentTime + 0.05);
        } catch (_) {}
      }
    } catch (err) {
      console.error('Failed to dispatch message:', err);
    }
  };

  // PTT Radio chirps & recording
  const handlePttStart = async () => {
    setIsPttActive(true);
    isRecordingRequestedRef.current = true;
    if (typeof window !== 'undefined' && window.AudioContext) {
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

    // Initialize Media Recording with pre-warmed stream
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
            const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            const reader = new FileReader();
            reader.readAsDataURL(audioBlob);
            reader.onloadend = () => {
              const base64Audio = reader.result as string;
              // Send base64 audio chunk via clientCommunicationEngine
              clientCommunicationEngine.sendVoiceChunk(user.id, base64Audio);
            };
          }
        };

        mediaRecorder.start();
      } catch (err) {
        console.warn('Failed to start MediaRecorder on pre-warmed stream:', err);
        mediaRecorderRef.current = null;
      }
    }
  };

  const handlePttEnd = () => {
    setIsPttActive(false);
    isRecordingRequestedRef.current = false;
    if (typeof window !== 'undefined' && window.AudioContext) {
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

    // Stop recording
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    } else {
      // Fallback: If microphone was blocked/unsupported or request was too short to start recorder
      const displayName = user && user.role === 'officer' && !user.name.startsWith('Officer')
        ? `Officer ${user.name}`
        : (user ? user.name : 'Unknown Officer');
      const synthText = `${displayName} transmitting on Channel ${radioChannel}`;
      clientCommunicationEngine.sendVoiceChunk(user.id, `MOCK_SPEECH:${synthText}`);
    }
  };

  // Ingest captured photos through Evidence Pipeline
  const handleCaptureEvidence = async () => {
    if (!evidenceDesc.trim()) {
      alert('Description required.');
      return;
    }

    setIsCapturing(true);

    if (typeof window !== 'undefined' && window.AudioContext) {
      try {
        const audioCtx = new AudioContext();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.12);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.15);
      } catch (_) {}
    }

    let base64Image = '';

    if (videoRef.current && canvasRef.current && mediaStream) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        base64Image = canvas.toDataURL('image/jpeg', 0.6);
      }
    }

    if (!base64Image && canvasRef.current) {
      const canvas = canvasRef.current;
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#0F172A';
        ctx.fillRect(0, 0, 640, 480);
        ctx.strokeStyle = '#0284C7';
        ctx.lineWidth = 4;
        ctx.strokeRect(20, 20, 600, 440);
        
        ctx.beginPath();
        ctx.arc(320, 240, 80, 0, 2 * Math.PI);
        ctx.stroke();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 24px sans-serif';
        ctx.fillText(`SECURE TELEMETRY FEED`, 60, 80);
        ctx.fillText(`DESC: ${evidenceDesc.toUpperCase()}`, 60, 120);
        ctx.fillText(`GPS: ${currentLocation?.lat.toFixed(5)} / ${currentLocation?.lng.toFixed(5)}`, 60, 160);
        base64Image = canvas.toDataURL('image/jpeg', 0.6);
      }
    }

    try {
      const ev = await EvidencePipeline.processAndQueue(
        user.id,
        null,
        evidenceDesc,
        base64Image,
        currentLocation ? { latitude: currentLocation.lat, longitude: currentLocation.lng } : null
      );

      setEvidenceList(prev => [ev, ...prev]);
      setCapturedThumbnail(evidenceDesc);
      setEvidenceDesc('');
    } catch (err) {
      console.error('Evidence pipeline capture failed:', err);
    } finally {
      setIsCapturing(false);
      setTimeout(() => setCapturedThumbnail(null), 3000);
    }
  };

  return (
    <div className="flex-1 bg-slate-50 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-sky-50/40 via-slate-50 to-slate-100 flex flex-col min-h-screen text-slate-800 font-sans pb-24 selection:bg-sky-200">
      {/* Hidden canvas */}
      <canvas ref={canvasRef} className="hidden" />

      {/* TOP STATUS TELEMETRY BAR */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-slate-300 px-6 py-2.5 flex justify-between items-center text-[10px] font-mono select-none font-bold shadow-md z-20">
        <div className="flex items-center gap-1.5">
          <span>{currentTime}</span>
          <span className="text-slate-700">|</span>
          <span className="text-[9px] uppercase tracking-widest text-sky-450 font-black">POLICE MESH PORTAL</span>
        </div>
        <div className="flex items-center gap-2">
          <Wifi className={`w-3.5 h-3.5 ${isOnline ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`} />
          <span className="text-slate-700">|</span>
          <div className="flex items-center gap-1">
            <span>BAT: {localBattery}%</span>
            <div className="w-5 h-2.5 border border-slate-600 rounded-sm p-0.5 flex items-center">
              <div 
                className={`h-full rounded-2xs ${localBattery > 20 ? 'bg-emerald-500' : 'bg-red-500'}`} 
                style={{ width: `${localBattery}%` }} 
              />
            </div>
          </div>
        </div>
      </div>

      {/* Indian Style Police Badge Banner (Moved to top as requested) */}
      <div className="bg-gradient-to-r from-indigo-700 via-blue-800 to-indigo-700 border-b-4 border-amber-400/80 px-5 py-4 shadow-[0_8px_30px_rgb(0,0,0,0.12)] relative overflow-hidden text-white select-none z-20">
        {/* Tricolor flag accent strip at the top */}
        <div className="absolute top-0 left-0 right-0 h-1 flex">
          <div className="flex-1 bg-[#FF9933]" />
          <div className="flex-1 bg-white" />
          <div className="flex-1 bg-[#138808]" />
        </div>
        <div className="absolute top-3.5 right-4 bg-amber-400/20 border border-amber-400/40 text-amber-200 font-extrabold text-[8px] uppercase tracking-widest px-2.5 py-0.5 rounded-full">
          కర్నూలు పోలీస్
        </div>
        <div className="flex items-center gap-4 mt-2">
          <div className="w-12 h-12 bg-white/10 backdrop-blur p-1 rounded-2xl flex items-center justify-center shadow-inner border border-white/20 relative">
            <img src="/ap-police-logo.png" className="w-9 h-9 object-contain" alt="AP Police Logo" />
          </div>
          <div>
            <h2 className="text-xs font-black tracking-wider text-amber-300 uppercase leading-none font-sans flex items-center gap-1.5">
              KURNOOL DISTRICT POLICE
            </h2>
            <h3 className="text-[8px] text-blue-100 uppercase font-mono font-bold tracking-tight mt-1.5 leading-none">
              ఆంధ్రప్రదేశ్ రాష్ట్ర రక్షక భట శాఖ / AP Police Dept
            </h3>
            <div className="flex items-center gap-2 mt-2 font-mono text-[9px] text-blue-200 font-bold leading-none">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_#10B981]" />
              <span>STATION: KURNOOL I-TOWN PS</span>
            </div>
          </div>
        </div>
      </div>

      {/* MAIN PREMIUM APP HEADER */}
      <header className="bg-white border-b border-slate-100 px-6 py-4 flex justify-between items-center shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-sm font-black text-slate-900 tracking-tight leading-none uppercase">
              Officer {user.name.split(' ')[1] || user.name}
            </h1>
            <span className="text-[9px] text-slate-400 font-mono mt-1.5 block uppercase tracking-wider font-extrabold">
              Badge: {user.badgeNumber} • TEAM Alpha
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <StatusBadge status={officerStatus} />
          <div className="bg-sky-500 text-white p-2 rounded-xl shadow-[0_4px_12px_rgba(14,165,233,0.25)] ml-1 border border-sky-400">
            <RadioTower className="w-4 h-4 animate-pulse" />
          </div>
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className={`p-2 border rounded-xl transition cursor-pointer shadow-sm ${
              showSettings ? 'bg-sky-500 border-sky-500 text-white shadow-[0_4px_12px_rgba(14,165,233,0.25)]' : 'bg-white border-slate-200/60 text-slate-500 hover:text-slate-800 hover:bg-slate-50 hover:shadow-md'
            }`}
            title="Diagnostics Dashboard"
          >
            <Sliders className="w-4 h-4" />
          </button>
          <button 
            onClick={handleLogout}
            className="p-2 border border-slate-200/60 bg-white hover:bg-red-50 text-slate-450 hover:text-red-500 hover:border-red-200 rounded-xl transition cursor-pointer shadow-sm hover:shadow-md"
            title="Disconnect Terminal Link"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* DISASTER WARNING BANNER */}
      {!isOnline && (
        <div className="bg-gradient-to-r from-red-600 to-amber-600 text-white text-center py-2 px-4 flex items-center justify-center gap-2 text-[10px] font-mono font-black tracking-wider uppercase shadow-md z-10 animate-pulse">
          <ShieldAlert className="w-4 h-4" />
          <span>MESH NETWORK MODE ACTIVATED • SYNCHRONIZING OFFLINE QUEUE ({queueSize})</span>
        </div>
      )}

      {/* INNER VIEWPORT WRAPPER */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 md:p-6 space-y-6">

        {/* SETTINGS / DIAGNOSTICS SLIDE DRAWER */}
        {showSettings && (
          <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-md space-y-4 animate-scaleUp">
            <div className="flex justify-between items-center border-b border-slate-100 pb-2">
              <h3 className="text-xs font-black uppercase text-slate-800 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-sky-600" />
                Hardware Diagnostics & Telemetry
              </h3>
              <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-slate-800 font-bold">✕</button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-50/60 p-4 rounded-2xl border border-slate-100 space-y-3">
                <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Battery className="w-4 h-4 text-emerald-500" />
                  Battery Simulation
                </span>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-bold text-slate-700">
                    <span>Charge:</span>
                    <span>{localBattery}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="10" 
                    max="100" 
                    value={localBattery}
                    onChange={(e) => setLocalBattery(parseInt(e.target.value))}
                    className="w-full accent-sky-500 bg-slate-200 h-1.5 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              </div>

              <div className="bg-slate-50/60 p-4 rounded-2xl border border-slate-100 space-y-1.5 text-xs font-mono">
                <span className="text-[9px] font-extrabold text-slate-450 uppercase tracking-wider block font-sans mb-1">
                  System Stats
                </span>
                <div className="flex justify-between">
                  <span className="text-slate-400">CPU LOAD:</span>
                  <span className="text-slate-800 font-bold">12%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">STORAGE:</span>
                  <span className="text-slate-800 font-bold">38% USED</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">FIRMWARE:</span>
                  <span className="text-slate-800 font-bold">1.0.4-MESH</span>
                </div>
              </div>

              <div className="bg-slate-50/60 p-4 rounded-2xl border border-slate-100 space-y-1.5 text-xs font-mono">
                <span className="text-[9px] font-extrabold text-slate-455 uppercase tracking-wider block font-sans mb-1">
                  Mesh Telemetry
                </span>
                <div className="flex justify-between">
                  <span className="text-slate-400">MAC ADDR:</span>
                  <span className="text-slate-800 font-bold">2E:C5:31:0C:4A:8D</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">OUTBOUND QUEUE:</span>
                  <span className="text-sky-700 font-extrabold">{queueSize} PENDING</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">PEERS ALIVE:</span>
                  <span className="text-emerald-700 font-extrabold">{peers.length} ONLINE</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 1: OPERATIONAL TELEMETRY FEED */}
        {activeTab === 'home' && (
          <div className="space-y-6 animate-fadeIn">

            {/* TACTICAL PANIC ALARM TAP BUTTON — TOP PRIORITY */}
              <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm flex flex-col items-center justify-center text-center space-y-4 min-h-[260px] relative overflow-hidden">
                <div className="absolute inset-0 bg-red-500/[0.01] pointer-events-none" />
                <div className="absolute -top-12 -left-12 w-32 h-32 bg-red-500/5 rounded-full blur-2xl pointer-events-none" />
                <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-red-500/5 rounded-full blur-2xl pointer-events-none" />
                
                {/* Ripple Animations */}
                <div className="relative flex items-center justify-center select-none">
                  {officerStatus === 'Emergency' && (
                    <>
                      <div className="absolute w-44 h-44 border-2 border-red-500/25 rounded-full animate-ping opacity-60" />
                      <div className="absolute w-52 h-52 border border-red-500/10 rounded-full animate-ping delay-200 opacity-45" />
                    </>
                  )}
                  
                  <button
                    type="button"
                    onClick={executeSOS}
                    className={`w-36 h-36 rounded-full flex flex-col items-center justify-center gap-1 transition-all duration-300 cursor-pointer select-none relative active:scale-95 ${
                      officerStatus === 'Emergency'
                        ? 'bg-gradient-to-br from-red-600 to-red-700 shadow-[0_0_35px_rgba(239,68,68,0.7)] scale-105 border-4 border-red-300'
                        : 'bg-gradient-to-br from-red-500 to-red-650 hover:from-red-600 hover:to-red-700 border-4 border-red-100/50 shadow-[0_12px_30px_rgba(239,68,68,0.3)] hover:shadow-[0_15px_35px_rgba(239,68,68,0.45)]'
                    }`}
                  >
                    <Shield className="w-12 h-12 text-white fill-white/10" />
                    <span className="text-white font-sans text-xl font-black tracking-widest leading-none">
                      SOS
                    </span>
                    <span className="text-[7px] text-red-100 font-extrabold tracking-widest uppercase font-sans mt-0.5 leading-none">
                      అత్యవసరం
                    </span>
                  </button>
                </div>

                {/* Subtext */}
                <div className="flex flex-col gap-1 mt-1 z-10">
                  <span className="text-[10px] font-black text-slate-450 uppercase tracking-widest leading-none font-sans">
                    {officerStatus === 'Emergency' ? '🚨 SOS BEACON BROADCASTING...' : 'అత్యవసర బటన్ / TAP TO TRIGGER SOS'}
                  </span>
                  {officerStatus === 'Emergency' ? (
                    <span className="text-[8px] font-mono text-red-500 font-extrabold animate-pulse leading-none mt-1">
                      COORD SENT: {currentLocation?.lat.toFixed(5)}, {currentLocation?.lng.toFixed(5)}
                    </span>
                  ) : (
                    <span className="text-[8px] text-slate-400 font-bold leading-none mt-1 font-sans">
                      THIS WILL IMMEDIATELY BROADCAST EMERGENCY TO ALL MESH TERMINALS
                    </span>
                  )}
                </div>
              </div>

            {/* Update Availability Status — RIGHT BELOW SOS */}
            <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm space-y-3">
              <span className="text-[10px] text-slate-450 font-black uppercase tracking-wider block font-sans">
                అందుబాటు స్థితి మార్పు / Update Availability Status:
              </span>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { status: 'Available', label: 'Available', localLabel: 'సిద్ధంగా ఉన్నారు' },
                  { status: 'Patrolling', label: 'Patrolling', localLabel: 'గస్తీలో ఉన్నారు' },
                  { status: 'Busy', label: 'Busy', localLabel: 'వేరే పనిలో ఉన్నారు' }
                ].map(st => (
                  <button
                    key={st.status}
                    onClick={() => setOfficerStatus(st.status as OfficerStatus)}
                    className={`px-2.5 py-2.5 border rounded-2xl font-bold flex flex-col items-center justify-center gap-0.5 transition active:scale-95 cursor-pointer text-center ${
                      officerStatus === st.status 
                        ? 'border-sky-500 bg-sky-500 text-white shadow-[0_4px_12px_rgba(14,165,233,0.25)]' 
                        : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-[9px] uppercase font-black tracking-wide leading-none">{st.label}</span>
                    <span className={`text-[7px] font-sans font-bold leading-none mt-0.5 ${
                      officerStatus === st.status ? 'text-sky-100' : 'text-slate-400'
                    }`}>{st.localLabel}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Compact Telemetry Stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white border border-slate-100 rounded-2xl p-3.5 shadow-sm flex items-center gap-3">
                <Compass className="w-5 h-5 text-sky-600 flex-shrink-0" />
                <div>
                  <span className="text-[8px] text-slate-400 font-bold block font-sans">GPS COORDS</span>
                  <span className="text-slate-800 font-extrabold text-[10px] tracking-tight block font-mono">
                    {currentLocation ? `${currentLocation.lat.toFixed(4)}, ${currentLocation.lng.toFixed(4)}` : 'SCANNING...'}
                  </span>
                </div>
              </div>
              <div className="bg-white border border-slate-100 rounded-2xl p-3.5 shadow-sm flex items-center gap-3">
                <HardDrive className="w-5 h-5 text-sky-600 flex-shrink-0" />
                <div>
                  <span className="text-[8px] text-slate-400 font-bold block font-sans">SYNC QUEUE</span>
                  <span className="text-sky-700 font-extrabold block text-[10px] font-mono">
                    {queueSize} PENDING
                  </span>
                </div>
              </div>
              <div className="bg-white border border-slate-100 rounded-2xl p-3.5 shadow-sm flex items-center gap-3">
                <Users className="w-5 h-5 text-sky-600 flex-shrink-0" />
                <div>
                  <span className="text-[8px] text-slate-400 font-bold block font-sans">PEERS</span>
                  <span className="text-emerald-700 font-extrabold block text-[10px] font-mono">
                    {peers.length} ONLINE
                  </span>
                </div>
              </div>
            </div>

            {/* Sector Personnel — Compact List at Bottom */}
            <div className="bg-white border border-slate-100 rounded-3xl p-4 shadow-sm space-y-3">
              <h3 className="text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center justify-between gap-2 font-sans">
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-sky-600" />
                  సహచర సిబ్బంది / Sector Personnel ({peers.length + 1})
                </span>
                <span className="text-[8px] bg-slate-50 border border-slate-150 px-2 py-0.5 rounded-full font-mono text-slate-400 font-bold uppercase">
                  MESH SEGMENT
                </span>
              </h3>
              
              <div className="flex flex-wrap gap-2 text-xs">
                {/* Self chip */}
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200/60 px-3 py-1.5 rounded-xl">
                  <div className="bg-amber-500 text-white p-1 rounded-md">
                    <UserIcon className="w-3 h-3" />
                  </div>
                  <span className="font-bold text-slate-800 font-sans text-[11px]">{user.name} <span className="text-amber-600 text-[9px]">(YOU)</span></span>
                </div>

                {/* Peer chips */}
                {peers.map(peer => (
                  <div key={peer.id} className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
                    <div className="bg-slate-100 text-slate-500 border border-slate-200 p-1 rounded-md">
                      <UserIcon className="w-3 h-3" />
                    </div>
                    <span className="font-bold text-slate-700 font-sans text-[11px]">{peer.name}</span>
                    <StatusBadge status={peer.status} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: TACTICAL VECTOR MAP */}
        {activeTab === 'map' && (
          <div className="h-[520px] animate-fadeIn">
            <TacticalMap 
              officers={[user, ...peers]}
              incidents={incidents}
              currentOfficerLocation={currentLocation}
            />
          </div>
        )}

        {/* TAB 3: PTT RADIO COMMS */}
        {activeTab === 'ptt' && (
          <div className="max-w-md mx-auto space-y-6 animate-fadeIn">
            <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm flex flex-col items-center gap-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-sky-500 to-blue-600" />
              
              <div className="w-full flex justify-between items-center border-b border-slate-100 pb-3">
                <span className="font-sans text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <RadioTower className="w-4 h-4 text-sky-600 animate-pulse" />
                  Kurnool Police Broadcast Channel
                </span>
                <span className="text-[10px] font-sans text-sky-700 font-extrabold bg-sky-50 px-3 py-1 rounded-xl border border-sky-100/50 shadow-sm">
                  {radioChannel.toUpperCase()} CHANNEL
                </span>
              </div>

              {/* Channel Selector */}
              <div className="w-full grid grid-cols-5 gap-1.5 select-none font-mono">
                {(['Alpha', 'Bravo', 'Charlie', 'Delta', 'Command'] as const).map(ch => (
                  <button
                    key={ch}
                    onClick={() => setRadioChannel(ch)}
                    className={`py-2 border text-[9px] rounded-xl font-bold transition active:scale-95 cursor-pointer ${
                      radioChannel === ch 
                        ? 'border-sky-500 bg-sky-500 text-white shadow-md' 
                        : 'border-slate-200 bg-slate-50 text-slate-450 hover:bg-slate-100'
                    }`}
                  >
                    {ch.substring(0, 4).toUpperCase()}
                  </button>
                ))}
              </div>

              {/* Wave visualizer */}
              <div className="h-16 flex items-center justify-center gap-2 w-full max-w-[280px] bg-slate-50 rounded-2xl border border-slate-100 px-4 py-2 shadow-inner">
                {waveHeights.map((ht, i) => (
                  <span 
                    key={i} 
                    className={`w-2 bg-sky-500 rounded-full transition-all duration-150 ${
                      isPttActive 
                        ? 'opacity-100 shadow-[0_0_8px_#0EA5E9]' 
                        : 'opacity-15'
                    }`}
                    style={{ 
                      height: `${ht}px`
                    }}
                  />
                ))}
              </div>

              {/* Hold to talk push trigger button */}
              <div className="relative p-3 bg-slate-100/50 border border-slate-200/50 rounded-full shadow-inner mb-2">
                <button
                  onMouseDown={handlePttStart}
                  onMouseUp={handlePttEnd}
                  onTouchStart={handlePttStart}
                  onTouchEnd={handlePttEnd}
                  className={`w-38 h-38 rounded-full border-[7px] flex flex-col items-center justify-center gap-2.5 transition duration-200 select-none cursor-pointer active:scale-95 ${
                    isPttActive
                      ? 'bg-sky-500 border-sky-300 text-white shadow-[0_12px_40px_rgba(14,165,233,0.35)]'
                      : 'bg-white border-slate-100 text-sky-700 hover:bg-slate-50 hover:border-slate-200 shadow-md'
                  }`}
                >
                  <Radio className={`w-9 h-9 transition ${isPttActive ? 'animate-pulse text-white' : 'text-sky-600'}`} />
                  <span className="font-sans text-[10px] font-black uppercase tracking-widest">
                    {isPttActive ? 'PTT ACTIVE' : 'HOLD TO TALK'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: MESH CHAT */}
        {activeTab === 'messages' && (
          <div className="max-w-xl mx-auto bg-white border border-slate-100 rounded-3xl p-5 shadow-sm h-[500px] flex flex-col justify-between overflow-hidden relative animate-fadeIn">
            
            <div className="flex justify-between items-center border-b border-slate-100 pb-3 mb-3">
              <span className="font-sans text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-sky-600" />
                Operations Group Chat
              </span>
              <span className="text-[9px] font-sans text-emerald-600 font-extrabold bg-emerald-50 px-3 py-1 border border-emerald-100/50 rounded-full shadow-sm">
                TEAM SECURE
              </span>
            </div>

            {/* Chat bubbles */}
            <div className="flex-1 overflow-y-auto space-y-3.5 pr-2 py-2 text-xs font-sans">
              {chatMessages.map(msg => {
                const isMe = msg.senderId === user.id;
                return (
                  <div 
                    key={msg.id} 
                    className={`flex flex-col max-w-[82%] ${
                      isMe ? 'ml-auto items-end' : 'mr-auto items-start'
                    }`}
                  >
                    <div className={`p-3.5 rounded-2xl leading-relaxed text-[12px] shadow-sm ${
                      isMe 
                        ? 'bg-gradient-to-br from-sky-500 to-sky-600 text-white rounded-tr-sm' 
                        : 'bg-slate-100 border border-slate-150 text-slate-700 rounded-tl-sm'
                    }`}>
                      <p className="font-medium">{msg.body}</p>
                    </div>
                    <div className="flex items-center gap-1.5 text-[8px] text-slate-400 mt-1.5 select-none font-bold font-mono">
                      <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      {isMe && (
                        <CheckCheck className={`w-3.5 h-3.5 ${msg.syncStatus === 'delivered' ? 'text-emerald-500' : 'text-slate-350'}`} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Message input */}
            <div className="flex flex-col gap-2.5 border-t border-slate-100 pt-4 mt-3">
              <select
                value={selectedRecipient}
                onChange={(e) => setSelectedRecipient(e.target.value)}
                className="bg-slate-700 border border-slate-600 text-white rounded-xl px-3 py-2 text-xs focus:outline-none w-full"
              >
                <option value="all">Broadcast: All (Team)</option>
                <option value="hq">Direct: Headquarters</option>
                {peers.map(peer => (
                  <option key={peer.id} value={peer.id}>Direct: Officer {peer.name}</option>
                ))}
              </select>
              <div className="flex gap-2.5 w-full">
                <input 
                  type="text" 
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  placeholder={selectedRecipient === 'all' ? "Broadcast mesh text..." : "Direct message..."}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSendMessage();
                  }}
                  className="flex-1 bg-slate-50 border border-slate-200 px-4 py-3 rounded-2xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:bg-white transition-all shadow-inner min-w-0"
                />
                <button
                  onClick={handleSendMessage}
                  className="p-3 bg-sky-500 hover:bg-sky-600 text-white rounded-2xl transition flex-shrink-0 flex items-center justify-center cursor-pointer active:scale-95 shadow-md"
                >
                  <Send className="w-4.5 h-4.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: EVIDENCE CAMERA VIEW FINDER */}
        {activeTab === 'evidence' && (
          <div className="max-w-md mx-auto space-y-6 animate-fadeIn">
            <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <span className="font-sans text-xs font-black text-slate-800 uppercase flex items-center gap-2">
                  <Camera className="w-4 h-4 text-sky-600 animate-pulse" />
                  Secure Cryptographic Camera Feed
                </span>
                <span className="text-[9px] font-mono text-slate-400 font-extrabold bg-slate-50 border border-slate-150 px-2 py-0.5 rounded-md">SHA-256</span>
              </div>

              {/* Viewfinder Mockup */}
              <div className="h-56 border border-slate-850 rounded-2xl bg-slate-950 relative overflow-hidden flex items-center justify-center shadow-lg">
                
                {/* Crop marks */}
                <div className="absolute top-4 left-4 w-5 h-5 border-t-2 border-l-2 border-white/50 pointer-events-none z-10" />
                <div className="absolute top-4 right-4 w-5 h-5 border-t-2 border-r-2 border-white/50 pointer-events-none z-10" />
                <div className="absolute bottom-4 left-4 w-5 h-5 border-b-2 border-l-2 border-white/50 pointer-events-none z-10" />
                <div className="absolute bottom-4 right-4 w-5 h-5 border-b-2 border-r-2 border-white/50 pointer-events-none z-10" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 border border-dashed border-white/35 pointer-events-none z-10" />
                
                {/* Live stream */}
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  muted
                  className="absolute inset-0 w-full h-full object-cover transform scale-x-[-1]"
                />

                {isCapturing && (
                  <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center gap-2.5 z-20">
                    <RefreshCw className="w-8 h-8 text-sky-500 animate-spin" />
                    <span className="font-mono text-[9px] text-sky-450 font-black uppercase tracking-widest animate-pulse">Hashing Image Integrity...</span>
                  </div>
                )}

                {capturedThumbnail && (
                  <div className="absolute inset-0 bg-emerald-500/90 flex flex-col items-center justify-center gap-1.5 z-30 animate-fadeIn">
                    <CheckCheck className="w-9 h-9 text-white animate-bounce" />
                    <span className="font-sans text-[10px] text-white font-black uppercase tracking-widest">Integrity Hash Confirmed</span>
                  </div>
                )}
              </div>
              
              <div className="space-y-2">
                <span className="text-[9px] font-sans text-slate-400 font-extrabold uppercase tracking-wider block">Evidence Log Description</span>
                <input
                  type="text"
                  value={evidenceDesc}
                  onChange={(e) => setEvidenceDesc(e.target.value)}
                  placeholder="Describe evidence or zone incident..."
                  className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-2xl text-xs text-slate-805 placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:bg-white shadow-inner transition duration-200"
                />
              </div>

              <TacticalButton
                variant="primary"
                glow
                onClick={handleCaptureEvidence}
                disabled={isCapturing}
                className="w-full py-3 rounded-2xl text-xs"
              >
                SNAP & BROADCAST
              </TacticalButton>
            </div>

            {/* Evidence Roster */}
            {evidenceList.length > 0 && (
              <div className="space-y-2.5">
                <span className="font-sans text-[10px] text-slate-400 uppercase tracking-widest font-black block">Evidence Broadcast Logs ({evidenceList.length})</span>
                {evidenceList.map(ev => (
                  <div key={ev.id} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm text-xs space-y-2 font-mono">
                    <div className="flex justify-between items-center font-bold text-slate-800">
                      <span className="truncate font-sans font-black">LOG: {ev.description}</span>
                      <span className={`px-2.5 py-0.5 border rounded-full text-[8px] font-black ${
                        ev.syncStatus === 'delivered' ? 'border-emerald-200 bg-emerald-50 text-emerald-600' : 'border-sky-200 bg-sky-50 text-sky-600 animate-pulse'
                      }`}>
                        {ev.syncStatus?.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-[9px] text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-150/50 select-all truncate">
                      SHA-256: {ev.hash}
                    </div>
                    <div className="flex justify-between text-[9px] text-slate-400 pt-1 font-sans font-bold">
                      <span>TIME: {new Date(ev.timestamp).toLocaleTimeString()}</span>
                      <span>LAT: {ev.locationLat?.toFixed(4)} LNG: {ev.locationLng?.toFixed(4)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </main>

      {/* BOTTOM NAVIGATION BAR */}
      <nav className="fixed bottom-0 left-0 right-0 h-20 bg-white/80 backdrop-blur-xl border-t border-slate-200/60 flex items-center justify-around pb-5 z-40 shadow-[0_-8px_30px_rgba(0,0,0,0.06)] select-none">
        {[
          { id: 'home', label: 'Home', icon: Shield },
          { id: 'map', label: 'Map', icon: MapIcon },
          { id: 'ptt', label: 'Radio', icon: Radio },
          { id: 'messages', label: 'Chat', icon: MessageSquare },
          { id: 'evidence', label: 'Camera', icon: Camera }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className="flex flex-col items-center justify-center flex-1 h-full text-[9px] tracking-widest cursor-pointer transition active:scale-90 relative"
            >
              {isActive && (
                <span className="absolute top-2 w-12 h-8 bg-sky-50 border border-sky-100 rounded-xl z-0 animate-scaleUp" />
              )}
              
              <Icon className={`w-5 h-5 mb-1 transition z-10 ${isActive ? 'text-sky-600' : 'text-slate-400'}`} />
              <span className={`z-10 tracking-widest uppercase text-[8px] ${isActive ? 'text-sky-700 font-black' : 'text-slate-400 font-extrabold'}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
