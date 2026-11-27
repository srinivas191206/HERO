import * as Cesium from 'cesium';

let amenitiesDataSource = null;

export async function createAmenitiesLayer(viewer, geojsonData) {
  if (amenitiesDataSource) {
    viewer.dataSources.remove(amenitiesDataSource, true);
  }

  amenitiesDataSource = new Cesium.CustomDataSource('aditya-amenities');
  const features = geojsonData.features || [];

  features.forEach((feature, index) => {
    if (!feature.geometry || feature.geometry.type !== 'Polygon') return;
    const ring = feature.geometry.coordinates[0];
    if (!ring || ring.length < 3) return;

    const flatCoords = [];
    for (const pt of ring) {
      flatCoords.push(pt[0], pt[1]);
    }

    const name = feature.properties?.name || 'Campus Green';
    const isSports = name.toLowerCase().includes('ground') || name.toLowerCase().includes('basket');

    amenitiesDataSource.entities.add({
      id: `amenity-${index}`,
      name: name,
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray(flatCoords),
        height: 0,
        material: isSports
          ? Cesium.Color.fromCssColorString('#0284c7').withAlpha(0.35) // Sports court blue/cyan
          : Cesium.Color.fromCssColorString('#10b981').withAlpha(0.40), // Lush park emerald green
        outline: true,
        outlineColor: isSports 
          ? Cesium.Color.fromCssColorString('#38bdf8').withAlpha(0.85)
          : Cesium.Color.fromCssColorString('#34d399').withAlpha(0.85),
        classificationType: Cesium.ClassificationType.BOTH
      },
      properties: feature.properties
    });
  });

  await viewer.dataSources.add(amenitiesDataSource);
  console.log(`Rendered ${amenitiesDataSource.entities.values.length} campus green/sports spaces`);
  return amenitiesDataSource;
}

export function setAmenitiesVisibility(visible) {
  if (amenitiesDataSource) {
    amenitiesDataSource.show = visible;
  }
}
