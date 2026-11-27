import * as Cesium from 'cesium';

let parcelsDataSource = null;
let activeHighlightedParcel = null;

export async function createParcelsLayer(viewer, buildingsGeoJSON) {
  parcelsDataSource = new Cesium.CustomDataSource('cadastral-parcels');

  if (!buildingsGeoJSON || !buildingsGeoJSON.features) {
    await viewer.dataSources.add(parcelsDataSource);
    return parcelsDataSource;
  }

  const features = buildingsGeoJSON.features;
  console.log(`Generating cadastral surface parcels for ${features.length} properties...`);
  parcelsDataSource.entities.suspendEvents();

  features.forEach((feature, index) => {
    if (!feature.geometry || feature.geometry.type !== 'Polygon') return;
    const ring = feature.geometry.coordinates[0];
    if (!ring || ring.length < 3) return;

    // Buffer parcel ring outward slightly (~1.5 to 2.5 meters in deg)
    const centroid = feature.properties?.centroid || [ring[0][0], ring[0][1]];
    const scaleFactor = 1.15; // slightly larger than building footprint to form parcel boundary

    const parcelCoords = [];
    for (const [lon, lat] of ring) {
      const pLon = centroid[0] + (lon - centroid[0]) * scaleFactor;
      const pLat = centroid[1] + (lat - centroid[1]) * scaleFactor;
      parcelCoords.push(pLon, pLat);
    }

    const fid = feature.properties?.id || index;
    parcelsDataSource.entities.add({
      id: `parcel-${fid}`,
      name: `Parcel #${fid}`,
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray(parcelCoords),
        height: 0.15,
        material: Cesium.Color.fromCssColorString('#ffffff').withAlpha(0.04),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString('#e2e8f0').withAlpha(0.55),
        outlineWidth: 1.0
      },
      properties: new Cesium.PropertyBag({
        parcelId: fid,
        buildingId: fid
      })
    });
  });

  parcelsDataSource.entities.resumeEvents();
  await viewer.dataSources.add(parcelsDataSource);
  console.log(`Loaded ${parcelsDataSource.entities.values.length} surface parcels.`);
  return parcelsDataSource;
}

export function highlightParcel(buildingId) {
  // Clear previous
  if (activeHighlightedParcel && activeHighlightedParcel.polygon) {
    activeHighlightedParcel.polygon.material = Cesium.Color.fromCssColorString('#ffffff').withAlpha(0.04);
    activeHighlightedParcel.polygon.outlineColor = Cesium.Color.fromCssColorString('#e2e8f0').withAlpha(0.65);
    activeHighlightedParcel.polygon.outlineWidth = 1.5;
    activeHighlightedParcel = null;
  }

  if (!buildingId || !parcelsDataSource) return;

  const parcel = parcelsDataSource.entities.getById(`parcel-${buildingId}`);
  if (parcel && parcel.polygon) {
    activeHighlightedParcel = parcel;
    parcel.polygon.material = Cesium.Color.fromCssColorString('#ffffff').withAlpha(0.22); // translucent white ground lot fill
    parcel.polygon.outlineColor = Cesium.Color.fromCssColorString('#ffffff').withAlpha(0.95);
    parcel.polygon.outlineWidth = 3.0;
  }
}

export function setParcelsVisibility(visible) {
  if (parcelsDataSource) {
    parcelsDataSource.show = visible;
  }
}
