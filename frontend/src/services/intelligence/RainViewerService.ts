export interface RadarFrame {
  time: number;
  path: string;
}

export interface RainViewerFeed {
  host: string;
  generated: number;
  past: RadarFrame[];
  nowcast: RadarFrame[];
}

export async function fetchRainViewerRadar(): Promise<RainViewerFeed> {
  const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
  if (!res.ok) {
    throw new Error(`RainViewer HTTP ${res.status}`);
  }
  const data = await res.json();
  return {
    host: data?.host || 'https://tilecache.rainviewer.com',
    generated: data?.generated || Math.floor(Date.now() / 1000),
    past: Array.isArray(data?.radar?.past) ? data.radar.past : [],
    nowcast: Array.isArray(data?.radar?.nowcast) ? data.radar.nowcast : []
  };
}

export function buildRadarTileUrl(host: string, path: string): string {
  return `${host}${path}/256/{z}/{x}/{y}/2/1_1.png`;
}
