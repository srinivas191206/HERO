# HERO 3D GIS Explorer - Aditya University & Kakinada Regional Twin

A standalone, high-performance 3D Geographic Information System (GIS) application combining **Aditya University (Surampalem)** and **Kakinada City, Andhra Pradesh, India** into a single seamless 3D geospatial environment built with **CesiumJS**, **Vite**, **Vanilla JavaScript**, and **OpenStreetMap** data.

This application serves as an experimental 3D spatial foundation for the disaster management command-center project **HERO**, featuring 3,433 3D building extrusions, regional highways (including the ADB 4-lane Highway corridor), major railway stations, APSRTC bus terminals, and emergency hospital care facilities.

---

## 1. Unified Geographic Scope

The application unifies the full regional corridor across East Godavari / Kakinada District:
- **Aditya University Campus (Surampalem)**: 40 distinct educational bhavans, research institutes, laboratory blocks, hostel residence towers, and campus infrastructure (Cotton Bhavan, Hanuman Temple, Technical Hub, Petroleum Technology, Aditya University Admin Tower, Aditya Polytechnic, Aditya Pharmacy, Newton Bhavan, James Watt Bhavan, Ramanujan Bhavan, K.L. Rao Bhavan, Ratan Tata Bhavan, Polavaram Project Model Pavilion, Aditya Bridge Complex, Hostel Quarters).
- **ADB 4-Lane Highway Corridor**: High-speed connector linking Surampalem -> Peddapuram -> Samalkot -> Kakinada City.
- **Transit & Emergency Stations**:
  - Railway Stations: Samalkot Junction (SLO), Kakinada Town (CCT), Kakinada Port (COA), Peddapuram Station (station names, badges & coordinates retained without cluttering track lines).
  - Bus Stations: Kakinada APSRTC Central Bus Complex, Aditya Campus Bus Fleet Terminal, Samalkot Bus Stand, Peddapuram Bus Station.
  - Hospitals: Government General Hospital (GGH) Kakinada, Apollo Hospital, Medicover Hospital, Inodaya Hospital, Aditya Campus Emergency Health Center.
- **Kakinada City & Deep Water Port**: 1,296 urban buildings, coastal waterways, canals, and docks.

---

## 1. Project Structure

```
3d map/
├── index.html                           # Application entrypoint with GIS HUD layout
├── vite.config.js                       # Vite build configuration with vite-plugin-cesium
├── package.json                         # Project dependencies and npm scripts
├── public/
│   └── data/
│       ├── kakinada_buildings_fallback.geojson  # 1,296 real OSM building footprints
│       ├── kakinada_roads.geojson               # 189 primary and secondary road runs
│       ├── kakinada_water.geojson               # Kakinada Bay, Salt Creek & water bodies
│       └── kakinada_landmarks.json              # Curated Kakinada reference landmarks
├── scripts/
│   ├── fetch-osm-data.js                # Overpass API data extraction script
│   └── fetch-water-landmarks.js         # Water bodies and landmark generator
└── src/
    ├── main.js                          # Main application orchestration & lifecycle
    ├── cesium.js                        # CesiumJS Viewer setup, WebGL configuration
    ├── config/
    │   └── mapConfig.js                 # Coordinates, camera views, styling, imagery endpoints
    ├── layers/
    │   ├── imageryLayer.js              # Esri World Satellite, OSM, and Carto Dark switcher
    │   ├── terrainLayer.js              # Cesium World Terrain with WGS84 Ellipsoid fallback
    │   ├── buildingsLayer.js            # 3D building extrusion, selection, and outline logic
    │   ├── roadsLayer.js                # Clamped-to-ground road corridors with highway glow
    │   ├── waterLayer.js                # Aquatic polygons and canal lines
    │   └── disasterLayers.js            # Future HERO foundation: flood zones, EOCs, mesh nodes
    ├── components/
    │   ├── layerPanel.js                # Left HUD panel: layer visibility and toggles
    │   ├── buildingPanel.js             # Right HUD panel: AOI stats & feature attribute table
    │   ├── parcelContextPanel.js        # Bottom-right: 2D vector building footprint preview
    │   ├── searchPanel.js               # Top bar search with local + Nominatim geocoding
    │   └── mapControls.js               # Floating controls: Orbit, Reset, Globe View, 2D/3D
    ├── services/
    │   ├── osmService.js                # Data loader and live Overpass bbox querying
    │   └── geocodingService.js          # Fast landmark search and reverse geocoding
    ├── utils/
    │   ├── cameraUtils.js               # Camera fly-to, orbit, zoom, tilt, and view transitions
    │   └── geoUtils.js                  # Coordinate formatting, centroid, and area calculations
    └── styles/
        └── main.css                     # Tactical dark GIS command-center interface theme
```

---

## 2. Technologies Used

- **CesiumJS (v1.124)**: High-precision 3D geospatial engine rendering the WGS84 globe, oblique camera perspectives, polyline glow, and 3D polygon extrusions.
- **Vite (v6)**: Next-generation fast frontend build tool.
- **vite-plugin-cesium**: Seamless integration of Cesium static assets, web workers, and WebGL shaders into Vite.
- **Vanilla JavaScript (ES Modules)**: Modular, dependency-free frontend architecture without heavy UI frameworks.
- **HTML5 Canvas**: Powers the 2D "Parcel Context" mini-map for instant footprint inspection.
- **CSS3 Modern HUD**: Dark tactical GIS styling with glassmorphism, responsive status bars, and hardware-accelerated animations.

---

## 3. Geographic Data Sources

1. **Building Footprints**: Extracted from **OpenStreetMap** for central Kakinada (`16.9600°N - 17.0100°N`, `82.2200°E - 82.2650°E`). Includes 1,296 individual polygons.
2. **Road Corridors**: Extracted from **OpenStreetMap** (highways: primary, secondary, trunk, and urban arterials). Includes 189 runs.
3. **Water Bodies**: Extracted and delineated for **Kakinada Bay**, **Upputeru / Salt Creek Canal**, **Boat Club Lake**, and **Port Docks**.
4. **Satellite Imagery**: **Esri World Imagery** tile service (`https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer`) – freely accessible, zero API key required, with OpenStreetMap and CartoDB Dark Matter fallbacks.
5. **Terrain**: Standard **WGS84 Ellipsoid** and optional **Cesium World Terrain**.
6. **Geocoding & Search**: Curated high-precision Kakinada landmarks coupled with **OSM Nominatim** geocoding.

---

## 4. API Keys and Configuration Requirements

- **No paid API keys required**: The application is fully pre-configured to use open, free geospatial providers.
- **Esri World Satellite**: Accessible freely without an API token for development and prototyping.
- **OpenStreetMap Data**: Pre-downloaded locally in `public/data/` as authentic GeoJSON fallback files, ensuring 100% offline functionality even if Overpass API public endpoints encounter rate limits.
- **Cesium Ion**: Not required for core functionality; an optional token can be supplied in `src/cesium.js` if custom proprietary Cesium Ion 3D tilesets or photogrammetry are later introduced.

---

## 5. How to Run the Application

```bash
# 1. Install dependencies
npm install

# 2. Start the development server
npm run dev

# 3. Open your browser
# Navigate to: http://localhost:5173/

# 4. Production Build
npm run build
```

---

## 6. Tested & Verified Features

- [x] **3D Globe Initialization**: Full 3D globe with realistic atmospheric lighting, stars, and space background.
- [x] **Kakinada Initial View**: Camera starts at an elevated oblique perspective (`Lat: 16.9891°N, Lon: 82.2475°E`) viewing the urban corridor and coastline.
- [x] **Globe View Toggle**: Smooth camera flight out to 14,000 km altitude displaying the entire Earth sphere in space (matching the reference HUD image), and instant return with "Back to city".
- [x] **3D Building Extrusions**: 1,296 real OpenStreetMap building footprints extruded conservatively to 3D heights with crisp architectural outlines.
- [x] **Building Picking & Highlight**: Clicking a building highlights it in glowing coral/amber, displaying attributes (Height, Sourced vs Estimated badge, Storeys, Area, OSM ID, Lat/Lon) in the right panel.
- [x] **2D Parcel Context Mini-Map**: Dynamic HTML5 canvas drawing the exact 2D vector geometry and orientation of the selected parcel in the bottom-right HUD.
- [x] **GIS Layer Management**: Left panel controls enabling/disabling 3D Buildings, Height Extrusion, Outlines, Satellite Imagery, Imagery Source Switcher, Terrain, Roads, Water Bodies, and Disaster Simulation Layers.
- [x] **Disaster Readiness Layers (HERO Foundation)**: Pre-architected toggleable layers for Flood Inundation Zones, Emergency Command Posts, and Ad-Hoc Mesh Network communication links.
- [x] **Search & Landmark Navigation**: Autocomplete search bar finding Kakinada landmarks (e.g. *JNTUK, Deep Water Port, Jagannaickpur, Bhanugudi Junction, Collectorate, Boat Club Lake*) and smoothly navigating the camera.
- [x] **Camera Navigation**: Functional Orbit mode (continuous 360° rotation), Reset view, 2D/3D morphing, Tilt adjustment, and Zoom in/out.
- [x] **Live Coordinates & Status Bar**: Real-time cursor latitude/longitude readout, camera altitude, building count, CRS, and attribution.

---

## 7. Known Data Limitations

- **Building Heights**: While some buildings in OpenStreetMap have surveyed `height` or `building:levels` tags, many smaller residential structures in Kakinada lack explicit height metadata in OSM. These are conservatively estimated at ~7m to ~15m based on building taxonomy, and are explicitly labelled with the **ESTIMATED** badge in the UI rather than claimed as surveyed.
- **Public Overpass Endpoints**: Public Overpass servers occasionally experience high server traffic or throttling. The built-in pre-cached GeoJSON ensures instantaneous load times under any network conditions.

---

## 8. Next Steps for HERO Disaster Management Integration

1. **Hydrological Inundation Modeling**: Ingest real elevation digital surface models (e.g. CartoDEM / Copernicus 30m) to calculate dynamic water-level rise along Kakinada Salt Creek and the coastline during cyclonic surges.
2. **Real-time Incident Feeds**: Connect WebSocket or REST endpoints to plot live disaster incidents, SOS beacons, and field responder GPS tracks directly on the 3D map.
3. **Mesh Network Telemetry**: Connect physical LoRa mesh routers to display real-time signal strength (RSSI/SNR), packet hops, and battery health on the mesh link entities.
4. **Evacuation Routing**: Integrate OpenRouteService or pgRouting algorithms to compute safe, non-flooded egress routes to designated storm shelters.
