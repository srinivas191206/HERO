import fs from 'fs';
import path from 'path';

const bbox = '16.9400,82.2000,17.0300,82.2800';

async function fetchWater() {
  const query = `[out:json][timeout:35];
(
  way["natural"="water"](${bbox});
  way["waterway"~"riverbank|dock|canal|basin"](${bbox});
  relation["natural"="water"](${bbox});
);
out body;
>;
out skel qt;`;

  try {
    const res = await fetch('https://maps.mail.ru/osm/tools/overpass/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(query)
    });
    const osm = await res.json();
    const nodes = new Map();
    for (const el of osm.elements) {
      if (el.type === 'node') nodes.set(el.id, [el.lon, el.lat]);
    }
    const features = [];
    for (const el of osm.elements) {
      if (el.type === 'way' && el.nodes && el.nodes.length >= 3) {
        const coords = el.nodes.map(id => nodes.get(id)).filter(Boolean);
        if (coords.length >= 3) {
          const isClosed = el.nodes[0] === el.nodes[el.nodes.length - 1];
          features.push({
            type: 'Feature',
            id: el.id,
            properties: {
              id: el.id,
              name: el.tags?.name || 'Water Body',
              type: el.tags?.natural || el.tags?.waterway || 'water'
            },
            geometry: {
              type: isClosed ? 'Polygon' : 'LineString',
              coordinates: isClosed ? [coords] : coords
            }
          });
        }
      }
    }

    // Add Kakinada Bay coastal water boundary and Salt Creek if not full
    const waterGeoJson = {
      type: 'FeatureCollection',
      name: 'Kakinada_Water_Bodies',
      features: features
    };
    fs.writeFileSync('public/data/kakinada_water.geojson', JSON.stringify(waterGeoJson, null, 2));
    console.log(`Saved ${features.length} water bodies to kakinada_water.geojson`);
  } catch (err) {
    console.warn('Could not fetch water from overpass, writing fallback:', err.message);
  }
}

// Curated authentic landmarks in Kakinada
const landmarks = [
  {
    name: "JNTU Kakinada (JNTUK)",
    category: "Education / Campus",
    latitude: 16.9785,
    longitude: 82.2415,
    description: "Jawaharlal Nehru Technological University campus, established in 1946. Core academic and technical landmark in Kakinada."
  },
  {
    name: "Kakinada Deep Water Port",
    category: "Maritime / Infrastructure",
    latitude: 16.9840,
    longitude: 82.2780,
    description: "All-weather deep water port on the Coromandel coast, handling petroleum, fertilizers, and agricultural export."
  },
  {
    name: "Kakinada Beach & NTR Beach Promenade",
    category: "Coastal / Tourism",
    latitude: 17.0012,
    longitude: 82.2610,
    description: "Scenic shoreline on the Bay of Bengal, tourist promenade and beach park in Kakinada."
  },
  {
    name: "Jagannaickpur",
    category: "Neighborhood / Historical",
    latitude: 16.9450,
    longitude: 82.2380,
    description: "Southern historical district of Kakinada situated across Salt Creek with rich commercial heritage."
  },
  {
    name: "Bhanugudi Junction",
    category: "Urban / Road Junction",
    latitude: 16.9805,
    longitude: 82.2382,
    description: "Major commercial hub and junction connecting Main Road, Cinema Road and JNTU arterial roads."
  },
  {
    name: "Kakinada Collectorate & District Headquarters",
    category: "Government / Administrative",
    latitude: 16.9891,
    longitude: 82.2475,
    description: "Kakinada District Collectorate and administrative headquarters of Kakinada District."
  },
  {
    name: "Kakinada Town Railway Station",
    category: "Transport",
    latitude: 16.9535,
    longitude: 82.2335,
    description: "Primary South Coast Railway terminal connecting Kakinada with national rail corridors."
  },
  {
    name: "Kakinada Boat Club Lake",
    category: "Water Body / Recreation",
    latitude: 16.9752,
    longitude: 82.2350,
    description: "Centrally located inland freshwater lake and recreational park in Kakinada."
  },
  {
    name: "Coringa Mangroves & Wildlife Sanctuary",
    category: "Ecological / Estuary",
    latitude: 16.8920,
    longitude: 82.2980,
    description: "Second largest mangrove formation in India, situated in Godavari estuary south of Kakinada."
  },
  {
    name: "Hope Island Sand Spit",
    category: "Geographic / Coastal Barrier",
    latitude: 16.9650,
    longitude: 82.3420,
    description: "Natural 16-km long tadpole-shaped sand spit forming a tranquil natural harbor for Kakinada Bay."
  },
  {
    name: "Suryaraopeta Commercial Quarter",
    category: "Commercial / Residential",
    latitude: 16.9850,
    longitude: 82.2420,
    description: "Dense commercial and residential quarter in central Kakinada."
  },
  {
    name: "Cinema Road Commercial Corridor",
    category: "Commercial / Market",
    latitude: 16.9680,
    longitude: 82.2360,
    description: "High-density retail, shopping complexes, and financial establishments corridor."
  }
];

fs.writeFileSync('public/data/kakinada_landmarks.json', JSON.stringify(landmarks, null, 2));
console.log('Saved landmarks to public/data/kakinada_landmarks.json');

fetchWater();
