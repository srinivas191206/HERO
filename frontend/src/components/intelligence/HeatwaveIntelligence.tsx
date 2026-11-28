'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { IntelligenceLeafletMap, MapMarkerSpec } from './IntelligenceLeafletMap';
import { AP_DISTRICTS, matchApDistrict } from '../../utils/apDistricts';
import { fetchBatchWeather, PointWeatherTelemetry } from '../../services/intelligence/OpenMeteoService';
import { DistrictSummary, User } from '../../types';
import {
  DistrictHeatRow,
  HeatStressTier,
  HeatwaveControlPanel,
  ThermalFeedStatus
} from './HeatwaveControlPanel';
import { HeatwaveAdvisoryPanel } from './HeatwaveAdvisoryPanel';
import { HeatwaveVulnerabilityProfile } from './HeatwaveVulnerabilityProfile';
import { DistrictThermalTrendCard } from './DistrictThermalTrendCard';

interface GeoJsonDistrictFeature {
  properties?: {
    district?: string;
    peak_tmax?: number;
    peak_mandal?: string;
  };
}

function getHeatTier(tempC: number): HeatStressTier {
  if (tempC >= 46) return 'EXTREME DANGER';
  if (tempC >= 42) return 'DANGER';
  if (tempC >= 38) return 'EXTREME CAUTION';
  if (tempC >= 32) return 'CAUTION';
  return 'NORMAL';
}

function getHeatFillColor(tempC: number): string {
  if (tempC >= 45) return '#7f1d1d';
  if (tempC >= 43) return '#dc2626';
  if (tempC >= 41) return '#ea580c';
  if (tempC >= 38) return '#f59e0b';
  if (tempC >= 34) return '#fbbf24';
  return '#38bdf8';
}

interface HeatwaveIntelligenceProps {
  districts?: DistrictSummary[];
  officers?: User[];
  onInspectIn3D?: (target: {
    id: string;
    name: string;
    lat: number;
    lng: number;
    kind: 'station' | 'landmark';
    districtName?: string;
    description: string;
  }) => void;
}

export const HeatwaveIntelligence: React.FC<HeatwaveIntelligenceProps> = ({
  districts = [],
  officers = [],
  onInspectIn3D
}) => {
  const [geojsonData, setGeojsonData] = useState<unknown>(null);
  const [weatherByDist, setWeatherByDist] = useState<Record<string, PointWeatherTelemetry>>({});
  const [weatherStatus, setWeatherStatus] = useState<ThermalFeedStatus>('loading');
  const [lastSyncedLabel, setLastSyncedLabel] = useState<string | null>(null);
  const [dataSourceMode, setDataSourceMode] = useState<'live' | 'apsdma'>('apsdma');
  const [selectedDist, setSelectedDist] = useState<string>('Eluru');
  const [loading, setLoading] = useState<boolean>(true);
  const fetchSeqRef = useRef<number>(0);

  const executeLoadAll = useCallback(async (needsGeoJson: boolean) => {
    const seq = ++fetchSeqRef.current;

    if (needsGeoJson) {
      fetch('/gis-3d/data/ap_districts.geojson')
        .then(r => (r.ok ? r.json() : null))
        .then(gj => {
          if (gj) setGeojsonData(gj);
        })
        .catch(() => {});
    }

    try {
      const batch = await fetchBatchWeather(
        AP_DISTRICTS.map(d => ({ lat: d.centerLat, lng: d.centerLng }))
      );
      if (seq !== fetchSeqRef.current) return;

      const map: Record<string, PointWeatherTelemetry> = {};
      AP_DISTRICTS.forEach((d, i) => {
        if (batch[i]) map[d.district] = batch[i];
      });
      setWeatherByDist(map);
      setWeatherStatus(Object.keys(map).length > 0 ? 'live' : 'unavailable');
      setLastSyncedLabel(
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      );
    } catch {
      if (seq === fetchSeqRef.current) {
        setWeatherStatus('error');
      }
    } finally {
      if (seq === fetchSeqRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void executeLoadAll(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [executeLoadAll]);

  const handleRefresh = useCallback(() => {
    setLoading(true);
    setWeatherStatus(prev => (prev === 'live' ? 'live' : 'loading'));
    void executeLoadAll(!geojsonData);
  }, [executeLoadAll, geojsonData]);

  // Verified officer counts by canonical AP district name
  const officerCountByDist = useMemo(() => {
    const counts: Record<string, number> = {};
    districts.forEach(d => {
      const canonical = matchApDistrict(d.name)?.district || matchApDistrict(d.code)?.district;
      if (!canonical) return;
      counts[canonical] = officers.filter(o => o.districtId === d.id && o.role === 'officer').length;
    });
    return counts;
  }, [districts, officers]);

  const rows: DistrictHeatRow[] = useMemo(() => {
    return AP_DISTRICTS.map(meta => {
      const w = weatherByDist[meta.district];
      const hasLiveWeather = Boolean(w);
      const liveTempC = w?.temperatureC ?? 33.0;
      const liveRh = w?.relativeHumidity ?? 55;
      const heatIndexC = w?.apparentTemperatureC ?? liveTempC + 2.0;
      const apsdmaPeakC = meta.peakTmax ?? 40.0;
      const displayTempC = dataSourceMode === 'live' ? heatIndexC : apsdmaPeakC;
      return {
        meta,
        liveTempC,
        liveRh,
        heatIndexC,
        apsdmaPeakC,
        displayTempC,
        stressTier: getHeatTier(displayTempC),
        hasLiveWeather,
        verifiedOfficerCount: officerCountByDist[meta.district] ?? 0
      };
    });
  }, [weatherByDist, dataSourceMode, officerCountByDist]);

  const activeRow = useMemo(
    () => rows.find(r => r.meta.district === selectedDist) || rows[0],
    [rows, selectedDist]
  );

  const geojsonStyle = useCallback(
    (feature: GeoJsonDistrictFeature): L.PathOptions => {
      const distName = feature?.properties?.district;
      const row = rows.find(r => r.meta.district === distName);
      const temp = row?.displayTempC ?? feature?.properties?.peak_tmax ?? 38;
      const isSelected = distName === selectedDist;
      return {
        fillColor: getHeatFillColor(temp),
        fillOpacity: isSelected ? 0.65 : 0.42,
        color: isSelected ? '#0f172a' : '#ffffff',
        weight: isSelected ? 2.5 : 1
      };
    },
    [rows, selectedDist]
  );

  const onEachFeature = useCallback((feature: GeoJsonDistrictFeature, layer: L.Layer) => {
    const distName = feature?.properties?.district;
    if (!distName) return;
    layer.on('click', () => setSelectedDist(distName));
    layer.bindTooltip(
      `${distName} • Peak ${feature?.properties?.peak_tmax ?? '--'}°C (${feature?.properties?.peak_mandal || ''})`,
      { sticky: true }
    );
  }, []);

  const markers: MapMarkerSpec[] = useMemo(() => {
    return rows
      .filter(r => r.meta.district === selectedDist || r.displayTempC >= 44)
      .map(r => ({
        id: `heat-${r.meta.code}`,
        lat: r.meta.centerLat,
        lng: r.meta.centerLng,
        title: `${r.meta.district} (${r.stressTier})`,
        subtitle: `Peak Mandal: ${r.meta.peakMandal} • Heat Index: ${r.heatIndexC.toFixed(1)}°C • APSDMA Peak: ${r.apsdmaPeakC}°C`,
        badge: `${r.displayTempC.toFixed(0)}°`,
        color: getHeatFillColor(r.displayTempC),
        radius: r.meta.district === selectedDist ? 14 : 11,
        pulse: r.displayTempC >= 44,
        onClick: () => setSelectedDist(r.meta.district)
      }));
  }, [rows, selectedDist]);

  return (
    <div className="space-y-4">
      {/* Top Thermal Intelligence Header & 5-Element Control Panel */}
      <HeatwaveControlPanel
        rows={rows}
        activeRow={activeRow}
        selectedDist={selectedDist}
        onSelectDist={setSelectedDist}
        dataSourceMode={dataSourceMode}
        onChangeDataSourceMode={setDataSourceMode}
        weatherStatus={weatherStatus}
        lastSyncedLabel={lastSyncedLabel}
        loading={loading}
        onRefresh={handleRefresh}
        onInspectIn3D={
          onInspectIn3D && activeRow
            ? () =>
                onInspectIn3D({
                  id: activeRow.meta.code,
                  name: `${activeRow.meta.district} Thermal Monitoring HQ`,
                  lat: activeRow.meta.centerLat,
                  lng: activeRow.meta.centerLng,
                  kind: 'station',
                  districtName: activeRow.meta.district,
                  description: `Peak ${activeRow.apsdmaPeakC}°C (${activeRow.meta.peakMandal}) • Live Heat Index ${activeRow.heatIndexC.toFixed(1)}°C`
                })
            : undefined
        }
      />

      {/* Main Two-Column Workspace: Left Protected AP Thermal Map (~67%) + Right Advisory & Ranking (~33%) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        <div className="xl:col-span-8 bg-white border border-slate-200 rounded-2xl p-2 shadow-xs h-[460px] sm:h-[520px] xl:h-[540px] min-h-[420px]">
          <IntelligenceLeafletMap
            center={[15.95, 80.1]}
            zoom={7}
            geojsonData={geojsonData}
            geojsonStyle={geojsonStyle}
            onEachGeoJsonFeature={onEachFeature}
            markers={markers}
            className="h-full rounded-xl border-slate-100"
          />
        </div>

        <div className="xl:col-span-4 min-w-0">
          <HeatwaveAdvisoryPanel
            rows={rows}
            activeRow={activeRow}
            selectedDist={selectedDist}
            onSelectDist={setSelectedDist}
            dataSourceMode={dataSourceMode}
            weatherStatus={weatherStatus}
            lastSyncedLabel={lastSyncedLabel}
          />
        </div>
      </div>

      {/* Bottom Intelligence Row: Human Vulnerability Profile + Live District Thermal Trend */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        <div className="xl:col-span-7 min-w-0">
          <HeatwaveVulnerabilityProfile
            activeRow={activeRow}
            districts={districts}
            officers={officers}
          />
        </div>
        <div className="xl:col-span-5 min-w-0">
          <DistrictThermalTrendCard
            districtName={selectedDist}
            weather={weatherByDist[selectedDist]}
            weatherStatus={weatherStatus}
          />
        </div>
      </div>
    </div>
  );
};
