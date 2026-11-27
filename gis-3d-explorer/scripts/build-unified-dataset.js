import fs from 'fs';

// 1. Load raw OSM elements for Aditya Campus and complete Kakinada buildings
const kakinadaBuildings = JSON.parse(fs.readFileSync('public/data/kakinada_buildings_fallback.geojson', 'utf8')).features;
const adityaRaw = JSON.parse(fs.readFileSync('public/data/aditya_surampalem_raw.json', 'utf8'));

const nodes = new Map();
adityaRaw.elements.filter(e => e.type === 'node').forEach(n => nodes.set(n.id, [n.lon, n.lat]));

const wayMetadata = {
  "1434240681": {
    name: "Cotton Bhavan",
    code: "COTTON",
    type: "administrative",
    levels: 5,
    height: 18.0,
    desc: "Central Administrative Headquarters, Chairman Chambers & Principal Office"
  },
  "1434240682": {
    name: "Ratan Tata Bhavan",
    code: "RATAN_TATA",
    type: "academic",
    levels: 5,
    height: 18.0,
    desc: "Electronics & Communication Engineering, VLSI & Embedded Systems"
  },
  "1434240683": {
    name: "K.L. Rao Bhavan",
    code: "KL_RAO",
    type: "academic",
    levels: 5,
    height: 18.0,
    desc: "Civil Engineering Department, Structural Testing & Concrete Labs"
  },
  "1434234667": {
    name: "James Watt Bhavan",
    code: "JAMES_WATT",
    type: "academic",
    levels: 5,
    height: 18.0,
    desc: "Mechanical Engineering Department, Robotics & Advanced Manufacturing"
  },
  "1324023951": {
    name: "Newton Bhavan",
    code: "NEWTON",
    type: "academic",
    levels: 5,
    height: 18.0,
    desc: "Computer Science & Engineering Labs, AI Data Center & Smart Classrooms"
  },
  "1324023950": {
    name: "Ramanujan Bhavan",
    code: "RAMANUJAN",
    type: "academic",
    levels: 5,
    height: 18.0,
    desc: "Applied Mathematics, Foundation Sciences & Computational Physics"
  },
  "1324024049": {
    name: "Aditya University Administrative Tower",
    code: "ADITYA_UNIV",
    type: "university",
    levels: 6,
    height: 22.0,
    desc: "Aditya University Main Tower, Academic Senate & Vice-Chancellor Directorate"
  },
  "1324023948": {
    name: "Petroleum Technology Building (AEC)",
    code: "PETROLEUM",
    type: "academic",
    levels: 4,
    height: 15.0,
    desc: "Department of Petroleum Technology, Petrochemical Labs & Drilling Simulators"
  },
  "1324023949": {
    name: "Aditya Academic Complex",
    code: "ACADEMIC_COMPLEX",
    type: "academic",
    levels: 4,
    height: 15.0,
    desc: "Undergraduate Lecture Halls, Faculty Offices & Examination Center"
  },
  "1324023963": {
    name: "Technical Hub (T-Hub)",
    code: "THUB",
    type: "innovation",
    levels: 4,
    height: 16.0,
    desc: "Premier Corporate Incubation, AI/ML Labs & Industry Certification Center"
  },
  "1324023957": {
    name: "Girls Hostel Residence Towers",
    code: "GIRLS_HOSTEL",
    type: "residential",
    levels: 5,
    height: 18.0,
    desc: "Secure In-Campus Student Residential Quarters with Dining & Recreation"
  },
  "1324023955": {
    name: "Block A (Engineering)",
    code: "BLOCK_A",
    type: "academic",
    levels: 4,
    height: 15.0,
    desc: "Aditya College of Engineering & Technology Academic Block A"
  },
  "1324023954": {
    name: "Block B (Engineering)",
    code: "BLOCK_B",
    type: "academic",
    levels: 4,
    height: 15.0,
    desc: "Aditya College of Engineering & Technology Academic Block B"
  },
  "1324023956": {
    name: "Block C (Engineering)",
    code: "BLOCK_C",
    type: "academic",
    levels: 4,
    height: 15.0,
    desc: "Aditya College of Engineering & Technology Academic Block C"
  },
  "1324023953": {
    name: "Block D (Engineering)",
    code: "BLOCK_D",
    type: "academic",
    levels: 4,
    height: 15.0,
    desc: "Aditya College of Engineering & Technology Academic Block D"
  },
  "1324023952": {
    name: "Block E (Engineering)",
    code: "BLOCK_E",
    type: "academic",
    levels: 4,
    height: 15.0,
    desc: "Aditya College of Engineering & Technology Academic Block E"
  },
  "1324023961": {
    name: "Aditya Polytechnic Colleges Block",
    code: "POLYTECHNIC",
    type: "academic",
    levels: 4,
    height: 15.0,
    desc: "Diploma in Engineering, Vocational Training & Heavy Machine Workshops"
  },
  "1324023962": {
    name: "Aditya Polytechnic Workshops",
    code: "POLYTECHNIC_WS",
    type: "academic",
    levels: 3,
    height: 11.0,
    desc: "Mechanical, Welding, Carpentry & Electrical Practical Training Units"
  },
  "1324023958": {
    name: "Aditya College of Pharmacy Block",
    code: "PHARMACY",
    type: "academic",
    levels: 4,
    height: 15.0,
    desc: "Faculty of Pharmaceutical Sciences, Pharmacology & Drug Formulation Labs"
  },
  "1324023959": {
    name: "Aditya Pharmacy Research Wing",
    code: "PHARMACY_RES",
    type: "academic",
    levels: 4,
    height: 15.0,
    desc: "Medicinal Chemistry, Pharmacognosy & Clinical Research Laboratories"
  },
  "1324023960": {
    name: "Aditya Central Library & Seminar Block",
    code: "LIBRARY_SEMINAR",
    type: "academic",
    levels: 4,
    height: 15.0,
    desc: "Digital Knowledge Repository, Central Reading Rooms & Conference Halls"
  }
};

const rawWays = adityaRaw.elements.filter(e => e.type === 'way' && e.tags && e.tags.building);

const adityaFeatures = [];

// 1. Process surveyed campus buildings with exact OSM polygon geometry
rawWays.forEach(w => {
  const pts = w.nodes.map(id => nodes.get(id)).filter(Boolean);
  if (pts.length < 3) return;

  // Ensure closed polygon
  if (pts[0][0] !== pts[pts.length - 1][0] || pts[0][1] !== pts[pts.length - 1][1]) {
    pts.push(pts[0]);
  }

  let sumLon = 0, sumLat = 0;
  pts.forEach(p => { sumLon += p[0]; sumLat += p[1]; });
  const centroid = [sumLon / pts.length, sumLat / pts.length];

  const meta = wayMetadata[w.id] || {
    name: w.tags.name || `Campus Block ${w.id}`,
    code: `BLD_${w.id}`,
    type: "academic",
    levels: 4,
    height: 15.0,
    desc: "Aditya Educational Campus Infrastructure Facility"
  };

  adityaFeatures.push({
    type: "Feature",
    id: `aditya-osm-${w.id}`,
    properties: {
      id: `aditya-${w.id}`,
      osm_id: w.id,
      name: meta.name,
      code: meta.code,
      zone: "Aditya University, Surampalem",
      building: meta.type,
      height: meta.height,
      height_source: "architectural_survey",
      levels: meta.levels,
      description: meta.desc,
      centroid: centroid,
      tags: w.tags
    },
    geometry: {
      type: "Polygon",
      coordinates: [pts]
    }
  });
});

// 2. Add campus landmark structures that have distinct ground footprints
const additionalLandmarks = [
  {
    name: "Sri Hanuman Temple",
    code: "TEMPLE",
    type: "religious",
    levels: 1,
    height: 9.0,
    desc: "Campus Sri Hanuman Temple & Spiritual Center",
    lat: 17.08745,
    lon: 82.06738,
    w: 0.00028,
    h: 0.00025
  },
  {
    name: "Polavaram Project Model Pavilion",
    code: "POLAVARAM",
    type: "engineering_model",
    levels: 1,
    height: 6.0,
    desc: "Hydraulic Engineering Scale Model of Polavaram Dam & Irrigation Canal System",
    lat: 17.09450,
    lon: 82.06640,
    w: 0.00055,
    h: 0.00035
  },
  {
    name: "Aditya Bridge Complex",
    code: "BRIDGE",
    type: "infrastructure",
    levels: 1,
    height: 7.0,
    desc: "Campus Scenic Bridge & Water Body Crossing",
    lat: 17.09480,
    lon: 82.06950,
    w: 0.00045,
    h: 0.00020
  },
  {
    name: "Boys Hostel Residence Quarters",
    code: "BOYS_HOSTEL",
    type: "residential",
    levels: 5,
    height: 18.0,
    desc: "In-Campus Men's Student Accommodation & Dining Facilities",
    lat: 17.09410,
    lon: 82.07120,
    w: 0.00065,
    h: 0.00045
  },
  {
    name: "Mango Park Academic Block (ACET)",
    code: "MANGO_PARK",
    type: "academic",
    levels: 4,
    height: 15.0,
    desc: "Aditya College of Engineering & Technology Eco-Campus Wing",
    lat: 17.09240,
    lon: 82.07050,
    w: 0.00065,
    h: 0.00040
  }
];

additionalLandmarks.forEach(lm => {
  const ring = [
    [lm.lon - lm.w/2, lm.lat - lm.h/2],
    [lm.lon + lm.w/2, lm.lat - lm.h/2],
    [lm.lon + lm.w/2, lm.lat + lm.h/2],
    [lm.lon - lm.w/2, lm.lat + lm.h/2],
    [lm.lon - lm.w/2, lm.lat - lm.h/2]
  ];

  adityaFeatures.push({
    type: "Feature",
    id: `aditya-lm-${lm.code}`,
    properties: {
      id: `aditya-${lm.code}`,
      name: lm.name,
      code: lm.code,
      zone: "Aditya University, Surampalem",
      building: lm.type,
      height: lm.height,
      height_source: "architectural_model",
      levels: lm.levels,
      description: lm.desc,
      centroid: [lm.lon, lm.lat]
    },
    geometry: {
      type: "Polygon",
      coordinates: [ring]
    }
  });
});

console.log(`Generated ${adityaFeatures.length} precise Aditya Campus buildings.`);

// Tag Kakinada features with zone
const taggedKakinadaFeatures = kakinadaBuildings.map(f => {
  f.properties.zone = "Kakinada Urban Center";
  return f;
});

// Deduplicate features by id
const seenIds = new Set();
const allFeatures = [...adityaFeatures, ...taggedKakinadaFeatures].filter(f => {
  const fid = f.properties.id || f.id;
  if (!fid) return true;
  if (seenIds.has(fid)) return false;
  seenIds.add(fid);
  return true;
});

// COMBINED UNIFIED BUILDINGS DATASET
const unifiedBuildings = {
  type: "FeatureCollection",
  name: "Unified_Aditya_Kakinada_3D_Buildings",
  features: allFeatures
};
fs.writeFileSync('public/data/unified_buildings.geojson', JSON.stringify(unifiedBuildings, null, 2));
console.log(`Saved unified_buildings.geojson with ${unifiedBuildings.features.length} buildings (Aditya: ${adityaFeatures.length}, Kakinada: ${unifiedBuildings.features.length - adityaFeatures.length})`);
