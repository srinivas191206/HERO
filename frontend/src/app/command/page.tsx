'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { HUDPanel } from '../../components/ui/HUDPanel';
import { TacticalButton } from '../../components/ui/TacticalButton';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { DisasterModeBanner } from '../../components/shared/DisasterModeBanner';
import { TacticalMap } from '../../components/shared/TacticalMap';
import { Hero3DGisView, FlyTo3DTarget } from '../../components/shared/Hero3DGisView';
import { getTacticalFacilitiesForDistrict, matchApDistrict } from '../../utils/apDistricts';
import { clientEventBus } from '../../services/events/EventBus';
import { 
  ShieldAlert, Activity, Users, Radio, MessageSquare, Database, 
  Map as MapIcon, Key, FileText, Settings, LogOut, RadioTower, 
  AlertTriangle, Navigation, Clock, ShieldCheck, HelpCircle, UserCheck, RefreshCw,
  Send, CheckCheck, BellOff, Camera, Wifi, PhoneCall, Siren, Bot, ChevronDown, List, MoreVertical, Trash2, Grid, Download, Laptop, Plus, UploadCloud, ArrowLeft, CheckCircle2, Globe2, Compass
} from 'lucide-react';
import { User, Incident, AuditLog, Message } from '../../types';
import { clientCommunicationEngine } from '../../services/communication/CommunicationEngine';
import { SupabaseStateClient } from '../../services/cloud/SupabaseStateClient';

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
  const { user, logout, token, authMode, isAuthenticated, isLoading, isForcedOffline, simulateOfflineToggle } = useAuth();
  const { isOnline, activeAlerts, clearAlerts, queueSize } = useApp();

  const [activeDistrictId, setActiveDistrictId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<{
    districtName: string;
    districtCode: string;
    districtStatus: string;
    pendingCount: number;
    lastSyncAt: number | null;
    cloudConfigured: boolean;
    availableDistricts?: Array<{ id: string; code: string; name: string; status: string; center_lat?: number; center_lng?: number }>;
  } | null>(null);
  const [lanIPs, setLanIPs] = useState<string[]>([]);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [showNewIncidentForm, setShowNewIncidentForm] = useState(false);
  const [newIncTitle, setNewIncTitle] = useState('');
  const [newIncDesc, setNewIncDesc] = useState('');
  const [newIncPriority, setNewIncPriority] = useState<'P1' | 'P2' | 'P3' | 'P4'>('P2');

  // District Personnel Deployment (Batch by count or Single officer)
  const [deployCount, setDeployCount] = useState<number>(5);
  const [deployPin, setDeployPin] = useState<string>('police');
  const [singleBadge, setSingleBadge] = useState<string>('');
  const [singleName, setSingleName] = useState<string>('');
  const [singlePin, setSinglePin] = useState<string>('police');
  const [generatedPins, setGeneratedPins] = useState<Record<string, string>>({});
  const [deployNotice, setDeployNotice] = useState<string | null>(null);

  const [initialIncidentId, setInitialIncidentId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const qDist = params.get('districtId');
      const qInc = params.get('incidentId');
      if (qDist) setActiveDistrictId(qDist);
      if (qInc) setInitialIncidentId(qInc);
    }
  }, []);

  const [activeTab, setActiveTab] = useState<string>('command');
  const [pending3dFlyTo, setPending3dFlyTo] = useState<FlyTo3DTarget | null>(null);
  const [officers, setOfficers] = useState<User[]>([]);
  const officersRef = useRef<User[]>([]);
  useEffect(() => {
    officersRef.current = officers;
  }, [officers]);
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
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeTab === 'messages') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, activeTab]);

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
      } else if (user?.role !== 'dispatcher' && user?.role !== 'state_admin') {
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

  const districtQuery = activeDistrictId ? `?districtId=${encodeURIComponent(activeDistrictId)}` : '';

  const fetchOperationsData = async () => {
    if (!token) return;
    try {
      if (authMode === 'cloud') {
        const targetDist = activeDistrictId || user?.districtId || 'd_eluru';
        const snap = await SupabaseStateClient.fetchDistrictSnapshot(token, targetDist);
        setOfficers(snap.officers);
        setIncidents(snap.incidents);
        if (initialIncidentId) {
          const matched = snap.incidents.find(i => i.id === initialIncidentId);
          if (matched) {
            setSelectedIncident(matched);
            setInitialIncidentId(null);
          }
        }
        setAuditLogs(snap.auditLogs);
        setChatMessages(snap.messages);
        setEvidenceLogs(snap.evidence);
        setSyncStatus({
          districtName: snap.district?.name || targetDist,
          districtCode: snap.district?.code || 'CLOUD',
          districtStatus: snap.district?.status || 'offline',
          pendingCount: 0,
          lastSyncAt: snap.district?.last_sync_at || null,
          cloudConfigured: true
        });
        setMetrics({
          total: snap.officers.length,
          online: snap.officers.filter(o => o.status !== 'Offline').length,
          offline: snap.officers.filter(o => o.status === 'Offline').length,
          sos: snap.officers.filter(o => o.status === 'Emergency').length,
          incidents: snap.incidents.length
        });
        return;
      }

      const offResponse = await fetch(`${getBackendUrl()}/api/officers${districtQuery}`, {
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

      const incResponse = await fetch(`${getBackendUrl()}/api/incidents${districtQuery}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (incResponse.ok) {
        const data = await incResponse.json();
        setIncidents(data);
        setMetrics(prev => ({ ...prev, incidents: data.length }));

        if (initialIncidentId) {
          const targetInc = data.find((i: Incident) => i.id === initialIncidentId);
          if (targetInc) {
            setSelectedIncident(targetInc);
            setInitialIncidentId(null);
          }
        } else if (selectedIncident) {
          const fresh = data.find((i: Incident) => i.id === selectedIncident.id);
          if (fresh) setSelectedIncident(fresh);
        }
      }

      const auditResponse = await fetch(`${getBackendUrl()}/api/audit-logs${districtQuery}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (auditResponse.ok) {
        const data = await auditResponse.json();
        setAuditLogs(data);
      }

      const msgResponse = await fetch(`${getBackendUrl()}/api/messages${districtQuery}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (msgResponse.ok) {
        const data = await msgResponse.json();
        setChatMessages(data);
      }

      const evResponse = await fetch(`${getBackendUrl()}/api/evidence${districtQuery}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (evResponse.ok) {
        const data = await evResponse.json();
        setEvidenceLogs(data);
      }

      const syncResponse = await fetch(`${getBackendUrl()}/api/sync/status${districtQuery}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (syncResponse.ok) {
        setSyncStatus(await syncResponse.json());
      }

      const healthRes = await fetch(`${getBackendUrl()}/health`);
      if (healthRes.ok) {
        const healthData = await healthRes.json();
        setLanIPs(healthData.lanIPs || []);
      }

    } catch (err) {
      console.error('Failed to sync dispatcher telemetry feeds:', err);
    }
  };

  // Switch Socket.IO district room immediately whenever activeDistrictId changes
  useEffect(() => {
    if (!activeDistrictId || authMode !== 'local') return;
    const transport = clientCommunicationEngine.getTransport() as any;
    if (transport?.switchDistrict) {
      transport.switchDistrict(activeDistrictId);
    }
  }, [activeDistrictId, authMode]);

  // Poll database parameters
  useEffect(() => {
    if (!token) return;
    fetchOperationsData();
    const interval = setInterval(fetchOperationsData, 8000);
    return () => clearInterval(interval);
  }, [token, selectedIncident, activeDistrictId]);

  // Subscribe to real-time events on the mesh Event Bus (stable subscription for zero-latency SOS & live GPS)
  useEffect(() => {
    const handleStatusChange = (data: { userId: string; status: any; lastHeartbeat?: number }) => {
      if (!data?.userId) return;
      setOfficers(prev => {
        const next = prev.map(off =>
          off.id === data.userId
            ? { ...off, status: data.status, lastHeartbeat: data.lastHeartbeat || Date.now() }
            : off
        );
        setMetrics(m => ({
          ...m,
          online: next.filter(o => o.status !== 'Offline').length,
          offline: next.filter(o => o.status === 'Offline').length,
          sos: next.filter(o => o.status === 'Emergency').length
        }));
        return next;
      });
    };

    const handleTelemetry = (data: {
      userId: string;
      battery?: number;
      status?: any;
      networkQuality?: string;
      location?: { lat: number; lng: number; heading?: number; speed?: number; accuracy?: number } | null;
      lastHeartbeat?: number;
    }) => {
      if (!data?.userId) return;
      const now = data.lastHeartbeat || Date.now();
      setOfficers(prev =>
        prev.map(off =>
          off.id === data.userId
            ? {
                ...off,
                battery: data.battery ?? off.battery,
                status: data.status ?? off.status,
                lastHeartbeat: now,
                location: data.location
                  ? {
                      latitude: data.location.lat,
                      longitude: data.location.lng,
                      heading: data.location.heading ?? null,
                      speed: data.location.speed ?? null,
                      accuracy: data.location.accuracy ?? null,
                      networkQuality: data.networkQuality ?? null,
                      timestamp: now
                    }
                  : off.location
              }
            : off
        )
      );
    };

    const handleSos = (data: { incident?: Incident; officerId?: string }) => {
      alarmManuallyMutedRef.current = false;
      playLoopingSiren();

      if (data?.incident) {
        setIncidents(prev => {
          if (prev.some(i => i.id === data.incident!.id)) return prev;
          const next = [data.incident!, ...prev];
          setMetrics(m => ({ ...m, incidents: next.length }));
          return next;
        });
        setSelectedIncident(data.incident);
      }

      if (data?.officerId) {
        setOfficers(prev => {
          const next = prev.map(off =>
            off.id === data.officerId
              ? {
                  ...off,
                  status: 'Emergency' as const,
                  lastHeartbeat: Date.now(),
                  location:
                    data.incident?.locationLat != null && data.incident?.locationLng != null
                      ? {
                          latitude: data.incident.locationLat,
                          longitude: data.incident.locationLng,
                          timestamp: Date.now()
                        }
                      : off.location
                }
              : off
          );
          setMetrics(m => ({
            ...m,
            sos: next.filter(o => o.status === 'Emergency').length,
            online: next.filter(o => o.status !== 'Offline').length
          }));
          return next;
        });
      }
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
        const officer = officersRef.current.find(o => o.id === ev.officerId);
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
  }, [user?.id]);

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

  if (isLoading || !user || (user.role !== 'dispatcher' && user.role !== 'state_admin')) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 font-sans text-xs uppercase tracking-widest text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin text-sky-600 mb-2" />
        <span>Authorizing Command Node Configs...</span>
      </div>
    );
  }

  const handleTriggerCloudSync = async () => {
    if (!token) return;
    setSyncMessage('Syncing district queue to State Cloud...');
    try {
      const res = await fetch(`${getBackendUrl()}/api/sync/trigger${districtQuery}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setSyncMessage(`Synced ${data.pushedCount} items to State Cloud.`);
      } else {
        setSyncMessage(data.error || 'Offline: queued locally until internet returns.');
      }
      fetchOperationsData();
    } catch {
      setSyncMessage('Offline: buffered locally in SQLite.');
    } finally {
      setTimeout(() => setSyncMessage(null), 4000);
    }
  };

  const handleCreateIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !newIncTitle.trim()) return;
    try {
      const res = await fetch(`${getBackendUrl()}/api/incidents${districtQuery}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          title: newIncTitle.trim(),
          description: newIncDesc.trim(),
          priority: newIncPriority
        })
      });
      if (res.ok) {
        setNewIncTitle('');
        setNewIncDesc('');
        setShowNewIncidentForm(false);
        fetchOperationsData();
      }
    } catch (err) {
      console.error('Failed to create incident:', err);
    }
  };

  const handleUpdateIncidentStatus = async (incidentId: string, status: 'Resolved' | 'Closed') => {
    if (!token) return;
    try {
      const res = await fetch(`${getBackendUrl()}/api/incidents/${incidentId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        fetchOperationsData();
      }
    } catch (err) {
      console.error('Failed to update incident status:', err);
    }
  };

  const handleVerifyEvidence = async (evidenceId: string) => {
    if (!token) return;
    try {
      const res = await fetch(`${getBackendUrl()}/api/evidence/${evidenceId}/verify`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const result = await res.json();
        setDispatchSuccess(
          result.verified
            ? `SHA-256 Integrity Verified (${result.computedHash.slice(0, 12)}...)`
            : `INTEGRITY MISMATCH DETECTED!`
        );
        fetchOperationsData();
        setTimeout(() => setDispatchSuccess(null), 4000);
      }
    } catch (err) {
      console.error('Evidence verification error:', err);
    }
  };

  const handleBatchDeployOfficers = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setDeployNotice(null);
    const targetDist = activeDistrictId || user.districtId || 'd_eluru';
    try {
      let created: Array<{ badgeNumber: string; pin: string }> = [];
      if (authMode === 'cloud') {
        created = await SupabaseStateClient.batchDeployOfficers(token, {
          districtId: targetDist,
          count: deployCount,
          defaultPin: deployPin || 'police'
        });
      } else {
        const res = await fetch(`${getBackendUrl()}/api/officers/batch${districtQuery}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            districtId: targetDist,
            count: deployCount,
            defaultPin: deployPin || 'police'
          })
        });
        const data = await res.json();
        if (!res.ok) {
          setDeployNotice(data.error || 'Failed to deploy officers.');
          return;
        }
        created = data.created || [];
      }

      const nextMap: Record<string, string> = { ...generatedPins };
      for (const c of created) {
        nextMap[c.badgeNumber.toLowerCase()] = c.pin;
      }
      setGeneratedPins(nextMap);
      setDeployNotice(`Generated ${created.length} officers (${created.map(c => c.badgeNumber).join(', ')}) with PIN "${deployPin || 'police'}".`);
      fetchOperationsData();
    } catch (err: any) {
      setDeployNotice(err?.message || 'Failed to generate officers.');
    }
  };

  const handleAddSingleOfficer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !singleBadge.trim() || !singleName.trim()) return;
    setDeployNotice(null);
    const targetDist = activeDistrictId || user.districtId || 'd_eluru';
    try {
      if (authMode === 'cloud') {
        await SupabaseStateClient.assignUser(token, {
          badgeNumber: singleBadge.trim(),
          name: singleName.trim(),
          pin: singlePin || 'police',
          role: 'officer',
          districtId: targetDist
        });
      } else {
        const res = await fetch(`${getBackendUrl()}/api/officers${districtQuery}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            badgeNumber: singleBadge.trim(),
            name: singleName.trim(),
            pin: singlePin || 'police',
            districtId: targetDist
          })
        });
        const data = await res.json();
        if (!res.ok) {
          setDeployNotice(data.error || 'Failed to add officer.');
          return;
        }
      }
      setGeneratedPins(prev => ({ ...prev, [singleBadge.trim().toLowerCase()]: singlePin || 'police' }));
      setDeployNotice(`Added officer ${singleName.trim()} (PID: ${singleBadge.trim()}, PIN: ${singlePin || 'police'}).`);
      setSingleBadge('');
      setSingleName('');
      fetchOperationsData();
    } catch (err: any) {
      setDeployNotice(err?.message || 'Failed to add officer.');
    }
  };

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

  const activeDistrictMeta = (() => {
    const d = syncStatus?.availableDistricts?.find(x => x.id === (activeDistrictId || user?.districtId));
    const ap = matchApDistrict(d?.name || syncStatus?.districtName || d?.code || syncStatus?.districtCode);
    const lat = d?.center_lat ?? ap?.centerLat ?? 17.0146;
    const lng = d?.center_lng ?? ap?.centerLng ?? 81.1826;
    const name = ap?.district || d?.name || syncStatus?.districtName || 'Eluru';
    const code = d?.code || syncStatus?.districtCode || ap?.code || 'ELR';
    return { name, code, lat, lng };
  })();

  const inspectTargetIn3D = (target: FlyTo3DTarget) => {
    setPending3dFlyTo({
      ...target,
      districtName: target.districtName || activeDistrictMeta.name
    });
    setActiveTab('gis3d');
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
    <div className="flex-1 flex flex-col bg-slate-50 min-h-screen text-slate-800 font-sans relative">
      {/* Top System Connection Status Bar */}
      <div className="bg-white border-b border-slate-200/80 px-6 py-2 flex flex-wrap items-center justify-between gap-3 text-[11px] font-bold tracking-wider z-20">
        <div className="flex flex-wrap items-center gap-5">
          {user.role === 'state_admin' && (
            <button
              onClick={() => router.push('/admin')}
              className="text-sky-700 hover:text-sky-900 bg-sky-50 border border-sky-200 px-2.5 py-1 rounded-full text-[10px] font-black flex items-center gap-1 cursor-pointer"
            >
              <ArrowLeft className="w-3 h-3" />
              STATE PORTAL
            </button>
          )}
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-black uppercase text-[10px]">ACTIVE DISTRICT:</span>
            <select
              value={activeDistrictId || user.districtId || 'd_eluru'}
              onChange={async (e) => {
                const nextDist = e.target.value;
                setActiveDistrictId(nextDist);
                if (authMode === 'local' && token) {
                  await fetch(`${getBackendUrl()}/api/sync/set-active-district`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ districtId: nextDist })
                  }).catch(() => {});
                }
              }}
              className="bg-slate-100 border border-slate-200 text-slate-800 px-2.5 py-0.5 rounded-full text-[10px] font-black focus:outline-none cursor-pointer"
            >
              {(syncStatus?.availableDistricts?.length
                ? syncStatus.availableDistricts
                : [{ id: user.districtId || 'd_eluru', code: syncStatus?.districtCode || 'ELR', name: syncStatus?.districtName || 'Eluru District Hub' }]
              ).map(d => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.code})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-black uppercase text-[10px]">LINK STATE:</span>
            <span className={`font-black flex items-center gap-1.5 uppercase text-[10px] ${isOnline ? 'text-emerald-600' : 'text-red-600'}`}>
              <span className={`w-2 h-2 rounded-full inline-block ${isOnline ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_#10B981]' : 'bg-red-500'}`} />
              {isOnline ? 'CONNECTED' : 'DISCONNECTED'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-black uppercase text-[10px]">STATE SHARE-POINT QUEUE:</span>
            <span className="bg-sky-100 text-sky-700 px-2.5 py-0.5 rounded-full font-black text-[10px]">
              {(syncStatus?.pendingCount ?? 0) + queueSize} PENDING
            </span>
            <button
              onClick={handleTriggerCloudSync}
              className="px-2.5 py-0.5 rounded-full bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-[10px] font-black flex items-center gap-1 cursor-pointer"
              title="Push offline SQLite records to State Supabase Cloud"
            >
              <UploadCloud className="w-3 h-3" />
              SYNC TO STATE
            </button>
          </div>

          {lanIPs.length > 0 && (
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-600">
              <span className="text-slate-400 font-sans font-black uppercase">FIELD LAN IP:</span>
              <span className="bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-lg font-bold text-slate-800 select-all">
                {lanIPs[0]}:5001
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {syncMessage && (
            <span className="text-[10px] font-mono text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-200">
              {syncMessage}
            </span>
          )}
          <span className="text-slate-400 font-black uppercase text-[10px]">BLACKOUT CONTROL:</span>
          <button 
            onClick={() => simulateOfflineToggle(!isForcedOffline)}
            className={`px-3 py-1 rounded-full text-[10px] font-extrabold transition cursor-pointer flex items-center gap-1.5 active:scale-95 border ${
              isForcedOffline
                ? 'bg-red-600 text-white border-red-600'
                : 'text-red-500 hover:text-red-600 bg-red-50 hover:bg-red-100 border-red-200'
            }`}
          >
            <RadioTower className="w-3 h-3" />
            {isForcedOffline ? 'RESTORE LINK' : 'GO OFFLINE'}
          </button>
        </div>
      </div>

      {/* SECURE HEADER GAUGE */}
      <header className="border-b border-slate-200 bg-white px-6 py-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs z-10">
        <div className="flex items-center gap-3.5">
          <div className="bg-white p-1.5 rounded-xl border border-slate-200 shadow-xs flex-shrink-0">
            <img src="/ap-police-logo.png" className="w-9 h-9 object-contain" alt="AP Police Logo" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-black tracking-tight text-slate-800 uppercase font-sans leading-none">
                {syncStatus?.districtName || 'DISTRICT COMMAND CENTER'}
              </h1>
              <span className="text-[9px] px-2.5 py-0.5 border border-sky-200 bg-sky-50 text-sky-700 font-black uppercase tracking-wider rounded-full">
                {syncStatus?.districtCode || 'HQ'} CONTROL DECK
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-1 font-semibold">
              <span>Hybrid Emergency Response & Operations</span>
              <span>•</span>
              <span>Operator: {user?.name || 'Command Center (Admin)'}</span>
              <span>•</span>
              <span className="text-slate-500">Link: <strong className="text-slate-700">Secure</strong></span>
            </div>
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
            className="p-2 border border-slate-200 bg-white hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-xl transition cursor-pointer shadow-xs"
            title="Disconnect dispatcher terminal"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Dashboard Metrics Bar (5 Telemetry Cards in 1 row) */}
      <section className="bg-white/80 border-b border-slate-200 px-6 py-4 grid grid-cols-2 sm:grid-cols-5 gap-4">
        {/* Card 1: TOTAL FORCE */}
        <div className="bg-white border border-slate-200 p-4 rounded-2xl flex items-center gap-3.5 shadow-xs hover:border-slate-300 transition">
          <div className="w-11 h-11 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 flex-shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[9px] text-slate-400 font-black uppercase tracking-wider block">TOTAL FORCE</span>
            <span className="text-2xl font-black text-slate-800 leading-tight block">{metrics.total}</span>
            <span className="text-[9.5px] text-slate-400 font-bold block">Registered Personnel</span>
          </div>
        </div>

        {/* Card 2: ACTIVE ONLINE */}
        <div className="bg-white border border-slate-200 p-4 rounded-2xl flex items-center gap-3.5 shadow-xs hover:border-slate-300 transition">
          <div className="w-11 h-11 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 flex-shrink-0">
            <Wifi className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[9px] text-slate-400 font-black uppercase tracking-wider block">ACTIVE ONLINE</span>
            <span className="text-2xl font-black text-emerald-600 leading-tight block">{metrics.online}</span>
            <span className="text-[9.5px] text-slate-400 font-bold block">Pings Active</span>
          </div>
        </div>

        {/* Card 3: OFFLINE NODES */}
        <div className="bg-white border border-slate-200 p-4 rounded-2xl flex items-center gap-3.5 shadow-xs hover:border-slate-300 transition">
          <div className="w-11 h-11 rounded-2xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 flex-shrink-0">
            <Radio className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[9px] text-slate-400 font-black uppercase tracking-wider block">OFFLINE NODES</span>
            <span className="text-2xl font-black text-purple-600 leading-tight block">{metrics.offline}</span>
            <span className="text-[9.5px] text-slate-400 font-bold block">Out of Reach</span>
          </div>
        </div>

        {/* Card 4: SOS EMERGENCIES */}
        <div className="bg-white border border-slate-200 p-4 rounded-2xl flex items-center gap-3.5 shadow-xs hover:border-slate-300 transition">
          <div className="w-11 h-11 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 flex-shrink-0">
            <PhoneCall className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[9px] text-slate-400 font-black uppercase tracking-wider block">SOS EMERGENCIES</span>
            <span className={`text-2xl font-black leading-tight block ${metrics.sos > 0 ? 'text-red-600 animate-pulse' : 'text-slate-800'}`}>{metrics.sos}</span>
            <span className="text-[9.5px] text-slate-400 font-bold block">P1 Calls Active</span>
          </div>
        </div>

        {/* Card 5: ACTIVE INCIDENTS */}
        <div className="bg-white border border-slate-200 p-4 rounded-2xl flex items-center gap-3.5 shadow-xs hover:border-slate-300 transition">
          <div className="w-11 h-11 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center text-red-600 flex-shrink-0">
            <Siren className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[9px] text-slate-400 font-black uppercase tracking-wider block">ACTIVE INCIDENTS</span>
            <span className="text-2xl font-black text-red-600 leading-tight block">{metrics.incidents}</span>
            <span className="text-[9.5px] text-slate-400 font-bold block">Assigned / Open</span>
          </div>
        </div>
      </section>

      {/* Main Workspace */}
      <section className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        
        {/* Left Side Navigation Sidebar */}
        <aside className="w-full lg:w-64 border-b lg:border-b-0 lg:border-r border-slate-200 bg-white/70 flex flex-col justify-between p-4 shadow-xs z-10">
          <div className="space-y-1">
            <span className="text-[9px] text-slate-400 uppercase tracking-widest px-3 mb-3 block font-black">
              HQ TERMINAL CHANNELS
            </span>
            {[
              { id: 'command', label: 'Tactical HUD', icon: Activity },
              { id: 'map', label: 'Command Radar Map', icon: MapIcon },
              { id: 'gis3d', label: '3D GIS Explorer', icon: Globe2 },
              { id: 'officers', label: 'Personnel Deployed', icon: Users },
              { id: 'incidents', label: 'Incident Desk', icon: ShieldAlert },
              { id: 'messages', label: 'Group Chat Sync', icon: MessageSquare },
              { id: 'evidence', label: 'Evidence Logs', icon: Camera },
              { id: 'audit', label: 'Security Audit Logs', icon: FileText }
            ].map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setSelectedIncident(null);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-xs font-bold uppercase tracking-wider text-left transition cursor-pointer ${
                    isActive 
                      ? 'bg-sky-50 text-sky-700 border-l-4 border-sky-500 shadow-[inset_0_0_12px_rgba(14,165,233,0.06)]' 
                      : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-sky-600' : 'text-slate-400'}`} />
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="space-y-3 pt-3 border-t border-slate-200/80">
            <div className="hidden lg:block space-y-1.5 text-[10px] font-black px-1">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block shadow-[0_0_6px_#10B981]" />
                  LINK STATUS
                </span>
                <span className="text-emerald-600 font-extrabold">● ONLINE</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">ACTIVE CHANNELS</span>
                <span className="text-sky-600 font-extrabold">5 ACTIVE CHANNELS</span>
              </div>
            </div>

            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 font-black flex items-center justify-center text-xs">
                  AD
                </div>
                <div>
                  <span className="font-bold text-xs text-slate-800 block leading-tight">Admin</span>
                  <span className="text-[10px] text-slate-400 font-semibold block">HQ Operator</span>
                </div>
              </div>
              <ChevronDown className="w-4 h-4 text-slate-400" />
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
            <div className="space-y-6">
              
              {/* Map (2/3) + Operations Dispatch Assistant (1/3) */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                
                {/* Map Panel */}
                <div className="xl:col-span-2">
                  <HUDPanel
                    title="Tactical Command Radar Map"
                    subtitle="Pulsing GPS Telemetry Feed"
                    className="h-[430px]"
                    headerRight={
                      <button
                        type="button"
                        onClick={() => setActiveTab('gis3d')}
                        className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 rounded-xl text-[10px] font-black uppercase flex items-center gap-1.5 cursor-pointer transition"
                      >
                        <Compass className="w-3.5 h-3.5" />
                        Open 3D GIS
                      </button>
                    }
                  >
                    <TacticalMap 
                      officers={officers}
                      incidents={incidents}
                      districtCenter={(() => {
                        const d = syncStatus?.availableDistricts?.find(x => x.id === (activeDistrictId || user.districtId));
                        return d?.center_lat != null && d?.center_lng != null ? { lat: d.center_lat, lng: d.center_lng } : null;
                      })()}
                      selectedIncidentId={selectedIncident?.id}
                      onSelectIncident={handleSelectIncidentId}
                      onDispatchOfficer={handleDispatch}
                      onInspectIn3D={inspectTargetIn3D}
                      isCommandCenter
                    />
                  </HUDPanel>
                </div>

                {/* Sidebar recommendation & details workspace */}
                <div>
                  {selectedIncident ? (
                    <HUDPanel 
                      title="Incident Dispatch Helper" 
                      subtitle="AI Backup Recommendations"
                      statusColor={selectedIncident.priority === 'P1' ? 'red' : 'amber'}
                      className="h-[430px]"
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
                            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
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
                    <HUDPanel title="Operations Dispatch Assistant" subtitle="System Recommendations" className="h-[430px]">
                      <div className="flex flex-col items-center justify-center h-full py-12 text-center text-xs text-slate-400 font-bold uppercase tracking-wide gap-3">
                        <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center text-slate-300">
                          <Bot className="w-8 h-8" />
                        </div>
                        <span className="max-w-[200px] leading-relaxed text-slate-400 text-[11px] font-semibold">
                          Select active incident on map or list to assist dispatching
                        </span>
                      </div>
                    </HUDPanel>
                  )}
                </div>

              </div>

              {/* Incidents desk list summary */}
              <div>
                <HUDPanel 
                  title="Operational Incident Desk" 
                  subtitle="Active Disaster Reports"
                  headerRight={
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowNewIncidentForm(!showNewIncidentForm)}
                        className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-[10px] font-black uppercase flex items-center gap-1 cursor-pointer transition"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Log Incident
                      </button>
                      <select 
                        value={priorityFilter}
                        onChange={(e) => setPriorityFilter(e.target.value)}
                        className="bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 focus:outline-none focus:border-sky-500 cursor-pointer"
                      >
                        <option value="all">All Priorities</option>
                        <option value="P1">P1 Critical</option>
                        <option value="P2">P2 Urgent</option>
                        <option value="P3">P3 Standard</option>
                        <option value="P4">P4 Low</option>
                      </select>

                      <button className="p-1.5 border border-slate-200 bg-white hover:bg-slate-50 rounded-xl text-slate-500 transition">
                        <List className="w-4 h-4" />
                      </button>
                    </div>
                  }
                >
                  {showNewIncidentForm && (
                    <form onSubmit={handleCreateIncident} className="mb-4 p-4 bg-slate-50 border border-slate-200 rounded-2xl grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                      <input
                        type="text"
                        required
                        placeholder="Incident title..."
                        value={newIncTitle}
                        onChange={e => setNewIncTitle(e.target.value)}
                        className="px-3 py-2 bg-white border border-slate-200 rounded-xl font-semibold focus:outline-none focus:border-sky-500"
                      />
                      <input
                        type="text"
                        placeholder="Details / location notes..."
                        value={newIncDesc}
                        onChange={e => setNewIncDesc(e.target.value)}
                        className="px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-sky-500"
                      />
                      <select
                        value={newIncPriority}
                        onChange={e => setNewIncPriority(e.target.value as any)}
                        className="px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold focus:outline-none focus:border-sky-500"
                      >
                        <option value="P1">P1 Critical</option>
                        <option value="P2">P2 Urgent</option>
                        <option value="P3">P3 Standard</option>
                        <option value="P4">P4 Low</option>
                      </select>
                      <button
                        type="submit"
                        className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-black uppercase rounded-xl cursor-pointer transition"
                      >
                        Create Incident
                      </button>
                    </form>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                     {incidents
                      .filter(inc => priorityFilter === 'all' || inc.priority === priorityFilter)
                      .map(inc => (
                        <div 
                          key={inc.id} 
                          onClick={() => setSelectedIncident(inc)}
                          className={`border p-4 rounded-2xl space-y-2.5 relative shadow-xs cursor-pointer transition ${
                              selectedIncident?.id === inc.id 
                              ? 'border-sky-400 bg-sky-50/60 shadow-[0_4px_20px_rgba(14,165,233,0.08)]' 
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <div className="flex justify-between items-center text-[10px]">
                            <span className={`px-2.5 py-0.5 rounded-full font-black ${
                              inc.priority === 'P1' ? 'bg-red-50 border border-red-200 text-red-600 animate-pulse' : 'bg-amber-50 border border-amber-200 text-amber-600'
                            }`}>
                              {inc.priority}
                            </span>
                            <span className="text-slate-400 font-mono font-bold">
                              {new Date(inc.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </span>
                          </div>
                          <h4 className="text-xs uppercase font-black text-slate-800 mt-1 font-sans">{inc.title}</h4>
                          <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed font-sans italic">"{inc.description}"</p>
                          
                          <div className="pt-2.5 border-t border-slate-100 flex justify-between items-center text-[10px] text-slate-500 font-sans font-bold">
                            <span>Reporter: {inc.reporterId}</span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  inspectTargetIn3D({
                                    id: inc.id,
                                    name: inc.title,
                                    lat: inc.locationLat ?? activeDistrictMeta.lat,
                                    lng: inc.locationLng ?? activeDistrictMeta.lng,
                                    kind: 'incident',
                                    levels: 4,
                                    description: inc.description
                                  });
                                }}
                                className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 cursor-pointer"
                                title="Fly 3D GIS camera to incident & inspect building floors"
                              >
                                3D Inspect
                              </button>
                              {inc.status !== 'Resolved' && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleUpdateIncidentStatus(inc.id, 'Resolved');
                                  }}
                                  className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 cursor-pointer"
                                >
                                  Resolve
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUpdateIncidentStatus(inc.id, 'Closed');
                                }}
                                className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 cursor-pointer"
                              >
                                Close
                              </button>
                              <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase ${
                                inc.status === 'Resolved' 
                                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-600' 
                                  : 'bg-sky-50 border border-sky-200 text-sky-600'
                              }`}>
                                {inc.status}
                              </span>
                            </div>
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
            <div className="space-y-3 animate-fadeIn">
              <div className="flex items-center justify-between bg-white border border-slate-200 rounded-2xl px-4 py-2.5">
                <div className="text-xs font-bold text-slate-700">
                  District Radar Map • {activeDistrictMeta.name} ({activeDistrictMeta.code})
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('gis3d')}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black uppercase flex items-center gap-1.5 cursor-pointer transition"
                >
                  <Globe2 className="w-3.5 h-3.5" />
                  Launch Full 3D GIS Explorer
                </button>
              </div>
              <div className="h-[540px]">
                <TacticalMap 
                  officers={officers}
                  incidents={incidents}
                  districtCenter={(() => {
                    const d = syncStatus?.availableDistricts?.find(x => x.id === (activeDistrictId || user.districtId));
                    return d?.center_lat != null && d?.center_lng != null ? { lat: d.center_lat, lng: d.center_lng } : null;
                  })()}
                  selectedIncidentId={selectedIncident?.id}
                  onSelectIncident={handleSelectIncidentId}
                  onDispatchOfficer={handleDispatch}
                  onInspectIn3D={inspectTargetIn3D}
                  isCommandCenter
                />
              </div>
            </div>
          )}

          {/* TAB 2B: FULL-HEIGHT 3D GIS & ULPIN FLOOR INSPECTOR */}
          {activeTab === 'gis3d' && (
            <div className="h-[calc(100vh-230px)] min-h-[600px] flex flex-col animate-fadeIn">
              <Hero3DGisView
                mode="district"
                districtName={activeDistrictMeta.name}
                districtCode={activeDistrictMeta.code}
                centerLat={activeDistrictMeta.lat}
                centerLng={activeDistrictMeta.lng}
                officers={officers}
                incidents={incidents}
                facilities={getTacticalFacilitiesForDistrict(
                  activeDistrictMeta.name,
                  activeDistrictMeta.lat,
                  activeDistrictMeta.lng
                )}
                pendingFlyTo={pending3dFlyTo}
                className="flex-1"
                onEntitySelectedFrom3D={(sel) => {
                  if (sel.kind === 'incident' && sel.id) {
                    handleSelectIncidentId(sel.id);
                  }
                }}
              />
            </div>
          )}

          {/* TAB 3: PERSONNEL DEPLOYMENTS */}
          {activeTab === 'officers' && (
            <div className="space-y-5">
              <HUDPanel title="DEPLOY / ADD POLICE OFFICERS" subtitle="Generate Officer Credentials by Count or Add Manually">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
                  <form onSubmit={handleBatchDeployOfficers} className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex flex-wrap items-end gap-2.5">
                    <div className="w-28">
                      <label className="text-[9px] font-black uppercase text-slate-500 block mb-1">Officer Count</label>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={deployCount}
                        onChange={e => setDeployCount(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono font-black focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div className="w-28">
                      <label className="text-[9px] font-black uppercase text-slate-500 block mb-1">Default PIN</label>
                      <input
                        type="text"
                        value={deployPin}
                        onChange={e => setDeployPin(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono font-bold focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-black uppercase rounded-xl cursor-pointer transition flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Generate {deployCount} PIDs
                    </button>
                  </form>

                  <form onSubmit={handleAddSingleOfficer} className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex flex-wrap items-end gap-2.5">
                    <div className="w-28">
                      <label className="text-[9px] font-black uppercase text-slate-500 block mb-1">Badge PID</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. p6"
                        value={singleBadge}
                        onChange={e => setSingleBadge(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono font-bold focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div className="flex-1 min-w-[120px]">
                      <label className="text-[9px] font-black uppercase text-slate-500 block mb-1">Officer Name</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Inspector Kiran"
                        value={singleName}
                        onChange={e => setSingleName(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-semibold focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div className="w-24">
                      <label className="text-[9px] font-black uppercase text-slate-500 block mb-1">PIN</label>
                      <input
                        type="text"
                        required
                        value={singlePin}
                        onChange={e => setSinglePin(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono font-bold focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase rounded-xl cursor-pointer transition flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Officer
                    </button>
                  </form>
                </div>
                {deployNotice && (
                  <div className="mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
                    {deployNotice}
                  </div>
                )}
              </HUDPanel>

              <HUDPanel title="DEPLOYED FIELD PERSONNEL REGISTRIES" subtitle="Heartbeat Tracking Telemetry & Credentials">
                <div className="overflow-hidden border border-slate-200/80 rounded-3xl bg-white shadow-xs">
                  <table className="w-full text-left font-sans text-xs border-collapse">
                    <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-400 uppercase tracking-wider text-[9.5px] font-black">
                      <tr>
                        <th className="py-3.5 px-4">BADGE PID</th>
                        <th className="py-3.5 px-4">OFFICER NAME</th>
                        <th className="py-3.5 px-4">ACCESS PIN</th>
                        <th className="py-3.5 px-4">SECTOR TEAM</th>
                        <th className="py-3.5 px-4">CURRENT STATUS</th>
                        <th className="py-3.5 px-4">BATTERY</th>
                        <th className="py-3.5 px-4">GPS COORDINATE</th>
                        <th className="py-3.5 px-4">LAST CHECK-IN</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {officers.map(off => {
                        const isLost = off.status === 'Lost Connection';
                        const isEmergency = off.status === 'Emergency';
                        const isOnline = off.status !== 'Offline' && !isLost;
                        const knownPin = generatedPins[(off.badgeNumber || '').toLowerCase()] || 'police (default)';

                        return (
                          <tr key={off.id} className="hover:bg-slate-50/80 transition duration-150">
                            <td className="py-4 px-4 font-black text-xs text-sky-600 font-mono">
                              {off.badgeNumber || 'p?'}
                            </td>
                            <td className="py-4 px-4 text-slate-800 font-extrabold text-xs">{off.name}</td>
                            <td className="py-4 px-4 font-mono text-[11px] font-bold text-slate-600">{knownPin}</td>
                            <td className="py-4 px-4 text-slate-500 font-medium text-xs">{off.teamName || 'Unassigned'}</td>
                            <td className="py-4 px-4">
                              {isLost ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase border border-amber-200 bg-amber-50 text-amber-600">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                  LOST CONNECTION
                                </span>
                              ) : isEmergency ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase border border-red-200 bg-red-50 text-red-600 animate-pulse">
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                  EMERGENCY
                                </span>
                              ) : isOnline ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase border border-emerald-200 bg-emerald-50 text-emerald-600">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                  ONLINE
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase border border-slate-200 bg-slate-100 text-slate-500">
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                  OFFLINE
                                </span>
                              )}
                            </td>
                            <td className="py-4 px-4 font-black text-emerald-600 text-xs">{off.battery}%</td>
                            <td className="py-4 px-4 text-slate-500 font-mono text-[11px] font-semibold">
                              {off.location?.latitude && off.location?.longitude ? `${off.location.latitude.toFixed(4)}, ${off.location.longitude.toFixed(4)}` : 'UNKNOWN'}
                            </td>
                            <td className="py-4 px-4 text-slate-500 font-mono text-[11px] font-semibold">
                              {off.lastHeartbeat ? new Date(off.lastHeartbeat).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Never'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </HUDPanel>
            </div>
          )}

          {/* TAB 4: INCIDENT MANAGEMENT DESK */}
          {activeTab === 'incidents' && (
            <HUDPanel title="FULL INCIDENT MANAGEMENT DESK" subtitle="Critical Operations Timeline History">
              <div className="space-y-5">
                {incidents.map(inc => {
                  const formattedTitle = inc.title.replace('Akshaya', 'Srujan').replace('Varun', 'Pravalika');
                  const formattedDesc = inc.description.replace('Akshaya', 'Srujan').replace('Varun', 'Pravalika');

                  return (
                    <div key={inc.id} className="relative pl-6 before:absolute before:left-2 before:top-4 before:bottom-0 before:w-0.5 before:bg-slate-200">
                      <span className="absolute left-[3px] top-3.5 w-2.5 h-2.5 rounded-full border-2 border-white bg-sky-500 shadow-xs" />
                      
                      <div className="border border-slate-200 bg-white rounded-3xl p-5 space-y-3.5 shadow-xs hover:border-slate-300 transition">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                          <div className="flex items-center gap-3">
                            <span className={`px-2.5 py-0.5 rounded-full font-black text-[10px] ${
                              inc.priority === 'P1' ? 'bg-red-50 border border-red-200 text-red-600' : 'bg-amber-50 border border-amber-200 text-amber-600'
                            }`}>
                              {inc.priority}
                            </span>
                            <h3 className="text-xs font-black uppercase text-slate-800 tracking-wide">{formattedTitle}</h3>
                          </div>
                          <div className="flex items-center gap-2 text-slate-400 font-mono text-[10.5px] font-semibold">
                            <span>{new Date(inc.timestamp).toLocaleDateString()}, {new Date(inc.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                            <ChevronDown className="w-4 h-4 text-slate-400" />
                          </div>
                        </div>

                        <p className="text-xs text-slate-600 leading-relaxed italic bg-slate-50/70 p-3.5 rounded-2xl border border-slate-200/80 font-sans">
                          "{formattedDesc}"
                        </p>

                        <div className="text-[11px] bg-slate-50/80 p-4 rounded-2xl space-y-2 border border-slate-200/80 font-mono">
                          <div className="text-[9px] text-slate-400 font-black uppercase tracking-widest font-sans mb-1">CHRONOLOGICAL AUDIT LOG:</div>
                          {typeof inc.timeline === 'string' && JSON.parse(inc.timeline).map((evt: any, idx: number) => {
                            const evtText = evt.event.replace('Akshaya', 'Srujan').replace('Varun', 'Pravalika');
                            return (
                              <div key={idx} className="flex justify-between items-center text-slate-600 py-0.5">
                                <span>• {evtText}</span>
                                <span className="text-slate-400 font-normal font-mono text-[10px]">
                                  {new Date(evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {incidents.length === 0 && (
                  <div className="text-center py-16 text-xs text-slate-400 uppercase font-bold tracking-wider">
                    No active operations incidents recorded.
                  </div>
                )}
              </div>
            </HUDPanel>
          )}

          {/* TAB 5: GROUP BROADCAST MESSAGES */}
          {activeTab === 'messages' && (
            <HUDPanel 
              title="MESH GROUP BROADCASTS CHANNELS" 
              subtitle="Emergency Communication Traffic Logs"
              headerAction={
                <div className="flex items-center gap-2">
                  <select className="px-3 py-1.5 border border-slate-200 rounded-xl bg-white text-[11px] font-extrabold text-slate-700 focus:outline-none shadow-xs">
                    <option value="all">Filter: All Channels</option>
                    <option value="t1">Alpha Team</option>
                    <option value="t2">Bravo Team</option>
                  </select>
                  <button 
                    onClick={() => setChatMessages([])}
                    className="px-3 py-1.5 border border-slate-200 rounded-xl bg-white hover:bg-slate-50 text-[11px] font-extrabold text-slate-600 transition shadow-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-slate-400" />
                    Clear Chat
                  </button>
                </div>
              }
            >
              <div className="border border-slate-200 bg-white rounded-3xl p-5 flex flex-col justify-between h-[520px] shadow-xs">
                <div className="flex-1 overflow-y-auto space-y-6 pr-3 py-2">
                  {chatMessages.length === 0 ? (
                    <div className="text-center py-16 text-slate-400 uppercase text-xs font-bold tracking-wider">
                      No communications recorded in this session.
                    </div>
                  ) : (
                    chatMessages.map(msg => {
                      const isMe = msg.senderId === user.id;
                      const sender = officers.find(o => o.id === msg.senderId);
                      const senderName = isMe
                        ? `${user.name} (${user.badgeNumber})`
                        : (sender ? `Officer ${sender.name} (${sender.badgeNumber})` : `HQ / System (${msg.senderId})`);
                      
                      return (
                        <div key={msg.id} className="flex gap-4 items-start">
                          <div className="flex flex-col items-center w-12 flex-shrink-0">
                            <span className="text-[10px] font-mono font-bold text-slate-400">
                              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <div className="w-2 h-2 rounded-full bg-slate-400 my-1 shadow-xs" />
                            <div className="w-0.5 flex-1 bg-slate-200 min-h-[30px]" />
                          </div>

                          <div className="flex-1 space-y-1.5">
                            <span className="text-[10px] font-bold text-slate-500 block">
                              {senderName} • {msg.isBroadcast ? 'Broadcast' : msg.teamId ? 'Team Room' : 'Direct'}
                            </span>
                            <div className="inline-block border border-slate-200 bg-slate-50/90 text-slate-800 px-4 py-3 rounded-2xl text-xs font-semibold max-w-lg shadow-2xs leading-relaxed">
                              {msg.body}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={chatEndRef} />
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center gap-3">
                  <input
                    type="text"
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    placeholder="Broadcast text message to all operational mesh nodes..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleBroadcast();
                    }}
                    className="flex-1 bg-white border border-slate-200 px-4 py-3 rounded-2xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-500 shadow-xs font-sans"
                  />
                  <button
                    onMouseDown={handlePttStart}
                    onMouseUp={handlePttEnd}
                    onTouchStart={handlePttStart}
                    onTouchEnd={handlePttEnd}
                    className={`p-3.5 rounded-2xl text-white transition transform active:scale-95 shadow-md flex-shrink-0 cursor-pointer ${
                      isPttActive 
                        ? "bg-red-500 shadow-red-500/50 animate-pulse" 
                        : "bg-amber-500 hover:bg-amber-600 shadow-amber-500/30"
                    }`}
                    title="Hold to Talk (PTT)"
                  >
                    <Radio className="w-5 h-5" />
                  </button>
                  <button
                    onClick={handleBroadcast}
                    className="p-3.5 bg-sky-600 hover:bg-sky-500 text-white rounded-2xl transition flex items-center justify-center cursor-pointer active:scale-95 shadow-md border-0"
                    title="Send Text Broadcast"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </HUDPanel>
          )}

          {/* TAB 6: SECURITY AUDITS */}
          {activeTab === 'audit' && (
            <HUDPanel 
              title="SECURE CRYPTOGRAPHIC AUDIT TRAIL" 
              subtitle="Central System Transaction Database"
              headerAction={
                <div className="flex items-center gap-2">
                  <select className="px-3 py-1.5 border border-slate-200 rounded-xl bg-white text-[11px] font-extrabold text-slate-700 focus:outline-none shadow-xs">
                    <option value="all">Filter</option>
                  </select>
                  <button className="px-3 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-extrabold text-slate-700 rounded-xl transition shadow-xs flex items-center gap-1.5 cursor-pointer">
                    <Download className="w-3.5 h-3.5 text-slate-500" />
                    Export Logs
                  </button>
                </div>
              }
            >
              <div className="overflow-hidden border border-slate-200/80 rounded-3xl bg-white shadow-xs">
                <table className="w-full text-left font-sans text-xs border-collapse">
                  <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-400 uppercase tracking-wider text-[9.5px] font-black">
                    <tr>
                      <th className="py-3.5 px-4">LOG TIMESTAMP</th>
                      <th className="py-3.5 px-4">USER NODE</th>
                      <th className="py-3.5 px-4">TRANSACTION LOGGED</th>
                      <th className="py-3.5 px-4 text-right">IP INTERFACE</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {auditLogs.map((log, i) => {
                      const formattedAction = log.action.replace('AKSHAYA', 'SRUJAN').replace('VARUN', 'PRAVALIKA');
                      return (
                        <tr key={i} className="hover:bg-slate-50/80 transition duration-150">
                          <td className="py-3.5 px-4 text-slate-400 font-mono text-[10.5px] font-bold flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span>{new Date(log.timestamp).toLocaleDateString([], { month: '2-digit', day: '2-digit', year: 'numeric' })}, {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                          </td>
                          <td className="py-3.5 px-4 font-black text-sky-600 font-mono text-xs">{log.userId || 'u_disp1'}</td>
                          <td className="py-3.5 px-4 uppercase font-black text-slate-800 text-[11px] tracking-tight">{formattedAction}</td>
                          <td className="py-3.5 px-4 text-right">
                            <span className="inline-flex items-center gap-1 text-slate-400 font-mono text-[10.5px] font-bold">
                              <Laptop className="w-3.5 h-3.5 text-slate-400" />
                              {log.ipAddress || 'local'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </HUDPanel>
          )}

          {/* TAB 7: FIELD EVIDENCE DECK */}
          {activeTab === 'evidence' && (
            <HUDPanel 
              title="CRYPTOGRAPHIC FIELD EVIDENCE DECK" 
              subtitle="Real-time Synchronized Field Captures & Hashes"
              headerAction={
                <div className="flex items-center gap-2">
                  <select className="px-3 py-1.5 border border-slate-200 rounded-xl bg-white text-[11px] font-extrabold text-slate-700 focus:outline-none shadow-xs">
                    <option value="all">Filter</option>
                  </select>
                  <select className="px-3 py-1.5 border border-slate-200 rounded-xl bg-white text-[11px] font-extrabold text-slate-700 focus:outline-none shadow-xs">
                    <option value="latest">Sort: Latest First</option>
                  </select>
                  <button className="p-1.5 border border-slate-200 bg-white hover:bg-slate-50 rounded-xl text-slate-500 transition shadow-xs">
                    <Grid className="w-4 h-4" />
                  </button>
                </div>
              }
            >
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {evidenceLogs.map((ev) => {
                    const officer = officers.find(o => o.id === ev.officerId);
                    const officerName = officer ? `${officer.name} (${officer.badgeNumber})` : ev.officerName || `Srinivas (p1)`;

                    return (
                      <div key={ev.id} className="border border-slate-200 bg-white rounded-3xl overflow-hidden shadow-xs hover:border-slate-300 transition">
                        <div className="relative aspect-[4/3] w-full bg-slate-900 overflow-hidden">
                          {ev.filePath ? (
                            <img 
                              src={ev.filePath} 
                              alt={ev.description} 
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs font-mono font-bold uppercase">NO PREVIEW</div>
                          )}
                          
                          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2">
                            <div className="bg-slate-950/85 backdrop-blur-md px-3 py-1.5 rounded-full text-[9.5px] font-mono text-emerald-400 font-bold border border-emerald-500/30 flex items-center gap-1.5 shadow-md">
                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                              <span>SHA-256</span>
                              <span className="text-emerald-300 font-black">{ev.hash ? ev.hash.substring(0, 8).toUpperCase() : 'N/A'}...</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleVerifyEvidence(ev.id)}
                              className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase border backdrop-blur-md cursor-pointer flex items-center gap-1 ${
                                ev.hashVerified === false
                                  ? 'bg-red-950/85 border-red-400 text-red-300'
                                  : 'bg-emerald-950/85 border-emerald-400/50 text-emerald-300 hover:bg-emerald-900'
                              }`}
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              {ev.hashVerified === false ? 'TAMPERED • RECHECK' : 'VERIFY HASH'}
                            </button>
                          </div>
                        </div>

                        <div className="p-4 flex items-center justify-between border-t border-slate-100 bg-white text-[10px]">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center border border-sky-100">
                              <Camera className="w-4 h-4" />
                            </div>
                            <div>
                              <span className="text-[8.5px] font-black text-slate-400 uppercase tracking-wider block">OFFICER / SYSTEM</span>
                              <span className="font-extrabold text-slate-800 text-xs block">{officerName}</span>
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="flex items-center gap-1 text-slate-400 font-mono font-bold justify-end">
                              <Clock className="w-3 h-3 text-slate-400" />
                              <span>{new Date(ev.timestamp).toLocaleDateString([], { month: '2-digit', day: '2-digit', year: 'numeric' })}</span>
                            </div>
                            <span className="text-slate-500 font-mono font-extrabold text-xs block mt-0.5">
                              {new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {evidenceLogs.length === 0 && (
                    <div className="col-span-3 text-center py-16 text-xs text-slate-400 font-bold uppercase tracking-wider">
                      No field evidence files synced to this terminal.
                    </div>
                  )}
                </div>

                {/* Pagination Bar */}
                <div className="flex justify-center items-center gap-2 pt-2">
                  <button className="w-8 h-8 border border-slate-200 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-50 transition cursor-pointer text-xs">
                    &lt;
                  </button>
                  <button className="w-8 h-8 bg-sky-600 text-white font-black rounded-xl flex items-center justify-center shadow-xs text-xs">
                    1
                  </button>
                  <button className="w-8 h-8 border border-slate-200 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-50 transition cursor-pointer text-xs">
                    &gt;
                  </button>
                </div>
              </div>
            </HUDPanel>
          )}

        </main>
      </section>

    </div>
  );
}
