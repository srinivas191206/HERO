'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Compass, Droplets, MapPin, RefreshCw, ShieldAlert, Waves } from 'lucide-react';
import { HUDPanel } from '../ui/HUDPanel';
import { IntelligenceLeafletMap, MapMarkerSpec, MapPolygonSpec, MapPolylineSpec } from './IntelligenceLeafletMap';
import { fetchPointWeather, fetchRiverDischarge, PointWeatherTelemetry, RiverDischargeTelemetry } from '../../services/intelligence/OpenMeteoService';
import { sampleTerrainAndSlope } from '../../services/intelligence/TerrariumElevationService';

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

interface DamBreakIntelligenceProps {
  onInspectIn3D?: (target: { id: string; name: string; lat: number; lng: number; kind: 'station' | 'shelter' | 'incident' | 'landmark'; description: string }) => void;
}

export const DamBreakIntelligence: React.FC<DamBreakIntelligenceProps> = ({ onInspectIn3D }) => {
  const [selectedDamId, setSelectedDamId] = useState<string>('polavaram');
  const [breachRatio, setBreachRatio] = useState<number>(50);
  const [surgeMeters, setSurgeMeters] = useState<number>(7.5);
  const [discharge, setDischarge] = useState<RiverDischargeTelemetry | null>(null);
  const [weather, setWeather] = useState<PointWeatherTelemetry | null>(null);
  const [damElevation, setDamElevation] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const dam = useMemo(() => AP_DAMS.find(d => d.id === selectedDamId) || AP_DAMS[0], [selectedDamId]);

  const loadTelemetry = async () => {
    setLoading(true);
    try {
      const [disData, wData, terr] = await Promise.all([
        fetchRiverDischarge(dam.lat, dam.lng).catch(() => null),
        fetchPointWeather(dam.lat, dam.lng).catch(() => null),
        sampleTerrainAndSlope(dam.lat, dam.lng, dam.frlMeters)
      ]);
      setDischarge(disData);
      setWeather(wData);
      setDamElevation(terr.elevationMeters);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTelemetry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dam.id]);

  // Simulated hydrodynamic breach metrics
  const simulatedPeakCumecs = useMemo(() => {
    const base = discharge?.peak7dDischarge || 1200;
    const breachOutflow = dam.capacityTmc * 180 * (breachRatio / 100) * (surgeMeters / 8);
    return Math.round(base + breachOutflow);
  }, [discharge, dam.capacityTmc, breachRatio, surgeMeters]);

  const affectedPopTotal = useMemo(() => {
    const factor = Math.min(1, (breachRatio / 100) * (surgeMeters / 10));
    return Math.round(dam.downstreamRegions.reduce((s, r) => s + r.population, 0) * factor);
  }, [dam, breachRatio, surgeMeters]);

  // Build downstream inundation polygon envelope scaled by breach severity
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
      mks.push({
        id: `zone-${idx}`,
        lat: reg.lat,
        lng: reg.lng,
        title: reg.name,
        subtitle: `${reg.distanceKm} km downstream • Pop ${reg.population.toLocaleString()} • ${reg.criticalInfra}`,
        badge: `Z${idx + 1}`,
        color: '#f59e0b',
        radius: 11
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
  }, [dam, breachRatio, surgeMeters, simulatedPeakCumecs]);

  const waveSpeedKmh = 18 + (surgeMeters * 0.9);

  return (
    <div className="space-y-5">
      {/* Header & Reservoir Controls */}
      <HUDPanel
        title="Dam Break & Inundation Intelligence"
        subtitle="Hydrodynamic Breach Modelling, Downstream Arrival & Evacuation Planning (Open-Meteo GloFAS + AWS DEM)"
        statusColor={breachRatio >= 75 ? 'red' : 'amber'}
        headerRight={
          <div className="flex items-center gap-2">
            {onInspectIn3D && (
              <button
                type="button"
                onClick={() =>
                  onInspectIn3D({
                    id: dam.id,
                    name: dam.name,
                    lat: dam.lat,
                    lng: dam.lng,
                    kind: 'station',
                    description: `${dam.river} • FRL ${dam.frlMeters}m • Simulated ${simulatedPeakCumecs} m³/s`
                  })
                }
                className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-[10px] font-black uppercase flex items-center gap-1 cursor-pointer"
              >
                <Compass className="w-3.5 h-3.5" />
                Inspect Dam in 3D
              </button>
            )}
            <button
              type="button"
              onClick={loadTelemetry}
              className="p-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 cursor-pointer"
              title="Refresh GloFAS River Discharge"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 text-xs">
          <div>
            <label htmlFor="dam-select" className="text-[10px] font-black uppercase text-slate-500 block mb-1">
              Target Reservoir / Barrage
            </label>
            <select
              id="dam-select"
              value={selectedDamId}
              onChange={e => setSelectedDamId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 cursor-pointer"
            >
              {AP_DAMS.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.district})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="breach-range" className="text-[10px] font-black uppercase text-slate-500 flex justify-between mb-1">
              <span>Gate / Breach Scenario</span>
              <span className="font-mono text-red-600 font-black">{breachRatio}%</span>
            </label>
            <input
              id="breach-range"
              type="range"
              min={15}
              max={100}
              step={5}
              value={breachRatio}
              onChange={e => setBreachRatio(Number(e.target.value))}
              className="w-full mt-2 cursor-pointer"
            />
            <div className="flex justify-between text-[9px] text-slate-400 font-bold mt-0.5">
              <span>Spillway Release</span>
              <span>Full Breach</span>
            </div>
          </div>

          <div>
            <label htmlFor="surge-range" className="text-[10px] font-black uppercase text-slate-500 flex justify-between mb-1">
              <span>Downstream Stage Rise</span>
              <span className="font-mono text-sky-700 font-black">+{surgeMeters.toFixed(1)} m</span>
            </label>
            <input
              id="surge-range"
              type="range"
              min={2}
              max={18}
              step={0.5}
              value={surgeMeters}
              onChange={e => setSurgeMeters(Number(e.target.value))}
              className="w-full mt-2 cursor-pointer"
            />
            <div className="flex justify-between text-[9px] text-slate-400 font-bold mt-0.5">
              <span>+2m Watch</span>
              <span>+18m Catastrophic</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="bg-sky-50 border border-sky-200 rounded-xl p-2.5">
              <span className="text-[9px] font-black uppercase text-sky-700 block">LIVE GLOFAS FLOW</span>
              <span className="text-sm font-black font-mono text-slate-800">
                {discharge ? `${discharge.currentDischarge.toFixed(1)} m³/s` : 'Loading...'}
              </span>
              <span className="text-[9px] text-slate-500 block">7d peak: {discharge ? `${discharge.peak7dDischarge.toFixed(1)}` : '--'} m³/s</span>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-2.5">
              <span className="text-[9px] font-black uppercase text-red-700 block">SIMULATED SURGE</span>
              <span className="text-sm font-black font-mono text-red-700">
                {simulatedPeakCumecs.toLocaleString()} m³/s
              </span>
              <span className="text-[9px] text-red-600 block">Est. exposed: ~{affectedPopTotal.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </HUDPanel>

      {/* Map + Downstream Regions / Evacuation Panel */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 h-[460px]">
          <IntelligenceLeafletMap
            center={[dam.lat - 0.14, dam.lng + 0.12]}
            zoom={9}
            polygons={polygons}
            polylines={polylines}
            markers={markers}
          />
        </div>

        <HUDPanel
          title="Downstream Impact & Evacuation"
          subtitle={`${dam.river} • Dam Elev: ${damElevation ?? dam.frlMeters}m • Upstream 24h Rain: ${weather?.next24hRainMm ?? 0} mm`}
          className="h-[460px]"
        >
          <div className="space-y-3 overflow-y-auto pr-1 h-full text-xs">
            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-center gap-2 text-[11px] font-bold">
              <Waves className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span>Flood Front Velocity: ~{waveSpeedKmh.toFixed(1)} km/h downstream</span>
            </div>

            {dam.downstreamRegions.map((reg, idx) => {
              const etaMins = Math.round((reg.distanceKm / waveSpeedKmh) * 60);
              return (
                <div key={reg.name} className="border border-slate-200 rounded-2xl p-3 bg-slate-50/70 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-slate-800 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                      {reg.name}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-mono font-black text-[10px]">
                      ETA {etaMins} min
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600">
                    <strong>Distance:</strong> {reg.distanceKm} km • <strong>Pop:</strong> {reg.population.toLocaleString()}
                  </div>
                  <div className="text-[10.5px] text-slate-500">
                    <strong>Exposed Assets:</strong> {reg.criticalInfra}
                  </div>
                  <div className="pt-1.5 border-t border-slate-200 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-emerald-700 flex items-center gap-1">
                      <ShieldAlert className="w-3 h-3" />
                      Evacuate to: {reg.shelterName}
                    </span>
                    {onInspectIn3D && (
                      <button
                        type="button"
                        onClick={() =>
                          onInspectIn3D({
                            id: `shelter-${dam.id}-${idx}`,
                            name: reg.shelterName,
                            lat: reg.shelterLat,
                            lng: reg.shelterLng,
                            kind: 'shelter',
                            description: `Evacuation Camp for ${reg.name}`
                          })
                        }
                        className="px-2 py-0.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[9px] font-black uppercase cursor-pointer"
                      >
                        3D View
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200 text-[10px] text-slate-500 flex items-center gap-2">
              <Droplets className="w-3.5 h-3.5 text-sky-600 flex-shrink-0" />
              <span>
                Soil saturation near dam: {weather?.soilMoistureTop != null ? `${(weather.soilMoistureTop * 100).toFixed(1)}%` : 'Syncing...'} • Wind {weather?.windSpeedKmh ?? '--'} km/h
              </span>
            </div>
          </div>
        </HUDPanel>
      </div>
    </div>
  );
};
