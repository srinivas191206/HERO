export interface PointWeatherTelemetry {
  latitude: number;
  longitude: number;
  elevation: number;
  temperatureC: number;
  relativeHumidity: number;
  apparentTemperatureC: number;
  precipitationMm: number;
  windSpeedKmh: number;
  soilMoistureTop: number | null;
  soilMoistureRoot: number | null;
  hourlyTime: string[];
  hourlyTemperatureC: number[];
  hourlyRelativeHumidity: number[];
  hourlyPrecipitationMm: number[];
  hourlyApparentTempC: number[];
  hourlySoilMoistureTop: number[];
  next24hRainMm: number;
  next72hRainMm: number;
  peak3hRainMm: number;
  fetchedAt: number;
}

export interface RiverDischargeTelemetry {
  latitude: number;
  longitude: number;
  dates: string[];
  discharge: number[];
  dischargeMean: number[];
  dischargeMax: number[];
  currentDischarge: number;
  peak7dDischarge: number;
  fetchedAt: number;
}

const weatherCache = new Map<string, PointWeatherTelemetry>();
const floodCache = new Map<string, RiverDischargeTelemetry>();
const inFlightBatch = new Map<string, Promise<PointWeatherTelemetry[]>>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function fetchWithTimeout(url: string, ms = 8000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(id));
}

function parsePointWeather(item: any, lat: number, lng: number): PointWeatherTelemetry {
  const hourly = item?.hourly || {};
  const hourlyTime: string[] = Array.isArray(hourly.time) ? hourly.time : [];
  const hourlyTemp: number[] = Array.isArray(hourly.temperature_2m)
    ? hourly.temperature_2m.map((v: unknown) => Number(v) || 0)
    : [];
  const hourlyRh: number[] = Array.isArray(hourly.relative_humidity_2m)
    ? hourly.relative_humidity_2m.map((v: unknown) => Number(v) || 0)
    : [];
  const hourlyPrecip: number[] = Array.isArray(hourly.precipitation)
    ? hourly.precipitation.map((v: any) => Number(v) || 0)
    : [];
  const hourlyApparent: number[] = Array.isArray(hourly.apparent_temperature)
    ? hourly.apparent_temperature.map((v: any) => Number(v) || 0)
    : [];
  const hourlySoil: number[] = Array.isArray(hourly.soil_moisture_0_to_7cm)
    ? hourly.soil_moisture_0_to_7cm.map((v: any) => (v != null ? Number(v) : 0))
    : [];
  const hourlySoilDeep: number[] = Array.isArray(hourly.soil_moisture_7_to_28cm)
    ? hourly.soil_moisture_7_to_28cm.map((v: any) => (v != null ? Number(v) : 0))
    : [];

  const next24h = hourlyPrecip.slice(0, 24).reduce((s, v) => s + v, 0);
  const next72h = hourlyPrecip.slice(0, 72).reduce((s, v) => s + v, 0);
  let peak3h = 0;
  for (let i = 0; i < Math.min(24, hourlyPrecip.length); i++) {
    const window3 = (hourlyPrecip[i] || 0) + (hourlyPrecip[i + 1] || 0) + (hourlyPrecip[i + 2] || 0);
    if (window3 > peak3h) peak3h = window3;
  }

  return {
    latitude: item?.latitude ?? lat,
    longitude: item?.longitude ?? lng,
    elevation: item?.elevation ?? 0,
    temperatureC: Number(item?.current?.temperature_2m ?? 30),
    relativeHumidity: Number(item?.current?.relative_humidity_2m ?? 60),
    apparentTemperatureC: Number(item?.current?.apparent_temperature ?? item?.current?.temperature_2m ?? 32),
    precipitationMm: Number(item?.current?.precipitation ?? 0),
    windSpeedKmh: Number(item?.current?.wind_speed_10m ?? 10),
    soilMoistureTop: hourlySoil[0] ?? null,
    soilMoistureRoot: hourlySoilDeep[0] ?? null,
    hourlyTime,
    hourlyTemperatureC: hourlyTemp,
    hourlyRelativeHumidity: hourlyRh,
    hourlyPrecipitationMm: hourlyPrecip,
    hourlyApparentTempC: hourlyApparent,
    hourlySoilMoistureTop: hourlySoil,
    next24hRainMm: Number(next24h.toFixed(1)),
    next72hRainMm: Number(next72h.toFixed(1)),
    peak3hRainMm: Number(peak3h.toFixed(1)),
    fetchedAt: Date.now()
  };
}

export async function fetchPointWeather(lat: number, lng: number): Promise<PointWeatherTelemetry> {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const cached = weatherCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached;
  }

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,wind_speed_10m` +
    `&hourly=temperature_2m,relative_humidity_2m,precipitation,apparent_temperature,soil_moisture_0_to_7cm,soil_moisture_7_to_28cm` +
    `&forecast_days=3&timezone=Asia%2FKolkata`;

  const res = await fetchWithTimeout(url, 8000);
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const data = await res.json();
  const parsed = parsePointWeather(data, lat, lng);
  weatherCache.set(key, parsed);
  return parsed;
}

export async function fetchBatchWeather(
  points: Array<{ lat: number; lng: number }>
): Promise<PointWeatherTelemetry[]> {
  if (points.length === 0) return [];
  if (points.length === 1) {
    return [await fetchPointWeather(points[0].lat, points[0].lng)];
  }

  // Return immediately from cache if all requested coordinates are fresh
  const now = Date.now();
  const cachedAll = points.map(p => weatherCache.get(`${p.lat.toFixed(3)},${p.lng.toFixed(3)}`));
  if (cachedAll.every(c => c && now - c.fetchedAt < CACHE_TTL_MS)) {
    return cachedAll as PointWeatherTelemetry[];
  }

  const lats = points.map(p => p.lat.toFixed(4)).join(',');
  const lngs = points.map(p => p.lng.toFixed(4)).join(',');
  const batchKey = `${lats}|${lngs}`;
  const pending = inFlightBatch.get(batchKey);
  if (pending) return pending;

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,wind_speed_10m` +
    `&hourly=temperature_2m,relative_humidity_2m,precipitation,apparent_temperature,soil_moisture_0_to_7cm,soil_moisture_7_to_28cm` +
    `&forecast_days=3&timezone=Asia%2FKolkata`;

  const reqPromise = (async () => {
    try {
      const res = await fetchWithTimeout(url, 9000);
      if (!res.ok) throw new Error(`Open-Meteo batch HTTP ${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : [data];
      return list.map((item, i) => {
        const parsed = parsePointWeather(item, points[i]?.lat ?? 0, points[i]?.lng ?? 0);
        weatherCache.set(`${points[i].lat.toFixed(3)},${points[i].lng.toFixed(3)}`, parsed);
        return parsed;
      });
    } finally {
      inFlightBatch.delete(batchKey);
    }
  })();

  inFlightBatch.set(batchKey, reqPromise);
  return reqPromise;
}

export async function fetchRiverDischarge(lat: number, lng: number): Promise<RiverDischargeTelemetry> {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const cached = floodCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached;
  }

  const url =
    `https://flood-api.open-meteo.com/v1/flood?latitude=${lat}&longitude=${lng}` +
    `&daily=river_discharge,river_discharge_mean,river_discharge_max&forecast_days=7`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo Flood HTTP ${res.status}`);
  const data = await res.json();
  const dates: string[] = Array.isArray(data?.daily?.time) ? data.daily.time : [];
  const discharge: number[] = Array.isArray(data?.daily?.river_discharge)
    ? data.daily.river_discharge.map((v: any) => Number(v) || 0)
    : [];
  const dischargeMean: number[] = Array.isArray(data?.daily?.river_discharge_mean)
    ? data.daily.river_discharge_mean.map((v: any) => Number(v) || 0)
    : [];
  const dischargeMax: number[] = Array.isArray(data?.daily?.river_discharge_max)
    ? data.daily.river_discharge_max.map((v: any) => Number(v) || 0)
    : [];

  const parsed: RiverDischargeTelemetry = {
    latitude: data?.latitude ?? lat,
    longitude: data?.longitude ?? lng,
    dates,
    discharge,
    dischargeMean,
    dischargeMax,
    currentDischarge: discharge[0] ?? 0,
    peak7dDischarge: Math.max(0, ...discharge),
    fetchedAt: Date.now()
  };
  floodCache.set(key, parsed);
  return parsed;
}
