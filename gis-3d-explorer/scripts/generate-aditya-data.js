import fs from 'fs';
import path from 'path';

const raw = JSON.parse(fs.readFileSync('public/data/aditya_surampalem_raw.json', 'utf8'));
const nodes = new Map();
raw.elements.filter(e => e.type === 'node').forEach(n => nodes.set(n.id, [n.lon, n.lat]));

// 1. Process 3D Buildings
const buildingFeatures = [];
const bhavanMeta = {
  'Cotton Bhavan': { levels: 5, height: 18.0, desc: 'Central Administrative Headquarters & Principal Office', type: 'administrative' },
  'Newton Bhavan': { levels: 5, height: 18.0, desc: 'Core Engineering Block & Departmental Labs', type: 'academic' },
  'James watt Bhavan': { levels: 5, height: 18.0, desc: 'Mechanical & Automation Engineering Laboratories', type: 'academic' },
  'Ramanujan Bhavan': { levels: 5, height: 18.0, desc: 'First Year Foundation & Sciences Block', type: 'academic' },
  'K.L. Rao Bhavan': { levels: 5, height: 18.0, desc: 'Civil Engineering & Structural Design Center', type: 'academic' },
  'Ratan Tata Bhavan': { levels: 5, height: 18.0, desc: 'Electrical, Electronics & Computing Center', type: 'academic' },
  'Aditya Engineering college': { levels: 4, height: 15.0, desc: 'Main Campus Academic Complex (AEC)', type: 'academic' },
  'A block': { levels: 4, height: 14.0, desc: 'Classrooms, Lecture Halls & Faculty Chambers', type: 'academic' },
  'B Block': { levels: 4, height: 14.0, desc: 'Applied Sciences & Tutorial Complex', type: 'academic' },
  'C Block': { levels: 4, height: 14.0, desc: 'Computing Labs & Multimedia Classrooms', type: 'academic' },
  'D Block': { levels: 4, height: 14.0, desc: 'Seminar Halls & Advanced Study Facilities', type: 'academic' },
  'E block': { levels: 4, height: 14.0, desc: 'Auditorium, Seminar Halls & Examination Wing', type: 'academic' },
  'Girls Hostel': { levels: 6, height: 21.0, desc: 'Secure Residential Student Quarters (Girls)', type: 'residential' }
};

let unnamedCount = 1;
raw.elements.filter(e => e.type === 'way' && e.tags && e.tags.building).forEach(w => {
  const coords = w.nodes.map(id => nodes.get(id)).filter(Boolean);
  if (coords.length >= 3) {
    const isClosed = w.nodes[0] === w.nodes[w.nodes.length - 1];
    let name = w.tags.name;
    let meta = name && bhavanMeta[name] ? bhavanMeta[name] : null;

    if (!name) {
      // Determine probable use by location/shape
      const avgLat = coords.reduce((s, p) => s + p[1], 0) / coords.length;
      const avgLon = coords.reduce((s, p) => s + p[0], 0) / coords.length;
      if (avgLon > 82.0675 && avgLat > 17.090) {
        name = `Campus Annex Block ${unnamedCount++}`;
        meta = { levels: 4, height: 14.0, desc: 'Hostel & Residential Wing', type: 'residential' };
      } else {
        name = `Campus Academic Facility ${unnamedCount++}`;
        meta = { levels: 3, height: 11.0, desc: 'Laboratory & Workshop Block', type: 'academic' };
      }
    }

    const height = meta ? meta.height : 12.0;
    const levels = meta ? meta.levels : 3;

    buildingFeatures.push({
      type: 'Feature',
      id: w.id,
      properties: {
        id: w.id,
        name: name,
        campus: 'Aditya Educational Institutions, Surampalem',
        building: meta ? meta.type : (w.tags.building || 'university'),
        height: height,
        height_source: 'architectural_model',
        levels: levels,
        description: meta ? meta.desc : 'Campus Educational Facility',
        tags: w.tags
      },
      geometry: {
        type: isClosed ? 'Polygon' : 'LineString',
        coordinates: isClosed ? [coords] : coords
      }
    });
  }
});

const buildingsGeoJson = {
  type: 'FeatureCollection',
  name: 'Aditya_Surampalem_3D_Buildings',
  crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } },
  features: buildingFeatures
};
fs.writeFileSync('public/data/aditya_buildings.geojson', JSON.stringify(buildingsGeoJson, null, 2));
console.log(`Saved ${buildingFeatures.length} 3D buildings for Aditya Surampalem`);

// 2. Process Campus Roads & Corridors
const roadFeatures = [];
raw.elements.filter(e => e.type === 'way' && e.tags && e.tags.highway).forEach(w => {
  const coords = w.nodes.map(id => nodes.get(id)).filter(Boolean);
  if (coords.length >= 2) {
    const isAdb = (w.tags.name && w.tags.name.includes('ADB')) || w.tags.highway === 'primary';
    roadFeatures.push({
      type: 'Feature',
      id: w.id,
      properties: {
        id: w.id,
        name: w.tags.name || (isAdb ? 'ADB Highway Corridor' : 'Campus Boulevard / Pathway'),
        highway: isAdb ? 'primary' : (w.tags.highway || 'campus_internal'),
        lanes: isAdb ? 4 : 2,
        is_campus: !isAdb
      },
      geometry: {
        type: 'LineString',
        coordinates: coords
      }
    });
  }
});

const roadsGeoJson = {
  type: 'FeatureCollection',
  name: 'Aditya_Surampalem_Roads',
  features: roadFeatures
};
fs.writeFileSync('public/data/aditya_roads.geojson', JSON.stringify(roadsGeoJson, null, 2));
console.log(`Saved ${roadFeatures.length} road corridors for Aditya Surampalem`);

// 3. Process Grounds, Parks & Sports Amenities
const amenityFeatures = [];
raw.elements.filter(e => e.type === 'way' && e.tags && (e.tags.leisure || e.tags.amenity || (e.tags.name && e.tags.name.includes('Ground')))).forEach(w => {
  const coords = w.nodes.map(id => nodes.get(id)).filter(Boolean);
  if (coords.length >= 3) {
    const isClosed = w.nodes[0] === w.nodes[w.nodes.length - 1];
    amenityFeatures.push({
      type: 'Feature',
      id: w.id,
      properties: {
        id: w.id,
        name: w.tags.name || 'Campus Facility',
        type: w.tags.leisure || w.tags.amenity || 'facility'
      },
      geometry: {
        type: isClosed ? 'Polygon' : 'LineString',
        coordinates: isClosed ? [coords] : coords
      }
    });
  }
});

const amenitiesGeoJson = {
  type: 'FeatureCollection',
  name: 'Aditya_Surampalem_Amenities',
  features: amenityFeatures
};
fs.writeFileSync('public/data/aditya_amenities.geojson', JSON.stringify(amenitiesGeoJson, null, 2));
console.log(`Saved ${amenityFeatures.length} campus amenity spaces`);

// 4. Curated Aditya Campus Landmarks for Instant Autocomplete
const landmarks = [
  {
    name: "Cotton Bhavan (Admin Headquarters)",
    category: "Administration / Central Office",
    latitude: 17.08799,
    longitude: 82.06686,
    description: "Main administrative facade, Principal's office, Chairman chambers & centralized reception."
  },
  {
    name: "Newton Bhavan (Engineering Block)",
    category: "Academic / Engineering Labs",
    latitude: 17.09362,
    longitude: 82.06670,
    description: "Multi-storey engineering block housing advanced departmental computer labs and lecture theatres."
  },
  {
    name: "James Watt Bhavan (Mechanical Block)",
    category: "Academic / Mechanical & Robotics",
    latitude: 17.09318,
    longitude: 82.06616,
    description: "Mechanical engineering department, thermal labs, robotics & manufacturing workshops."
  },
  {
    name: "Ramanujan Bhavan (Science & Basic Engineering)",
    category: "Academic / First Year Wing",
    latitude: 17.09314,
    longitude: 82.06662,
    description: "Mathematics, physics, chemistry labs and first-year undergraduate lecture halls."
  },
  {
    name: "K.L. Rao Bhavan (Civil Engineering)",
    category: "Academic / Civil & Infrastructure",
    latitude: 17.08829,
    longitude: 82.06627,
    description: "Civil engineering block, soil mechanics labs, concrete tech & CAD drafting studios."
  },
  {
    name: "Ratan Tata Bhavan (Electrical & Computing)",
    category: "Academic / Electrical & IT",
    latitude: 17.08782,
    longitude: 82.06632,
    description: "Electrical, electronics, embedded systems, and artificial intelligence incubation labs."
  },
  {
    name: "Aditya Engineering College (AEC Main Block)",
    category: "Academic Complex",
    latitude: 17.08980,
    longitude: 82.06675,
    description: "Central collegiate academic building established in 2001, premier autonomous institute."
  },
  {
    name: "Technical Hub (T-Hub Innovation Centre)",
    category: "Innovation & Training",
    latitude: 17.09100,
    longitude: 82.06780,
    description: "Flagship skill development and corporate incubation center driving real-world tech certifications."
  },
  {
    name: "A Block & B Block Complex",
    category: "Academic Classrooms",
    latitude: 17.09174,
    longitude: 82.06915,
    description: "Modern smart classrooms, tutorial rooms and department faculty chambers."
  },
  {
    name: "C Block, D Block & E Block",
    category: "Academic & Auditorium",
    latitude: 17.09252,
    longitude: 82.06910,
    description: "Conference halls, state-of-the-art multimedia auditoriums and specialized seminar venues."
  },
  {
    name: "Girls Hostel Residence",
    category: "Residential Quarters",
    latitude: 17.09168,
    longitude: 82.06821,
    description: "Secure on-campus student residential hostel with dining hall and study pavilions."
  },
  {
    name: "Aditya Sports Arena & Basketball Ground",
    category: "Sports & Recreation",
    latitude: 17.08900,
    longitude: 82.06793,
    description: "Floodlit championship basketball courts, volleyball courts and athletics pavilion."
  },
  {
    name: "College Central Park & Gardens",
    category: "Landscape & Open Spaces",
    latitude: 17.09294,
    longitude: 82.06797,
    description: "Landscaped botanical park, green lawns and central fountain meeting spot."
  },
  {
    name: "Kakinada & Rajahmundry Bus Fleet Hub",
    category: "Transportation Terminal",
    latitude: 17.08940,
    longitude: 82.06910,
    description: "Transit logistics hub operating over 250 buses across Godavari coastal districts."
  }
];

fs.writeFileSync('public/data/aditya_landmarks.json', JSON.stringify(landmarks, null, 2));
console.log('Saved Aditya campus landmarks');
