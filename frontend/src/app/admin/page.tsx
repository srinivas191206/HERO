'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { HUDPanel } from '../../components/ui/HUDPanel';
import { TacticalButton } from '../../components/ui/TacticalButton';
import { TacticalMap } from '../../components/shared/TacticalMap';
import { Hero3DGisView, FlyTo3DTarget } from '../../components/shared/Hero3DGisView';
import { IntelligenceModuleRenderer } from '../../components/intelligence/IntelligenceModuleRenderer';
import { getEnabledIntelligenceModules, IntelligenceModuleId } from '../../config/intelligenceModules';
import { AP_DISTRICTS, getTacticalFacilitiesForDistrict, matchApDistrict } from '../../utils/apDistricts';
import { SupabaseStateClient } from '../../services/cloud/SupabaseStateClient';
import { DistrictSummary } from '../../types';
import {
  Building2, ShieldAlert, Users, Wifi, WifiOff, Plus, Download,
  ExternalLink, LogOut, RefreshCw, Map as MapIcon, UserPlus, CheckCircle2, KeyRound, Globe2, Compass,
  Waves, CloudRain, Flame, CloudLightning, Route as RouteIcon, Mountain
} from 'lucide-react';

const getBackendUrl = () => {
  if (typeof window !== 'undefined') {
    const savedIp = localStorage.getItem('tactical_server_ip');
    if (savedIp) return `http://${savedIp}:5001`;
    return `http://${window.location.hostname}:5001`;
  }
  return 'http://localhost:5001';
};

export default function StateAdminPortal() {
  const router = useRouter();
  const { user, token, authMode, logout, isAuthenticated, isLoading } = useAuth();
  const { isOnline } = useApp();

  const [activeTab, setActiveTab] = useState<'overview' | 'map3d' | 'provision' | 'map' | IntelligenceModuleId>('overview');
  const [selected3dDistrictName, setSelected3dDistrictName] = useState<string>('');
  const [pending3dFlyTo, setPending3dFlyTo] = useState<FlyTo3DTarget | null>(null);
  const [districts, setDistricts] = useState<DistrictSummary[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Create District Form
  const [distName, setDistName] = useState('');
  const [distCode, setDistCode] = useState('');
  const [distState, setDistState] = useState('Andhra Pradesh');
  const [distLat, setDistLat] = useState('17.6868');
  const [distLng, setDistLng] = useState('83.2185');
  const [distOfficerCount, setDistOfficerCount] = useState<number>(5);
  const [generatedNodeKey, setGeneratedNodeKey] = useState<{ districtId: string; key: string } | null>(null);

  // Assign User / Batch Deploy Form
  const [assignMode, setAssignMode] = useState<'batch' | 'single'>('batch');
  const [assignDistrictId, setAssignDistrictId] = useState('');
  const [batchCount, setBatchCount] = useState<number>(5);
  const [batchPrefix, setBatchPrefix] = useState('');
  const [batchPin, setBatchPin] = useState('police');
  const [generatedCredentials, setGeneratedCredentials] = useState<Array<{
    badgeNumber: string;
    name: string;
    pin: string;
    teamName?: string;
  }>>([]);
  const [badgeNumber, setBadgeNumber] = useState('');
  const [officerName, setOfficerName] = useState('');
  const [officerPin, setOfficerPin] = useState('police');
  const [officerRole, setOfficerRole] = useState<'dispatcher' | 'officer'>('officer');

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        router.replace('/login');
      } else if (user?.role !== 'state_admin') {
        router.replace(user?.role === 'dispatcher' ? '/command' : '/officer');
      }
    }
  }, [isLoading, isAuthenticated, user, router]);

  const fetchOverview = async () => {
    if (!token) return;
    setLoadingData(true);
    try {
      if (authMode === 'cloud') {
        const list = await SupabaseStateClient.fetchStateOverview(token);
        setDistricts(list);
        if (!assignDistrictId && list.length > 0) {
          setAssignDistrictId(list[0].id);
        }
        return;
      }

      const res = await fetch(`${getBackendUrl()}/api/state/overview`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDistricts(data.districts || []);
        if (!assignDistrictId && data.districts?.length > 0) {
          setAssignDistrictId(data.districts[0].id);
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        setFeedback({ type: 'err', text: errData.error || `State overview failed (HTTP ${res.status}).` });
      }
    } catch (err: any) {
      console.error('Failed to fetch state overview:', err);
      const msg = err?.message || 'Unable to load districts.';
      setFeedback({ type: 'err', text: `${msg} Click Refresh or sign in again if your session expired.` });
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (token && user?.role === 'state_admin') {
      fetchOverview();
      const timer = setInterval(fetchOverview, 10000);
      return () => clearInterval(timer);
    }
  }, [token, user]);

  const handleCreateDistrict = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setFeedback(null);
    setGeneratedNodeKey(null);
    setGeneratedCredentials([]);
    try {
      if (authMode === 'cloud') {
        const data = await SupabaseStateClient.createDistrict(token, {
          name: distName,
          code: distCode,
          stateName: distState,
          centerLat: parseFloat(distLat),
          centerLng: parseFloat(distLng)
        });
        let deployed: any[] = [];
        if (distOfficerCount > 0) {
          deployed = await SupabaseStateClient.batchDeployOfficers(token, {
            districtId: data.district.id,
            count: distOfficerCount,
            defaultPin: 'police'
          });
          setGeneratedCredentials(deployed);
        }
        setGeneratedNodeKey({ districtId: data.district.id, key: data.nodeKey });
        setFeedback({
          type: 'ok',
          text: `District "${data.district.name}" created with ${deployed.length} officer credentials in Supabase.`
        });
        setDistName('');
        setDistCode('');
        setAssignDistrictId(data.district.id);
        fetchOverview();
        return;
      }

      const res = await fetch(`${getBackendUrl()}/api/state/districts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: distName,
          code: distCode,
          stateName: distState,
          centerLat: parseFloat(distLat),
          centerLng: parseFloat(distLng),
          officerCount: distOfficerCount,
          defaultPin: 'police'
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: 'err', text: data.error || 'Failed to create district.' });
        return;
      }
      setGeneratedNodeKey({ districtId: data.district.id, key: data.nodeKey });
      if (data.deployedOfficers?.length) {
        setGeneratedCredentials(data.deployedOfficers);
      }
      setFeedback({
        type: 'ok',
        text: `District "${data.district.name}" created with ${data.deployedOfficers?.length || 0} officer credentials.`
      });
      setDistName('');
      setDistCode('');
      setAssignDistrictId(data.district.id);
      fetchOverview();
    } catch (err: any) {
      setFeedback({ type: 'err', text: err?.message || 'Network error creating district.' });
    }
  };

  const handleBatchDeploy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !assignDistrictId) return;
    setFeedback(null);
    try {
      if (authMode === 'cloud') {
        const created = await SupabaseStateClient.batchDeployOfficers(token, {
          districtId: assignDistrictId,
          count: batchCount,
          prefix: batchPrefix || undefined,
          defaultPin: batchPin || 'police'
        });
        setGeneratedCredentials(created);
        setFeedback({ type: 'ok', text: `Generated ${created.length} officer credentials in Supabase.` });
        fetchOverview();
        return;
      }

      const res = await fetch(`${getBackendUrl()}/api/officers/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          districtId: assignDistrictId,
          count: batchCount,
          prefix: batchPrefix || undefined,
          defaultPin: batchPin || 'police'
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: 'err', text: data.error || 'Failed to batch deploy officers.' });
        return;
      }
      setGeneratedCredentials(data.created || []);
      setFeedback({ type: 'ok', text: `Generated ${data.created?.length || 0} officer credentials for district.` });
      fetchOverview();
    } catch (err: any) {
      setFeedback({ type: 'err', text: err?.message || 'Failed to deploy officers.' });
    }
  };

  const handleAssignUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setFeedback(null);
    try {
      if (authMode === 'cloud') {
        const data = await SupabaseStateClient.assignUser(token, {
          badgeNumber,
          name: officerName,
          pin: officerPin,
          role: officerRole,
          districtId: assignDistrictId
        });
        setFeedback({ type: 'ok', text: `Assigned ${data.role} "${data.name}" (${data.badgeNumber}) in Supabase.` });
        setBadgeNumber('');
        setOfficerName('');
        fetchOverview();
        return;
      }

      const res = await fetch(`${getBackendUrl()}/api/state/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          badgeNumber,
          name: officerName,
          pin: officerPin,
          role: officerRole,
          districtId: assignDistrictId
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: 'err', text: data.error || 'Failed to assign personnel.' });
        return;
      }
      setFeedback({ type: 'ok', text: `Assigned ${data.role} "${data.name}" (${data.badgeNumber}) to district.` });
      setBadgeNumber('');
      setOfficerName('');
      fetchOverview();
    } catch (err: any) {
      setFeedback({ type: 'err', text: err?.message || 'Network error assigning user.' });
    }
  };

  const handleExportBundle = async (district: DistrictSummary) => {
    if (!token) return;
    try {
      const bundle = authMode === 'cloud'
        ? await SupabaseStateClient.exportDistrictBundle(token, district.id)
        : await (async () => {
            const res = await fetch(`${getBackendUrl()}/api/state/districts/${district.id}/bundle`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Failed to export bundle.');
            return res.json();
          })();

      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hero-district-${district.code.toLowerCase()}-bundle.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export district bundle:', err);
    }
  };

  if (isLoading || !user || user.role !== 'state_admin') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 font-sans text-xs uppercase tracking-widest text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin text-sky-600 mb-2" />
        <span>Verifying State Command Authority...</span>
      </div>
    );
  }

  const totalOfficers = districts.reduce((sum, d) => sum + d.totalOfficers, 0);
  const totalOnlineDistricts = districts.filter(d => d.status === 'online').length;
  const totalOfflineDistricts = districts.filter(d => d.status !== 'online').length;
  const totalIncidents = districts.reduce((sum, d) => sum + d.activeIncidents, 0);
  const totalSos = districts.reduce((sum, d) => sum + d.sosCount, 0);

  return (
    <div className="flex-1 flex flex-col bg-slate-50 min-h-screen text-slate-800 font-sans">
      {/* Top Header */}
      <header className="bg-[#0B1739] text-white px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-md relative">
        <div className="absolute top-0 left-0 right-0 h-1 flex">
          <div className="flex-1 bg-[#FF9933]" />
          <div className="flex-1 bg-white" />
          <div className="flex-1 bg-[#138808]" />
        </div>

        <div className="flex items-center gap-3.5 mt-1">
          <img src="/hero-logo.png" className="w-10 h-10 object-contain" alt="HERO Logo" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-black uppercase tracking-wider">HERO STATE COMMAND & ADMIN PORTAL</h1>
              <span className="text-[9px] px-2.5 py-0.5 bg-sky-500/20 border border-sky-400/40 text-sky-200 rounded-full font-black uppercase">
                STATE HQ
              </span>
            </div>
            <p className="text-[11px] text-slate-300 font-medium">
              Multi-District Provisioning, Offline Node Monitoring & State Operations • Operator: {user.name}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border flex items-center gap-1.5 ${
            isOnline ? 'border-emerald-500/40 bg-emerald-950/60 text-emerald-300' : 'border-amber-500/40 bg-amber-950/60 text-amber-300'
          }`}>
            <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            {isOnline ? 'STATE LINK ACTIVE' : 'LOCAL CACHE MODE'}
          </span>
          <button
            onClick={fetchOverview}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
            title="Refresh State Overview"
          >
            <RefreshCw className={`w-4 h-4 ${loadingData ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={async () => {
              await logout();
              router.push('/login');
            }}
            className="p-2 rounded-xl bg-white/10 hover:bg-red-500/30 text-white transition cursor-pointer"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Statewide KPI Strip */}
      <section className="bg-white border-b border-slate-200 px-6 py-4 grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="border border-slate-200 rounded-2xl p-3.5 flex items-center gap-3">
          <Building2 className="w-5 h-5 text-sky-600" />
          <div>
            <span className="text-[9px] font-black text-slate-400 uppercase block">DISTRICTS</span>
            <span className="text-xl font-black text-slate-800">{districts.length}</span>
          </div>
        </div>
        <div className="border border-slate-200 rounded-2xl p-3.5 flex items-center gap-3">
          <Wifi className="w-5 h-5 text-emerald-600" />
          <div>
            <span className="text-[9px] font-black text-slate-400 uppercase block">CLOUD SYNCED</span>
            <span className="text-xl font-black text-emerald-600">{totalOnlineDistricts}</span>
          </div>
        </div>
        <div className="border border-slate-200 rounded-2xl p-3.5 flex items-center gap-3">
          <WifiOff className="w-5 h-5 text-amber-600" />
          <div>
            <span className="text-[9px] font-black text-slate-400 uppercase block">LOCAL / OFFLINE</span>
            <span className="text-xl font-black text-amber-600">{totalOfflineDistricts}</span>
          </div>
        </div>
        <div className="border border-slate-200 rounded-2xl p-3.5 flex items-center gap-3">
          <Users className="w-5 h-5 text-blue-600" />
          <div>
            <span className="text-[9px] font-black text-slate-400 uppercase block">TOTAL OFFICERS</span>
            <span className="text-xl font-black text-slate-800">{totalOfficers}</span>
          </div>
        </div>
        <div className="border border-slate-200 rounded-2xl p-3.5 flex items-center gap-3">
          <ShieldAlert className={`w-5 h-5 ${totalSos > 0 ? 'text-red-600 animate-pulse' : 'text-slate-500'}`} />
          <div>
            <span className="text-[9px] font-black text-slate-400 uppercase block">ACTIVE INCIDENTS / SOS</span>
            <span className="text-xl font-black text-red-600">{totalIncidents} <span className="text-xs font-bold">({totalSos} SOS)</span></span>
          </div>
        </div>
      </section>

      {/* Main Workspace with Left Sidebar Navigation */}
      <section className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <aside className="w-full lg:w-72 border-b lg:border-b-0 lg:border-r border-slate-200 bg-white flex flex-col p-4 gap-4 z-10">
          <nav aria-label="State Admin Navigation" className="space-y-1">
            <span className="text-[9px] text-slate-400 uppercase tracking-widest px-3 mb-2 block font-black">
              STATE COMMAND CHANNELS
            </span>
            {[
              { id: 'overview', label: 'District Operations Hub', icon: Building2 },
              { id: 'map3d', label: '3D Map (Andhra Pradesh)', icon: Globe2 },
              { id: 'provision', label: 'Create & Assign Districts', icon: Plus },
              { id: 'map', label: 'Statewide 2D Radar', icon: MapIcon }
            ].map(t => {
              const Icon = t.icon;
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id as any)}
                  className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider text-left transition cursor-pointer ${
                    active
                      ? 'bg-sky-50 text-sky-700 border-l-4 border-sky-600 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-sky-600' : 'text-slate-400'}`} />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Standalone Role-Assignable Disaster Intelligence Modules */}
          <nav aria-label="Disaster Intelligence Modules" className="border-t border-slate-200 pt-3 space-y-1">
            <span className="text-[9px] text-slate-400 uppercase tracking-widest px-3 mb-1.5 block font-black">
              DISASTER INTELLIGENCE
            </span>
            {getEnabledIntelligenceModules().map(mod => {
              const Icon =
                mod.id === 'dam_break' ? Waves :
                mod.id === 'flash_flood' ? CloudRain :
                mod.id === 'heatwave' ? Flame :
                mod.id === 'rainfall_ews' ? CloudLightning :
                mod.id === 'urban_flood' ? RouteIcon :
                Mountain;
              const active = activeTab === mod.id;
              return (
                <button
                  key={mod.id}
                  type="button"
                  onClick={() => setActiveTab(mod.id)}
                  className={`w-full flex items-center gap-2.5 px-3.5 py-2 rounded-2xl text-[11px] font-black uppercase tracking-wider text-left transition cursor-pointer ${
                    active
                      ? 'bg-indigo-50 text-indigo-700 border-l-4 border-indigo-600 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-indigo-600' : 'text-slate-400'}`} />
                  <span className="truncate">{mod.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Andhra Pradesh 28-District Quick Navigator (Mapped from APSDMA GeoJSON) */}
          <div className="border-t border-slate-200 pt-3 flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between px-1 mb-2">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                AP 28 Districts (3D Coords)
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelected3dDistrictName('');
                  setPending3dFlyTo(null);
                  setActiveTab('map3d');
                }}
                className="text-[9px] font-black uppercase text-sky-600 hover:underline cursor-pointer"
              >
                All State
              </button>
            </div>
            <div className="space-y-1 max-h-56 lg:max-h-[340px] overflow-y-auto pr-1">
              {AP_DISTRICTS.map(apDist => {
                const provisioned = districts.find(d => matchApDistrict(d.name)?.district === apDist.district || matchApDistrict(d.code)?.district === apDist.district);
                const isSelected = selected3dDistrictName === apDist.district && activeTab === 'map3d';
                return (
                  <button
                    key={apDist.district}
                    type="button"
                    onClick={() => {
                      setSelected3dDistrictName(apDist.district);
                      setPending3dFlyTo(null);
                      setActiveTab('map3d');
                    }}
                    className={`w-full px-2.5 py-1.5 rounded-xl text-left text-[11px] flex items-center justify-between gap-2 transition cursor-pointer border ${
                      isSelected
                        ? 'bg-sky-600 text-white border-sky-600 font-bold'
                        : 'bg-slate-50/70 hover:bg-sky-50 text-slate-700 border-slate-200/70 font-semibold'
                    }`}
                  >
                    <span className="truncate flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${provisioned ? 'bg-emerald-400' : 'bg-slate-300'}`} />
                      {apDist.district}
                    </span>
                    <span className={`text-[9px] font-mono flex-shrink-0 ${isSelected ? 'text-sky-100' : 'text-slate-400'}`}>
                      {apDist.peakTmax != null ? `${apDist.peakTmax}°C` : apDist.code}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        <main className="flex-1 p-5 md:p-6 overflow-y-auto space-y-6">
        {feedback && (
          <div className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center gap-2 ${
            feedback.type === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-600'
          }`}>
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{feedback.text}</span>
          </div>
        )}

        {generatedNodeKey && (
          <div className="p-4 rounded-2xl border border-amber-300 bg-amber-50 text-amber-900 space-y-1.5 text-xs">
            <div className="font-black uppercase flex items-center gap-1.5">
              <KeyRound className="w-4 h-4" />
              District Sync Key Generated (Save for District Laptop .env)
            </div>
            <p className="font-mono text-[11px] bg-white p-2.5 rounded-xl border border-amber-200 select-all">
              DISTRICT_ID={generatedNodeKey.districtId}{'\n'}
              DISTRICT_NODE_KEY={generatedNodeKey.key}
            </p>
          </div>
        )}

        {generatedCredentials.length > 0 && (
          <div className="p-4 rounded-2xl border border-emerald-300 bg-emerald-50 text-emerald-950 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-black uppercase flex items-center gap-1.5 text-emerald-800">
                <Users className="w-4 h-4" />
                Generated Officer Credentials ({generatedCredentials.length} Deployed)
              </span>
              <button
                type="button"
                onClick={() => {
                  const text = generatedCredentials.map(c => `${c.badgeNumber} / ${c.pin} (${c.name})`).join('\n');
                  navigator.clipboard?.writeText(text);
                }}
                className="px-2.5 py-1 bg-white border border-emerald-300 rounded-lg text-[10px] font-black uppercase text-emerald-700 hover:bg-emerald-100 cursor-pointer"
              >
                Copy All
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
              {generatedCredentials.map((cred, idx) => (
                <div key={idx} className="bg-white border border-emerald-200 rounded-xl p-2.5 font-mono text-[11px]">
                  <div className="font-black text-sky-700">PID: {cred.badgeNumber}</div>
                  <div className="text-slate-600 font-bold">PIN: {cred.pin}</div>
                  <div className="text-[9px] text-slate-400 font-sans truncate">{cred.name}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'overview' && (
          districts.length === 0 ? (
            <HUDPanel
              title="No District Hubs Loaded"
              subtitle={loadingData ? 'Syncing State Registry...' : 'Verify State Link or Provision First District'}
            >
              <div className="py-8 flex flex-col items-center justify-center text-center gap-3 text-xs text-slate-600">
                <p className="max-w-md">
                  {loadingData
                    ? 'Loading provisioned districts from State Cloud / local backend...'
                    : 'No districts returned yet. If your State Admin session expired, sign out and log in again, or create a new district hub.'}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={fetchOverview}
                    className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-black uppercase text-[10px] cursor-pointer"
                  >
                    Refresh State Overview
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('provision')}
                    className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-black uppercase text-[10px] cursor-pointer"
                  >
                    Create District Hub
                  </button>
                </div>
              </div>
            </HUDPanel>
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {districts.map(dist => {
              const isSynced = dist.status === 'online';
              return (
                <HUDPanel
                  key={dist.id}
                  title={`${dist.name} (${dist.code})`}
                  subtitle={`${dist.stateName} • ID: ${dist.id}`}
                  statusColor={dist.sosCount > 0 ? 'red' : isSynced ? 'green' : 'amber'}
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between text-xs">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase border ${
                        isSynced
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : 'bg-amber-50 border-amber-200 text-amber-700'
                      }`}>
                        {isSynced ? 'CLOUD SYNCED' : dist.status === 'provisioning' ? 'PROVISIONING' : 'LOCAL OFFLINE MODE'}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400 font-bold">
                        {dist.lastSyncAt ? `Last Sync: ${new Date(dist.lastSyncAt).toLocaleTimeString()}` : 'Never Synced'}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                        <span className="text-[9px] font-black text-slate-400 uppercase block">OFFICERS</span>
                        <span className="text-sm font-black text-slate-800">{dist.onlineOfficers}/{dist.totalOfficers}</span>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                        <span className="text-[9px] font-black text-slate-400 uppercase block">INCIDENTS</span>
                        <span className="text-sm font-black text-amber-600">{dist.activeIncidents}</span>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                        <span className="text-[9px] font-black text-slate-400 uppercase block">SOS / P1</span>
                        <span className={`text-sm font-black ${dist.sosCount > 0 ? 'text-red-600 animate-pulse' : 'text-slate-700'}`}>
                          {dist.sosCount} / {dist.p1Count}
                        </span>
                      </div>
                    </div>

                    {dist.pendingSyncCount > 0 && (
                      <div className="text-[10px] font-mono font-bold text-sky-700 bg-sky-50 border border-sky-200 px-3 py-1.5 rounded-xl">
                        {dist.pendingSyncCount} local records queued for State Share-Point sync
                      </div>
                    )}

                    <div className="flex gap-2 pt-2 border-t border-slate-100">
                      <button
                        onClick={() => router.push(`/command?districtId=${encodeURIComponent(dist.id)}`)}
                        className="flex-1 py-2 px-3 bg-sky-600 hover:bg-sky-700 text-white text-[10px] font-black uppercase rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Open District Hub
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const matched = matchApDistrict(dist.name) || matchApDistrict(dist.code);
                          setSelected3dDistrictName(matched?.district || dist.name);
                          setPending3dFlyTo({
                            id: dist.id,
                            name: `${dist.name} HQ`,
                            lat: dist.centerLat || matched?.centerLat || 17.0146,
                            lng: dist.centerLng || matched?.centerLng || 81.1826,
                            kind: 'station',
                            levels: 4,
                            districtName: matched?.district || dist.name,
                            description: `${dist.name} (${dist.code}) District Command Center`
                          });
                          setActiveTab('map3d');
                        }}
                        className="py-2 px-3 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-[10px] font-black uppercase rounded-xl flex items-center justify-center gap-1 cursor-pointer transition"
                        title="Open District in 3D GIS Map"
                      >
                        <Compass className="w-3.5 h-3.5" />
                        3D Map
                      </button>
                      <button
                        onClick={() => handleExportBundle(dist)}
                        className="py-2 px-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-[10px] font-black uppercase rounded-xl flex items-center justify-center gap-1 cursor-pointer transition"
                        title="Download Offline Provisioning Bundle (.json) for Electron"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Pack
                      </button>
                    </div>
                  </div>
                </HUDPanel>
              );
            })}
          </div>
          )
        )}

        {activeTab === 'map3d' && (() => {
          const apMeta = matchApDistrict(selected3dDistrictName);
          const heroDist = districts.find(
            d => matchApDistrict(d.name)?.district === apMeta?.district || d.name === selected3dDistrictName
          );
          const activeLat = heroDist?.centerLat ?? apMeta?.centerLat;
          const activeLng = heroDist?.centerLng ?? apMeta?.centerLng;
          const activeDistName = apMeta?.district || heroDist?.name || (selected3dDistrictName || undefined);
          const facilities = activeDistName
            ? getTacticalFacilitiesForDistrict(activeDistName, activeLat ?? 17.0146, activeLng ?? 81.1826)
            : [];

          return (
            <div className="space-y-3 h-[calc(100vh-225px)] min-h-[600px] flex flex-col">
              <div className="bg-white border border-slate-200 rounded-2xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs shadow-xs">
                <div>
                  <span className="text-[10px] font-black uppercase text-sky-600 tracking-wider block">
                    ANDHRA PRADESH 3D GIS &amp; ULPIN EXPLORER
                  </span>
                  <span className="font-bold text-slate-800">
                    {activeDistName
                      ? `${activeDistName} (${apMeta?.code || heroDist?.code || 'AP'}) • Lat ${activeLat?.toFixed(4)}, Lng ${activeLng?.toFixed(4)}${apMeta?.peakTmax != null ? ` • Peak ${apMeta.peakTmax}°C (${apMeta.peakMandal})` : ''}`
                      : 'All 28 Andhra Pradesh Districts • APSDMA GeoJSON Thermal & Boundary Overlay'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    aria-label="Filter 3D Map by Andhra Pradesh District"
                    value={selected3dDistrictName}
                    onChange={(e) => {
                      setSelected3dDistrictName(e.target.value);
                      setPending3dFlyTo(null);
                    }}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:border-sky-500 cursor-pointer"
                  >
                    <option value="">All 28 AP Districts (State Overview)</option>
                    {AP_DISTRICTS.map(d => (
                      <option key={d.district} value={d.district}>
                        {d.district} ({d.code}) · {d.peakTmax}°C
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <Hero3DGisView
                mode={activeDistName ? 'district' : 'state'}
                districtName={activeDistName}
                districtCode={apMeta?.code || heroDist?.code}
                centerLat={activeLat}
                centerLng={activeLng}
                districts={districts}
                facilities={facilities}
                pendingFlyTo={pending3dFlyTo}
                onEntitySelectedFrom3D={(sel) => {
                  if (sel.kind === 'district' && sel.name) {
                    setSelected3dDistrictName(sel.name);
                  }
                }}
                className="flex-1"
              />
            </div>
          );
        })()}

        {activeTab === 'provision' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <HUDPanel title="Create Disaster Response District" subtitle="Provision New District Command Hub">
              <form onSubmit={handleCreateDistrict} className="space-y-3 text-xs">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">
                    Quick-Fill from AP 28 Districts (APSDMA Coordinates)
                  </label>
                  <select
                    defaultValue=""
                    onChange={e => {
                      const chosen = AP_DISTRICTS.find(d => d.district === e.target.value);
                      if (chosen) {
                        setDistName(`${chosen.district} District Hub`);
                        setDistCode(chosen.code);
                        setDistState('Andhra Pradesh');
                        setDistLat(String(chosen.centerLat));
                        setDistLng(String(chosen.centerLng));
                      }
                    }}
                    className="w-full px-3.5 py-2 bg-sky-50/70 border border-sky-200 rounded-xl font-bold text-sky-900 focus:outline-none focus:border-sky-500 cursor-pointer"
                  >
                    <option value="">-- Select AP District to auto-fill coordinates --</option>
                    {AP_DISTRICTS.map(d => (
                      <option key={d.district} value={d.district}>
                        {d.district} ({d.code}) — {d.centerLat.toFixed(4)}, {d.centerLng.toFixed(4)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">District Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Visakhapatnam District Hub"
                    value={distName}
                    onChange={e => setDistName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">District Code</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. VZG"
                      value={distCode}
                      onChange={e => setDistCode(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold uppercase focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">State</label>
                    <input
                      type="text"
                      value={distState}
                      onChange={e => setDistState(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">HQ Latitude</label>
                    <input
                      type="number"
                      step="any"
                      value={distLat}
                      onChange={e => setDistLat(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">HQ Longitude</label>
                    <input
                      type="number"
                      step="any"
                      value={distLng}
                      onChange={e => setDistLng(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Deploy Officers</label>
                    <input
                      type="number"
                      min={0}
                      max={50}
                      value={distOfficerCount}
                      onChange={e => setDistOfficerCount(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>
                <TacticalButton type="submit" variant="primary" glow className="w-full py-2.5 text-xs mt-2">
                  <Plus className="w-4 h-4" />
                  Create District Hub & Generate {distOfficerCount} Officers
                </TacticalButton>
              </form>
            </HUDPanel>

            <HUDPanel title="Assign District Personnel" subtitle="Batch Generate PIDs or Add Single Account">
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setAssignMode('batch')}
                    className={`py-1.5 rounded-lg text-[10px] font-black uppercase cursor-pointer transition ${
                      assignMode === 'batch' ? 'bg-white text-sky-700 shadow-xs' : 'text-slate-500'
                    }`}
                  >
                    Deploy by Count (Batch)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssignMode('single')}
                    className={`py-1.5 rounded-lg text-[10px] font-black uppercase cursor-pointer transition ${
                      assignMode === 'single' ? 'bg-white text-sky-700 shadow-xs' : 'text-slate-500'
                    }`}
                  >
                    Single Officer / Dispatcher
                  </button>
                </div>

                {assignMode === 'batch' ? (
                  <form onSubmit={handleBatchDeploy} className="space-y-3">
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Target District</label>
                      <select
                        value={assignDistrictId}
                        onChange={e => setAssignDistrictId(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:outline-none focus:border-sky-500"
                      >
                        {districts.map(d => (
                          <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Person Count</label>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          required
                          value={batchCount}
                          onChange={e => setBatchCount(Number(e.target.value))}
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-black focus:outline-none focus:border-sky-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">PID Prefix (Opt.)</label>
                        <input
                          type="text"
                          placeholder="auto (e.g. p)"
                          value={batchPrefix}
                          onChange={e => setBatchPrefix(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:outline-none focus:border-sky-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Default PIN</label>
                        <input
                          type="text"
                          required
                          value={batchPin}
                          onChange={e => setBatchPin(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold focus:outline-none focus:border-sky-500"
                        />
                      </div>
                    </div>
                    <TacticalButton type="submit" variant="success" glow className="w-full py-2.5 text-xs mt-2">
                      <UserPlus className="w-4 h-4" />
                      Generate {batchCount} Officer PIDs (PIN: {batchPin})
                    </TacticalButton>
                  </form>
                ) : (
                  <form onSubmit={handleAssignUser} className="space-y-3">
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Target District</label>
                      <select
                        value={assignDistrictId}
                        onChange={e => setAssignDistrictId(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:outline-none focus:border-sky-500"
                      >
                        {districts.map(d => (
                          <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Role</label>
                        <select
                          value={officerRole}
                          onChange={e => setOfficerRole(e.target.value as 'officer' | 'dispatcher')}
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:outline-none focus:border-sky-500"
                        >
                          <option value="officer">Field Officer</option>
                          <option value="dispatcher">District Command Dispatcher</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Badge / Login ID</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. vzg_p1"
                          value={badgeNumber}
                          onChange={e => setBadgeNumber(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold focus:outline-none focus:border-sky-500"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Full Name</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Inspector Ravi"
                          value={officerName}
                          onChange={e => setOfficerName(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold focus:outline-none focus:border-sky-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Access PIN</label>
                        <input
                          type="text"
                          required
                          value={officerPin}
                          onChange={e => setOfficerPin(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:outline-none focus:border-sky-500"
                        />
                      </div>
                    </div>
                    <TacticalButton type="submit" variant="success" glow className="w-full py-2.5 text-xs mt-2">
                      <UserPlus className="w-4 h-4" />
                      Assign to District Roster
                    </TacticalButton>
                  </form>
                )}
              </div>
            </HUDPanel>
          </div>
        )}

        {activeTab === 'map' && (
          <HUDPanel title="Statewide District Radar Overview" subtitle="Multi-District Anchor View (Ready for State Overlay Expansion)" className="h-[520px]">
            <TacticalMap
              officers={districts.map(d => ({
                id: d.id,
                badgeNumber: d.code,
                name: d.name,
                role: 'dispatcher',
                status: d.sosCount > 0 ? 'Emergency' : d.status === 'online' ? 'Available' : 'Offline',
                battery: 100,
                teamId: null,
                location: {
                  latitude: d.centerLat,
                  longitude: d.centerLng,
                  timestamp: d.lastSyncAt || d.createdAt
                }
              }))}
              incidents={[]}
              onInspectIn3D={(target) => {
                const matched = matchApDistrict(target.name);
                setSelected3dDistrictName(matched?.district || target.name);
                setPending3dFlyTo({
                  ...target,
                  districtName: matched?.district || target.name
                });
                setActiveTab('map3d');
              }}
              isCommandCenter
            />
          </HUDPanel>
        )}

        {(activeTab === 'dam_break' ||
          activeTab === 'flash_flood' ||
          activeTab === 'heatwave' ||
          activeTab === 'rainfall_ews' ||
          activeTab === 'urban_flood' ||
          activeTab === 'landslide') && (
          <IntelligenceModuleRenderer
            moduleId={activeTab}
            onInspectIn3D={(target) => {
              const matched = matchApDistrict(target.districtName || target.name);
              setSelected3dDistrictName(matched?.district || target.districtName || '');
              setPending3dFlyTo({
                ...target,
                districtName: matched?.district || target.districtName
              });
              setActiveTab('map3d');
            }}
          />
        )}
      </main>
      </section>
    </div>
  );
}

