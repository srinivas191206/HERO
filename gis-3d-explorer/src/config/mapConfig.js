/**
 * HERO 3D GIS - Map Configuration
 * Unified: Aditya Educational Institutions (Surampalem) & Kakinada City Corridor
 */

const BASE_URL = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) ? import.meta.env.BASE_URL : '/gis-3d/';

export const MAP_CONFIG = {
  appName: "HERO 3D GIS",
  subtitle: "Andhra Pradesh State & District Command Explorer",
  aoi: {
    name: "Andhra Pradesh 3D Command Grid",
    district: "Andhra Pradesh, India",
    country: "India",
    center: {
      latitude: 17.0450,
      longitude: 82.1550,
      height: 3500.0
    },
    crs: "EPSG:4326 (WGS 84)",
    dataPaths: {
      buildings: `${BASE_URL}data/unified_buildings.geojson`,
      roads: `${BASE_URL}data/unified_roads.geojson`,
      water: `${BASE_URL}data/kakinada_water.geojson`,
      landmarks: `${BASE_URL}data/unified_landmarks.json`,
      apDistricts: `${BASE_URL}data/ap_districts.geojson`
    }
  },
  camera: {
    // 0. Andhra Pradesh 28-District State Overview
    andhraPradeshState: {
      longitude: 80.1500,
      latitude: 15.9500,
      height: 780000.0,
      heading: 0.0,
      pitch: -78.0,
      roll: 0.0
    },
    // 1. Aditya Surampalem Campus (Default initial oblique view)
    adityaCampus: {
      longitude: 82.0675,
      latitude: 17.0830,
      height: 850.0,
      heading: 2.0,     // looking North across Cotton Bhavan, Newton, T-Hub
      pitch: -42.0,     // elevated oblique perspective
      roll: 0.0
    },
    // 2. Regional Corridor (Showing ADB Highway connecting Surampalem -> Samalkot -> Kakinada)
    regionalCorridor: {
      longitude: 82.1550,
      latitude: 16.9750,
      height: 16000.0,
      heading: 350.0,
      pitch: -45.0,
      roll: 0.0
    },
    // 3. Kakinada City & Deep Water Port
    kakinadaCity: {
      longitude: 82.2450,
      latitude: 16.9740,
      height: 1800.0,
      heading: 8.0,
      pitch: -38.0,
      roll: 0.0
    },
    // 4. High-altitude 3D Globe in Space (Image 3 reference match)
    globeView: {
      longitude: 80.0,
      latitude: 18.0,
      height: 12500000.0,
      heading: 0.0,
      pitch: -89.5,
      roll: 0.0
    }
  },
  imagery: {
    esriWorldImagery: {
      name: "Esri World Satellite",
      url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      attribution: "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics"
    },
    osmStandard: {
      name: "OpenStreetMap Standard",
      url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution: "© OpenStreetMap contributors"
    },
    cartoDark: {
      name: "Esri World Topo Map",
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
      attribution: "Tiles © Esri"
    }
  },
  buildingStyle: {
    defaultColor: "#f8fafc",
    defaultAlpha: 0.92,
    outlineColor: "#38bdf8",
    outlineWidth: 2.0,
    selectedColor: "#f78166", // bright coral / amber highlight
    highlightGlow: "#388bfd"
  }
};
