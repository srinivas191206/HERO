import * as Cesium from 'cesium';

let waterDataSource = null;

export async function createWaterLayer(viewer, geojsonData) {
  if (waterDataSource) {
    viewer.dataSources.remove(waterDataSource, true);
  }

  waterDataSource = new Cesium.CustomDataSource('kakinada-water-bodies');
  const features = geojsonData.features || [];

  features.forEach((feature, index) => {
    if (!feature.geometry) return;
    const geomType = feature.geometry.type;
    const props = feature.properties || {};

    if (geomType === 'Polygon') {
      const ring = feature.geometry.coordinates[0];
      if (!ring || ring.length < 3) return;
      const flatCoords = [];
      for (const pt of ring) {
        flatCoords.push(pt[0], pt[1]);
      }

      waterDataSource.entities.add({
        id: `water-${props.id || index}`,
        name: props.name || 'Water Body',
        polygon: {
          hierarchy: Cesium.Cartesian3.fromDegreesArray(flatCoords),
          material: Cesium.Color.fromCssColorString('#0077b6').withAlpha(0.6),
          classificationType: Cesium.ClassificationType.BOTH
        },
        properties: new Cesium.PropertyBag(props)
      });
    } else if (geomType === 'LineString') {
      const coords = feature.geometry.coordinates;
      if (!coords || coords.length < 2) return;
      const flatCoords = [];
      for (const pt of coords) {
        flatCoords.push(pt[0], pt[1]);
      }

      waterDataSource.entities.add({
        id: `water-line-${props.id || index}`,
        name: props.name || 'Canal / Creek Channel',
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray(flatCoords),
          width: 5.0,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.25,
            color: Cesium.Color.fromCssColorString('#00b4d8').withAlpha(0.85)
          }),
          clampToGround: true
        },
        properties: new Cesium.PropertyBag(props)
      });
    }
  });

  await viewer.dataSources.add(waterDataSource);
  console.log(`Rendered ${waterDataSource.entities.values.length} water features`);
  return waterDataSource;
}

export function setWaterVisibility(visible) {
  if (waterDataSource) {
    waterDataSource.show = visible;
  }
}
