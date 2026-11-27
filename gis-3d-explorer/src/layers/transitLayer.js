import * as Cesium from 'cesium';

const BASE_URL = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) ? import.meta.env.BASE_URL : '/gis-3d/';

let stationsDataSource = null;
let busDataSource = null;
let hospitalsDataSource = null;

export async function createTransitLayers(viewer, onSelectFacility) {
  // 1. Railway Stations (Railway line tracks removed per user request, station names and pins preserved)
  stationsDataSource = new Cesium.CustomDataSource('transit-stations');
  try {
    const res = await fetch(`${BASE_URL}data/unified_railway_stations.geojson`);
    if (res.ok) {
      const data = await res.json();
      data.features.forEach((feature, idx) => {
        const [lon, lat] = feature.geometry.coordinates;
        const props = feature.properties;
        
        stationsDataSource.entities.add({
          id: `station-${props.id || idx}`,
          name: props.name,
          position: Cesium.Cartesian3.fromDegrees(lon, lat, 25),
          point: {
            pixelSize: 10,
            color: Cesium.Color.fromCssColorString('#f59e0b'), // Amber rail marker
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 50000)
          },
          label: {
            text: `🚆 ${props.name.toUpperCase()}`,
            font: 'bold 11px -apple-system, sans-serif',
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 3.5,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -14),
            backgroundColor: Cesium.Color.fromCssColorString('#1e293b').withAlpha(0.85),
            showBackground: true,
            backgroundPadding: new Cesium.Cartesian2(6, 4),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 35000)
          },
          properties: new Cesium.PropertyBag({
            ...props,
            facilityType: 'Railway Station',
            centroid: [lon, lat]
          })
        });
      });
    }
  } catch (e) {
    console.warn('Failed to load railway stations:', e);
  }

  // 3. Bus Stands / Terminals
  busDataSource = new Cesium.CustomDataSource('transit-bus-stands');
  try {
    const res = await fetch(`${BASE_URL}data/unified_bus_stations.geojson`);
    if (res.ok) {
      const data = await res.json();
      data.features.forEach((feature, idx) => {
        const [lon, lat] = feature.geometry.coordinates;
        const props = feature.properties;
        
        busDataSource.entities.add({
          id: `bus-stand-${idx}`,
          name: props.name,
          position: Cesium.Cartesian3.fromDegrees(lon, lat, 25),
          point: {
            pixelSize: 9,
            color: Cesium.Color.fromCssColorString('#38bdf8'), // Cyan bus marker
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 45000)
          },
          label: {
            text: `🚌 ${props.name.toUpperCase()}`,
            font: 'bold 11px -apple-system, sans-serif',
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 3.5,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -14),
            backgroundColor: Cesium.Color.fromCssColorString('#0f172a').withAlpha(0.85),
            showBackground: true,
            backgroundPadding: new Cesium.Cartesian2(6, 4),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 30000)
          },
          properties: new Cesium.PropertyBag({
            ...props,
            facilityType: 'Bus Station / Terminal',
            centroid: [lon, lat]
          })
        });
      });
    }
  } catch (e) {
    console.warn('Failed to load bus stands:', e);
  }

  // 4. Major Hospitals & Healthcare
  hospitalsDataSource = new Cesium.CustomDataSource('transit-hospitals');
  try {
    const res = await fetch(`${BASE_URL}data/unified_hospitals.geojson`);
    if (res.ok) {
      const data = await res.json();
      data.features.forEach((feature, idx) => {
        const [lon, lat] = feature.geometry.coordinates;
        const props = feature.properties;
        
        hospitalsDataSource.entities.add({
          id: `hospital-${idx}`,
          name: props.name,
          position: Cesium.Cartesian3.fromDegrees(lon, lat, 30),
          point: {
            pixelSize: 10,
            color: Cesium.Color.fromCssColorString('#ef4444'), // Red cross medical marker
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 50000)
          },
          label: {
            text: `🏥 ${props.name.toUpperCase()}`,
            font: 'bold 11px -apple-system, sans-serif',
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 3.5,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -14),
            backgroundColor: Cesium.Color.fromCssColorString('#450a0a').withAlpha(0.9),
            showBackground: true,
            backgroundPadding: new Cesium.Cartesian2(6, 4),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 35000)
          },
          properties: new Cesium.PropertyBag({
            ...props,
            facilityType: 'Hospital / Healthcare',
            centroid: [lon, lat]
          })
        });
      });
    }
  } catch (e) {
    console.warn('Failed to load hospitals:', e);
  }

  await viewer.dataSources.add(stationsDataSource);
  await viewer.dataSources.add(busDataSource);
  await viewer.dataSources.add(hospitalsDataSource);

  return {
    stationsDataSource,
    busDataSource,
    hospitalsDataSource
  };
}

export function setRailwaysVisibility(visible) {
  if (stationsDataSource) stationsDataSource.show = visible;
}

export function setBusStandsVisibility(visible) {
  if (busDataSource) busDataSource.show = visible;
}

export function setHospitalsVisibility(visible) {
  if (hospitalsDataSource) hospitalsDataSource.show = visible;
}
