'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IntelligenceLeafletMap, MapMarkerSpec, MapPolygonSpec, MapPolylineSpec } from './IntelligenceLeafletMap';
import { fetchPointWeather, PointWeatherTelemetry } from '../../services/intelligence/OpenMeteoService';
import { sampleTerrainAndSlope } from '../../services/intelligence/TerrariumElevationService';
import { Incident } from '../../types';
import { getTacticalFacilitiesForDistrict, matchApDistrict } from '../../utils/apDistricts';
import { UrbanFloodControls, UrbanTelemetryStatus } from './UrbanFloodControls';
import { EvaluatedUrbanSegment, StreetDrainageFeedPanel } from './StreetDrainageFeedPanel';
import { EmergencyRoutePanel } from './EmergencyRoutePanel';
import { WaterloggingSimulatorCard } from './WaterloggingSimulatorCard';
import { DrainageInfrastructurePanel, VerifiedHospitalFacility } from './DrainageInfrastructurePanel';

interface UrbanCorridor {
  id: string;
  city: string;
  districtKey: string;
  lat: number;
  lng: number;
  drainCapacityMmHr: number;
  segments: Array<{
    id: string;
    name: string;
    role: 'drain_choke' | 'low_road' | 'safe_evac';
    thresholdDepthM: number;
    path: Array<[number, number]>;
    note: string;
  }>;
}

const AP_URBAN_HUBS: UrbanCorridor[] = [
  {
    id: 'eluru',
    city: 'Eluru Urban (Tammileru & Eluru Canal)',
    districtKey: 'Eluru',
    lat: 16.7107,
    lng: 81.0952,
    drainCapacityMmHr: 32,
    segments: [
      { id: 'elr-1', name: 'Powerpeta Railway Underpass', role: 'low_road', thresholdDepthM: 0.4, path: [[16.709, 81.089], [16.711, 81.095], [16.713, 81.101]], note: 'Chronically waterlogged underpass during heavy rain' },
      { id: 'elr-2', name: 'Tangellamudi Canal Bund Drain', role: 'drain_choke', thresholdDepthM: 0.8, path: [[16.718, 81.085], [16.721, 81.096], [16.724, 81.108]], note: 'Tammileru overflow backwater zone' },
      { id: 'elr-3', name: 'NH-16 Bypass Emergency Spine', role: 'safe_evac', thresholdDepthM: 2.2, path: [[16.695, 81.072], [16.715, 81.082], [16.735, 81.098]], note: 'Elevated highway — Safe Ambulance/Police Route' }
    ]
  },
  {
    id: 'vijayawada',
    city: 'Vijayawada (Budameru & Krishnalanka)',
    districtKey: 'NTR',
    lat: 16.5062,
    lng: 80.648,
    drainCapacityMmHr: 35,
    segments: [
      { id: 'vja-1', name: 'Ajit Singh Nagar / Budameru Lowlands', role: 'low_road', thresholdDepthM: 0.5, path: [[16.541, 80.628], [16.535, 80.641], [16.529, 80.654]], note: 'Budameru rivulet urban spill corridor' },
      { id: 'vja-2', name: 'Benz Circle Underpass & MG Road', role: 'drain_choke', thresholdDepthM: 0.9, path: [[16.498, 80.642], [16.499, 80.654], [16.501, 80.666]], note: 'High-density stormwater trunk junction' },
      { id: 'vja-3', name: 'Inner Ring Elevated Corridor', role: 'safe_evac', thresholdDepthM: 2.4, path: [[16.518, 80.612], [16.522, 80.648], [16.519, 80.682]], note: 'Clear High-Ground Emergency Route' }
    ]
  },
  {
    id: 'kakinada',
    city: 'Kakinada (Salt Creek & Bhanugudi)',
    districtKey: 'Kakinada',
    lat: 16.974,
    lng: 82.245,
    drainCapacityMmHr: 38,
    segments: [
      { id: 'kkd-1', name: 'Jagannaickpur Salt Creek Margin', role: 'low_road', thresholdDepthM: 0.4, path: [[16.942, 82.231], [16.948, 82.241], [16.955, 82.249]], note: 'Tidal backwater + storm surge choke point' },
      { id: 'kkd-2', name: 'Bhanugudi–Main Road Drain Trunk', role: 'drain_choke', thresholdDepthM: 0.9, path: [[16.968, 82.235], [16.978, 82.241], [16.987, 82.247]], note: 'Main commercial drainage bottleneck' },
      { id: 'kkd-3', name: 'ADB Road Elevated Evacuation Link', role: 'safe_evac', thresholdDepthM: 2.3, path: [[16.992, 82.212], [17.012, 82.185], [17.035, 82.155]], note: 'Safe Expressway Corridor to Samalkot/Surampalem' }
    ]
  },
  {
    id: 'visakhapatnam',
    city: 'Visakhapatnam (Gajuwaka & Poorna Market)',
    districtKey: 'Visakhapatnam',
    lat: 17.7231,
    lng: 83.3013,
    drainCapacityMmHr: 42,
    segments: [
      { id: 'vzg-1', name: 'Convent Junction–Port Low Basin', role: 'low_road', thresholdDepthM: 0.5, path: [[17.698, 83.285], [17.703, 83.295], [17.709, 83.304]], note: 'Low-lying coastal stormwater basin' },
      { id: 'vzg-2', name: 'Gajuwaka Old NH-16 Drain', role: 'drain_choke', thresholdDepthM: 0.9, path: [[17.686, 83.208], [17.692, 83.219], [17.699, 83.229]], note: 'Hill-runoff urban culvert' },
      { id: 'vzg-3', name: 'Beach Road & MVP Elevated Spine', role: 'safe_evac', thresholdDepthM: 2.3, path: [[17.718, 83.331], [17.734, 83.339], [17.748, 83.344]], note: 'Primary Coastal Emergency Access Route' }
    ]
  },
  {
    id: 'guntur',
    city: 'Guntur (Brodipet & Nallapadu)',
    districtKey: 'Guntur',
    lat: 16.3067,
    lng: 80.4365,
    drainCapacityMmHr: 30,
    segments: [
      { id: 'gnt-1', name: 'Kankarakunta Railway Underbridge', role: 'low_road', thresholdDepthM: 0.35, path: [[16.298, 80.432], [16.303, 80.438], [16.308, 80.443]], note: 'Frequent flash waterlogging (>35cm)' },
      { id: 'gnt-2', name: 'Nallacheruvu Drain Trunk', role: 'drain_choke', thresholdDepthM: 0.85, path: [[16.288, 80.442], [16.295, 80.449], [16.302, 80.456]], note: 'Silt-restricted city drain' },
      { id: 'gnt-3', name: 'Inner Ring Road (Autonagar–Pattabhipuram)', role: 'safe_evac', thresholdDepthM: 2.2, path: [[16.318, 80.408], [16.325, 80.434], [16.319, 80.461]], note: 'Passable Emergency Ring Route' }
    ]
  },
  {
    id: 'tirupati',
    city: 'Tirupati (Kapila Theertham & Town)',
    districtKey: 'Tirupati',
    lat: 13.6288,
    lng: 79.4192,
    drainCapacityMmHr: 36,
    segments: [
      { id: 'tpt-1', name: 'Leelamahal–Railway Underpass', role: 'low_road', thresholdDepthM: 0.45, path: [[13.626, 79.412], [13.629, 79.420], [13.631, 79.428]], note: 'Seshachalam runoff underpass' },
      { id: 'tpt-2', name: 'Kapila Theertham Waterfall Outfall Drain', role: 'drain_choke', thresholdDepthM: 0.8, path: [[13.649, 79.419], [13.642, 79.424], [13.636, 79.429]], note: 'Fast hill-to-city stormwater channel' },
      { id: 'tpt-3', name: 'Garuda Elevated Highway Spine', role: 'safe_evac', thresholdDepthM: 2.4, path: [[13.618, 79.398], [13.624, 79.422], [13.628, 79.448]], note: 'Elevated Emergency Dispatch Corridor' }
    ]
  }
];

function computePathKm(path: Array<[number, number]>): number {
  let total = 0;
  const R = 6371;
  for (let i = 1; i < path.length; i += 1) {
    const [lat1, lon1] = path[i - 1];
    const [lat2, lon2] = path[i];
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    total += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  return Number(total.toFixed(2));
}

interface UrbanFloodIntelligenceProps {
  incidents?: Incident[];
  onInspectIn3D?: (target: {
    id: string;
    name: string;
    lat: number;
    lng: number;
    kind: 'incident' | 'station';
    floor?: string;
    districtName?: string;
    description: string;
  }) => void;
}

export const UrbanFloodIntelligence: React.FC<UrbanFloodIntelligenceProps> = ({
  incidents = [],
  onInspectIn3D
}) => {
  const [selectedCityId, setSelectedCityId] = useState<string>('eluru');
  const [waterDepthM, setWaterDepthM] = useState<number>(0.7);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [focusedCoord, setFocusedCoord] = useState<{ lat: number; lng: number; zoom: number } | null>(null);

  const [showBlockedLayer, setShowBlockedLayer] = useState<boolean>(true);
  const [showSafeLayer, setShowSafeLayer] = useState<boolean>(true);
  const [showDrainLayer, setShowDrainLayer] = useState<boolean>(true);
  const [showFacilitiesLayer, setShowFacilitiesLayer] = useState<boolean>(true);

  const [weather, setWeather] = useState<PointWeatherTelemetry | null>(null);
  const [weatherStatus, setWeatherStatus] = useState<UrbanTelemetryStatus>('loading');
  const [microElevM, setMicroElevM] = useState<number | null>(null);
  const [terrainSource, setTerrainSource] = useState<'aws-terrarium' | 'fallback'>('fallback');
  const [kakinadaRoadsGj, setKakinadaRoadsGj] = useState<unknown>(null);
  const [kakinadaHospitals, setKakinadaHospitals] = useState<VerifiedHospitalFacility[]>([]);
  const [lastSyncedLabel, setLastSyncedLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const fetchSeqRef = useRef<number>(0);

  const hub = useMemo(
    () => AP_URBAN_HUBS.find(u => u.id === selectedCityId) || AP_URBAN_HUBS[0],
    [selectedCityId]
  );

  const executeTelemetryFetch = useCallback(async (lat: number, lng: number, cityId: string, hasRoads: boolean, hasHosp: boolean) => {
    const seq = ++fetchSeqRef.current;

    if (cityId === 'kakinada') {
      if (!hasRoads) {
        fetch('/gis-3d/data/kakinada_roads.geojson')
          .then(r => (r.ok ? r.json() : null))
          .then(gj => {
            if (gj) setKakinadaRoadsGj(gj);
          })
          .catch(() => {});
      }
      if (!hasHosp) {
        fetch('/gis-3d/data/unified_hospitals.geojson')
          .then(r => (r.ok ? r.json() : null))
          .then((gj: { features?: Array<{ geometry?: { coordinates?: [number, number] }; properties?: { name?: string; address?: string; emergency?: string } }> } | null) => {
            if (!gj?.features) return;
            const parsed: VerifiedHospitalFacility[] = gj.features
              .filter(f => Array.isArray(f.geometry?.coordinates) && f.geometry!.coordinates!.length >= 2)
              .map(f => ({
                name: f.properties?.name || 'Verified Hospital',
                address: f.properties?.address,
                emergency: f.properties?.emergency,
                lat: f.geometry!.coordinates![1],
                lng: f.geometry!.coordinates![0]
              }));
            setKakinadaHospitals(parsed);
          })
          .catch(() => {});
      }
    }

    try {
      const [wRes, tRes] = await Promise.allSettled([
        fetchPointWeather(lat, lng),
        sampleTerrainAndSlope(lat, lng, 18)
      ]);

      if (seq !== fetchSeqRef.current) return;

      if (wRes.status === 'fulfilled') {
        setWeather(wRes.value);
        setWeatherStatus('live');
      } else {
        setWeather(null);
        setWeatherStatus('error');
      }

      if (tRes.status === 'fulfilled') {
        setMicroElevM(tRes.value.elevationMeters);
        setTerrainSource(tRes.value.source);
      }

      setLastSyncedLabel(
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      );
    } finally {
      if (seq === fetchSeqRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void executeTelemetryFetch(
        hub.lat,
        hub.lng,
        hub.id,
        Boolean(kakinadaRoadsGj),
        kakinadaHospitals.length > 0
      );
    }, 0);
    return () => clearTimeout(timer);
  }, [hub.id, hub.lat, hub.lng, executeTelemetryFetch, kakinadaRoadsGj, kakinadaHospitals.length]);

  const handleSelectCity = (nextCityId: string) => {
    setSelectedCityId(nextCityId);
    setSelectedSegmentId(null);
    setFocusedCoord(null);
    setLoading(true);
    setWeatherStatus('loading');
  };

  const handleRefresh = () => {
    setLoading(true);
    setWeatherStatus(prev => (prev === 'live' ? 'live' : 'loading'));
    void executeTelemetryFetch(
      hub.lat,
      hub.lng,
      hub.id,
      Boolean(kakinadaRoadsGj),
      kakinadaHospitals.length > 0
    );
  };

  const evaluatedSegments: EvaluatedUrbanSegment[] = useMemo(() => {
    return hub.segments.map(seg => {
      const isFlooded = waterDepthM >= seg.thresholdDepthM;
      const isCaution = !isFlooded && waterDepthM >= seg.thresholdDepthM * 0.75;
      const mid = seg.path[Math.floor(seg.path.length / 2)];
      return {
        ...seg,
        lat: mid[0],
        lng: mid[1],
        lengthKm: computePathKm(seg.path),
        isFlooded,
        status: isFlooded ? 'IMPASSABLE' : isCaution ? 'CAUTION' : 'OPEN'
      };
    });
  }, [hub, waterDepthM]);

  const tacticalFacilities = useMemo(
    () => getTacticalFacilitiesForDistrict(hub.districtKey, hub.lat, hub.lng),
    [hub.districtKey, hub.lat, hub.lng]
  );

  const verifiedHospitals = useMemo(
    () => (hub.id === 'kakinada' ? kakinadaHospitals : []),
    [hub.id, kakinadaHospitals]
  );

  const corridorIncidents = useMemo(() => {
    return incidents.filter(inc => {
      if (inc.status === 'Resolved') return false;
      return (
        matchApDistrict(inc.districtId)?.district === hub.districtKey ||
        matchApDistrict(inc.title)?.district === hub.districtKey
      );
    });
  }, [incidents, hub.districtKey]);

  const { polygons, polylines, markers, floodedCount, safeCount } = useMemo(() => {
    let fCount = 0;
    let sCount = 0;
    const polys: MapPolygonSpec[] = [];
    const lines: MapPolylineSpec[] = [];
    const mks: MapMarkerSpec[] = [];

    evaluatedSegments.forEach(seg => {
      if (seg.isFlooded) fCount += 1;
      else sCount += 1;

      const isSelected = selectedSegmentId === seg.id;
      const visibleByLayer =
        (seg.isFlooded && showBlockedLayer) ||
        (seg.role === 'safe_evac' && !seg.isFlooded && showSafeLayer) ||
        (!seg.isFlooded && seg.role !== 'safe_evac' && showDrainLayer);

      if (!visibleByLayer && !isSelected) return;

      const color = seg.isFlooded ? '#ef4444' : seg.role === 'safe_evac' ? '#10b981' : '#f59e0b';
      lines.push({
        id: seg.id,
        positions: seg.path,
        color: isSelected ? '#0B193D' : color,
        weight: isSelected ? 7 : seg.isFlooded ? 6 : 5,
        dashArray: seg.isFlooded ? '8, 6' : undefined,
        title: `${seg.name} — ${seg.isFlooded ? 'FLOODED / IMPASSABLE' : 'PASSABLE'}`,
        subtitle: `${seg.note} (Flood threshold ${seg.thresholdDepthM}m)`,
        onClick: () => {
          setSelectedSegmentId(seg.id);
          setFocusedCoord({ lat: seg.lat, lng: seg.lng, zoom: 14 });
        }
      });

      if (seg.isFlooded) {
        const pad = 0.0035 + waterDepthM * 0.0015;
        polys.push({
          id: `uf-zone-${seg.id}`,
          positions: [
            [seg.lat - pad, seg.lng - pad],
            [seg.lat - pad, seg.lng + pad],
            [seg.lat + pad, seg.lng + pad],
            [seg.lat + pad, seg.lng - pad]
          ],
          color: '#dc2626',
          fillColor: '#ef4444',
          fillOpacity: 0.25,
          weight: 1.5,
          title: `Waterlogged Basin: ${seg.name}`,
          subtitle: `Depth ${waterDepthM.toFixed(1)}m exceeds ${seg.thresholdDepthM}m drain threshold`
        });
      }

      mks.push({
        id: `umk-${seg.id}`,
        lat: seg.lat,
        lng: seg.lng,
        title: seg.name,
        subtitle: `${seg.isFlooded ? 'Blocked at' : 'Safe up to'} ${seg.thresholdDepthM}m • ${seg.note}`,
        badge: seg.isFlooded ? 'BLOCKED' : 'CLEAR',
        color: isSelected ? '#0788C9' : color,
        radius: isSelected ? 14 : 12,
        pulse: seg.isFlooded || isSelected,
        onClick: () => {
          setSelectedSegmentId(seg.id);
          setFocusedCoord({ lat: seg.lat, lng: seg.lng, zoom: 14 });
        }
      });
    });

    if (showFacilitiesLayer) {
      tacticalFacilities.forEach(fac => {
        mks.push({
          id: `uf-fac-${fac.id}`,
          lat: fac.lat,
          lng: fac.lng,
          title: fac.name,
          subtitle: fac.desc,
          badge: fac.kind === 'shelter' ? 'SHEL' : fac.kind === 'station' ? 'POL' : 'EOC',
          color: '#1E3A8A',
          radius: 9
        });
      });
    }

    return { polygons: polys, polylines: lines, markers: mks, floodedCount: fCount, safeCount: sCount };
  }, [
    evaluatedSegments,
    selectedSegmentId,
    waterDepthM,
    showBlockedLayer,
    showSafeLayer,
    showDrainLayer,
    showFacilitiesLayer,
    tacticalFacilities
  ]);

  const mapCenter: [number, number] = focusedCoord
    ? [focusedCoord.lat, focusedCoord.lng]
    : [hub.lat, hub.lng];
  const mapZoom = focusedCoord ? focusedCoord.zoom : 13;

  const focusSegment =
    evaluatedSegments.find(s => s.id === selectedSegmentId) ||
    evaluatedSegments.find(s => s.isFlooded) ||
    evaluatedSegments[0];

  return (
    <div className="space-y-4">
      {/* Top Operations Control Center */}
      <UrbanFloodControls
        hubs={AP_URBAN_HUBS}
        selectedCityId={selectedCityId}
        activeHub={hub}
        onSelectCity={handleSelectCity}
        waterDepthM={waterDepthM}
        onChangeWaterDepthM={setWaterDepthM}
        onResetScenario={() => setWaterDepthM(0.1)}
        weather={weather}
        weatherStatus={weatherStatus}
        microElevM={microElevM}
        terrainSource={terrainSource}
        floodedCount={floodedCount}
        safeCount={safeCount}
        lastSyncedLabel={lastSyncedLabel}
        loading={loading}
        onRefresh={handleRefresh}
        onJumpToSimulator={() => {
          document.getElementById('waterlogging-scenario-simulator')?.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest'
          });
        }}
        onJumpToDrainage={() => {
          document.getElementById('drainage-infrastructure-panel')?.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest'
          });
        }}
        onInspectIn3D={
          onInspectIn3D
            ? () =>
                onInspectIn3D({
                  id: `urban-${hub.id}`,
                  name: `${hub.city} Flooded Zone (Safe Floors: Level 1+)`,
                  lat: hub.lat,
                  lng: hub.lng,
                  kind: 'incident',
                  floor: waterDepthM >= 1.2 ? '2' : '1',
                  districtName: hub.districtKey,
                  description: `Simulated Street Water Depth ${waterDepthM.toFixed(1)}m • Ground floor submerged, upper levels safe`
                })
            : undefined
        }
      />

      {/* Main Two-Column Workspace: Left Protected Operational Map (~67%) + Right Street Feed (~33%) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        <div className="xl:col-span-8 bg-white border border-slate-200 rounded-2xl p-2 shadow-xs flex flex-col justify-between gap-2 h-[500px] xl:h-[540px] min-h-[440px]">
          <div className="flex-1 min-h-0">
            <IntelligenceLeafletMap
              center={mapCenter}
              zoom={mapZoom}
              geojsonData={hub.id === 'kakinada' ? kakinadaRoadsGj : null}
              geojsonStyle={() => ({ color: '#64748b', weight: 1.2, opacity: 0.45 })}
              polygons={polygons}
              polylines={polylines}
              markers={markers}
              className="h-full rounded-xl border-slate-100"
            />
          </div>

          {/* Integrated Map Legend & Functional Layer Toggles */}
          <div className="px-2 py-1 flex flex-wrap items-center justify-between gap-2 text-[10.5px] border-t border-slate-100 flex-shrink-0">
            <span className="font-extrabold text-[#0B193D] uppercase tracking-wider">Map Legend:</span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowBlockedLayer(v => !v)}
                aria-pressed={showBlockedLayer}
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border font-semibold cursor-pointer transition ${
                  showBlockedLayer
                    ? 'bg-[#FFF3F3] border-[#F8CCCC] text-[#D93636]'
                    : 'bg-slate-50 border-slate-200 text-slate-400'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-[#ef4444]" aria-hidden="true" />
                <span>Blocked / Impassable</span>
              </button>

              <button
                type="button"
                onClick={() => setShowSafeLayer(v => !v)}
                aria-pressed={showSafeLayer}
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border font-semibold cursor-pointer transition ${
                  showSafeLayer
                    ? 'bg-[#ECFDF5] border-[#BDEBD8] text-[#16A477]'
                    : 'bg-slate-50 border-slate-200 text-slate-400'
                }`}
              >
                <span className="w-2.5 h-1 rounded bg-[#10b981]" aria-hidden="true" />
                <span>Accessible / Safe Spine</span>
              </button>

              <button
                type="button"
                onClick={() => setShowDrainLayer(v => !v)}
                aria-pressed={showDrainLayer}
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border font-semibold cursor-pointer transition ${
                  showDrainLayer
                    ? 'bg-[#FFFBEB] border-[#FDE68A] text-[#B45309]'
                    : 'bg-slate-50 border-slate-200 text-slate-400'
                }`}
              >
                <span className="w-2.5 h-1 rounded bg-[#f59e0b]" aria-hidden="true" />
                <span>Drain / Caution Corridor</span>
              </button>

              <button
                type="button"
                onClick={() => setShowFacilitiesLayer(v => !v)}
                aria-pressed={showFacilitiesLayer}
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border font-semibold cursor-pointer transition ${
                  showFacilitiesLayer
                    ? 'bg-[#EEF4FD] border-[#DCE7F7] text-[#1E3A8A]'
                    : 'bg-slate-50 border-slate-200 text-slate-400'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-[#1E3A8A]" aria-hidden="true" />
                <span>Critical Facility</span>
              </button>
            </div>
          </div>
        </div>

        <div className="xl:col-span-4 min-w-0">
          <StreetDrainageFeedPanel
            hubCity={hub.city}
            segments={evaluatedSegments}
            waterDepthM={waterDepthM}
            selectedSegmentId={selectedSegmentId}
            onInspectSegment={(seg) => {
              setSelectedSegmentId(seg.id);
              setFocusedCoord({ lat: seg.lat, lng: seg.lng, zoom: 14 });
            }}
            onResetOverview={() => {
              setSelectedSegmentId(null);
              setFocusedCoord(null);
            }}
            lastSyncedLabel={lastSyncedLabel}
          />
        </div>
      </div>

      {/* Bottom Operational Row: Route Intelligence + Scenario Simulator + Drainage & Infrastructure */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        <div className="lg:col-span-4 min-w-0">
          <EmergencyRoutePanel
            hubCity={hub.city}
            segments={evaluatedSegments}
            focusSegment={focusSegment}
            selectedRouteId={selectedSegmentId}
            onSelectRoute={(route) => {
              setSelectedSegmentId(route.id);
              setFocusedCoord({ lat: route.lat, lng: route.lng, zoom: 14 });
            }}
            corridorIncidents={corridorIncidents}
          />
        </div>

        <div className="lg:col-span-4 min-w-0">
          <WaterloggingSimulatorCard
            waterDepthM={waterDepthM}
            onChangeWaterDepthM={setWaterDepthM}
            onResetScenario={() => setWaterDepthM(0.1)}
            onFocusImpactOnMap={() => {
              const target = evaluatedSegments.find(s => s.isFlooded) || evaluatedSegments[0];
              if (target) {
                setSelectedSegmentId(target.id);
                setFocusedCoord({ lat: target.lat, lng: target.lng, zoom: 13 });
              }
            }}
            segments={evaluatedSegments}
          />
        </div>

        <div className="lg:col-span-4 min-w-0">
          <DrainageInfrastructurePanel
            hubCity={hub.city}
            drainCapacityMmHr={hub.drainCapacityMmHr}
            liveRainMm={weather?.precipitationMm ?? null}
            segments={evaluatedSegments}
            tacticalFacilities={tacticalFacilities}
            verifiedHospitals={verifiedHospitals}
            lastSyncedLabel={lastSyncedLabel}
            onFocusCoordinate={(lat, lng) => {
              setFocusedCoord({ lat, lng, zoom: 15 });
            }}
          />
        </div>
      </div>
    </div>
  );
};
