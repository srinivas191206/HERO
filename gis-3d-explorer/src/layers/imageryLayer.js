import * as Cesium from 'cesium';
import { MAP_CONFIG } from '../config/mapConfig.js';

let activeImageryLayer = null;
let currentProviderType = 'esri';

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    )
  ]);
}

export async function setupImageryLayers(viewer) {
  viewer.imageryLayers.removeAll();

  try {
    // Primary: Esri World Satellite (bounded timeout so slow networks never stall startup)
    const provider = await withTimeout(
      Cesium.ArcGisMapServerImageryProvider.fromUrl(
        'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer',
        { enablePickFeatures: false }
      ),
      4000,
      'Esri World Imagery'
    );
    activeImageryLayer = viewer.imageryLayers.addImageryProvider(provider);
    currentProviderType = 'esri';
    console.log('Esri World Imagery initialized successfully');
    return activeImageryLayer;
  } catch (err) {
    console.warn('Esri fromUrl failed or timed out, falling back to OSM:', err.message);
  }

  // Fallback: OpenStreetMap
  const osmProvider = new Cesium.OpenStreetMapImageryProvider({
    url: 'https://tile.openstreetmap.org/'
  });
  activeImageryLayer = viewer.imageryLayers.addImageryProvider(osmProvider);
  currentProviderType = 'osm';
  return activeImageryLayer;
}

export async function switchImageryProvider(viewer, type) {
  viewer.imageryLayers.removeAll();
  currentProviderType = type;

  try {
    if (type === 'esri') {
      const provider = await withTimeout(
        Cesium.ArcGisMapServerImageryProvider.fromUrl(
          'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer',
          { enablePickFeatures: false }
        ),
        5000,
        'Esri World Imagery'
      );
      activeImageryLayer = viewer.imageryLayers.addImageryProvider(provider);
    } else if (type === 'osm') {
      const provider = new Cesium.OpenStreetMapImageryProvider({
        url: 'https://tile.openstreetmap.org/'
      });
      activeImageryLayer = viewer.imageryLayers.addImageryProvider(provider);
    } else if (type === 'carto') {
      const provider = new Cesium.UrlTemplateImageryProvider({
        url: MAP_CONFIG.imagery.cartoDark.url,
        subdomains: ['a', 'b', 'c', 'd']
      });
      activeImageryLayer = viewer.imageryLayers.addImageryProvider(provider);
    }
  } catch (e) {
    console.warn('Failed to switch imagery, using OSM:', e.message);
    const osm = new Cesium.OpenStreetMapImageryProvider({
      url: 'https://tile.openstreetmap.org/'
    });
    activeImageryLayer = viewer.imageryLayers.addImageryProvider(osm);
  }

  return activeImageryLayer;
}

export function setImageryVisibility(visible) {
  if (activeImageryLayer) {
    activeImageryLayer.show = visible;
  }
}

export function getImageryProviderType() {
  return currentProviderType;
}
