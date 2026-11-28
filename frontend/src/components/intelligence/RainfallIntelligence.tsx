'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IntelligenceLeafletMap, MapMarkerSpec } from './IntelligenceLeafletMap';
import { AP_DISTRICTS } from '../../utils/apDistricts';
import { fetchBatchWeather, PointWeatherTelemetry } from '../../services/intelligence/OpenMeteoService';
import { buildRadarTileUrl, fetchRainViewerRadar, RadarFrame } from '../../services/intelligence/RainViewerService';
import { Incident } from '../../types';
import {
  ImdBand,
  RainRiskRow,
  RainfallControlHeader,
  ServiceFeedState
} from './RainfallControlHeader';
import { DistrictRainfallForecastPanel } from './DistrictRainfallForecastPanel';
import { DistrictForecastTimelineCard } from './DistrictForecastTimelineCard';
import { RainfallEarlyWarningPanel } from './RainfallEarlyWarningPanel';

function getImdRainBand(rain24h: number): ImdBand {
  if (rain24h >= 204.5) return 'EXTREMELY HEAVY';
  if (rain24h >= 115.6) return 'VERY HEAVY';
  if (rain24h >= 64.5) return 'HEAVY';
  if (rain24h >= 15.6) return 'MODERATE';
  if (rain24h >= 2.5) return 'LIGHT';
  return 'DRY / TRACE';
}

function getImdColor(band: ImdBand): string {
  switch (band) {
    case 'EXTREMELY HEAVY': return '#991b1b';
    case 'VERY HEAVY': return '#dc2626';
    case 'HEAVY': return '#ea580c';
    case 'MODERATE': return '#0284c7';
    case 'LIGHT': return '#10b981';
    default: return '#64748b';
  }
}

interface RainfallIntelligenceProps {
  incidents?: Incident[];
  onInspectIn3D?: (target: {
    id: string;
    name: string;
    lat: number;
    lng: number;
    kind: 'incident' | 'station';
    districtName?: string;
    description: string;
  }) => void;
}

export const RainfallIntelligence: React.FC<RainfallIntelligenceProps> = ({
  incidents = [],
  onInspectIn3D
}) => {
  const [frames, setFrames] = useState<RadarFrame[]>([]);
  const [pastFrameCount, setPastFrameCount] = useState<number>(0);
  const [radarHost, setRadarHost] = useState<string>('https://tilecache.rainviewer.com');
  const [frameIndex, setFrameIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeedMs, setPlaybackSpeedMs] = useState<number>(900);

  const [weatherByDist, setWeatherByDist] = useState<Record<string, PointWeatherTelemetry>>({});
  const [radarStatus, setRadarStatus] = useState<ServiceFeedState>('loading');
  const [forecastStatus, setForecastStatus] = useState<ServiceFeedState>('loading');
  const [lastUpdatedLabel, setLastUpdatedLabel] = useState<string | null>(null);
  const [selectedDist, setSelectedDist] = useState<string>('Eluru');
  const [loading, setLoading] = useState<boolean>(true);
  const fetchSeqRef = useRef<number>(0);

  const executeLoadFeeds = useCallback(async () => {
    const seq = ++fetchSeqRef.current;

    try {
      const [radarRes, batchRes] = await Promise.allSettled([
        fetchRainViewerRadar(),
        fetchBatchWeather(AP_DISTRICTS.map(d => ({ lat: d.centerLat, lng: d.centerLng })))
      ]);

      if (seq !== fetchSeqRef.current) return;

      if (radarRes.status === 'fulfilled') {
        const radar = radarRes.value;
        const allFrames = [...radar.past, ...radar.nowcast];
        setRadarHost(radar.host);
        setFrames(allFrames);
        setPastFrameCount(radar.past.length);
        if (allFrames.length > 0) {
          setFrameIndex(Math.max(0, radar.past.length - 1));
          setRadarStatus('live');
        } else {
          setRadarStatus('unavailable');
        }
      } else {
        setRadarStatus('error');
      }

      if (batchRes.status === 'fulfilled' && batchRes.value.length > 0) {
        const map: Record<string, PointWeatherTelemetry> = {};
        AP_DISTRICTS.forEach((d, i) => {
          if (batchRes.value[i]) map[d.district] = batchRes.value[i];
        });
        setWeatherByDist(map);
        setForecastStatus('live');
      } else {
        setForecastStatus(batchRes.status === 'rejected' ? 'error' : 'unavailable');
      }

      if (radarRes.status === 'fulfilled' || batchRes.status === 'fulfilled') {
        setLastUpdatedLabel(
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
    const timer = setTimeout(() => {
      void executeLoadFeeds();
    }, 0);
    return () => clearTimeout(timer);
  }, [executeLoadFeeds]);

  const handleRefresh = useCallback(() => {
    setLoading(true);
    setRadarStatus(prev => (prev === 'live' ? 'live' : 'loading'));
    setForecastStatus(prev => (prev === 'live' ? 'live' : 'loading'));
    void executeLoadFeeds();
  }, [executeLoadFeeds]);

  // Original RainViewer playback timer preserved with configurable cadence
  useEffect(() => {
    if (!isPlaying || frames.length <= 1) return;
    const timer = setInterval(() => {
      setFrameIndex(prev => (prev + 1) % frames.length);
    }, playbackSpeedMs);
    return () => clearInterval(timer);
  }, [isPlaying, frames.length, playbackSpeedMs]);

  const rows: RainRiskRow[] = useMemo(() => {
    return AP_DISTRICTS.map(meta => {
      const w = weatherByDist[meta.district];
      const rain24hMm = w?.next24hRainMm ?? 0;
      return {
        meta,
        currentMm: w?.precipitationMm ?? 0,
        peak3hMm: w?.peak3hRainMm ?? 0,
        rain24hMm,
        rain72hMm: w?.next72hRainMm ?? 0,
        soilPct: (w?.soilMoistureTop ?? 0.2) * 100,
        imdBand: getImdRainBand(rain24hMm),
        hasLiveForecast: Boolean(w)
      };
    });
  }, [weatherByDist]);

  const activeRow = useMemo(
    () => rows.find(r => r.meta.district === selectedDist) || rows[0],
    [rows, selectedDist]
  );

  const currentFrame = frames[frameIndex];
  const radarTileUrl = currentFrame ? buildRadarTileUrl(radarHost, currentFrame.path) : null;

  const markers: MapMarkerSpec[] = useMemo(() => {
    return rows.map(r => ({
      id: `rain-${r.meta.code}`,
      lat: r.meta.centerLat,
      lng: r.meta.centerLng,
      title: `${r.meta.district} (${r.imdBand})`,
      subtitle: `24h Forecast: ${r.rain24hMm}mm • 72h: ${r.rain72hMm}mm • Soil: ${r.soilPct.toFixed(0)}%`,
      badge: r.rain24hMm >= 1 ? `${r.rain24hMm.toFixed(0)}` : r.meta.code,
      color: getImdColor(r.imdBand),
      radius: r.meta.district === selectedDist ? 14 : 10,
      pulse: r.rain24hMm >= 64.5,
      onClick: () => setSelectedDist(r.meta.district)
    }));
  }, [rows, selectedDist]);

  return (
    <div className="space-y-4">
      {/* Top Page Header + RainViewer Playback Console + District Rainfall Summary */}
      <RainfallControlHeader
        rows={rows}
        activeRow={activeRow}
        selectedDist={selectedDist}
        onSelectDist={setSelectedDist}
        frames={frames}
        pastFrameCount={pastFrameCount}
        frameIndex={frameIndex}
        isPlaying={isPlaying}
        playbackSpeedMs={playbackSpeedMs}
        onTogglePlay={() => setIsPlaying(prev => !prev)}
        onPrevFrame={() => {
          if (frames.length === 0) return;
          setIsPlaying(false);
          setFrameIndex(prev => (prev - 1 + frames.length) % frames.length);
        }}
        onNextFrame={() => {
          if (frames.length === 0) return;
          setIsPlaying(false);
          setFrameIndex(prev => (prev + 1) % frames.length);
        }}
        onSeekFrame={(idx) => {
          setIsPlaying(false);
          setFrameIndex(idx);
        }}
        onJumpLatestFrame={() => {
          setIsPlaying(false);
          setFrameIndex(Math.max(0, pastFrameCount - 1));
        }}
        onChangePlaybackSpeedMs={setPlaybackSpeedMs}
        radarStatus={radarStatus}
        forecastStatus={forecastStatus}
        lastUpdatedLabel={lastUpdatedLabel}
        loading={loading}
        onRefresh={handleRefresh}
        onJumpToWarnings={() => {
          document.getElementById('rainfall-early-warning-panel')?.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest'
          });
        }}
        onInspectIn3D={
          onInspectIn3D && activeRow
            ? () =>
                onInspectIn3D({
                  id: `rain-${activeRow.meta.code}`,
                  name: `${activeRow.meta.district} Rainfall Warning Zone`,
                  lat: activeRow.meta.centerLat,
                  lng: activeRow.meta.centerLng,
                  kind: 'incident',
                  districtName: activeRow.meta.district,
                  description: `IMD Band: ${activeRow.imdBand} • 72h Forecast: ${activeRow.rain72hMm}mm`
                })
            : undefined
        }
      />

      {/* Main Two-Column Workspace: Left Protected RainViewer Map (~67%) + Right District Forecast Panel (~33%) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        <div className="xl:col-span-8 bg-white border border-slate-200 rounded-2xl p-2 shadow-xs h-[460px] sm:h-[520px] xl:h-[540px] min-h-[420px]">
          <IntelligenceLeafletMap
            center={[15.95, 80.1]}
            zoom={7}
            radarTileUrl={radarTileUrl}
            markers={markers}
            className="h-full rounded-xl border-slate-100"
          />
        </div>

        <div className="xl:col-span-4 min-w-0">
          <DistrictRainfallForecastPanel
            rows={rows}
            selectedDist={selectedDist}
            onSelectDist={setSelectedDist}
            forecastStatus={forecastStatus}
          />
        </div>
      </div>

      {/* Bottom Intelligence Row: Day-wise / Hourly Forecast Timeline + Early Warning Intelligence */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        <div className="xl:col-span-6 min-w-0">
          <DistrictForecastTimelineCard
            districtName={selectedDist}
            weather={weatherByDist[selectedDist]}
            forecastStatus={forecastStatus}
            lastUpdatedLabel={lastUpdatedLabel}
          />
        </div>
        <div className="xl:col-span-6 min-w-0">
          <RainfallEarlyWarningPanel
            rows={rows}
            activeRow={activeRow}
            incidents={incidents}
            radarStatus={radarStatus}
            forecastStatus={forecastStatus}
            lastUpdatedLabel={lastUpdatedLabel}
          />
        </div>
      </div>
    </div>
  );
};
