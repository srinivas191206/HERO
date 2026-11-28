'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IntelligenceLeafletMap, MapMarkerSpec, MapPolygonSpec } from './IntelligenceLeafletMap';
import { fetchBatchWeather, PointWeatherTelemetry } from '../../services/intelligence/OpenMeteoService';
import { sampleTerrainAndSlope, TerrainSample } from '../../services/intelligence/TerrariumElevationService';
import { EnvFreshnessState, FlashFloodControls } from './FlashFloodControls';
import { CatchmentMatrixPanel, MatrixBasinEval } from './CatchmentMatrixPanel';
import { CatchmentRiskProfile } from './CatchmentRiskProfile';

interface HillyBasin {
  id: string;
  name: string;
  district: string;
  lat: number;
  lng: number;
  historicalCount: number;
  lastMajorEvent: string;
  catchmentSpanDeg: number;
}

const AP_HILLY_BASINS: HillyBasin[] = [
  { id: 'araku', name: 'Araku Valley & Borra Streams', district: 'Alluri Sitharama Raju', lat: 18.3273, lng: 82.8775, historicalCount: 9, lastMajorEvent: 'Oct 2023 Cloudburst', catchmentSpanDeg: 0.08 },
  { id: 'paderu', name: 'Paderu Agency Matsyagadda Basin', district: 'Alluri Sitharama Raju', lat: 18.0833, lng: 82.6667, historicalCount: 11, lastMajorEvent: 'Sep 2022 Cyclone Surge', catchmentSpanDeg: 0.09 },
  { id: 'chintapalli', name: 'Chintapalli–Lambasingi Ridge', district: 'Alluri Sitharama Raju', lat: 17.8712, lng: 82.3536, historicalCount: 7, lastMajorEvent: 'Aug 2024 Orographic Rain', catchmentSpanDeg: 0.08 },
  { id: 'maredumilli', name: 'Maredumilli–Rampachodavaram Valleys', district: 'Polavaram / ASR', lat: 17.596, lng: 81.711, historicalCount: 12, lastMajorEvent: 'Jul 2024 Godavari Tributary Surge', catchmentSpanDeg: 0.09 },
  { id: 'seethampeta', name: 'Seethampeta–Vamsadhara Hills', district: 'Parvathipuram Manyam', lat: 18.678, lng: 83.751, historicalCount: 8, lastMajorEvent: 'Oct 2018 Titli Flash Flood', catchmentSpanDeg: 0.08 },
  { id: 'tirumala', name: 'Tirumala–Seshachalam Escarpment', district: 'Tirupati', lat: 13.6833, lng: 79.3472, historicalCount: 10, lastMajorEvent: 'Nov 2021 Swarnamukhi Flash Flood', catchmentSpanDeg: 0.07 },
  { id: 'horsley', name: 'Horsley Hills & Papagni Ravines', district: 'Annamayya', lat: 13.651, lng: 78.397, historicalCount: 5, lastMajorEvent: 'Nov 2021 Depression', catchmentSpanDeg: 0.07 },
  { id: 'veligonda', name: 'Veligonda–Nallamala Foothills', district: 'Markapuram / Prakasam', lat: 15.63, lng: 79.02, historicalCount: 6, lastMajorEvent: 'Sep 2020 Gundlakamma Surge', catchmentSpanDeg: 0.08 }
];

function computeFlashFloodScore(
  basin: HillyBasin,
  weather: PointWeatherTelemetry | undefined,
  terrain: TerrainSample,
  boostMm: number
): { score: number; tier: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW' } {
  const rainFactor = Math.min(40, (((weather?.peak3hRainMm ?? 0) + boostMm) / 60) * 40);
  const soilFactor = Math.min(30, ((weather?.soilMoistureTop ?? 0.25) / 0.45) * 30);
  const slopeFactor = Math.min(20, (terrain.slopeDegrees / 22) * 20);
  const histFactor = Math.min(10, (basin.historicalCount / 12) * 10);
  const score = Math.round(rainFactor + soilFactor + slopeFactor + histFactor);
  const tier: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW' =
    score >= 70 ? 'CRITICAL' : score >= 50 ? 'HIGH' : score >= 30 ? 'MODERATE' : 'LOW';
  return { score, tier };
}

interface FlashFloodIntelligenceProps {
  onInspectIn3D?: (target: { id: string; name: string; lat: number; lng: number; kind: 'incident' | 'landmark'; description: string }) => void;
}

export const FlashFloodIntelligence: React.FC<FlashFloodIntelligenceProps> = ({ onInspectIn3D }) => {
  const [weatherMap, setWeatherMap] = useState<Record<string, PointWeatherTelemetry>>({});
  const [terrainMap, setTerrainMap] = useState<Record<string, TerrainSample>>({});
  const [selectedBasinId, setSelectedBasinId] = useState<string>('araku');
  const [rainSimBoostMm, setRainSimBoostMm] = useState<number>(0);
  const [weatherStatus, setWeatherStatus] = useState<EnvFreshnessState>('loading');
  const [terrainStatus, setTerrainStatus] = useState<EnvFreshnessState>('loading');
  const [lastSyncedLabel, setLastSyncedLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const fetchSeqRef = useRef<number>(0);

  const executeDataFetch = useCallback(async () => {
    const seq = ++fetchSeqRef.current;

    try {
      const [weatherRes, terrainRes] = await Promise.allSettled([
        fetchBatchWeather(AP_HILLY_BASINS.map(b => ({ lat: b.lat, lng: b.lng }))),
        Promise.all(AP_HILLY_BASINS.map(b => sampleTerrainAndSlope(b.lat, b.lng, 450)))
      ]);

      if (seq !== fetchSeqRef.current) return;

      if (weatherRes.status === 'fulfilled' && weatherRes.value.length > 0) {
        const wObj: Record<string, PointWeatherTelemetry> = {};
        AP_HILLY_BASINS.forEach((b, idx) => {
          if (weatherRes.value[idx]) wObj[b.id] = weatherRes.value[idx];
        });
        setWeatherMap(wObj);
        setWeatherStatus('live');
      } else {
        setWeatherStatus(weatherRes.status === 'rejected' ? 'error' : 'unavailable');
      }

      if (terrainRes.status === 'fulfilled') {
        const tObj: Record<string, TerrainSample> = {};
        let hasLiveDem = false;
        AP_HILLY_BASINS.forEach((b, idx) => {
          const item = terrainRes.value[idx];
          if (item) {
            tObj[b.id] = item;
            if (item.source === 'aws-terrarium') hasLiveDem = true;
          }
        });
        setTerrainMap(tObj);
        setTerrainStatus(hasLiveDem ? 'live' : 'unavailable');
      } else {
        setTerrainStatus('error');
      }

      if (weatherRes.status === 'fulfilled' || terrainRes.status === 'fulfilled') {
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
    void executeDataFetch();
  }, [executeDataFetch]);

  const handleRefresh = useCallback(() => {
    setLoading(true);
    setWeatherStatus(prev => (prev === 'live' ? 'live' : 'loading'));
    setTerrainStatus(prev => (prev === 'live' ? 'live' : 'loading'));
    void executeDataFetch();
  }, [executeDataFetch]);

  const evaluations: MatrixBasinEval[] = useMemo(() => {
    return AP_HILLY_BASINS.map(basin => {
      const weather = weatherMap[basin.id];
      const terrain = terrainMap[basin.id] || { elevationMeters: 450, slopeDegrees: 8.5, source: 'fallback' as const };
      const simulated = computeFlashFloodScore(basin, weather, terrain, rainSimBoostMm);
      const baseline = computeFlashFloodScore(basin, weather, terrain, 0);
      return {
        basin,
        weather,
        terrain,
        riskScore: simulated.score,
        riskTier: simulated.tier,
        baselineScore: baseline.score,
        baselineTier: baseline.tier
      };
    });
  }, [weatherMap, terrainMap, rainSimBoostMm]);

  const activeEval = useMemo(
    () => evaluations.find(e => e.basin.id === selectedBasinId) || evaluations[0],
    [evaluations, selectedBasinId]
  );

  const { polygons, markers } = useMemo(() => {
    const polys: MapPolygonSpec[] = [];
    const mks: MapMarkerSpec[] = [];

    evaluations.forEach(ev => {
      const b = ev.basin;
      const color =
        ev.riskTier === 'CRITICAL' ? '#dc2626' :
        ev.riskTier === 'HIGH' ? '#ea580c' :
        ev.riskTier === 'MODERATE' ? '#f59e0b' : '#10b981';

      const s = b.catchmentSpanDeg;
      polys.push({
        id: `ff-poly-${b.id}`,
        positions: [
          [b.lat - s, b.lng - s],
          [b.lat - s * 0.4, b.lng + s],
          [b.lat + s, b.lng + s * 0.7],
          [b.lat + s * 0.6, b.lng - s]
        ],
        color,
        fillColor: color,
        fillOpacity: b.id === selectedBasinId ? 0.42 : 0.22,
        weight: b.id === selectedBasinId ? 3 : 1.5,
        title: `${b.name} (${ev.riskTier})`,
        subtitle: `Risk Score ${ev.riskScore}/100 • Slope ${ev.terrain.slopeDegrees}° • 24h Rain ${((ev.weather?.next24hRainMm ?? 0) + rainSimBoostMm).toFixed(1)} mm`,
        onClick: () => setSelectedBasinId(b.id)
      });

      mks.push({
        id: `ff-mk-${b.id}`,
        lat: b.lat,
        lng: b.lng,
        title: b.name,
        subtitle: `${b.district} • Score ${ev.riskScore}/100`,
        badge: `${ev.riskScore}`,
        color,
        radius: 12,
        pulse: ev.riskTier === 'CRITICAL',
        onClick: () => setSelectedBasinId(b.id)
      });
    });

    return { polygons: polys, markers: mks };
  }, [evaluations, selectedBasinId, rainSimBoostMm]);

  const activeBasinMeta = activeEval?.basin || AP_HILLY_BASINS[0];

  return (
    <div className="space-y-4">
      {/* Top Page Header + 4-Group Watershed Control Workspace */}
      <FlashFloodControls
        basins={AP_HILLY_BASINS}
        selectedBasinId={selectedBasinId}
        activeBasin={activeBasinMeta}
        onSelectBasin={setSelectedBasinId}
        rainSimBoostMm={rainSimBoostMm}
        onChangeRainSimBoostMm={setRainSimBoostMm}
        activeWeather={activeEval?.weather}
        activeTerrain={activeEval?.terrain}
        weatherStatus={weatherStatus}
        terrainStatus={terrainStatus}
        lastSyncedLabel={lastSyncedLabel}
        loading={loading}
        onRefresh={handleRefresh}
        onInspectBasinIn3D={
          onInspectIn3D && activeEval
            ? () =>
                onInspectIn3D({
                  id: activeEval.basin.id,
                  name: activeEval.basin.name,
                  lat: activeEval.basin.lat,
                  lng: activeEval.basin.lng,
                  kind: 'incident',
                  description: `Flash Flood Risk ${activeEval.riskScore}/100 • Slope ${activeEval.terrain.slopeDegrees}°`
                })
            : undefined
        }
      />

      {/* Main Two-Column Workspace: Left Operational Terrain Map (~67%) + Right Catchment Matrix (~33%) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        <div className="xl:col-span-8 bg-white border border-slate-200 rounded-2xl p-2 shadow-xs h-[440px] sm:h-[500px] xl:h-[540px] min-h-[400px]">
          <IntelligenceLeafletMap
            center={[activeBasinMeta.lat, activeBasinMeta.lng]}
            zoom={8}
            baseStyle="topo"
            polygons={polygons}
            markers={markers}
            className="h-full rounded-xl border-slate-100"
          />
        </div>

        <div className="xl:col-span-4 min-w-0">
          <CatchmentMatrixPanel
            evaluations={evaluations}
            selectedBasinId={selectedBasinId}
            onSelectBasin={setSelectedBasinId}
            rainSimBoostMm={rainSimBoostMm}
            activeEval={activeEval}
          />
        </div>
      </div>

      {/* Dedicated Catchment Risk Profile + Expandable Historical & Factor Drawer */}
      <CatchmentRiskProfile
        activeEval={activeEval}
        rainSimBoostMm={rainSimBoostMm}
        weatherStatus={weatherStatus}
        terrainStatus={terrainStatus}
        lastSyncedLabel={lastSyncedLabel}
      />
    </div>
  );
};
