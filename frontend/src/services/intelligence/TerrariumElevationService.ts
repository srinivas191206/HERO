export interface TerrainSample {
  elevationMeters: number;
  slopeDegrees: number;
  source: 'aws-terrarium' | 'fallback';
}

const tileCache = new Map<string, ImageData>();
const tileInFlight = new Map<string, Promise<ImageData>>();

function latLngToTilePixel(lat: number, lng: number, zoom: number) {
  const n = Math.pow(2, zoom);
  const xFloat = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const yFloat =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;

  const tileX = Math.floor(xFloat);
  const tileY = Math.floor(yFloat);
  const pxX = Math.min(255, Math.max(0, Math.floor((xFloat - tileX) * 256)));
  const pxY = Math.min(255, Math.max(0, Math.floor((yFloat - tileY) * 256)));
  return { tileX, tileY, pxX, pxY };
}

async function loadTerrariumTile(z: number, x: number, y: number): Promise<ImageData> {
  const key = `${z}/${x}/${y}`;
  const cached = tileCache.get(key);
  if (cached) return cached;

  const existing = tileInFlight.get(key);
  if (existing) return existing;

  const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
  const promise = new Promise<ImageData>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Terrarium timeout')), 4000);
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => {
      clearTimeout(timer);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas 2D unavailable'));
          return;
        }
        ctx.drawImage(el, 0, 0);
        const imageData = ctx.getImageData(0, 0, 256, 256);
        tileCache.set(key, imageData);
        resolve(imageData);
      } catch (err) {
        reject(err);
      }
    };
    el.onerror = () => {
      clearTimeout(timer);
      reject(new Error('Terrarium tile load failed'));
    };
    el.src = url;
  }).finally(() => {
    tileInFlight.delete(key);
  });

  tileInFlight.set(key, promise);
  return promise;
}

function decodeTerrariumPixel(imageData: ImageData, pxX: number, pxY: number): number {
  const idx = (pxY * 256 + pxX) * 4;
  const r = imageData.data[idx];
  const g = imageData.data[idx + 1];
  const b = imageData.data[idx + 2];
  return r * 256 + g + b / 256 - 32768;
}

/**
 * Samples AWS Open Data Terrarium elevation (m) & estimates slope (degrees)
 * using neighboring pixels inside the z=11 (~75m/pixel) elevation raster.
 */
export async function sampleTerrainAndSlope(
  lat: number,
  lng: number,
  fallbackElev = 120
): Promise<TerrainSample> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { elevationMeters: fallbackElev, slopeDegrees: 4.5, source: 'fallback' };
  }

  try {
    const zoom = 11;
    const { tileX, tileY, pxX, pxY } = latLngToTilePixel(lat, lng, zoom);
    const tile = await loadTerrariumTile(zoom, tileX, tileY);
    const elev = decodeTerrariumPixel(tile, pxX, pxY);

    const xPrev = Math.max(0, pxX - 1);
    const xNext = Math.min(255, pxX + 1);
    const yPrev = Math.max(0, pxY - 1);
    const yNext = Math.min(255, pxY + 1);

    const eL = decodeTerrariumPixel(tile, xPrev, pxY);
    const eR = decodeTerrariumPixel(tile, xNext, pxY);
    const eU = decodeTerrariumPixel(tile, pxX, yPrev);
    const eD = decodeTerrariumPixel(tile, pxX, yNext);

    const metersPerPixel = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
    const dx = Math.max(1, xNext - xPrev) * metersPerPixel;
    const dy = Math.max(1, yNext - yPrev) * metersPerPixel;
    const dzdx = (eR - eL) / dx;
    const dzdy = (eD - eU) / dy;
    const slopeRad = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy));
    const slopeDeg = Number(((slopeRad * 180) / Math.PI).toFixed(1));

    return {
      elevationMeters: Number(elev.toFixed(1)),
      slopeDegrees: slopeDeg,
      source: 'aws-terrarium'
    };
  } catch {
    return { elevationMeters: fallbackElev, slopeDegrees: 5.0, source: 'fallback' };
  }
}
