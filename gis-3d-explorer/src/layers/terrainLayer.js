import * as Cesium from 'cesium';

let terrainActive = true;
let terrainStatus = 'Ellipsoid standard';

export async function setupTerrain(viewer) {
  // Fast WGS84 Ellipsoid unless a valid Cesium Ion access token is explicitly configured
  if (Cesium.Ion.defaultAccessToken) {
    try {
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
      console.warn('World Terrain unavailable, falling back to Ellipsoid terrain.', err.message);
    }
  }

  viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
  viewer.scene.globe.depthTestAgainstTerrain = false;
  terrainStatus = 'WGS84 Ellipsoid (Fast Offline)';
  return false;
}

export function setTerrainVisibility(viewer, enable) {
  terrainActive = enable;
  viewer.scene.globe.depthTestAgainstTerrain = enable;
}

export function getTerrainStatus() {
  return terrainStatus;
}
