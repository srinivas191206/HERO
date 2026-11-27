import * as Cesium from 'cesium';

let roadsDataSource = null;

export async function createRoadsLayer(viewer, geojsonData) {
  if (roadsDataSource) {
    viewer.dataSources.remove(roadsDataSource, true);
  }

  roadsDataSource = new Cesium.CustomDataSource('unified-roads');
  const features = geojsonData.features || [];

  features.forEach((feature, index) => {
    if (!feature.geometry || feature.geometry.type !== 'LineString') return;
    const coords = feature.geometry.coordinates;
    if (!coords || coords.length < 2) return;

    const flatCoords = [];
    for (const pt of coords) {
      flatCoords.push(pt[0], pt[1]);
    }

    const props = feature.properties || {};
    const isAdbHighway = props.name && (props.name.includes('ADB') || props.id === 'adb-express-corridor');
    const isPrimary = props.highway === 'primary' || props.highway === 'trunk';
    
    let width = 2.0;
    let glowPower = 0.15;
    let color = Cesium.Color.fromCssColorString('#ffffff').withAlpha(0.7);

    if (isAdbHighway) {
      width = 5.0; // Prominent regional 4-lane expressway
      glowPower = 0.35;
      color = Cesium.Color.fromCssColorString('#f59e0b').withAlpha(0.95); // Glowing amber
    } else if (isPrimary) {
      width = 3.5;
      glowPower = 0.25;
      color = Cesium.Color.fromCssColorString('#38bdf8').withAlpha(0.9); // Primary highway cyan
    }

    roadsDataSource.entities.add({
      id: `road-${props.id || index}`,
      name: props.name || 'Road Corridor',
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray(flatCoords),
        width: width,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: glowPower,
          color: color
        }),
        clampToGround: true
      },
      properties: new Cesium.PropertyBag(props)
    });
  });

  await viewer.dataSources.add(roadsDataSource);
  console.log(`Rendered ${roadsDataSource.entities.values.length} road corridors`);
  return roadsDataSource;
}

export function setRoadsVisibility(visible) {
  if (roadsDataSource) {
    roadsDataSource.show = visible;
  }
}
