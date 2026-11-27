/**
 * Geocoding Service: Search unified directory across Aditya Campus & Kakinada Region
 */

const BASE_URL = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) ? import.meta.env.BASE_URL : '/gis-3d/';

let cachedLandmarks = null;

export async function loadUnifiedLandmarks() {
  if (cachedLandmarks) return cachedLandmarks;
  try {
    const res = await fetch(`${BASE_URL}data/unified_landmarks.json`);
    if (res.ok) {
      cachedLandmarks = await res.json();
      return cachedLandmarks;
    }
  } catch (err) {
    console.warn('Could not load unified landmarks:', err.message);
  }
  return [];
}

export async function searchLocations(query) {
  if (!query || query.trim().length < 2) return [];

  const q = query.trim().toLowerCase();
  const landmarks = await loadUnifiedLandmarks();
  
  // 1. Instant match across all Bhavans, Stations, Hospitals, Bus Stands & Landmarks
  const matches = landmarks.filter(item => {
    return (
      item.name.toLowerCase().includes(q) ||
      (item.category && item.category.toLowerCase().includes(q)) ||
      (item.description && item.description.toLowerCase().includes(q))
    );
  }).map(item => ({
    name: item.name,
    category: item.category,
    description: item.description,
    latitude: item.latitude,
    longitude: item.longitude,
    source: item.category.includes('Aditya') ? 'Aditya Surampalem' : 'Regional Facility'
  }));

  if (matches.length > 0) {
    return matches;
  }

  // 2. Fallback to OpenStreetMap Nominatim for any specific address in the district
  try {
    const viewbox = '82.04,16.90,82.35,17.15';
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ' Kakinada')}&viewbox=${viewbox}&bounded=0&limit=5`;
    
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (res.ok) {
      const results = await res.json();
      return results.map(r => ({
        name: r.display_name.split(',')[0],
        category: r.type || 'Location',
        description: r.display_name,
        latitude: parseFloat(r.lat),
        longitude: parseFloat(r.lon),
        source: 'OpenStreetMap'
      }));
    }
  } catch (err) {
    console.warn('Nominatim search query throttled:', err.message);
  }

  return matches;
}
