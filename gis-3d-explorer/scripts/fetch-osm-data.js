import fs from 'fs';
import path from 'path';

// Kakinada central coordinates bbox: [minLat, minLon, maxLat, maxLon]
// Focus on vibrant core city & coastal port zone
const bbox = '16.9600,82.2200,17.0100,82.2650';

async function fetchOverpass(query, retries = 3) {
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];

  for (let i = 0; i < endpoints.length; i++) {
    const url = endpoints[i];
    console.log(`Trying Overpass endpoint: ${url}`);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query)
      });
      if (res.ok) {
        return await res.json();
      }
      console.warn(`Endpoint ${url} returned ${res.status}: ${res.statusText}`);
    } catch (err) {
      console.warn(`Endpoint ${url} failed: ${err.message}`);
    }
  }
  throw new Error('All Overpass endpoints failed');
}

function osmToGeojson(osmData) {
  const nodes = new Map();
  for (const el of osmData.elements) {
    if (el.type === 'node') {
      nodes.set(el.id, [el.lon, el.lat]);
    }
  }

  const features = [];
  for (const el of osmData.elements) {
    if (el.type === 'way' && el.nodes && el.nodes.length >= 3) {
      const coords = [];
      let valid = true;
      for (const nid of el.nodes) {
        const pt = nodes.get(nid);
        if (pt) coords.push(pt);
        else { valid = false; break; }
      }
      if (!valid || coords.length < 3) continue;

      const isClosed = el.nodes[0] === el.nodes[el.nodes.length - 1];
      const tags = el.tags || {};
      
      // Determine height
      let height = null;
      let heightSource = 'estimated';
      if (tags.height) {
        const parsed = parseFloat(tags.height);
        if (!isNaN(parsed) && parsed > 0) {
          height = parsed;
          heightSource = 'osm:height';
        }
      } else if (tags['building:levels']) {
        const levels = parseFloat(tags['building:levels']);
        if (!isNaN(levels) && levels > 0) {
          height = levels * 3.5;
          heightSource = 'osm:levels';
        }
      }

      if (!height) {
        // Conservative estimation based on building type/area
        const type = tags.building || 'yes';
        if (type === 'hospital' || type === 'university' || type === 'school' || type === 'commercial') {
          height = 12.0; // 3-4 storeys
        } else if (type === 'apartments' || type === 'office') {
          height = 15.0; // 4-5 storeys
        } else if (type === 'industrial' || type === 'warehouse') {
          height = 8.0;
        } else {
          // Standard residential / general
          height = 7.0; // ~2 storeys
        }
        heightSource = 'estimated';
      }

      const feature = {
        type: 'Feature',
        id: el.id,
        properties: {
          id: el.id,
          osm_type: 'way',
          name: tags.name || tags['name:en'] || tags['name:te'] || (tags.building && tags.building !== 'yes' ? tags.building : 'Building'),
          building: tags.building || 'yes',
          height: height,
          height_source: heightSource,
          levels: tags['building:levels'] ? parseFloat(tags['building:levels']) : null,
          amenity: tags.amenity || null,
          addr_street: tags['addr:street'] || tags['addr:district'] || null,
          tags: tags
        },
        geometry: {
          type: isClosed ? 'Polygon' : 'LineString',
          coordinates: isClosed ? [coords] : coords
        }
      };
      features.push(feature);
    }
  }

  return {
    type: 'FeatureCollection',
    name: 'Kakinada_Features',
    crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } },
    features
  };
}

async function main() {
  const outDir = path.resolve('public/data');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  console.log('Querying real OpenStreetMap buildings for Kakinada...');
  const buildingQuery = `[out:json][timeout:35];
(
  way["building"](${bbox});
);
out body;
>;
out skel qt;`;

  try {
    const rawBuildings = await fetchOverpass(buildingQuery);
    console.log(`Fetched ${rawBuildings.elements?.length || 0} OSM elements for buildings`);
    const geojson = osmToGeojson(rawBuildings);
    console.log(`Extracted ${geojson.features.length} building footprints`);
    fs.writeFileSync(path.join(outDir, 'kakinada_buildings_fallback.geojson'), JSON.stringify(geojson, null, 2));
    console.log('Saved kakinada_buildings_fallback.geojson successfully');
  } catch (err) {
    console.error('Error fetching buildings:', err.message);
  }

  console.log('Querying major roads for Kakinada...');
  const roadsQuery = `[out:json][timeout:30];
(
  way["highway"~"primary|secondary|tertiary|trunk|main"](${bbox});
);
out body;
>;
out skel qt;`;

  try {
    const rawRoads = await fetchOverpass(roadsQuery);
    const roadNodes = new Map();
    for (const el of rawRoads.elements) {
      if (el.type === 'node') roadNodes.set(el.id, [el.lon, el.lat]);
    }
    const roadFeatures = [];
    for (const el of rawRoads.elements) {
      if (el.type === 'way' && el.nodes) {
        const coords = el.nodes.map(id => roadNodes.get(id)).filter(Boolean);
        if (coords.length >= 2) {
          roadFeatures.push({
            type: 'Feature',
            id: el.id,
            properties: {
              id: el.id,
              name: el.tags?.name || 'Road',
              highway: el.tags?.highway,
              lanes: el.tags?.lanes || 2
            },
            geometry: {
              type: 'LineString',
              coordinates: coords
            }
          });
        }
      }
    }
    const roadGeoJson = {
      type: 'FeatureCollection',
      name: 'Kakinada_Roads',
      features: roadFeatures
    };
    fs.writeFileSync(path.join(outDir, 'kakinada_roads.geojson'), JSON.stringify(roadGeoJson, null, 2));
    console.log(`Saved ${roadFeatures.length} roads to kakinada_roads.geojson`);
  } catch (err) {
    console.error('Error fetching roads:', err.message);
  }
}

main();
