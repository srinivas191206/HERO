/**
 * OSM Service: Unified Data Loader for Aditya University & Kakinada Region
 */

import { MAP_CONFIG } from '../config/mapConfig.js';

export async function loadUnifiedBuildings(onProgress) {
  if (onProgress) onProgress({ status: 'loading', message: 'Loading 3,433 3D building extrusions (Aditya + Kakinada complete)...' });
  try {
    const res = await fetch(MAP_CONFIG.aoi.dataPaths.buildings);
    if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load unified buildings GeoJSON`);
    const data = await res.json();
    if (onProgress) onProgress({ status: 'done', count: data.features.length, message: `Loaded ${data.features.length} 3D structures` });
    return data;
  } catch (err) {
    console.error('Error loading unified buildings:', err);
    throw err;
  }
}

export async function loadUnifiedRoads() {
  try {
    const res = await fetch(MAP_CONFIG.aoi.dataPaths.roads);
    if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load roads`);
    return await res.json();
  } catch (err) {
    console.warn('Roads dataset unavailable:', err.message);
    return { type: 'FeatureCollection', features: [] };
  }
}

export async function loadWaterBodies() {
  try {
    const res = await fetch(MAP_CONFIG.aoi.dataPaths.water);
    if (res.ok) return await res.json();
  } catch (err) {
    console.warn('Water bodies unavailable:', err.message);
  }
  return { type: 'FeatureCollection', features: [] };
}
