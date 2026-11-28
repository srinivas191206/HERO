'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { HUDPanel } from '../../components/ui/HUDPanel';
import { TacticalMap } from '../../components/shared/TacticalMap';
import { Hero3DGisView, FlyTo3DTarget } from '../../components/shared/Hero3DGisView';
import { IntelligenceModuleRenderer } from '../../components/intelligence/IntelligenceModuleRenderer';
import { IncidentTrendsCard } from '../../components/admin/IncidentTrendsCard';
import { RecentActivityPanel } from '../../components/admin/RecentActivityPanel';
import { InfrastructureHealthCard } from '../../components/admin/InfrastructureHealthCard';
import { ProvisioningWorkspace } from '../../components/admin/ProvisioningWorkspace';
import { getEnabledIntelligenceModules, IntelligenceModuleId } from '../../config/intelligenceModules';
import { AP_DISTRICTS, getTacticalFacilitiesForDistrict, matchApDistrict } from '../../utils/apDistricts';
import { fetchBatchWeather } from '../../services/intelligence/OpenMeteoService';
import { SupabaseStateClient, SupabaseSessionExpiredError } from '../../services/cloud/SupabaseStateClient';
import { clientEventBus } from '../../services/events/EventBus';
import { AuditLog, DistrictSummary, Incident, StateInfrastructureHealth, User } from '../../types';
import {
  Bell, Box, Building2, CheckCircle2, Cloud, CloudLightning, CloudRain,
  Download, ExternalLink, Flame, Globe2, LogOut, Map as MapIcon, Menu,
  Mountain, Plus, RefreshCw, Route as RouteIcon, ShieldAlert, Users,
  Waves, Wifi, WifiOff, X
} from 'lucide-react';

const getErrMsg = (err: unknown, fallback: string): string =>
  err instanceof Error ? err.message : fallback;

const getBackendUrl = () => {
  if (typeof window !== 'undefined') {
    const savedIp = localStorage.getItem('tactical_server_ip');
    if (savedIp) return `http://${savedIp}:5001`;
    return `http://${window.location.hostname}:5001`;
  }
  return 'http://localhost:5001';
};

type KpiFilter = 'all' | 'online' | 'offline' | 'incidents';

export default function StateAdminPortal() {
  const router = useRouter();
  const { user, token, authMode, logout, isAuthenticated, isLoading } = useAuth();
  const { isOnline, activeAlerts, clearAlerts } = useApp();

  const [activeTab, setActiveTab] = useState<'overview' | 'map3d' | 'provision' | 'map' | IntelligenceModuleId>('overview');
  const [kpiFilter, setKpiFilter] = useState<KpiFilter>('all');
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);

  const [selected3dDistrictName, setSelected3dDistrictName] = useState<string>('');
  const [pending3dFlyTo, setPending3dFlyTo] = useState<FlyTo3DTarget | null>(null);

  // Live operational state (never hardcoded)
  const [districts, setDistricts] = useState<DistrictSummary[]>([]);
  const [stateIncidents, setStateIncidents] = useState<Incident[]>([]);
  const [stateOfficers, setStateOfficers] = useState<User[]>([]);
  const [stateAuditLogs, setStateAuditLogs] = useState<AuditLog[]>([]);
  const [infraHealth, setInfraHealth] = useState<StateInfrastructureHealth | null>(null);
  const [liveTempsByDistrict, setLiveTempsByDistrict] = useState<Record<string, number>>({});
  const [snapshotTimestamp, setSnapshotTimestamp] = useState<number>(0);

  const [loadingData, setLoadingData] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [exportingDistrictId, setExportingDistrictId] = useState<string | null>(null);

  const refreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notificationPopoverRef = useRef<HTMLDivElement>(null);

  // Auth / RBAC Gate
  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        router.replace('/login');
      } else if (user?.role !== 'state_admin') {
        router.replace(user?.role === 'dispatcher' ? '/command' : '/officer');
      }
    }
  }, [isLoading, isAuthenticated, user, router]);

  const fetchOverview = useCallback(async (silent = false) => {
    if (!token) return;
    if (!silent) setLoadingData(true);
    try {
      if (authMode === 'cloud') {
        const snap = await SupabaseStateClient.fetchStateOperationsSnapshot(token);
        setDistricts(snap.districts);
        setStateIncidents(snap.incidents);
        setStateOfficers(snap.officers);
        setStateAuditLogs(snap.auditLogs);
        setInfraHealth(snap.health);
        setSnapshotTimestamp(snap.health.timestamp);
        setFetchError(null);
        return;
      }

      const [overviewRes, healthRes] = await Promise.all([
        fetch(`${getBackendUrl()}/api/state/overview`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${getBackendUrl()}/health`).catch(() => null)
      ]);

      if (!overviewRes.ok) {
        const errData = await overviewRes.json().catch(() => ({}));
        const errText = errData.error || `State overview failed (HTTP ${overviewRes.status}).`;
        setFetchError(errText);
        setInfraHealth(prev => ({
          status: 'Offline',
          cloudConfigured: prev?.cloudConfigured ?? false,
          pendingSyncTotal: prev?.pendingSyncTotal ?? 0,
          failedSyncTotal: prev?.failedSyncTotal ?? 0,
          syncedTotal: prev?.syncedTotal ?? 0,
          timestamp: Date.now()
        }));
        return;
      }

      const data = await overviewRes.json();
      const healthBody = healthRes && healthRes.ok ? await healthRes.json().catch(() => null) : null;

      const list: DistrictSummary[] = data.districts || [];
      setDistricts(list);
      setStateIncidents(data.incidents || []);
      setStateOfficers(data.officers || []);
      setStateAuditLogs(data.auditLogs || []);

      const healthData: StateInfrastructureHealth = data.health || {
        status: healthBody?.status === 'Operational' ? 'Operational' : 'Degraded',
        cloudConfigured: Boolean(healthBody?.syncStatus?.cloudConfigured),
        pendingSyncTotal: 0,
        failedSyncTotal: 0,
        syncedTotal: list.filter(d => d.status === 'online').length,
        lanIPs: healthBody?.lanIPs || [],
        timestamp: Date.now()
      };
      setInfraHealth(healthData);
      setSnapshotTimestamp(healthData.timestamp);
      setFetchError(null);
    } catch (err: unknown) {
      console.error('Failed to fetch state overview:', err);
      if (err instanceof SupabaseSessionExpiredError) {
        await logout();
        router.replace('/login');
        return;
      }
      const msg = getErrMsg(err, 'Unable to load state operations data.');
      setFetchError(`${msg} Click Refresh or sign out and log in again.`);
      setInfraHealth({
        status: 'Offline',
        cloudConfigured: authMode === 'cloud',
        pendingSyncTotal: 0,
        failedSyncTotal: 1,
        syncedTotal: 0,
        timestamp: Date.now()
      });
    } finally {
      if (!silent) setLoadingData(false);
    }
  }, [token, authMode, logout, router]);

  // Initial load + periodic safety refresh
  useEffect(() => {
    if (!token || user?.role !== 'state_admin') return;
    const initTimer = setTimeout(() => {
      void fetchOverview(false);
    }, 0);
    const intervalMs = authMode === 'cloud' ? 30000 : 20000;
    const timer = setInterval(() => {
      void fetchOverview(true);
    }, intervalMs);
    return () => {
      clearTimeout(initTimer);
      clearInterval(timer);
    };
  }, [token, user?.role, authMode, fetchOverview]);

  // Real-time event subscriptions (Socket.IO in local mode + Supabase Realtime in cloud mode)
  useEffect(() => {
    if (!token || user?.role !== 'state_admin') return;

    const scheduleSilentRefresh = () => {
      if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
      refreshDebounceRef.current = setTimeout(() => {
        fetchOverview(true);
      }, 450);
    };

    if (authMode === 'cloud') {
      const unsubscribeRealtime = SupabaseStateClient.subscribeStateRealtime(token, () => {
        scheduleSilentRefresh();
      });
      return () => {
        unsubscribeRealtime();
        if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
      };
    }

    const unsubs = [
      clientEventBus.subscribe('sos:received', scheduleSilentRefresh),
      clientEventBus.subscribe('incident:updated', scheduleSilentRefresh),
      clientEventBus.subscribe('officer:status_changed', scheduleSilentRefresh),
      clientEventBus.subscribe('officer:telemetry', scheduleSilentRefresh),
      clientEventBus.subscribe('incident:warning_received', scheduleSilentRefresh),
      clientEventBus.subscribe('network:online', scheduleSilentRefresh),
      clientEventBus.subscribe('network:offline', scheduleSilentRefresh)
    ];

    return () => {
      unsubs.forEach(fn => fn());
      if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
    };
  }, [token, user?.role, authMode, fetchOverview]);

  // Live Open-Meteo temperatures for AP 28 Districts Sidebar (only displayed if valid weather resolves)
  useEffect(() => {
    if (!user || user.role !== 'state_admin' || !isOnline) return;
    let active = true;
    fetchBatchWeather(AP_DISTRICTS.map(d => ({ lat: d.centerLat, lng: d.centerLng })))
      .then(results => {
        if (!active || !Array.isArray(results)) return;
        const map: Record<string, number> = {};
        AP_DISTRICTS.forEach((d, idx) => {
          const temp = results[idx]?.temperatureC;
          if (typeof temp === 'number' && Number.isFinite(temp)) {
            map[d.district] = Number(temp.toFixed(1));
          }
        });
        setLiveTempsByDistrict(map);
      })
      .catch(() => {
        // Leave empty if weather API is unreachable (never show fabricated temps)
      });
    return () => {
      active = false;
    };
  }, [user, isOnline]);

  const handleExportBundle = async (district: DistrictSummary) => {
    if (!token) return;
    setExportingDistrictId(district.id);
    setFeedback(null);
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
      setFeedback({
        type: 'ok',
        text: `Exported offline provisioning pack for ${district.name} (${district.code}).`
      });
    } catch (err: unknown) {
      console.error('Failed to export district bundle:', err);
      setFeedback({
        type: 'err',
        text: getErrMsg(err, `Failed to export provisioning bundle for ${district.name}.`)
      });
    } finally {
      setExportingDistrictId(null);
    }
  };

  const openDistrictIn3D = useCallback((dist: DistrictSummary) => {
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
  }, []);

  const openIncidentInCommand = useCallback(
    (inc: Incident) => {
      const targetDist = inc.districtId || districts[0]?.id || 'd_eluru';
      router.push(
        `/command?districtId=${encodeURIComponent(targetDist)}&incidentId=${encodeURIComponent(inc.id)}`
      );
    },
    [districts, router]
  );

  // Derived real metrics (calculated from actual operational records)
  const totalOfficers = useMemo(
    () => districts.reduce((sum, d) => sum + d.totalOfficers, 0),
    [districts]
  );
  const totalOnlineDistricts = useMemo(
    () => districts.filter(d => d.status === 'online').length,
    [districts]
  );
  const totalOfflineDistricts = useMemo(
    () => districts.filter(d => d.status !== 'online').length,
    [districts]
  );
  const totalIncidents = useMemo(
    () => districts.reduce((sum, d) => sum + d.activeIncidents, 0),
    [districts]
  );
  const totalSos = useMemo(
    () => districts.reduce((sum, d) => sum + d.sosCount, 0),
    [districts]
  );

  const filteredDistricts = useMemo(() => {
    if (kpiFilter === 'online') return districts.filter(d => d.status === 'online');
    if (kpiFilter === 'offline') return districts.filter(d => d.status !== 'online');
    if (kpiFilter === 'incidents') return districts.filter(d => d.activeIncidents > 0 || d.sosCount > 0);
    return districts;
  }, [districts, kpiFilter]);

  const urgentNotificationCount = useMemo(() => {
    const p1Active = stateIncidents.filter(
      i => i.priority === 'P1' && i.status !== 'Resolved' && i.status !== 'Closed'
    ).length;
    return activeAlerts.length + p1Active + (fetchError ? 1 : 0);
  }, [activeAlerts.length, stateIncidents, fetchError]);

  const stateLinkHealthy = Boolean(
    isOnline && !fetchError && infraHealth && infraHealth.status === 'Operational'
  );

  if (isLoading || !user || user.role !== 'state_admin') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#F4F7FB] font-sans text-xs uppercase tracking-widest text-slate-500 min-h-screen">
        <RefreshCw className="w-6 h-6 animate-spin text-[#0E5AD6] mb-2" />
        <span>Verifying State Command Authority...</span>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[#F4F7FB] min-h-screen text-[#0B1C3D] font-sans overflow-x-hidden">
      {/* 1. TOP NAVIGATION HEADER (Deep Navy Government Banner) */}
      <header className="bg-[#0B1C3D] text-white px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 shadow-md relative z-30">
        {/* India Tricolor Accent Bar */}
        <div className="absolute top-0 left-0 right-0 h-[3px] flex" aria-hidden="true">
          <div className="flex-1 bg-[#FF9933]" />
          <div className="flex-1 bg-white" />
          <div className="flex-1 bg-[#138808]" />
        </div>

        <div className="flex items-center gap-3 mt-0.5 min-w-0">
          <button
            type="button"
            onClick={() => setSidebarOpen(prev => !prev)}
            aria-label="Toggle State Command sidebar"
            className="lg:hidden p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
          >
            {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>

          <picture className="flex-shrink-0">
            <source srcSet="/hero-logo.webp" type="image/webp" />
            <img
              src="/hero-logo.png"
              width={284}
              height={254}
              decoding="async"
              className="w-10 h-10 object-contain"
              alt="HERO Crest"
            />
          </picture>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-sm sm:text-base font-extrabold uppercase tracking-wider truncate">
                HERO STATE COMMAND &amp; ADMIN PORTAL
              </h1>
              <span className="text-[10px] px-2.5 py-0.5 bg-[#1E3A6D] border border-sky-400/35 text-sky-200 rounded-md font-bold uppercase tracking-wide">
                STATE HQ
              </span>
            </div>
            <p className="text-[11px] text-slate-300 font-medium truncate mt-0.5">
              Multi-District Provisioning, Offline Node Monitoring &amp; State Operations • Operator:{' '}
              <span className="text-white font-semibold">{user.name}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-2.5 mt-0.5">
          {/* Dynamic State Connectivity Pill */}
          <span
            className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase border flex items-center gap-1.5 ${
              stateLinkHealthy
                ? 'border-emerald-500/45 bg-emerald-950/60 text-emerald-300'
                : fetchError || infraHealth?.status === 'Offline'
                  ? 'border-red-500/50 bg-red-950/70 text-red-200'
                  : 'border-amber-500/50 bg-amber-950/60 text-amber-200'
            }`}
            title={
              fetchError
                ? fetchError
                : stateLinkHealthy
                  ? `Connected via ${authMode === 'cloud' ? 'Supabase State Cloud' : 'District Node Backend'}`
                  : 'Connectivity limited or checking'
            }
          >
            <span
              className={`w-2 h-2 rounded-full ${
                stateLinkHealthy
                  ? 'bg-emerald-400 animate-pulse'
                  : fetchError || infraHealth?.status === 'Offline'
                    ? 'bg-red-400'
                    : 'bg-amber-400'
              }`}
            />
            <span className="hidden sm:inline">
              {stateLinkHealthy
                ? 'STATE LINK ACTIVE'
                : fetchError || infraHealth?.status === 'Offline'
                  ? 'STATE LINK OFFLINE'
                  : 'SYNCING / DEGRADED'}
            </span>
          </span>

          {/* Refresh Action */}
          <button
            type="button"
            onClick={() => fetchOverview(false)}
            aria-label="Refresh State Overview"
            title="Refresh State Overview"
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-white transition cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loadingData ? 'animate-spin' : ''}`} />
          </button>

          {/* Notifications Trigger (Native Edge-Aware Popover) */}
          <button
            type="button"
            popoverTarget="hero-state-notifications"
            aria-label={`Open notifications (${urgentNotificationCount} alerts)`}
            title="Operational Notifications & Alerts"
            className="relative p-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-white transition cursor-pointer"
          >
            <Bell className="w-4 h-4" />
            {urgentNotificationCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#E5242A] text-white text-[9px] font-black flex items-center justify-center border border-[#0B1C3D]">
                {urgentNotificationCount}
              </span>
            )}
          </button>

          {/* Notifications Popover Panel */}
          <div
            id="hero-state-notifications"
            ref={notificationPopoverRef}
            popover="auto"
            className="hero-notif-popover w-80 sm:w-96 rounded-2xl border border-slate-200 bg-white text-[#0B1C3D] shadow-2xl p-0"
          >
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#0E5AD6]" aria-hidden="true" />
                <span className="text-xs font-extrabold uppercase tracking-wide">
                  State Alerts &amp; Notifications
                </span>
              </div>
              {activeAlerts.length > 0 && (
                <button
                  type="button"
                  onClick={clearAlerts}
                  className="text-[10px] font-bold text-[#0E5AD6] hover:underline cursor-pointer"
                >
                  Clear Socket Alerts
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto p-3 space-y-2 text-xs">
              {fetchError && (
                <div className="p-2.5 rounded-xl border border-red-200 bg-red-50 text-red-700 font-semibold">
                  {fetchError}
                </div>
              )}

              {activeAlerts.map(alert => (
                <div
                  key={alert.id}
                  className={`p-2.5 rounded-xl border ${
                    alert.type === 'emergency'
                      ? 'bg-red-50 border-red-200 text-red-800'
                      : 'bg-amber-50 border-amber-200 text-amber-800'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 font-bold">
                    <span>{alert.title}</span>
                    <span className="text-[10px] font-mono opacity-75">
                      {new Date(alert.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-[11px] mt-0.5">{alert.message}</p>
                </div>
              ))}

              {stateIncidents
                .filter(i => i.priority === 'P1' && i.status !== 'Resolved' && i.status !== 'Closed')
                .slice(0, 6)
                .map(inc => (
                  <button
                    key={inc.id}
                    type="button"
                    onClick={() => {
                      const pop = document.getElementById('hero-state-notifications') as (HTMLElement & { hidePopover?: () => void }) | null;
                      pop?.hidePopover?.();
                      openIncidentInCommand(inc);
                    }}
                    className="w-full text-left p-2.5 rounded-xl border border-red-200 bg-red-50/70 hover:bg-red-50 transition cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-red-700 truncate">{inc.title}</span>
                      <span className="text-[10px] font-mono text-red-500">
                        {new Date(inc.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-600 mt-0.5">
                      Priority {inc.priority} • Status: {inc.status} • Click to open hub
                    </div>
                  </button>
                ))}

              {urgentNotificationCount === 0 && (
                <p className="py-6 text-center text-xs text-slate-400">
                  No active SOS alerts or synchronization errors.
                </p>
              )}
            </div>
          </div>

          {/* Logout Action */}
          <button
            type="button"
            onClick={async () => {
              await logout();
              router.push('/login');
            }}
            aria-label="Logout"
            title="Logout"
            className="p-2 rounded-xl bg-white/10 hover:bg-red-500/35 border border-white/10 text-white transition cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 2. STATEWIDE KPI SUMMARY STRIP */}
      <section
        aria-label="Statewide Operational KPIs"
        className="px-4 sm:px-6 py-4 grid grid-cols-2 md:grid-cols-5 gap-3.5"
      >
        {/* A. Districts */}
        <button
          type="button"
          onClick={() => {
            setKpiFilter('all');
            setActiveTab('overview');
          }}
          className={`text-left bg-white rounded-2xl border p-4 flex items-center justify-between gap-3 shadow-xs transition cursor-pointer hover:border-[#0E5AD6] ${
            activeTab === 'overview' && kpiFilter === 'all'
              ? 'border-[#BFD8F8] ring-1 ring-[#EAF2FC]'
              : 'border-slate-200'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#EEF4FD] text-[#0E5AD6] flex items-center justify-center flex-shrink-0">
              <Building2 className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                DISTRICTS
              </span>
              <span className="text-2xl font-black text-[#0B1C3D] tabular-nums">
                {loadingData && districts.length === 0 ? '—' : districts.length}
              </span>
            </div>
          </div>
          <MapIcon className="w-8 h-8 text-slate-200 hidden xl:block flex-shrink-0" aria-hidden="true" />
        </button>

        {/* B. Cloud Synced */}
        <button
          type="button"
          onClick={() => {
            setKpiFilter(prev => (prev === 'online' ? 'all' : 'online'));
            setActiveTab('overview');
          }}
          className={`text-left bg-white rounded-2xl border p-4 flex items-center justify-between gap-3 shadow-xs transition cursor-pointer hover:border-emerald-500 ${
            kpiFilter === 'online' ? 'border-emerald-500 ring-1 ring-emerald-100' : 'border-slate-200'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
              <Wifi className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                CLOUD SYNCED
              </span>
              <span className="text-2xl font-black text-emerald-600 tabular-nums">
                {loadingData && districts.length === 0 ? '—' : totalOnlineDistricts}
              </span>
            </div>
          </div>
          <Cloud className="w-8 h-8 text-emerald-100 hidden xl:block flex-shrink-0" aria-hidden="true" />
        </button>

        {/* C. Local / Offline */}
        <button
          type="button"
          onClick={() => {
            setKpiFilter(prev => (prev === 'offline' ? 'all' : 'offline'));
            setActiveTab('overview');
          }}
          className={`text-left bg-white rounded-2xl border p-4 flex items-center justify-between gap-3 shadow-xs transition cursor-pointer hover:border-amber-500 ${
            kpiFilter === 'offline' ? 'border-amber-500 ring-1 ring-amber-100' : 'border-slate-200'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
              <WifiOff className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                LOCAL / OFFLINE
              </span>
              <span className="text-2xl font-black text-amber-600 tabular-nums">
                {loadingData && districts.length === 0 ? '—' : totalOfflineDistricts}
              </span>
            </div>
          </div>
          <WifiOff className="w-7 h-7 text-amber-100 hidden xl:block flex-shrink-0" aria-hidden="true" />
        </button>

        {/* D. Total Officers */}
        <button
          type="button"
          onClick={() => setActiveTab('provision')}
          className={`text-left bg-white rounded-2xl border p-4 flex items-center justify-between gap-3 shadow-xs transition cursor-pointer hover:border-[#0E5AD6] ${
            activeTab === 'provision' ? 'border-[#0E5AD6] ring-1 ring-[#EAF2FC]' : 'border-slate-200'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-slate-100 text-[#0B1C3D] flex items-center justify-center flex-shrink-0">
              <Users className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                TOTAL OFFICERS
              </span>
              <span className="text-2xl font-black text-[#0B1C3D] tabular-nums">
                {loadingData && districts.length === 0 ? '—' : totalOfficers}
              </span>
            </div>
          </div>
          <Users className="w-8 h-8 text-slate-100 hidden xl:block flex-shrink-0" aria-hidden="true" />
        </button>

        {/* E. Active Incidents / SOS */}
        <button
          type="button"
          onClick={() => {
            setKpiFilter(prev => (prev === 'incidents' ? 'all' : 'incidents'));
            setActiveTab('overview');
          }}
          className={`col-span-2 md:col-span-1 text-left bg-white rounded-2xl border p-4 flex items-center justify-between gap-3 shadow-xs transition cursor-pointer hover:border-red-500 ${
            kpiFilter === 'incidents' ? 'border-red-500 ring-1 ring-red-100' : 'border-slate-200'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0">
              <ShieldAlert
                className={`w-5 h-5 ${totalSos > 0 ? 'animate-pulse' : ''}`}
                aria-hidden="true"
              />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block truncate">
                ACTIVE INCIDENTS / SOS
              </span>
              <span className="text-2xl font-black text-[#DC2626] tabular-nums">
                {loadingData && districts.length === 0 ? '—' : totalIncidents}{' '}
                <span className="text-xs font-bold">({totalSos} SOS)</span>
              </span>
            </div>
          </div>
        </button>
      </section>

      {/* 3. MAIN WORKSPACE & LEFT NAVIGATION SIDEBAR */}
      <section className="flex-1 flex flex-col lg:flex-row px-4 sm:px-6 pb-6 gap-5 overflow-hidden">
        {/* Left Navigation Sidebar */}
        <aside
          aria-label="State Command Sidebar"
          className={`${
            sidebarOpen ? 'flex' : 'hidden lg:flex'
          } w-full lg:w-64 xl:w-72 flex-shrink-0 bg-white border border-slate-200 rounded-2xl p-4 flex-col gap-4 shadow-xs max-h-[calc(100vh-195px)] lg:sticky lg:top-4 overflow-y-auto`}
        >
          <nav aria-label="State Command Channels" className="space-y-1">
            <span className="text-[10px] text-slate-400 uppercase tracking-widest px-2.5 mb-2 block font-extrabold">
              STATE COMMAND CHANNELS
            </span>
            {[
              { id: 'overview' as const, label: 'District Operations Hub', icon: Building2 },
              { id: 'map3d' as const, label: '3D Map (Andhra Pradesh)', icon: Globe2 },
              { id: 'provision' as const, label: 'Create & Assign Districts', icon: Plus },
              { id: 'map' as const, label: 'Statewide 2D Radar', icon: MapIcon }
            ].map(item => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.id);
                    setSidebarOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold text-left transition cursor-pointer ${
                    active
                      ? 'bg-[#EAF2FC] text-[#0E5AD6] border border-[#BFD8F8]'
                      : 'text-slate-600 hover:text-[#0B1C3D] hover:bg-slate-50 border border-transparent'
                  }`}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-[#0E5AD6]' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Standalone Disaster Intelligence Modules */}
          <nav aria-label="Disaster Intelligence Modules" className="border-t border-slate-100 pt-3 space-y-1">
            <span className="text-[10px] text-slate-400 uppercase tracking-widest px-2.5 mb-1.5 block font-extrabold">
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
                  onClick={() => {
                    setActiveTab(mod.id);
                    setSidebarOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-left transition cursor-pointer ${
                    active
                      ? 'bg-[#EAF2FC] text-[#0E5AD6] border border-[#BFD8F8]'
                      : 'text-slate-600 hover:text-[#0B1C3D] hover:bg-slate-50 border border-transparent'
                  }`}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-[#0E5AD6]' : 'text-slate-400'}`} />
                  <span className="truncate">{mod.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Andhra Pradesh 28-District Quick Directory */}
          <div className="border-t border-slate-100 pt-3 flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between px-1 mb-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                AP 28 DISTRICTS (LIVE HUBS)
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelected3dDistrictName('');
                  setPending3dFlyTo(null);
                  setActiveTab('map3d');
                  setSidebarOpen(false);
                }}
                className="text-[10px] font-bold uppercase text-[#0E5AD6] hover:underline cursor-pointer"
              >
                ALL STATE
              </button>
            </div>

            <div className="space-y-1 overflow-y-auto pr-1 flex-1 min-h-[160px]">
              {AP_DISTRICTS.map(apDist => {
                const provisioned = districts.find(
                  d =>
                    matchApDistrict(d.name)?.district === apDist.district ||
                    matchApDistrict(d.code)?.district === apDist.district
                );
                const isSelected = selected3dDistrictName === apDist.district && activeTab === 'map3d';
                const liveTemp = liveTempsByDistrict[apDist.district];

                return (
                  <button
                    key={apDist.district}
                    type="button"
                    onClick={() => {
                      setSelected3dDistrictName(apDist.district);
                      setPending3dFlyTo(null);
                      setActiveTab('map3d');
                      setSidebarOpen(false);
                    }}
                    className={`w-full px-2.5 py-1.5 rounded-xl text-left text-[11px] flex items-center justify-between gap-2 transition cursor-pointer border ${
                      isSelected
                        ? 'bg-[#0E5AD6] text-white border-[#0E5AD6] font-bold'
                        : 'bg-slate-50/70 hover:bg-[#EAF2FC] text-slate-700 border-slate-200/70 font-medium'
                    }`}
                  >
                    <span className="truncate flex items-center gap-1.5">
                      <span
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          provisioned
                            ? provisioned.status === 'online'
                              ? 'bg-emerald-500'
                              : 'bg-amber-500'
                            : 'bg-slate-300'
                        }`}
                        title={
                          provisioned
                            ? provisioned.status === 'online'
                              ? 'Cloud Synced'
                              : 'Local / Offline'
                            : 'Not Provisioned'
                        }
                      />
                      <span className="truncate">{apDist.district}</span>
                    </span>
                    <span
                      className={`text-[10px] font-mono flex-shrink-0 ${
                        isSelected ? 'text-sky-100' : 'text-slate-400'
                      }`}
                      title={
                        liveTemp != null
                          ? `Live Open-Meteo telemetry: ${liveTemp}°C`
                          : `Code: ${apDist.code}`
                      }
                    >
                      {liveTemp != null ? `${liveTemp}°C` : apDist.code}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Main Workspace Area */}
        <main className="flex-1 min-w-0 space-y-5 overflow-y-auto">
          {/* Operational Error / Feedback Banners */}
          {fetchError && (
            <div
              role="alert"
              className="p-3.5 rounded-2xl border border-red-200 bg-red-50 text-red-700 text-xs font-bold flex flex-wrap items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                <span>{fetchError}</span>
              </div>
              <button
                type="button"
                onClick={() => fetchOverview(false)}
                className="px-3 py-1 rounded-lg bg-white border border-red-200 text-red-700 hover:bg-red-100 text-[11px] font-bold cursor-pointer"
              >
                Retry Connection
              </button>
            </div>
          )}

          {feedback && (
            <div
              className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center justify-between gap-2 ${
                feedback.type === 'ok'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-red-50 border-red-200 text-red-600'
              }`}
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>{feedback.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setFeedback(null)}
                aria-label="Dismiss message"
                className="p-1 opacity-70 hover:opacity-100 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* OVERVIEW TAB: DISTRICT CARDS + LOWER OPERATIONAL INTELLIGENCE WORKSPACE */}
          {activeTab === 'overview' && (
            <div className="space-y-5">
              {/* Active KPI Filter Chip */}
              {kpiFilter !== 'all' && (
                <div className="flex items-center justify-between bg-white border border-[#BFD8F8] rounded-xl px-4 py-2 text-xs">
                  <span className="font-semibold text-[#0B1C3D]">
                    Showing{' '}
                    <span className="font-bold text-[#0E5AD6]">
                      {kpiFilter === 'online'
                        ? 'Cloud Synced Districts'
                        : kpiFilter === 'offline'
                          ? 'Local / Offline & Provisioning Districts'
                          : 'Districts with Active Incidents / SOS'}
                    </span>{' '}
                    ({filteredDistricts.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setKpiFilter('all')}
                    className="text-xs font-bold text-[#0E5AD6] hover:underline cursor-pointer"
                  >
                    Show All ({districts.length})
                  </button>
                </div>
              )}

              {/* District Operational Hub Cards */}
              {loadingData && districts.length === 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {[0, 1, 2].map(i => (
                    <div
                      key={i}
                      className="h-56 rounded-2xl border border-slate-200 bg-white p-5 animate-pulse space-y-4"
                    >
                      <div className="h-4 w-2/3 bg-slate-200 rounded" />
                      <div className="h-3 w-1/2 bg-slate-100 rounded" />
                      <div className="grid grid-cols-3 gap-2 pt-3">
                        <div className="h-14 bg-slate-100 rounded-xl" />
                        <div className="h-14 bg-slate-100 rounded-xl" />
                        <div className="h-14 bg-slate-100 rounded-xl" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredDistricts.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3 shadow-xs">
                  <Building2 className="w-8 h-8 text-slate-300 mx-auto" aria-hidden="true" />
                  <h2 className="text-sm font-extrabold text-[#0B1C3D] uppercase tracking-wide">
                    {districts.length === 0
                      ? 'No District Hubs Configured'
                      : 'No Districts Match Current Filter'}
                  </h2>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    {districts.length === 0
                      ? 'Verify your State Cloud / District Node link or provision your first Andhra Pradesh District Command Hub.'
                      : 'Clear the active KPI filter to inspect all provisioned districts.'}
                  </p>
                  <div className="flex flex-wrap justify-center gap-2 pt-1">
                    {districts.length === 0 ? (
                      <>
                        <button
                          type="button"
                          onClick={() => fetchOverview(false)}
                          className="px-4 py-2 rounded-xl bg-[#0E5AD6] hover:bg-[#0B47AD] text-white font-bold text-xs cursor-pointer"
                        >
                          Refresh Overview
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTab('provision')}
                          className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-[#0B1C3D] font-bold text-xs cursor-pointer"
                        >
                          Create District Hub
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setKpiFilter('all')}
                        className="px-4 py-2 rounded-xl bg-[#0E5AD6] text-white font-bold text-xs cursor-pointer"
                      >
                        Reset Filter
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filteredDistricts.map(dist => {
                    const isSynced = dist.status === 'online';
                    const isProvisioning = dist.status === 'provisioning';
                    const hasCriticalAlert = dist.sosCount > 0 || Boolean(fetchError);

                    const statusBadgeClass = fetchError
                      ? 'bg-red-50 border-red-200 text-red-700'
                      : isSynced
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        : 'bg-amber-50 border-amber-200 text-amber-700';

                    const dotClass = hasCriticalAlert
                      ? 'bg-red-500'
                      : isSynced
                        ? 'bg-emerald-500'
                        : 'bg-amber-500';

                    const statusText = fetchError
                      ? 'CONNECTION ISSUE'
                      : isSynced
                        ? 'CLOUD SYNCED'
                        : isProvisioning
                          ? 'PROVISIONING'
                          : 'LOCAL / OFFLINE';

                    return (
                      <article
                        key={dist.id}
                        className={`bg-white rounded-2xl border p-4 shadow-xs flex flex-col justify-between gap-3.5 transition hover:shadow-md ${
                          dist.sosCount > 0 ? 'border-red-300' : 'border-slate-200'
                        }`}
                      >
                        {/* Header */}
                        <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-100">
                          <div className="flex items-start gap-2 min-w-0">
                            <span
                              className={`w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 ${dotClass}`}
                              aria-hidden="true"
                            />
                            <div className="min-w-0">
                              <h2 className="text-sm font-extrabold text-[#0B1C3D] uppercase tracking-tight truncate">
                                {dist.name} ({dist.code})
                              </h2>
                              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mt-0.5 truncate">
                                {dist.stateName} • ID: {dist.id}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Status Badge + Sync Time */}
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${statusBadgeClass}`}
                          >
                            {statusText}
                          </span>
                          <span className="text-[11px] font-medium text-slate-500">
                            {dist.lastSyncAt
                              ? `Last Sync: ${new Date(dist.lastSyncAt).toLocaleTimeString()}`
                              : 'Never Synced'}
                          </span>
                        </div>

                        {/* Metric Strip */}
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="bg-[#F8FAFC] border border-slate-200/80 rounded-xl p-2.5">
                            <span className="text-[9px] font-bold text-slate-400 uppercase block">
                              OFFICERS
                            </span>
                            <span className="text-sm font-extrabold text-[#0B1C3D] tabular-nums">
                              {dist.onlineOfficers}/{dist.totalOfficers}
                            </span>
                          </div>
                          <div className="bg-[#F8FAFC] border border-slate-200/80 rounded-xl p-2.5">
                            <span className="text-[9px] font-bold text-slate-400 uppercase block">
                              INCIDENTS
                            </span>
                            <span
                              className={`text-sm font-extrabold tabular-nums ${
                                dist.activeIncidents > 0 ? 'text-amber-600' : 'text-[#0B1C3D]'
                              }`}
                            >
                              {dist.activeIncidents}
                            </span>
                          </div>
                          <div className="bg-[#F8FAFC] border border-slate-200/80 rounded-xl p-2.5">
                            <span className="text-[9px] font-bold text-slate-400 uppercase block">
                              SOS / P1
                            </span>
                            <span
                              className={`text-sm font-extrabold tabular-nums ${
                                dist.sosCount > 0 ? 'text-red-600 animate-pulse' : 'text-[#0B1C3D]'
                              }`}
                            >
                              {dist.sosCount}/{dist.p1Count}
                            </span>
                          </div>
                        </div>

                        {dist.pendingSyncCount > 0 && (
                          <div className="text-[10px] font-mono font-semibold text-[#0E5AD6] bg-[#EAF2FC] border border-[#BFD8F8] px-3 py-1.5 rounded-xl">
                            {dist.pendingSyncCount} local records queued for sync
                          </div>
                        )}

                        {/* Card Actions */}
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => router.push(`/command?districtId=${encodeURIComponent(dist.id)}`)}
                            className="flex-1 py-2 px-3 bg-[#0E5AD6] hover:bg-[#0B47AD] text-white text-[11px] font-bold uppercase rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition shadow-xs"
                          >
                            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Open District Hub</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openDistrictIn3D(dist)}
                            className="py-2 px-3 bg-white hover:bg-slate-50 border border-slate-200 text-[#0B1C3D] text-[11px] font-bold uppercase rounded-xl flex items-center justify-center gap-1 cursor-pointer transition"
                            title="Inspect District in 3D GIS"
                          >
                            <Box className="w-3.5 h-3.5 text-[#0E5AD6]" aria-hidden="true" />
                            <span>3D Map</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleExportBundle(dist)}
                            disabled={exportingDistrictId === dist.id}
                            className="py-2 px-3 bg-white hover:bg-slate-50 disabled:opacity-50 border border-slate-200 text-[#0B1C3D] text-[11px] font-bold uppercase rounded-xl flex items-center justify-center gap-1 cursor-pointer transition"
                            title="Download Offline Provisioning Bundle (.json)"
                          >
                            <Download className="w-3.5 h-3.5 text-slate-600" aria-hidden="true" />
                            <span>{exportingDistrictId === dist.id ? '...' : 'Pack'}</span>
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}

              {/* Lower Operational Intelligence Row */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
                {/* Operational Map (Existing TacticalMap / RealLeafletMap) */}
                <section
                  aria-label="Andhra Pradesh Operational Map"
                  className="xl:col-span-5 bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col gap-3 min-h-[340px]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <MapIcon className="w-4 h-4 text-[#0E5AD6] flex-shrink-0" aria-hidden="true" />
                      <h2 className="text-sm font-bold text-[#0B1C3D] truncate">
                        Andhra Pradesh – Operational Map
                      </h2>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                        stateLinkHealthy
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : 'bg-amber-50 border-amber-200 text-amber-700'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          stateLinkHealthy ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                        }`}
                      />
                      <span>{stateLinkHealthy ? 'Live' : 'Cached'}</span>
                    </span>
                  </div>

                  <div className="flex-1 min-h-[270px] rounded-xl overflow-hidden">
                    <TacticalMap
                      districts={filteredDistricts}
                      incidents={stateIncidents.filter(i => i.status !== 'Closed' && i.status !== 'Resolved')}
                      officers={stateOfficers}
                      strictRealCoordinates
                      showApDistrictGeoJson
                      defaultBasemap="satellite"
                      isExpandable
                      isCommandCenter
                      onOpenDistrictHub={(distId) =>
                        router.push(`/command?districtId=${encodeURIComponent(distId)}`)
                      }
                      onOpenIncident={openIncidentInCommand}
                      onInspectIn3D={(target) => {
                        const matched = matchApDistrict(target.name);
                        setSelected3dDistrictName(matched?.district || target.name);
                        setPending3dFlyTo({
                          ...target,
                          districtName: matched?.district || target.name
                        });
                        setActiveTab('map3d');
                      }}
                    />
                  </div>
                </section>

                {/* Recent Incidents & Activity */}
                <div className="xl:col-span-4">
                  <RecentActivityPanel
                    districts={districts}
                    incidents={stateIncidents}
                    auditLogs={stateAuditLogs}
                    referenceTimestamp={snapshotTimestamp}
                    loading={loadingData}
                    onOpenDistrict={(distId) =>
                      router.push(`/command?districtId=${encodeURIComponent(distId)}`)
                    }
                    onOpenIncident={openIncidentInCommand}
                  />
                </div>

                {/* Right Stacked Column: Incident Trends + System & Infrastructure Health */}
                <div className="xl:col-span-3 flex flex-col gap-4 justify-between">
                  <IncidentTrendsCard
                    incidents={stateIncidents}
                    referenceTimestamp={snapshotTimestamp}
                    loading={loadingData}
                  />
                  <InfrastructureHealthCard
                    districts={districts}
                    health={infraHealth}
                    isOnline={isOnline}
                    authMode={authMode}
                  />
                </div>
              </div>
            </div>
          )}

          {/* 3D MAP TAB (Unified Native HERO 3D GIS Workspace) */}
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
            const scopedIncidents = heroDist
              ? stateIncidents.filter(i => i.districtId === heroDist.id)
              : stateIncidents;

            return (
              <div className="h-[calc(100vh-205px)] min-h-[620px] flex flex-col">
                <Hero3DGisView
                  mode={activeDistName ? 'district' : 'state'}
                  districtName={activeDistName}
                  districtCode={apMeta?.code || heroDist?.code}
                  centerLat={activeLat}
                  centerLng={activeLng}
                  districts={districts}
                  officers={stateOfficers}
                  incidents={scopedIncidents}
                  facilities={facilities}
                  pendingFlyTo={pending3dFlyTo}
                  selectedDistrictValue={selected3dDistrictName}
                  onDistrictSelectChange={(nextDist) => {
                    setSelected3dDistrictName(nextDist);
                    setPending3dFlyTo(null);
                  }}
                  liveTemperatures={liveTempsByDistrict}
                  isNetworkOnline={isOnline}
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

          {/* PROVISIONING TAB (Create & Assign Districts Workspace) */}
          {activeTab === 'provision' && (
            <ProvisioningWorkspace
              districts={districts}
              officers={stateOfficers}
              token={token}
              authMode={authMode}
              backendUrl={getBackendUrl()}
              onRefreshState={() => fetchOverview(false)}
              onOpenDistrictHub={(distId) =>
                router.push(`/command?districtId=${encodeURIComponent(distId)}`)
              }
              onExportBundle={handleExportBundle}
              onReturnToHub={() => setActiveTab('overview')}
            />
          )}

          {/* STATEWIDE 2D RADAR TAB */}
          {activeTab === 'map' && (
            <HUDPanel
              title="Statewide District Radar Overview"
              subtitle="Live Andhra Pradesh Geospatial Command Map (Boundaries, Nodes, Incidents & Officer GPS)"
              className="h-[calc(100vh-215px)] min-h-[560px]"
            >
              <TacticalMap
                districts={districts}
                incidents={stateIncidents.filter(i => i.status !== 'Closed' && i.status !== 'Resolved')}
                officers={stateOfficers}
                strictRealCoordinates
                showApDistrictGeoJson
                defaultBasemap="satellite"
                isExpandable
                isCommandCenter
                onOpenDistrictHub={(distId) =>
                  router.push(`/command?districtId=${encodeURIComponent(distId)}`)
                }
                onOpenIncident={openIncidentInCommand}
                onInspectIn3D={(target) => {
                  const matched = matchApDistrict(target.name);
                  setSelected3dDistrictName(matched?.district || target.name);
                  setPending3dFlyTo({
                    ...target,
                    districtName: matched?.district || target.name
                  });
                  setActiveTab('map3d');
                }}
              />
            </HUDPanel>
          )}

          {/* DISASTER INTELLIGENCE MODULES */}
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
