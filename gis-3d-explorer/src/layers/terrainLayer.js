import * as Cesium from 'cesium';

let terrainActive = true;
let terrainStatus = 'Ellipsoid standard';

export async function setupTerrain(viewer) {
  try {
    // Attempt world terrain if supported
    if (typeof Cesium.createWorldTerrainAsync === 'function') {
      const terrain = await Cesium.createWorldTerrainAsync({
        requestWaterMask: true,
        requestVertexNormals: true
      });
      viewer.terrainProvider = terrain;
      viewer.scene.globe.depthTestAgainstTerrain = true;
      terrainStatus = 'Cesium World Terrain';
      console.log('Cesium World Terrain loaded successfully');
      return true;
    }
  } catch (err) {
    console.warn('World Terrain provider requires Cesium Ion token or encountered network restriction. Falling back to Ellipsoid terrain.', err.message);
  }

  // Fallback: Standard WGS84 Ellipsoid (guaranteed free, zero credentials needed)
  viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
  viewer.scene.globe.depthTestAgainstTerrain = false;
  terrainStatus = 'WGS84 Ellipsoid (Standard Fallback)';
  return false;
}

export function setTerrainVisibility(viewer, enable) {
  terrainActive = enable;
  viewer.scene.globe.depthTestAgainstTerrain = enable;
}

export function getTerrainStatus() {
  return terrainStatus;
}
