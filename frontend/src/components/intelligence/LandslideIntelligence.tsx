'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Layers } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { DistrictSummary, Incident, User } from '../../types';
import { FlyTo3DTarget } from '../shared/Hero3DGisView';
import { IntelligenceLeafletMap, MapMarkerSpec } from './IntelligenceLeafletMap';
import { fetchBatchWeather, PointWeatherTelemetry } from '../../services/intelligence/OpenMeteoService';
import { sampleTerrainAndSlope, TerrainSample } from '../../services/intelligence/TerrariumElevationService';
import { LandslideControlHeader } from './LandslideControlHeader';
import { LandslideWatchlistPanel } from './LandslideWatchlistPanel';
import { LandslideAnalyticsRow } from './LandslideAnalyticsRow';
import { CoordinateResponseModal, LogObservationModal } from './LandslideActionModals';
import {
  CoordinatedLandslideItem,
  EvaluatedLandslideZone,
  FieldLandslideReport,
  FieldObservationCategory,
  FieldReportReviewStatus,
  FieldReportSeverity,
  LandslideRegionFilter,
  LandslideZone
} from './landslideTypes';

const LANDSLIDE_CORRIDORS: LandslideZone[] = [
  {
    id: 'araku-ghat',
    name: 'Araku–Ananthagiri Ghat (SH-38)',
    region: 'AP Eastern Ghats',
    stateOrDistrict: 'Alluri Sitharama Raju, AP',
    lat: 18.235,
    lng: 83.005,
    vulnerableRoad: 'SH-38 Araku Valley Ghat Road & Kothavalasa Rail Line',
    historicalEvents: '6 rockfalls (2018–2024)',
    baseSlopeFallbackDeg: 18.5
  },
  {
    id: 'lambasingi',
    name: 'Lambasingi–Chintapalli Ghat',
    region: 'AP Eastern Ghats',
    stateOrDistrict: 'Alluri Sitharama Raju, AP',
    lat: 17.819,
    lng: 82.491,
    vulnerableRoad: 'Narsipatnam–Chintapalli State Highway',
    historicalEvents: '4 slope slips (2020–2023)',
    baseSlopeFallbackDeg: 16.2
  },
  {
    id: 'maredumilli',
    name: 'Maredumilli–Chinturu Hill Section',
    region: 'AP Eastern Ghats',
    stateOrDistrict: 'Polavaram / ASR, AP',
    lat: 17.615,
    lng: 81.708,
    vulnerableRoad: 'NH-365BB Bhadrachalam–Rampachodavaram Ghat',
    historicalEvents: '7 mudslides (2019–2024)',
    baseSlopeFallbackDeg: 15.8
  },
  {
    id: 'tirumala',
    name: 'Tirumala Ghat Road (Alipiri–2nd Ghat)',
    region: 'AP Eastern Ghats',
    stateOrDistrict: 'Tirupati, AP',
    lat: 13.669,
    lng: 79.354,
    vulnerableRoad: 'Tirumala Pilgrim Up-Ghat Highway (boulder zones)',
    historicalEvents: '5 boulder slips (2021 Cyclone)',
    baseSlopeFallbackDeg: 19.4
  },
  {
    id: 'indrakeeladri',
    name: 'Indrakeeladri & Mogalrajpuram Hills',
    region: 'AP Eastern Ghats',
    stateOrDistrict: 'NTR (Vijayawada), AP',
    lat: 16.515,
    lng: 80.606,
    vulnerableRoad: 'Kanaka Durga Ghat & Retaining Wall Settlements',
    historicalEvents: '4 urban hill rockfalls (2020–2024)',
    baseSlopeFallbackDeg: 14.0
  },
  {
    id: 'sikkim-nh10',
    name: 'Gangtok–Chungthang NH-10 Belt',
    region: 'NER Corridor',
    stateOrDistrict: 'Sikkim (NER)',
    lat: 27.516,
    lng: 88.622,
    vulnerableRoad: 'NH-10 Teesta Valley Highway',
    historicalEvents: '22+ severe slips (GLOF & Monsoon)',
    baseSlopeFallbackDeg: 28.0
  },
  {
    id: 'meghalaya-nh6',
    name: 'Sonapur Tunnel & Jowai NH-6 Hills',
    region: 'NER Corridor',
    stateOrDistrict: 'Meghalaya (NER)',
    lat: 25.106,
    lng: 92.362,
    vulnerableRoad: 'NH-6 Barak Valley Connectivity',
    historicalEvents: '18+ recurring mudslides',
    baseSlopeFallbackDeg: 24.5
  },
  {
    id: 'assam-haflong',
    name: 'Haflong–Lumding Dima Hasao Hills',
    region: 'NER Corridor',
    stateOrDistrict: 'Assam (NER)',
    lat: 25.165,
    lng: 93.018,
    vulnerableRoad: 'Lumding–Silchar Hill Rail & NH-27',
    historicalEvents: '15+ monsoon track breaches',
    baseSlopeFallbackDeg: 22.0
  }
];

const REPORTS_STORAGE_KEY = 'hero_landslide_field_reports_v1';

const getBackendUrl = () => {
  if (typeof window !== 'undefined') {
    const savedIp = localStorage.getItem('tactical_server_ip');
    if (savedIp) return `http://${savedIp}:5001`;
    return `http://${window.location.hostname}:5001`;
  }
  return 'http://localhost:5001';
};

function approxDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = (lat2 - lat1) * 111;
  const dLng = (lng2 - lng1) * 111 * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180));
  return Math.hypot(dLat, dLng);
}

interface LandslideIntelligenceProps {
  districts?: DistrictSummary[];
  officers?: User[];
  incidents?: Incident[];
  onInspectIn3D?: (target: FlyTo3DTarget) => void;
}

export const LandslideIntelligence: React.FC<LandslideIntelligenceProps> = ({
  districts = [],
  officers = [],
  incidents = [],
  onInspectIn3D
}) => {
  const { token, user, authMode } = useAuth();

  const [regionFilter, setRegionFilter] = useState<LandslideRegionFilter>('ALL');
  const [selectedId, setSelectedId] = useState<string>('araku-ghat');
  const [weatherByZone, setWeatherByZone] = useState<Record<string, PointWeatherTelemetry>>({});
  const [terrainByZone, setTerrainByZone] = useState<Record<string, TerrainSample>>({});
  const [fieldReports, setFieldReports] = useState<FieldLandslideReport[]>([]);
  const [incidentOverrides, setIncidentOverrides] = useState<
    Record<string, { status?: Incident['status']; assigneeId?: string | null }>
  >({});
  const [createdBackendIncidents, setCreatedBackendIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  const [showCorridorPins, setShowCorridorPins] = useState<boolean>(true);
  const [showReportPins, setShowReportPins] = useState<boolean>(true);
  const [legendExpanded, setLegendExpanded] = useState<boolean>(true);

  const [obsModalOpen, setObsModalOpen] = useState<boolean>(false);
  const [obsInitialZoneId, setObsInitialZoneId] = useState<string>('araku-ghat');
  const [coordModalOpen, setCoordModalOpen] = useState<boolean>(false);
  const [coordInitialKey, setCoordInitialKey] = useState<string | undefined>(undefined);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const raw = localStorage.getItem(REPORTS_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setFieldReports(parsed);
        }
      } catch {}
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [wList, tList] = await Promise.all([
        fetchBatchWeather(LANDSLIDE_CORRIDORS.map(z => ({ lat: z.lat, lng: z.lng }))).catch(() => []),
        Promise.all(LANDSLIDE_CORRIDORS.map(z => sampleTerrainAndSlope(z.lat, z.lng, 600)))
      ]);
      const wMap: Record<string, PointWeatherTelemetry> = {};
      const tMap: Record<string, TerrainSample> = {};
      LANDSLIDE_CORRIDORS.forEach((z, i) => {
        if (wList[i]) wMap[z.id] = wList[i];
        if (tList[i]) tMap[z.id] = tList[i];
      });
      setWeatherByZone(wMap);
      setTerrainByZone(tMap);
      setLastUpdatedAt(Date.now());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadAll();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadAll]);

  const evaluatedAllZones: EvaluatedLandslideZone[] = useMemo(() => {
    return LANDSLIDE_CORRIDORS.map(z => {
      const w = weatherByZone[z.id];
      const t = terrainByZone[z.id];
      const slope = t && t.source === 'aws-terrarium' && t.slopeDegrees > 1 ? t.slopeDegrees : z.baseSlopeFallbackDeg;
      const rain72 = w?.next72hRainMm ?? 0;
      const soilPct = (w?.soilMoistureTop ?? 0.25) * 100;
      const risk = Math.min(100, Math.round((slope / 30) * 40 + (rain72 / 120) * 35 + (soilPct / 45) * 25));
      const tier = risk >= 70 ? 'CRITICAL' : risk >= 50 ? 'HIGH' : risk >= 30 ? 'MODERATE' : 'LOW';
      return { zone: z, weather: w, terrain: t, slope, rain72, soilPct, risk, tier };
    });
  }, [weatherByZone, terrainByZone]);

  const visibleZones = useMemo(
    () => evaluatedAllZones.filter(v => regionFilter === 'ALL' || v.zone.region === regionFilter),
    [evaluatedAllZones, regionFilter]
  );

  const activeEval = useMemo(
    () => visibleZones.find(v => v.zone.id === selectedId) || visibleZones[0],
    [visibleZones, selectedId]
  );

  const handleRegionChange = (nextRegion: LandslideRegionFilter) => {
    setRegionFilter(nextRegion);
    const matching = evaluatedAllZones.filter(v => nextRegion === 'ALL' || v.zone.region === nextRegion);
    if (matching.length > 0 && !matching.some(v => v.zone.id === selectedId)) {
      setSelectedId(matching[0].zone.id);
    }
  };

  const reportCountByZone = useMemo(() => {
    const counts: Record<string, number> = {};
    fieldReports.forEach(r => {
      counts[r.zoneId] = (counts[r.zoneId] || 0) + 1;
    });
    return counts;
  }, [fieldReports]);

  const combinedBackendIncidents = useMemo(() => {
    const merged = new Map<string, Incident>();
    [...incidents, ...createdBackendIncidents].forEach(inc => {
      const patch = incidentOverrides[inc.id];
      merged.set(inc.id, patch ? { ...inc, ...patch } : inc);
    });
    return Array.from(merged.values());
  }, [incidents, createdBackendIncidents, incidentOverrides]);

  const relevantLandslideIncidents = useMemo(() => {
    const keywordRe = /(landslide|rockfall|mudslide|slope|ghat|boulder|retaining wall|slip|araku|lambasingi|maredumilli|tirumala|indrakeeladri|nh-10|nh-6|haflong)/i;
    return combinedBackendIncidents.filter(inc => {
      if (keywordRe.test(`${inc.title} ${inc.description}`)) return true;
      if (inc.locationLat != null && inc.locationLng != null) {
        return LANDSLIDE_CORRIDORS.some(z => approxDistanceKm(z.lat, z.lng, inc.locationLat!, inc.locationLng!) <= 35);
      }
      return false;
    });
  }, [combinedBackendIncidents]);

  const coordinatedItems: CoordinatedLandslideItem[] = useMemo(() => {
    const zoneById = new Map(LANDSLIDE_CORRIDORS.map(z => [z.id, z]));

    const reportItems: CoordinatedLandslideItem[] = fieldReports.map(r => {
      const z = zoneById.get(r.zoneId);
      const shortId = r.id.startsWith('ls-') ? `FLR-${r.id.slice(-4)}` : r.id;
      return {
        key: `field:${r.id}`,
        source: 'field',
        displayId: shortId,
        zoneId: r.zoneId,
        locationLabel: z ? z.name : `${r.lat.toFixed(2)}, ${r.lng.toFixed(2)}`,
        observation: r.category ? `${r.category}: ${r.note}` : r.note,
        severityLabel: r.severity,
        statusLabel: r.reviewStatus || 'Under Review',
        timestamp: r.reportedAt,
        fieldReport: r
      };
    });

    const incidentItems: CoordinatedLandslideItem[] = relevantLandslideIncidents.map(inc => ({
      key: `inc:${inc.id}`,
      source: 'incident',
      displayId: inc.id.slice(0, 8).toUpperCase(),
      locationLabel: inc.title,
      observation: inc.description || inc.title,
      severityLabel: inc.priority,
      statusLabel: inc.status,
      timestamp: inc.timestamp,
      incident: inc
    }));

    return [...reportItems, ...incidentItems].sort((a, b) => b.timestamp - a.timestamp);
  }, [fieldReports, relevantLandslideIncidents]);

  const canSyncBackend = Boolean(token && authMode === 'local');
  const canBackendDispatch = Boolean(
    token && authMode === 'local' && (user?.role === 'state_admin' || user?.role === 'dispatcher')
  );

  const resolveDistrictIdForZone = useCallback(
    (zoneId: string): string | undefined => {
      const z = LANDSLIDE_CORRIDORS.find(c => c.id === zoneId);
      if (!z || districts.length === 0) return undefined;
      const matched = districts.find(d => z.stateOrDistrict.toLowerCase().includes(d.name.toLowerCase()));
      return matched?.id;
    },
    [districts]
  );

  const handleSubmitObservation = async (payload: {
    zoneId: string;
    category: FieldObservationCategory;
    severity: FieldReportSeverity;
    note: string;
    lat: number;
    lng: number;
    escalateToCommand: boolean;
  }): Promise<{ ok: boolean; message: string }> => {
    const zone = LANDSLIDE_CORRIDORS.find(z => z.id === payload.zoneId);
    let backendIncidentId: string | undefined;

    if (payload.escalateToCommand && token && authMode === 'local') {
      try {
        const districtId = resolveDistrictIdForZone(payload.zoneId);
        const priority = payload.severity === 'High' ? 'P1' : payload.severity === 'Moderate' ? 'P2' : 'P3';
        const res = await fetch(`${getBackendUrl()}/api/incidents`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            title: `[Landslide] ${payload.category} — ${zone?.name || 'Corridor'}`,
            description: payload.note,
            priority,
            lat: payload.lat,
            lng: payload.lng,
            ...(districtId ? { districtId } : {})
          })
        });
        if (res.ok) {
          const created = (await res.json()) as Incident;
          backendIncidentId = created.id;
          setCreatedBackendIncidents(prev => [created, ...prev]);
        }
      } catch {
        // Offline / local server unavailable: continue persisting the geo-tagged field report locally
      }
    }

    const nextReport: FieldLandslideReport = {
      id: `ls-${Date.now()}`,
      zoneId: payload.zoneId,
      category: payload.category,
      note: payload.note,
      severity: payload.severity,
      reviewStatus: 'Under Review',
      backendIncidentId,
      lat: payload.lat,
      lng: payload.lng,
      reportedAt: Date.now()
    };

    const nextList = [nextReport, ...fieldReports];
    setFieldReports(nextList);
    try {
      localStorage.setItem(REPORTS_STORAGE_KEY, JSON.stringify(nextList));
    } catch {}

    return { ok: true, message: 'Field observation recorded.' };
  };

  const handleUpdateFieldReportStatus = (
    reportId: string,
    reviewStatus: FieldReportReviewStatus,
    assignedUnit?: string
  ) => {
    const next = fieldReports.map(r =>
      r.id === reportId ? { ...r, reviewStatus, assignedUnit } : r
    );
    setFieldReports(next);
    try {
      localStorage.setItem(REPORTS_STORAGE_KEY, JSON.stringify(next));
    } catch {}
  };

  const handleUpdateBackendIncidentStatus = async (
    incidentId: string,
    status: 'Open' | 'Dispatched' | 'Resolved' | 'Closed'
  ): Promise<{ ok: boolean; message: string }> => {
    if (!token || authMode !== 'local') {
      return { ok: false, message: 'Requires local server authentication.' };
    }
    try {
      const res = await fetch(`${getBackendUrl()}/api/incidents/${encodeURIComponent(incidentId)}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, message: body.error || `Failed (HTTP ${res.status})` };
      }
      setIncidentOverrides(prev => ({
        ...prev,
        [incidentId]: { ...prev[incidentId], status }
      }));
      return { ok: true, message: `Incident updated to ${status}.` };
    } catch {
      return { ok: false, message: 'Could not reach tactical backend.' };
    }
  };

  const handleDispatchOfficerToIncident = async (
    incidentId: string,
    assigneeId: string
  ): Promise<{ ok: boolean; message: string }> => {
    if (!token || authMode !== 'local') {
      return { ok: false, message: 'Requires local server authentication.' };
    }
    try {
      const res = await fetch(`${getBackendUrl()}/api/incidents/${encodeURIComponent(incidentId)}/dispatch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ assigneeId })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, message: body.error || `Dispatch failed (HTTP ${res.status})` };
      }
      setIncidentOverrides(prev => ({
        ...prev,
        [incidentId]: { ...prev[incidentId], assigneeId, status: 'Dispatched' }
      }));
      return { ok: true, message: body.message || 'Field officer dispatched.' };
    } catch {
      return { ok: false, message: 'Could not reach tactical backend.' };
    }
  };

  const markers: MapMarkerSpec[] = useMemo(() => {
    const zoneMarkers: MapMarkerSpec[] = showCorridorPins
      ? visibleZones.map(v => ({
          id: `ls-z-${v.zone.id}`,
          lat: v.zone.lat,
          lng: v.zone.lng,
          title: `${v.zone.name} (${v.tier})`,
          subtitle: `Risk ${v.risk}/100 • Slope ${v.slope.toFixed(1)}° • Soil ${v.soilPct.toFixed(0)}% • ${v.zone.vulnerableRoad}`,
          badge: `${v.risk}`,
          color:
            v.tier === 'CRITICAL'
              ? '#dc2626'
              : v.tier === 'HIGH'
                ? '#ea580c'
                : v.tier === 'MODERATE'
                  ? '#f59e0b'
                  : '#10b981',
          radius: v.zone.id === selectedId ? 14 : 11,
          pulse: v.tier === 'CRITICAL' || v.tier === 'HIGH',
          onClick: () => setSelectedId(v.zone.id)
        }))
      : [];

    const reportMarkers: MapMarkerSpec[] = showReportPins
      ? fieldReports.map(r => ({
          id: r.id,
          lat: r.lat,
          lng: r.lng,
          title: `Field Report (${r.severity})`,
          subtitle: `${r.category ? `${r.category}: ` : ''}${r.note} • ${new Date(r.reportedAt).toLocaleString()}`,
          badge: 'RPT',
          color: r.severity === 'High' ? '#991b1b' : '#0284c7',
          radius: 9
        }))
      : [];

    return [...zoneMarkers, ...reportMarkers];
  }, [visibleZones, fieldReports, selectedId, showCorridorPins, showReportPins]);

  const mapCenter: [number, number] =
    regionFilter === 'NER Corridor'
      ? [25.8, 90.8]
      : [activeEval?.zone.lat ?? 17.5, activeEval?.zone.lng ?? 81.8];

  return (
    <div className="space-y-5">
      {/* Header & 4-Card Metrics Strip */}
      <LandslideControlHeader
        regionFilter={regionFilter}
        onRegionChange={handleRegionChange}
        visibleZones={visibleZones}
        activeEval={activeEval}
        selectedId={selectedId}
        onSelectZone={setSelectedId}
        loading={loading}
        onRefresh={loadAll}
        onInspectIn3D={
          onInspectIn3D && activeEval
            ? () =>
                onInspectIn3D({
                  id: activeEval.zone.id,
                  name: activeEval.zone.name,
                  lat: activeEval.zone.lat,
                  lng: activeEval.zone.lng,
                  kind: 'incident',
                  description: `Landslide Risk ${activeEval.risk}/100 • Slope ${activeEval.slope.toFixed(1)}° • ${activeEval.zone.vulnerableRoad}`
                })
            : undefined
        }
      />

      {/* Two-Column Main Operational Workspace */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
        {/* Left: Protected Map Panel (DO NOT MODIFY IntelligenceLeafletMap / Inner) */}
        <div className="xl:col-span-8 relative h-[500px] rounded-2xl border border-slate-200/90 bg-white overflow-hidden shadow-xs min-w-0">
          <IntelligenceLeafletMap
            center={mapCenter}
            zoom={regionFilter === 'NER Corridor' ? 6 : 7}
            baseStyle="topo"
            markers={markers}
          />

          {/* Compact External Legend & Layer Controls Overlay */}
          <div className="absolute bottom-3 right-3 z-[500] w-56 rounded-2xl bg-white/95 backdrop-blur-sm border border-slate-200 shadow-lg text-[11px] overflow-hidden">
            <div className="px-3 py-2 flex items-center justify-between border-b border-slate-100 bg-slate-50/80">
              <span className="font-black text-slate-800 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-sky-600" aria-hidden="true" />
                Map Legend
              </span>
              <button
                type="button"
                aria-expanded={legendExpanded}
                aria-label={legendExpanded ? 'Collapse map legend' : 'Expand map legend'}
                onClick={() => setLegendExpanded(v => !v)}
                className="p-0.5 rounded text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                {legendExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
              </button>
            </div>

            {legendExpanded && (
              <div className="p-2.5 space-y-2">
                <div className="space-y-1 text-[10.5px] font-semibold text-slate-700">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-600 shrink-0" />
                    Critical Risk (≥ 70)
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-orange-600 shrink-0" />
                    High Risk (50–69)
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                    Moderate Risk (30–49)
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                    Low Risk (&lt; 30)
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-sky-600 shrink-0" />
                    Geo-Tagged Field Report
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-[10px] font-bold">
                  <label className="flex items-center gap-1 cursor-pointer text-slate-600">
                    <input
                      type="checkbox"
                      checked={showCorridorPins}
                      onChange={e => setShowCorridorPins(e.target.checked)}
                      className="rounded border-slate-300 text-sky-600"
                    />
                    Corridors
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer text-slate-600">
                    <input
                      type="checkbox"
                      checked={showReportPins}
                      onChange={e => setShowReportPins(e.target.checked)}
                      className="rounded border-slate-300 text-sky-600"
                    />
                    Reports ({fieldReports.length})
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Field Observation CTA & Corridor Watchlist */}
        <div className="xl:col-span-4 min-w-0">
          <LandslideWatchlistPanel
            visibleZones={visibleZones}
            selectedId={selectedId}
            onSelectZone={setSelectedId}
            reportCountByZone={reportCountByZone}
            onOpenObservationModal={zoneId => {
              setObsInitialZoneId(zoneId || selectedId);
              setObsModalOpen(true);
            }}
          />
        </div>
      </div>

      {/* Bottom 3-Panel Analytics & Coordination Row */}
      <LandslideAnalyticsRow
        activeEval={activeEval}
        coordinatedItems={coordinatedItems}
        lastUpdatedAt={lastUpdatedAt}
        loading={loading}
        onOpenCoordModal={itemKey => {
          setCoordInitialKey(itemKey);
          setCoordModalOpen(true);
        }}
      />

      {/* Native <dialog> Modals */}
      <LogObservationModal
        open={obsModalOpen}
        onClose={() => setObsModalOpen(false)}
        zones={evaluatedAllZones}
        initialZoneId={obsInitialZoneId}
        canSyncBackend={canSyncBackend}
        onSubmitObservation={handleSubmitObservation}
      />

      <CoordinateResponseModal
        open={coordModalOpen}
        onClose={() => setCoordModalOpen(false)}
        items={coordinatedItems}
        initialItemKey={coordInitialKey}
        officers={officers}
        canBackendDispatch={canBackendDispatch}
        onUpdateFieldReportStatus={handleUpdateFieldReportStatus}
        onUpdateBackendIncidentStatus={handleUpdateBackendIncidentStatus}
        onDispatchOfficerToIncident={handleDispatchOfficerToIncident}
        onOpenNewObservation={() => {
          setObsInitialZoneId(selectedId);
          setObsModalOpen(true);
        }}
      />
    </div>
  );
};
