import * as Cesium from 'cesium';

let heroEntitiesDataSource = null;

function getColorForEntity(kind, priority, status) {
  if (kind === 'incident') {
    return priority === 'P1'
      ? Cesium.Color.fromCssColorString('#ef4444')
      : Cesium.Color.fromCssColorString('#f59e0b');
  }
  if (kind === 'station') {
    return Cesium.Color.fromCssColorString('#0ea5e9');
  }
  if (kind === 'shelter') {
    return Cesium.Color.fromCssColorString('#10b981');
  }
  if (kind === 'officer') {
    if (status === 'Emergency') return Cesium.Color.fromCssColorString('#ef4444');
    if (status === 'Offline' || status === 'Lost Connection') return Cesium.Color.fromCssColorString('#94a3b8');
    return Cesium.Color.fromCssColorString('#22c55e');
  }
  return Cesium.Color.fromCssColorString('#38bdf8');
}

function getEmojiPrefix(kind) {
  if (kind === 'incident') return '🚨 ';
  if (kind === 'station') return '🚓 ';
  if (kind === 'shelter') return '🏕️ ';
  if (kind === 'officer') return '👮 ';
  return '📍 ';
}

export async function syncHeroEntitiesLayer(viewer, payload = {}) {
  if (!heroEntitiesDataSource) {
    heroEntitiesDataSource = new Cesium.CustomDataSource('hero-tactical-entities');
    await viewer.dataSources.add(heroEntitiesDataSource);
  }

  heroEntitiesDataSource.entities.removeAll();

  const items = [];

  (payload.stations || []).forEach((s, idx) => {
    if (typeof s.lat === 'number' && typeof s.lng === 'number') {
      items.push({
        id: `hero-station-${s.id || idx}`,
        rawId: s.id || `station-${idx}`,
        kind: 'station',
        name: s.name || 'Police Station',
        desc: s.desc || 'Police Tactical Post',
        lat: s.lat,
        lng: s.lng,
        levels: s.levels || 3,
        districtName: s.districtName
      });
    }
  });

  (payload.shelters || []).forEach((sh, idx) => {
    if (typeof sh.lat === 'number' && typeof sh.lng === 'number') {
      items.push({
        id: `hero-shelter-${sh.id || idx}`,
        rawId: sh.id || `shelter-${idx}`,
        kind: 'shelter',
        name: sh.name || 'Relief Shelter',
        desc: sh.desc || 'Emergency Disaster Shelter',
        lat: sh.lat,
        lng: sh.lng,
        levels: sh.levels || 2,
        districtName: sh.districtName
      });
    }
  });

  (payload.incidents || []).forEach((inc, idx) => {
    const lat = inc.locationLat ?? inc.lat;
    const lng = inc.locationLng ?? inc.lng;
    if (typeof lat === 'number' && typeof lng === 'number') {
      items.push({
        id: `hero-incident-${inc.id || idx}`,
        rawId: inc.id || `inc-${idx}`,
        kind: 'incident',
        name: inc.title || 'Incident',
        desc: inc.description || '',
        priority: inc.priority,
        status: inc.status,
        lat,
        lng,
        levels: 4,
        districtName: inc.districtName
      });
    }
  });

  (payload.officers || []).forEach((off, idx) => {
    const lat = off.location?.latitude ?? off.lat;
    const lng = off.location?.longitude ?? off.lng;
    if (typeof lat === 'number' && typeof lng === 'number') {
      items.push({
        id: `hero-officer-${off.id || idx}`,
        rawId: off.id || `off-${idx}`,
        kind: 'officer',
        name: `${off.name || 'Officer'} (${off.badgeNumber || 'PID'})`,
        desc: `Status: ${off.status || 'Online'} • Battery: ${off.battery ?? 100}%`,
        status: off.status,
        lat,
        lng,
        levels: 2,
        districtName: off.districtName
      });
    }
  });

  items.forEach((item) => {
    const color = getColorForEntity(item.kind, item.priority, item.status);
    heroEntitiesDataSource.entities.add({
      id: item.id,
      name: item.name,
      position: Cesium.Cartesian3.fromDegrees(item.lng, item.lat, item.kind === 'incident' ? 32 : 24),
      point: {
        pixelSize: item.kind === 'incident' ? 13 : 10,
        color,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      },
      label: {
        text: `${getEmojiPrefix(item.kind)}${item.name}`,
        font: 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif',
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -14),
        showBackground: true,
        backgroundColor: item.kind === 'incident'
          ? Cesium.Color.fromCssColorString('#7f1d1d').withAlpha(0.9)
          : Cesium.Color.fromCssColorString('#0f172a').withAlpha(0.88),
        backgroundPadding: new Cesium.Cartesian2(6, 4),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 90000),
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      },
      properties: new Cesium.PropertyBag({
        heroKind: item.kind,
        rawId: item.rawId,
        name: item.name,
        description: item.desc,
        lat: item.lat,
        lng: item.lng,
        levels: item.levels,
        districtName: item.districtName || ''
      })
    });
  });

  return items.length;
}
