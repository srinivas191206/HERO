/**
 * 3D ULPIN / HERO 3D GIS - Main Application Orchestration
 * Seamless Architectural & Cadastral Exploration across Aditya University & Kakinada
 */

import { initCesiumViewer } from './cesium.js';
import * as Cesium from 'cesium';
import { 
  loadUnifiedBuildings, 
  loadUnifiedRoads, 
  loadWaterBodies 
} from './services/osmService.js';
import { 
  createBuildingsLayer, 
  setBuildingsVisibility, 
  toggleBuildingExtrusion, 
  toggleBuildingOutlines, 
  clearBuildingSelection,
  selectBuilding,
  findOrCreateInspectableBuilding,
  setBuildingStyle,
  setBuildingTransparency,
  setFloorSlice
} from './layers/buildingsLayer.js';
import { createParcelsLayer, setParcelsVisibility } from './layers/parcelsLayer.js';
import { createRoadsLayer, setRoadsVisibility } from './layers/roadsLayer.js';
import { 
  createTransitLayers, 
  setRailwaysVisibility, 
  setBusStandsVisibility, 
  setHospitalsVisibility 
} from './layers/transitLayer.js';
import { createWaterLayer, setWaterVisibility } from './layers/waterLayer.js';
import { switchImageryProvider, setImageryVisibility } from './layers/imageryLayer.js';
import {
  renderAPDistrictsLayer,
  focusAPDistrict,
  setAPDistrictsVisibility
} from './layers/apDistrictsLayer.js';
import { syncHeroEntitiesLayer } from './layers/heroEntitiesLayer.js';

import { initLayerPanel } from './components/layerPanel.js';
import { initBuildingPanel, showSelectedBuilding, updateAOIStats } from './components/buildingPanel.js';
import { initParcelContextPanel, updateParcelContext } from './components/parcelContextPanel.js';
import { initLevelSelector } from './components/levelSelector.js';
import { initSearchPanel } from './components/searchPanel.js';
import { initMapControls } from './components/mapControls.js';

import { 
  flyToAdityaCampus, 
  flyToRegionalCorridor, 
  flyToKakinadaCity, 
  flyToGlobeView, 
  flyToAndhraPradesh,
  flyToTarget, 
  toggleOrbit, 
  toggle2D3D, 
  zoomIn, 
  zoomOut 
} from './utils/cameraUtils.js';
import { formatCoordinate, formatAltitude } from './utils/geoUtils.js';

let viewer = null;

// DOM Elements
const cursorLatEl = document.getElementById('cursor-lat');
const cursorLonEl = document.getElementById('cursor-lon');
const cameraAltEl = document.getElementById('camera-alt');
const bottomBuildingBadge = document.getElementById('bottom-building-badge');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');
const loadingSub = document.getElementById('loading-sub');

function updateCursorHUD(coords) {
  if (cursorLatEl) cursorLatEl.textContent = formatCoordinate(coords.latitude, true);
  if (cursorLonEl) cursorLonEl.textContent = formatCoordinate(coords.longitude, false);
  if (cameraAltEl) cameraAltEl.textContent = formatAltitude(coords.cameraAltitude);
}

async function startApplication() {
  try {
    if (loadingText) loadingText.textContent = 'Initializing 3D Geospatial Engine...';
    if (loadingSub) loadingSub.textContent = 'Setting up Cesium WebGL viewport & atmospheric lighting...';

    // 1. Initialize Cesium Globe
    viewer = await initCesiumViewer('cesium-container', updateCursorHUD);

    // 2. Initialize Right HUD: Feature Inspector & 2D Parcel Context
    const rightPanelContainer = document.getElementById('right-panel-container');
    const bottomRightContainer = document.getElementById('bottom-right-container');

    initBuildingPanel(
      rightPanelContainer, 
      () => {
        clearBuildingSelection();
        updateParcelContext(null);
      },
      () => {
        flyToKakinadaCity(viewer);
      }
    );

    initParcelContextPanel(bottomRightContainer);

    // Initialize Vertical LEVEL Selector (Floors / Slicing)
    const levelContainer = document.getElementById('level-selector-container');
    initLevelSelector(levelContainer, (level) => {
      setFloorSlice(level);
    });

    // 3. Load Unified Geospatial Datasets (Aditya + Kakinada)
    if (loadingText) loadingText.textContent = 'Loading Unified Regional Datasets...';
    if (loadingSub) loadingSub.textContent = 'Extracting 3,432 buildings, surface parcels & infrastructure...';

    const [buildingsData, roadsData, waterData] = await Promise.all([
      loadUnifiedBuildings((prog) => {
        if (loadingSub) loadingSub.textContent = prog.message;
      }),
      loadUnifiedRoads(),
      loadWaterBodies()
    ]);

    // 4. Render Surface Parcels Layer (Cadastral ground property boundaries)
    await createParcelsLayer(viewer, buildingsData);

    // 5. Render 3D Architectural Buildings Layer
    const buildingsResult = await createBuildingsLayer(viewer, buildingsData, (selectedBuilding) => {
      showSelectedBuilding(selectedBuilding);
      updateParcelContext(selectedBuilding);
    });

    // 6. Render Highways & Regional Road Network (ADB Expressway + Urban streets)
    await createRoadsLayer(viewer, roadsData);

    // 7. Render Transit Facilities: Railway Stations, Bus Stands, Hospitals
    await createTransitLayers(viewer, (facility) => {
      showSelectedBuilding(facility);
      updateParcelContext(facility);
    });

    // 8. Render Water Bodies
    if (waterData && waterData.features && waterData.features.length > 0) {
      await createWaterLayer(viewer, waterData);
    }

    // 8b. Render Andhra Pradesh 28-District GeoJSON layer (APSDMA boundary + thermal data)
    let latestHeroDistricts = [];
    renderAPDistrictsLayer(viewer, { visible: true }).catch(err => {
      console.warn('AP districts layer deferred error:', err);
    });

    // Update Stats in UI
    const bCount = buildingsResult.count;
    const rCount = roadsData.features ? roadsData.features.length : 252;
    updateAOIStats(bCount, rCount);

    if (bottomBuildingBadge) {
      bottomBuildingBadge.textContent = `${bCount.toLocaleString()} 3D buildings`;
    }

    // 9. Initialize Left Layer Management & Appearance Panel
    const leftPanelContainer = document.getElementById('left-panel-container');
    initLayerPanel(leftPanelContainer, {
      onToggleParcels: (show) => setParcelsVisibility(show),
      onToggleBuildings: (show) => setBuildingsVisibility(show),
      onToggleExtrusion: (extruded) => toggleBuildingExtrusion(extruded),
      onToggleOutlines: (outlines) => toggleBuildingOutlines(outlines),
      onSetBuildingStyle: (style) => setBuildingStyle(style),
      onSetTransparency: (alpha) => setBuildingTransparency(alpha),
      onToggleRoads: (show) => setRoadsVisibility(show),
      onToggleRailways: (show) => setRailwaysVisibility(show),
      onToggleBusStands: (show) => setBusStandsVisibility(show),
      onToggleHospitals: (show) => setHospitalsVisibility(show),
      onToggleWater: (show) => setWaterVisibility(show),
      onToggleImagery: (show) => setImageryVisibility(show),
      onSwitchImagery: (type) => switchImageryProvider(viewer, type)
    });

    // 10. Initialize Top Search Bar
    const searchContainer = document.getElementById('search-container');
    initSearchPanel(searchContainer, (target) => {
      flyToTarget(viewer, target.longitude, target.latitude, 220);
    });

    // 11. Initialize Bottom Floating Map Controls
    const controlsContainer = document.getElementById('floating-controls-container');
    initMapControls(controlsContainer, {
      onToggleOrbit: (active, cb) => toggleOrbit(viewer, cb),
      onCampusView: () => flyToAdityaCampus(viewer),
      onCorridorView: () => flyToRegionalCorridor(viewer),
      onKakinadaView: () => flyToKakinadaCity(viewer),
      onGlobeView: () => flyToGlobeView(viewer),
      onResetView: () => flyToAdityaCampus(viewer),
      onToggle2D: (is2D) => toggle2D3D(viewer, is2D),
      onZoomIn: () => zoomIn(viewer),
      onZoomOut: () => zoomOut(viewer)
    });

    // 12. Fullscreen toggle button
    document.getElementById('btn-fullscreen')?.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => console.warn(err));
      } else {
        document.exitFullscreen().catch(err => console.warn(err));
      }
    });

    // Helper: validate postMessage same-origin using Origin API with URL fallback
    const isTrustedParentEvent = (event) => {
      try {
        if ('Origin' in globalThis) {
          let senderOrigin;
          try {
            senderOrigin = Origin.from(event);
          } catch {
            senderOrigin = Origin.from(event.origin);
          }
          return senderOrigin.isSameOrigin(Origin.from(self));
        }
        const candidateUrl = new URL(event.origin);
        const selfUrl = new URL(window.location.href);
        return candidateUrl.origin !== 'null' && candidateUrl.origin === selfUrl.origin;
      } catch {
        return false;
      }
    };

    const postToParent = (message) => {
      if (window.parent && window.parent !== window && window.location.origin !== 'null') {
        window.parent.postMessage(message, window.location.origin);
      }
    };

    // Handle clicks on HERO tactical pins and AP District pins/boundaries
    const heroClickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    heroClickHandler.setInputAction((movement) => {
      const picked = viewer.scene.pick(movement.position);
      if (!Cesium.defined(picked) || !picked.id || !picked.id.properties) return;
      const props = picked.id.properties;
      const kind = props.kind?.getValue?.();
      const heroKind = props.heroKind?.getValue?.();

      if (kind === 'ap_district') {
        const distName = props.district?.getValue?.();
        const centerLat = props.centerLat?.getValue?.();
        const centerLng = props.centerLng?.getValue?.();
        focusAPDistrict(viewer, distName, { lat: centerLat, lng: centerLng, altitude: 38000 }, latestHeroDistricts);
        postToParent({
          type: 'HERO_3D_ENTITY_SELECTED',
          payload: { kind: 'district', name: distName, lat: centerLat, lng: centerLng }
        });
      } else if (heroKind) {
        const name = props.name?.getValue?.();
        const lat = props.lat?.getValue?.();
        const lng = props.lng?.getValue?.();
        const rawId = props.rawId?.getValue?.();
        const levels = props.levels?.getValue?.() || 4;
        const districtName = props.districtName?.getValue?.() || 'Andhra Pradesh';
        const description = props.description?.getValue?.() || '';
        findOrCreateInspectableBuilding({
          id: rawId,
          name,
          lat,
          lng,
          kind: heroKind,
          levels,
          height: levels * 4.0,
          districtName,
          description
        });
        postToParent({
          type: 'HERO_3D_ENTITY_SELECTED',
          payload: { kind: heroKind, id: rawId, name, lat, lng }
        });
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // Handle postMessage commands from HERO Next.js parent
    window.addEventListener('message', async (event) => {
      if (!isTrustedParentEvent(event)) return;
      const { type, payload } = event.data || {};
      if (!type) return;

      if (type === 'HERO_SHOW_STATE_AP') {
        clearBuildingSelection();
        setAPDistrictsVisibility(true);
        if (payload?.districts) latestHeroDistricts = payload.districts;
        await renderAPDistrictsLayer(viewer, {
          highlightName: payload?.highlightDistrict || null,
          heroDistricts: latestHeroDistricts,
          visible: true
        });
        if (payload?.fly !== false) {
          flyToAndhraPradesh(viewer, 1.5);
        }
      } else if (type === 'HERO_SELECT_DISTRICT') {
        setAPDistrictsVisibility(true);
        const distQuery = payload?.name || payload?.code || '';
        const coords =
          typeof payload?.lat === 'number' && typeof payload?.lng === 'number'
            ? { lat: payload.lat, lng: payload.lng, altitude: payload.altitude ?? 28000 }
            : null;
        await focusAPDistrict(viewer, distQuery, coords, latestHeroDistricts);
        const badgeEl = document.querySelector('#bottom-status-bar .status-left .status-entry:nth-child(2) .entry-val');
        if (badgeEl && distQuery) badgeEl.textContent = `${distQuery} · Andhra Pradesh`;
      } else if (type === 'HERO_SYNC_ENTITIES') {
        if (payload?.districts) {
          latestHeroDistricts = payload.districts;
          await renderAPDistrictsLayer(viewer, {
            highlightName: payload?.district?.name || null,
            heroDistricts: latestHeroDistricts,
            visible: true
          });
        }
        await syncHeroEntitiesLayer(viewer, payload || {});
      } else if (type === 'HERO_FLY_TO') {
        const lat = payload?.lat;
        const lng = payload?.lng;
        if (payload?.districtName) {
          await renderAPDistrictsLayer(viewer, {
            highlightName: payload.districtName,
            heroDistricts: latestHeroDistricts,
            visible: true
          });
        }
        if (payload?.inspect !== false && (typeof lat === 'number' && typeof lng === 'number' || payload?.query)) {
          const building = findOrCreateInspectableBuilding({
            id: payload?.id,
            name: payload?.name || payload?.title || 'HERO Tactical Target',
            query: payload?.query,
            lat,
            lng,
            kind: payload?.kind || 'facility',
            levels: payload?.levels || 4,
            height: payload?.height || (payload?.levels ? payload.levels * 4.0 : 16.0),
            districtName: payload?.districtName || 'Andhra Pradesh',
            description: payload?.description || '',
            floor: payload?.floor || 'all'
          });
          if (!building && typeof lat === 'number' && typeof lng === 'number') {
            flyToTarget(viewer, lng, lat, payload?.altitude || 350, 1.5);
          }
        } else if (typeof lat === 'number' && typeof lng === 'number') {
          flyToTarget(viewer, lng, lat, payload?.altitude || 550, 1.5);
        }
      } else if (type === 'HERO_SET_FLOOR') {
        if (payload?.floor) {
          setFloorSlice(String(payload.floor));
        }
      }
    });

    // Check URL query parameters
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('mode') === 'state' || urlParams.get('view') === 'ap') {
      await renderAPDistrictsLayer(viewer, { visible: true });
      flyToAndhraPradesh(viewer, 0.5);
    } else if (urlParams.get('district')) {
      const qDist = urlParams.get('district');
      const qLat = parseFloat(urlParams.get('lat') || '');
      const qLng = parseFloat(urlParams.get('lng') || '');
      await focusAPDistrict(
        viewer,
        qDist,
        !Number.isNaN(qLat) && !Number.isNaN(qLng) ? { lat: qLat, lng: qLng, altitude: 28000 } : null,
        latestHeroDistricts
      );
    } else if (urlParams.get('lat') && urlParams.get('lng')) {
      const qLat = parseFloat(urlParams.get('lat'));
      const qLng = parseFloat(urlParams.get('lng'));
      const qAlt = parseFloat(urlParams.get('alt') || '450');
      if (!Number.isNaN(qLat) && !Number.isNaN(qLng)) {
        flyToTarget(viewer, qLng, qLat, Number.isNaN(qAlt) ? 450 : qAlt, 0.8);
      }
    } else if (urlParams.get('view') === 'globe') {
      flyToGlobeView(viewer, 0);
    } else if (urlParams.get('view') === 'corridor') {
      flyToRegionalCorridor(viewer, 0);
    } else if (urlParams.get('view') === 'kakinada') {
      flyToKakinadaCity(viewer, 0);
    }

    // Auto-select building if requested via URL (?select=cotton or ?select=bld)
    const selectQuery = urlParams.get('select');
    if (selectQuery) {
      setTimeout(() => {
        findOrCreateInspectableBuilding({
          query: selectQuery,
          name: selectQuery,
          lat: parseFloat(urlParams.get('lat') || '') || undefined,
          lng: parseFloat(urlParams.get('lng') || '') || undefined,
          floor: urlParams.get('floor') || 'all'
        });
      }, 700);
    }

    // Smoothly fade out loading overlay
    setTimeout(() => {
      if (loadingOverlay) {
        loadingOverlay.style.opacity = '0';
        setTimeout(() => {
          loadingOverlay.style.display = 'none';
        }, 400);
      }
    }, 400);

    postToParent({ type: 'HERO_GIS_READY' });
    console.log("3D ULPIN / Property Mapper platform initialized successfully.");
  } catch (err) {
    console.error("Initialization error:", err);
    if (loadingText) loadingText.textContent = "Error initializing 3D GIS";
    if (loadingSub) loadingSub.textContent = err.message || "Please reload.";
  }
}

// Start application on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApplication);
} else {
  startApplication();
}
