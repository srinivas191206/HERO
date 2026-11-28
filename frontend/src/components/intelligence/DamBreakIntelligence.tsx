'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IntelligenceLeafletMap, MapMarkerSpec, MapPolygonSpec, MapPolylineSpec } from './IntelligenceLeafletMap';
import { fetchPointWeather, fetchRiverDischarge, PointWeatherTelemetry, RiverDischargeTelemetry } from '../../services/intelligence/OpenMeteoService';
import { sampleTerrainAndSlope } from '../../services/intelligence/TerrariumElevationService';
import { DamSimulationControls, TelemetryState } from './DamSimulationControls';
import {
  AssessedSettlement,
  DownstreamImpactPanel,
  RiskSeverity,
  SettlementSortKey
} from './DownstreamImpactPanel';

interface DamProfile {
  id: string;
  name: string;
  river: string;
  district: string;
  lat: number;
  lng: number;
  frlMeters: number;
  capacityTmc: number;
  downstreamRegions: Array<{
    name: string;
    lat: number;
    lng: number;
    distanceKm: number;
    population: number;
    criticalInfra: string;
    shelterName: string;
    shelterLat: number;
    shelterLng: number;
  }>;
  corridor: Array<[number, number]>;
}

const AP_DAMS: DamProfile[] = [
  {
    id: 'polavaram',
    name: 'Polavaram Multipurpose Dam',
    river: 'Godavari River',
    district: 'Polavaram / Eluru',
    lat: 17.2797,
    lng: 81.6512,
    frlMeters: 45.72,
    capacityTmc: 194.6,
    corridor: [
      [17.2797, 81.6512], [17.16, 81.69], [17.02, 81.74], [16.935, 81.771], [16.75, 81.86], [16.58, 82.05]
    ],
    downstreamRegions: [
      { name: 'Polavaram Town & Project Colony', lat: 17.247, lng: 81.646, distanceKm: 4, population: 24500, criticalInfra: 'Sub-station, CHC Hospital, Bridge', shelterName: 'Polavaram Hilltop Relief Camp', shelterLat: 17.255, shelterLng: 81.615 },
      { name: 'Kovvur & Rajamahendravaram Bank', lat: 17.008, lng: 81.742, distanceKm: 32, population: 185000, criticalInfra: 'Rail-cum-Road Bridge, Water Works, GGH', shelterName: 'Rajahmundry Arts College Shelter', shelterLat: 17.015, shelterLng: 81.795 },
      { name: 'Dowleswaram & Konaseema Delta', lat: 16.9355, lng: 81.7712, distanceKm: 41, population: 310000, criticalInfra: 'Cotton Barrage Headworks, NH-16', shelterName: 'Bommuru Cyclone Relief Center', shelterLat: 16.942, shelterLng: 81.815 }
    ]
  },
  {
    id: 'dowleswaram',
    name: 'Sir Arthur Cotton Barrage',
    river: 'Godavari River',
    district: 'East Godavari',
    lat: 16.9355,
    lng: 81.7712,
    frlMeters: 13.64,
    capacityTmc: 2.93,
    corridor: [
      [16.9355, 81.7712], [16.82, 81.86], [16.70, 81.96], [16.58, 82.05], [16.45, 82.18]
    ],
    downstreamRegions: [
      { name: 'Kadiam & Ravulapalem Delta', lat: 16.77, lng: 81.84, distanceKm: 19, population: 92000, criticalInfra: 'NH-16 Corridor, 132kV Grid', shelterName: 'Ravulapalem Govt Junior College', shelterLat: 16.765, shelterLng: 81.865 },
      { name: 'Amalapuram & Central Delta', lat: 16.578, lng: 82.005, distanceKm: 46, population: 165000, criticalInfra: 'Area Hospital, District Collectorate', shelterName: 'Amalapuram Stadium High Ground', shelterLat: 16.586, shelterLng: 82.022 }
    ]
  },
  {
    id: 'prakasam',
    name: 'Prakasam Barrage',
    river: 'Krishna River',
    district: 'NTR / Guntur',
    lat: 16.5067,
    lng: 80.6052,
    frlMeters: 17.39,
    capacityTmc: 3.07,
    corridor: [
      [16.5067, 80.6052], [16.42, 80.66], [16.29, 80.76], [16.14, 80.89], [15.98, 80.98]
    ],
    downstreamRegions: [
      { name: 'Krishnalanka & Tadepalli Lowlands', lat: 16.495, lng: 80.628, distanceKm: 3, population: 140000, criticalInfra: 'Kanaka Durga Flyover, Railway Mainline', shelterName: 'PB Siddhartha Elevated Campus', shelterLat: 16.506, shelterLng: 80.648 },
      { name: 'Vuyyuru & Avanigadda / Diviseema', lat: 16.021, lng: 80.919, distanceKm: 62, population: 215000, criticalInfra: 'Flood Bank Embankments, PHC', shelterName: 'Avanigadda Cyclone Shelter', shelterLat: 16.028, shelterLng: 80.935 }
    ]
  },
  {
    id: 'srisailam',
    name: 'Srisailam Reservoir',
    river: 'Krishna River',
    district: 'Nandyal / Kurnool',
    lat: 16.0869,
    lng: 78.8969,
    frlMeters: 269.75,
    capacityTmc: 215.8,
    corridor: [
      [16.0869, 78.8969], [16.25, 79.05], [16.42, 79.20], [16.5758, 79.3125]
    ],
    downstreamRegions: [
      { name: 'Srisailam Hydro Colony & Sunnipenta', lat: 16.071, lng: 78.885, distanceKm: 3, population: 18500, criticalInfra: 'Powerhouse Switchyard, Ghat Bridge', shelterName: 'Srisailam Plateau Temple Shelter', shelterLat: 16.074, shelterLng: 78.868 },
      { name: 'Nagarjunasagar Tail Basin', lat: 16.5758, lng: 79.3125, distanceKm: 72, population: 78000, criticalInfra: 'Spillway Apron, Bridge', shelterName: 'Vijayapuri South Hill Camp', shelterLat: 16.555, shelterLng: 79.305 }
    ]
  },
  {
    id: 'somasila',
    name: 'Somasila Reservoir',
    river: 'Penna River',
    district: 'SPSR Nellore',
    lat: 14.4875,
    lng: 79.3086,
    frlMeters: 100.58,
    capacityTmc: 78.0,
    corridor: [
      [14.4875, 79.3086], [14.55, 79.62], [14.49, 79.85], [14.45, 79.99], [14.54, 80.15]
    ],
    downstreamRegions: [
      { name: 'Atmakur & Sangam Barrage Reach', lat: 14.585, lng: 79.622, distanceKm: 36, population: 64000, criticalInfra: 'Sangam Anicut, Sub-station', shelterName: 'Sangam Relief High School', shelterLat: 14.596, shelterLng: 79.742 },
      { name: 'Nellore Municipal Riverfront', lat: 14.455, lng: 79.985, distanceKm: 74, population: 280000, criticalInfra: 'Penna Bridge, NH-16, GGH Nellore', shelterName: 'VR College Relief Center', shelterLat: 14.442, shelterLng: 79.988 }
    ]
  },
  {
    id: 'yeleru',
    name: 'Yeleru Reservoir',
    river: 'Yeleru River',
    district: 'Kakinada',
    lat: 17.2917,
    lng: 82.0697,
    frlMeters: 86.56,
    capacityTmc: 24.11,
    corridor: [
      [17.2917, 82.0697], [17.20, 82.13], [17.11, 82.22], [17.01, 82.26]
    ],
    downstreamRegions: [
      { name: 'Yeleswaram & Peddapuram Basin', lat: 17.16, lng: 82.14, distanceKm: 17, population: 88000, criticalInfra: 'ADB Canal Regulator, Town Bridge', shelterName: 'Peddapuram Polytechnic Shelter', shelterLat: 17.081, shelterLng: 82.139 },
      { name: 'Pithapuram & Kakinada Rural', lat: 17.112, lng: 82.253, distanceKm: 28, population: 135000, criticalInfra: 'Rail Overbridge, Substation', shelterName: 'Pithapuram High Ground Hub', shelterLat: 17.118, shelterLng: 82.262 }
    ]
  }
];

function classifySettlementSeverity(breachRatio: number, surgeMeters: number, etaMins: number): {
  severity: RiskSeverity;
  rank: number;
} {
  // Derive severity strictly from existing scenario controls + computed arrival time
  if (breachRatio >= 75 || surgeMeters >= 12 || (breachRatio >= 50 && etaMins <= 30)) {
    return { severity: 'critical', rank: 4 };
  }
  if (breachRatio >= 50 || surgeMeters >= 7.5 || etaMins <= 60) {
    return { severity: 'high', rank: 3 };
  }
  if (breachRatio >= 30 || surgeMeters >= 4.5) {
    return { severity: 'moderate', rank: 2 };
  }
  return { severity: 'low', rank: 1 };
}

interface DamBreakIntelligenceProps {
  onInspectIn3D?: (target: { id: string; name: string; lat: number; lng: number; kind: 'station' | 'shelter' | 'incident' | 'landmark'; description: string }) => void;
}

export const DamBreakIntelligence: React.FC<DamBreakIntelligenceProps> = ({ onInspectIn3D }) => {
  const [selectedDamId, setSelectedDamId] = useState<string>('polavaram');
  const [breachRatio, setBreachRatio] = useState<number>(50);
  const [surgeMeters, setSurgeMeters] = useState<number>(7.5);
  const [sortBy, setSortBy] = useState<SettlementSortKey>('risk');
  const [selectedSettlementName, setSelectedSettlementName] = useState<string | null>(null);

  const [discharge, setDischarge] = useState<RiverDischargeTelemetry | null>(null);
  const [glofasStatus, setGlofasStatus] = useState<TelemetryState>('loading');
  const [glofasError, setGlofasError] = useState<string | null>(null);

  const [weather, setWeather] = useState<PointWeatherTelemetry | null>(null);
  const [weatherStatus, setWeatherStatus] = useState<TelemetryState>('loading');

  const [damElevation, setDamElevation] = useState<number | null>(null);
  const [terrainSource, setTerrainSource] = useState<'aws-terrarium' | 'fallback'>('fallback');
  const [lastSyncedLabel, setLastSyncedLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const fetchSeqRef = useRef<number>(0);

  const dam = useMemo(() => AP_DAMS.find(d => d.id === selectedDamId) || AP_DAMS[0], [selectedDamId]);

  const executeTelemetryFetch = useCallback(async (lat: number, lng: number, frlMeters: number) => {
    const seq = ++fetchSeqRef.current;

    try {
      const [disRes, weatherRes, terrainRes] = await Promise.allSettled([
        fetchRiverDischarge(lat, lng),
        fetchPointWeather(lat, lng),
        sampleTerrainAndSlope(lat, lng, frlMeters)
      ]);

      if (seq !== fetchSeqRef.current) return;

      if (disRes.status === 'fulfilled') {
        setDischarge(disRes.value);
        setGlofasStatus(disRes.value.dates.length === 0 ? 'unavailable' : 'live');
        setGlofasError(
          disRes.value.dates.length === 0 ? 'No GLOFAS series points returned for coordinates' : null
        );
      } else {
        setDischarge(null);
        setGlofasStatus('error');
        setGlofasError(
          disRes.reason instanceof Error ? disRes.reason.message : 'GLOFAS API request failed'
        );
      }

      if (weatherRes.status === 'fulfilled') {
        setWeather(weatherRes.value);
        setWeatherStatus('live');
      } else {
        setWeather(null);
        setWeatherStatus('unavailable');
      }

      if (terrainRes.status === 'fulfilled') {
        setDamElevation(terrainRes.value.elevationMeters);
        setTerrainSource(terrainRes.value.source);
      }

      if (disRes.status === 'fulfilled' || weatherRes.status === 'fulfilled') {
        setLastSyncedLabel(
          new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        );
      }
    } finally {
      if (seq === fetchSeqRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void executeTelemetryFetch(dam.lat, dam.lng, dam.frlMeters);
  }, [dam.lat, dam.lng, dam.frlMeters, executeTelemetryFetch]);

  const handleRefresh = useCallback(() => {
    setLoading(true);
    setGlofasStatus(prev => (prev === 'live' ? 'live' : 'loading'));
    setWeatherStatus(prev => (prev === 'live' ? 'live' : 'loading'));
    setGlofasError(null);
    void executeTelemetryFetch(dam.lat, dam.lng, dam.frlMeters);
  }, [dam.lat, dam.lng, dam.frlMeters, executeTelemetryFetch]);

  const handleSelectDam = (nextDamId: string) => {
    setSelectedDamId(nextDamId);
    setSelectedSettlementName(null);
    setLoading(true);
    setDischarge(null);
    setWeather(null);
    setDamElevation(null);
    setGlofasStatus('loading');
    setWeatherStatus('loading');
    setGlofasError(null);
  };

  // Simulated hydrodynamic breach metrics (original model preserved)
  const simulatedPeakCumecs = useMemo(() => {
    const base = discharge?.peak7dDischarge || 1200;
    const breachOutflow = dam.capacityTmc * 180 * (breachRatio / 100) * (surgeMeters / 8);
    return Math.round(base + breachOutflow);
  }, [discharge, dam.capacityTmc, breachRatio, surgeMeters]);

  const affectedPopTotal = useMemo(() => {
    const factor = Math.min(1, (breachRatio / 100) * (surgeMeters / 10));
    return Math.round(dam.downstreamRegions.reduce((s, r) => s + r.population, 0) * factor);
  }, [dam, breachRatio, surgeMeters]);

  const waveSpeedKmh = 18 + (surgeMeters * 0.9);
  const waveSeverity = useMemo<RiskSeverity>(() => {
    if (breachRatio >= 75 || surgeMeters >= 12) return 'critical';
    if (breachRatio >= 50 || surgeMeters >= 7.5) return 'high';
    if (breachRatio >= 30 || surgeMeters >= 4.5) return 'moderate';
    return 'low';
  }, [breachRatio, surgeMeters]);

  const assessedSettlements = useMemo<AssessedSettlement[]>(() => {
    const items = dam.downstreamRegions.map((reg, index) => {
      const etaMins = Math.round((reg.distanceKm / waveSpeedKmh) * 60);
      const { severity, rank } = classifySettlementSeverity(breachRatio, surgeMeters, etaMins);
      return {
        index,
        ...reg,
        etaMins,
        severity,
        severityRank: rank
      };
    });

    return items.sort((a, b) => {
      if (sortBy === 'eta') return a.etaMins - b.etaMins;
      if (sortBy === 'population') return b.population - a.population;
      if (b.severityRank !== a.severityRank) return b.severityRank - a.severityRank;
      return a.etaMins - b.etaMins;
    });
  }, [dam.downstreamRegions, waveSpeedKmh, breachRatio, surgeMeters, sortBy]);

  const selectedSettlement = useMemo(
    () => dam.downstreamRegions.find(r => r.name === selectedSettlementName) || null,
    [dam.downstreamRegions, selectedSettlementName]
  );

  // Build downstream inundation polygon envelope & markers scaled by breach severity
  const { polygons, polylines, markers } = useMemo(() => {
    const spreadDeg = 0.02 + (breachRatio / 100) * 0.035 + (surgeMeters / 18) * 0.03;
    const upperBank: Array<[number, number]> = dam.corridor.map(([la, ln], i) => [la + spreadDeg * (0.4 + i * 0.12), ln - spreadDeg * 0.5]);
    const lowerBank: Array<[number, number]> = [...dam.corridor].reverse().map(([la, ln], i) => [la - spreadDeg * (0.4 + i * 0.1), ln + spreadDeg * 0.5]);

    const polys: MapPolygonSpec[] = [
      {
        id: `inundation-${dam.id}`,
        positions: [...upperBank, ...lowerBank],
        color: '#ef4444',
        fillColor: breachRatio >= 75 ? '#dc2626' : '#f97316',
        fillOpacity: 0.36,
        weight: 2,
        title: `${dam.name} Projected Flood Envelope`,
        subtitle: `Peak Simulated Outflow: ${simulatedPeakCumecs.toLocaleString()} m³/s (+${surgeMeters.toFixed(1)}m stage)`
      }
    ];

    const lines: MapPolylineSpec[] = [
      {
        id: `river-axis-${dam.id}`,
        positions: dam.corridor,
        color: '#0284c7',
        weight: 4,
        dashArray: '6, 4',
        title: `${dam.river} Flood Wave Path`
      }
    ];

    const mks: MapMarkerSpec[] = [
      {
        id: `dam-${dam.id}`,
        lat: dam.lat,
        lng: dam.lng,
        title: dam.name,
        subtitle: `${dam.river} • FRL ${dam.frlMeters}m • Capacity ${dam.capacityTmc} TMC`,
        badge: 'DAM',
        color: '#dc2626',
        radius: 14,
        pulse: true
      }
    ];

    dam.downstreamRegions.forEach((reg, idx) => {
      const isFocused = selectedSettlementName === reg.name;
      mks.push({
        id: `zone-${idx}`,
        lat: reg.lat,
        lng: reg.lng,
        title: reg.name,
        subtitle: `${reg.distanceKm} km downstream • Pop ${reg.population.toLocaleString()} • ${reg.criticalInfra}`,
        badge: `Z${idx + 1}`,
        color: isFocused ? '#0788C9' : '#f59e0b',
        radius: isFocused ? 13 : 11,
        pulse: isFocused,
        onClick: () => setSelectedSettlementName(reg.name)
      });
      mks.push({
        id: `shelter-${idx}`,
        lat: reg.shelterLat,
        lng: reg.shelterLng,
        title: reg.shelterName,
        subtitle: `High-Ground Evacuation Camp for ${reg.name}`,
        badge: 'CAMP',
        color: '#10b981',
        radius: 11
      });
    });

    return { polygons: polys, polylines: lines, markers: mks };
  }, [dam, breachRatio, surgeMeters, simulatedPeakCumecs, selectedSettlementName]);

  const mapCenter: [number, number] = selectedSettlement
    ? [selectedSettlement.lat, selectedSettlement.lng]
    : [dam.lat - 0.14, dam.lng + 0.12];
  const mapZoom = selectedSettlement ? 11 : 9;

  const damElevationLabel = `${damElevation ?? dam.frlMeters}m${terrainSource === 'aws-terrarium' ? ' (DEM)' : ''}`;

  return (
    <div className="space-y-4">
      {/* Top Header + 4-Group Simulation Control Workspace */}
      <DamSimulationControls
        dams={AP_DAMS}
        selectedDamId={selectedDamId}
        activeDam={dam}
        onSelectDam={handleSelectDam}
        breachRatio={breachRatio}
        onChangeBreachRatio={setBreachRatio}
        surgeMeters={surgeMeters}
        onChangeSurgeMeters={setSurgeMeters}
        discharge={discharge}
        glofasStatus={glofasStatus}
        glofasError={glofasError}
        simulatedPeakCumecs={simulatedPeakCumecs}
        affectedPopTotal={affectedPopTotal}
        loading={loading}
        onRefresh={handleRefresh}
        onInspectDamIn3D={
          onInspectIn3D
            ? () =>
                onInspectIn3D({
                  id: dam.id,
                  name: dam.name,
                  lat: dam.lat,
                  lng: dam.lng,
                  kind: 'station',
                  description: `${dam.river} • FRL ${dam.frlMeters}m • Simulated ${simulatedPeakCumecs} m³/s`
                })
            : undefined
        }
      />

      {/* Main Two-Column Operational Workspace: Left Map (65-70%) + Right Impact Panel (30-35%) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        <div className="xl:col-span-8 bg-white border border-slate-200 rounded-2xl p-2 shadow-xs h-[460px] sm:h-[520px] xl:h-[580px] min-h-[420px]">
          <IntelligenceLeafletMap
            center={mapCenter}
            zoom={mapZoom}
            polygons={polygons}
            polylines={polylines}
            markers={markers}
            className="h-full rounded-xl border-slate-100"
          />
        </div>

        <div className="xl:col-span-4 min-w-0">
          <DownstreamImpactPanel
            river={dam.river}
            damElevationLabel={damElevationLabel}
            weather={weather}
            weatherStatus={weatherStatus}
            lastSyncedLabel={lastSyncedLabel}
            waveSpeedKmh={waveSpeedKmh}
            waveSeverity={waveSeverity}
            settlements={assessedSettlements}
            sortBy={sortBy}
            onChangeSortBy={setSortBy}
            selectedSettlementName={selectedSettlementName}
            onSelectSettlement={(settlement) =>
              setSelectedSettlementName(prev => (prev === settlement.name ? null : settlement.name))
            }
            onResetMapFocus={() => setSelectedSettlementName(null)}
            onInspectSettlementIn3D={
              onInspectIn3D
                ? (settlement) =>
                    onInspectIn3D({
                      id: `shelter-${dam.id}-${settlement.index}`,
                      name: settlement.shelterName,
                      lat: settlement.shelterLat,
                      lng: settlement.shelterLng,
                      kind: 'shelter',
                      description: `Evacuation Camp for ${settlement.name}`
                    })
                : undefined
            }
          />
        </div>
      </div>
    </div>
  );
};
