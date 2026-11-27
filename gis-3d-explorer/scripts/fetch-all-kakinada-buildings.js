import fs from 'fs';

async function fetchFullKakinadaOSM() {
  console.log("Fetching ALL Kakinada buildings from Overpass API (bbox: 16.90, 82.18 to 17.06, 82.29)...");

  const query = `[out:json][timeout:180];
  (
    way["building"](16.90,82.18,17.06,82.29);
    relation["building"](16.90,82.18,17.06,82.29);
  );
  out body;
  >;
  out skel qt;`;

  const endpoints = [
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter"
  ];

  let osmData = null;
  for (const ep of endpoints) {
    try {
      console.log(`Connecting to: ${ep}...`);
      const res = await fetch(ep, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "HERO3DGIS-Kakinada/1.0 (academic-disaster-management)"
        },
        body: "data=" + encodeURIComponent(query)
      });
      if (res.ok) {
        osmData = await res.json();
        console.log(`Successfully received data from ${ep}! Elements: ${osmData.elements?.length}`);
        break;
      } else {
        console.warn(`${ep} returned status ${res.status}`);
      }
    } catch (err) {
      console.warn(`${ep} failed:`, err.message);
    }
  }

  if (!osmData || !osmData.elements) {
    throw new Error("Could not retrieve building data from any Overpass endpoint");
  }

  // Parse nodes
  const nodes = new Map();
  for (const el of osmData.elements) {
    if (el.type === 'node') {
      nodes.set(el.id, [el.lon, el.lat]);
    }
  }
  console.log(`Cached ${nodes.size} geometry nodes.`);

  // Parse ways
  const kakinadaFeatures = [];
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

      // Close polygon if needed
      if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
        coords.push(coords[0]);
      }

      const tags = el.tags || {};
      let height = null;
      let heightSource = 'estimated';

      if (tags.height) {
        const p = parseFloat(tags.height);
        if (!isNaN(p) && p > 0) {
          height = p;
          heightSource = 'osm:height';
        }
      } else if (tags['building:levels']) {
        const lv = parseFloat(tags['building:levels']);
        if (!isNaN(lv) && lv > 0) {
          height = lv * 3.5;
          heightSource = 'osm:levels';
        }
      }

      const bType = tags.building || 'yes';
      if (!height) {
        if (['hospital', 'university', 'college', 'school', 'civic', 'public'].includes(bType)) {
          height = 14.0;
        } else if (['apartments', 'hotel', 'commercial', 'office'].includes(bType)) {
          height = 16.0;
        } else if (['industrial', 'warehouse'].includes(bType)) {
          height = 9.0;
        } else if (['temple', 'church', 'mosque', 'shrine'].includes(bType)) {
          height = 11.0;
        } else {
          height = 7.5; // typical residential / mixed G+1 in Kakinada
        }
        heightSource = 'estimated';
      }

      // Compute centroid
      let sumLon = 0, sumLat = 0;
      for (const [x, y] of coords) {
        sumLon += x;
        sumLat += y;
      }
      const centroid = [sumLon / coords.length, sumLat / coords.length];

      const name = tags.name || tags['name:en'] || tags['name:te'] || (bType !== 'yes' ? `${bType.toUpperCase()} Building` : `Building #${el.id}`);

      kakinadaFeatures.push({
        type: 'Feature',
        id: `kakinada-osm-${el.id}`,
        properties: {
          id: el.id,
          osm_id: el.id,
          name: name,
          building: bType,
          amenity: tags.amenity || null,
          height: height,
          height_source: heightSource,
          levels: tags['building:levels'] ? parseInt(tags['building:levels']) : Math.max(1, Math.round(height / 3.5)),
          area: 'Kakinada City',
          address: tags['addr:street'] || tags['addr:full'] || 'Kakinada',
          centroid: centroid
        },
        geometry: {
          type: 'Polygon',
          coordinates: [coords]
        }
      });
    }
  }

  console.log(`Processed ${kakinadaFeatures.length} valid 3D building polygons across Kakinada.`);

  // Save full Kakinada fallback
  const kakinadaGeoJSON = {
    type: 'FeatureCollection',
    name: 'Kakinada Complete Buildings (OSM)',
    crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } },
    features: kakinadaFeatures
  };
  fs.writeFileSync('public/data/kakinada_buildings_fallback.geojson', JSON.stringify(kakinadaGeoJSON));
  console.log("Saved complete Kakinada building dataset to public/data/kakinada_buildings_fallback.geojson");

  return kakinadaFeatures;
}

fetchFullKakinadaOSM().catch(console.error);
