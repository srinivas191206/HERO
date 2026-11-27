import * as Cesium from 'cesium';
import { MAP_CONFIG } from '../config/mapConfig.js';

let apDistrictsDataSource = null;
let cachedFeatures = null;
let selectedDistrictName = null;

const DISTRICT_CODE_ALIASES = {
  elr: 'Eluru',
  eluru: 'Eluru',
  kkd: 'Kakinada',
  kakinada: 'Kakinada',
  vzg: 'Visakhapatnam',
  vsp: 'Visakhapatnam',
  visakhapatnam: 'Visakhapatnam',
  vizag: 'Visakhapatnam',
  knl: 'Kurnool',
  kurnool: 'Kurnool',
  gnt: 'Guntur',
  guntur: 'Guntur',
  tpt: 'Tirupati',
  tirupati: 'Tirupati',
  ntr: 'NTR',
  vja: 'NTR',
  vijayawada: 'NTR',
  atp: 'Ananthapuramu',
  ananthapuramu: 'Ananthapuramu',
  anantapur: 'Ananthapuramu',
  nlr: 'Sri Potti Sriramulu Nellore',
  nellore: 'Sri Potti Sriramulu Nellore',
  kdp: 'Y.S.R.Kadapa',
  kadapa: 'Y.S.R.Kadapa',
  skl: 'Srikakulam',
  srikakulam: 'Srikakulam',
  vzm: 'Vizianagaram',
  vizianagaram: 'Vizianagaram',
  egd: 'East Godavari',
  wgd: 'West Godavari',
  pkm: 'Prakasam',
  prakasam: 'Prakasam',
  ctr: 'Chittoor',
  chittoor: 'Chittoor',
  ndl: 'Nandyal',
  nandyal: 'Nandyal',
  bpt: 'Bapatla',
  bapatla: 'Bapatla',
  pld: 'Palnadu',
  palnadu: 'Palnadu',
  akp: 'Anakapalli',
  anakapalli: 'Anakapalli',
  asr: 'Alluri Sitharama Raju',
  konaseema: 'Dr.B.R.Ambedkar Konaseema',
  plv: 'Polavaram',
  polavaram: 'Polavaram',
  mrk: 'Markapuram',
  markapuram: 'Markapuram',
  pvp: 'Parvathipuram Manyam',
  annamayya: 'Annamayya',
  sss: 'Sri Sathya Sai',
  kris: 'Krishna',
  krishna: 'Krishna'
};

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\bdistrict\b|\bhub\b|\bcommand\b|\bpolice\b/g, ' ')
    .replace(/[^a-z0-9]/g, '');
}

export function matchAPDistrictFeature(features, queryOrCode) {
  if (!features || !features.length || !queryOrCode) return null;
  const raw = String(queryOrCode).trim();
  const aliasTarget = DISTRICT_CODE_ALIASES[raw.toLowerCase()];
  if (aliasTarget) {
    const exactAlias = features.find(f => f.properties?.district === aliasTarget);
    if (exactAlias) return exactAlias;
  }

  const normQuery = normalizeText(raw);
  if (!normQuery) return null;

  return (
    features.find(f => normalizeText(f.properties?.district) === normQuery) ||
    features.find(f => {
      const normDist = normalizeText(f.properties?.district);
      return normDist.includes(normQuery) || normQuery.includes(normDist);
    }) ||
    null
  );
}

function simplifyRing(ring, maxPoints = 90) {
  if (!ring || ring.length <= maxPoints) return ring;
  const step = Math.max(1, Math.floor(ring.length / maxPoints));
  const out = [];
  for (let i = 0; i < ring.length; i += step) {
    out.push(ring[i]);
  }
  const last = ring[ring.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

function computeFeatureBBox(geometry) {
  let minLat = 90;
  let maxLat = -90;
  let minLon = 180;
  let maxLon = -180;

  const visit = (coords) => {
    if (!Array.isArray(coords) || coords.length === 0) return;
    if (typeof coords[0] === 'number') {
      const [lon, lat] = coords;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      return;
    }
    for (const sub of coords) visit(sub);
  };

  visit(geometry?.coordinates);
  return {
    minLat,
    maxLat,
    minLon,
    maxLon,
    centerLat: (minLat + maxLat) / 2,
    centerLon: (minLon + maxLon) / 2
  };
}

function getHeatColor(tmax, isHighlighted) {
  if (isHighlighted) {
    return {
      fill: Cesium.Color.fromCssColorString('#0ea5e9').withAlpha(0.28),
      outline: Cesium.Color.fromCssColorString('#38bdf8').withAlpha(0.95),
      width: 3.5
    };
  }
  if (typeof tmax === 'number') {
    if (tmax >= 44) {
      return {
        fill: Cesium.Color.fromCssColorString('#ef4444').withAlpha(0.14),
        outline: Cesium.Color.fromCssColorString('#f97316').withAlpha(0.75),
        width: 1.8
      };
    }
    if (tmax >= 41) {
      return {
        fill: Cesium.Color.fromCssColorString('#f59e0b').withAlpha(0.11),
        outline: Cesium.Color.fromCssColorString('#fbbf24').withAlpha(0.65),
        width: 1.5
      };
    }
  }
  return {
    fill: Cesium.Color.fromCssColorString('#0284c7').withAlpha(0.08),
    outline: Cesium.Color.fromCssColorString('#38bdf8').withAlpha(0.55),
    width: 1.5
  };
}

export async function loadAPDistrictsGeoJSON() {
  if (cachedFeatures) return cachedFeatures;
  try {
    const res = await fetch(MAP_CONFIG.aoi.dataPaths.apDistricts);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    cachedFeatures = (data.features || []).map(f => ({
      ...f,
      _bbox: computeFeatureBBox(f.geometry)
    }));
    return cachedFeatures;
  } catch (err) {
    console.warn('AP Districts GeoJSON unavailable:', err.message);
    return [];
  }
}

export async function renderAPDistrictsLayer(viewer, options = {}) {
  const { highlightName = null, heroDistricts = [], visible = true } = options;
  selectedDistrictName = highlightName;

  const features = await loadAPDistrictsGeoJSON();
  if (!apDistrictsDataSource) {
    apDistrictsDataSource = new Cesium.CustomDataSource('ap-state-districts');
    await viewer.dataSources.add(apDistrictsDataSource);
  }

  apDistrictsDataSource.entities.removeAll();
  apDistrictsDataSource.show = visible;

  features.forEach((feature, fIdx) => {
    const props = feature.properties || {};
    const distName = props.district || `District ${fIdx + 1}`;
    const isHighlighted = Boolean(
      highlightName && normalizeText(distName) === normalizeText(highlightName)
    );
    const style = getHeatColor(props.peak_tmax, isHighlighted);
    const polygons =
      feature.geometry?.type === 'MultiPolygon'
        ? feature.geometry.coordinates
        : feature.geometry?.type === 'Polygon'
          ? [feature.geometry.coordinates]
          : [];

    polygons.forEach((polyCoords, pIdx) => {
      const outer = simplifyRing(polyCoords[0], isHighlighted ? 140 : 85);
      if (!outer || outer.length < 3) return;
      const flat = [];
      for (const pt of outer) {
        flat.push(pt[0], pt[1]);
      }

      apDistrictsDataSource.entities.add({
        id: `ap-dist-poly-${fIdx}-${pIdx}`,
        name: distName,
        polygon: {
          hierarchy: Cesium.Cartesian3.fromDegreesArray(flat),
          height: isHighlighted ? 18 : 2,
          extrudedHeight: isHighlighted ? 65 : undefined,
          material: style.fill,
          outline: true,
          outlineColor: style.outline,
          outlineWidth: style.width
        },
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray(flat),
          width: style.width,
          material: style.outline,
          clampToGround: true
        },
        properties: new Cesium.PropertyBag({
          kind: 'ap_district',
          district: distName,
          peakTmax: props.peak_tmax ?? null,
          peakMandal: props.peak_mandal ?? '',
          centerLat: feature._bbox.centerLat,
          centerLng: feature._bbox.centerLon
        })
      });
    });

    const heroMatch = heroDistricts.find(hd => {
      const matched = matchAPDistrictFeature([feature], hd.name || hd.code);
      return Boolean(matched);
    });

    const labelText = heroMatch
      ? `${distName.toUpperCase()} (${heroMatch.code})${props.peak_tmax != null ? ` · ${props.peak_tmax}°C` : ''}`
      : `${distName.toUpperCase()}${props.peak_tmax != null ? ` · ${props.peak_tmax}°C` : ''}`;

    apDistrictsDataSource.entities.add({
      id: `ap-dist-pin-${fIdx}`,
      name: distName,
      position: Cesium.Cartesian3.fromDegrees(feature._bbox.centerLon, feature._bbox.centerLat, isHighlighted ? 95 : 35),
      point: {
        pixelSize: isHighlighted ? 12 : heroMatch ? 10 : 7,
        color: heroMatch
          ? (heroMatch.sosCount > 0 ? Cesium.Color.RED : Cesium.Color.LIMEGREEN)
          : Cesium.Color.fromCssColorString('#38bdf8'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      },
      label: {
        text: labelText,
        font: isHighlighted
          ? 'bold 12px -apple-system, BlinkMacSystemFont, sans-serif'
          : 'bold 10px -apple-system, BlinkMacSystemFont, sans-serif',
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -12),
        showBackground: true,
        backgroundColor: isHighlighted
          ? Cesium.Color.fromCssColorString('#0369a1').withAlpha(0.92)
          : Cesium.Color.fromCssColorString('#0f172a').withAlpha(0.78),
        backgroundPadding: new Cesium.Cartesian2(6, 4),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(4500, 1500000),
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      },
      properties: new Cesium.PropertyBag({
        kind: 'ap_district',
        district: distName,
        peakTmax: props.peak_tmax ?? null,
        peakMandal: props.peak_mandal ?? '',
        centerLat: feature._bbox.centerLat,
        centerLng: feature._bbox.centerLon,
        heroDistrictId: heroMatch?.id || null
      })
    });
  });

  return features;
}

export async function focusAPDistrict(viewer, nameOrCode, fallbackCoords = null, heroDistricts = []) {
  const features = await loadAPDistrictsGeoJSON();
  const matched = matchAPDistrictFeature(features, nameOrCode);
  const highlightName = matched?.properties?.district || nameOrCode || selectedDistrictName;

  await renderAPDistrictsLayer(viewer, {
    highlightName,
    heroDistricts,
    visible: true
  });

  const targetLat = fallbackCoords?.lat ?? matched?._bbox?.centerLat;
  const targetLon = fallbackCoords?.lng ?? matched?._bbox?.centerLon;
  const targetAlt = fallbackCoords?.altitude ?? (matched ? 38000 : 12000);

  if (typeof targetLat === 'number' && typeof targetLon === 'number' && !Number.isNaN(targetLat) && !Number.isNaN(targetLon)) {
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(targetLon, targetLat - 0.08, targetAlt),
      orientation: {
        heading: Cesium.Math.toRadians(0.0),
        pitch: Cesium.Math.toRadians(-58.0),
        roll: 0.0
      },
      duration: 1.6
    });
  }

  return matched
    ? {
        district: matched.properties.district,
        peakTmax: matched.properties.peak_tmax,
        peakMandal: matched.properties.peak_mandal,
        centerLat: matched._bbox.centerLat,
        centerLng: matched._bbox.centerLon
      }
    : null;
}

export function setAPDistrictsVisibility(visible) {
  if (apDistrictsDataSource) {
    apDistrictsDataSource.show = visible;
  }
}
