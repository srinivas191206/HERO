import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { MAP_CONFIG } from './config/mapConfig.js';
import { setupImageryLayers } from './layers/imageryLayer.js';
import { setupTerrain } from './layers/terrainLayer.js';

export async function initCesiumViewer(containerId, onCoordUpdate) {
  // Free Cesium Ion token or configure blank default (direct XYZ tiles)
  Cesium.Ion.defaultAccessToken = '';

  const viewer = new Cesium.Viewer(containerId, {
    animation: false,
    timeline: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    infoBox: false,
    selectionIndicator: false,
    fullscreenButton: false,
    vrButton: false,
    scene3DOnly: false,
    shouldAnimate: true,
    requestRenderMode: false,
    maximumScreenSpaceError: 2
  });

  // Enable HDR and atmospheric lighting
  viewer.scene.globe.enableLighting = false;
  viewer.scene.globe.showGroundAtmosphere = true;
  viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#1e293b');
  viewer.scene.backgroundColor = Cesium.Color.BLACK;
  viewer.scene.skyBox.show = true;

  // Setup Base Satellite Imagery
  await setupImageryLayers(viewer);

  // Setup Terrain
  await setupTerrain(viewer);

  // Set initial camera to Aditya Surampalem 3D Campus view
  const campus = MAP_CONFIG.camera.adityaCampus;
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(campus.longitude, campus.latitude, campus.height),
    orientation: {
      heading: Cesium.Math.toRadians(campus.heading),
      pitch: Cesium.Math.toRadians(campus.pitch),
      roll: Cesium.Math.toRadians(campus.roll)
    }
  });

  // Track cursor coordinates for bottom status bar
  if (onCoordUpdate) {
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    const ellipsoid = viewer.scene.globe.ellipsoid;

    handler.setInputAction((movement) => {
      const cartesian = viewer.camera.pickEllipsoid(movement.endPosition, ellipsoid);
      if (cartesian) {
        const cartographic = ellipsoid.cartesianToCartographic(cartesian);
        const lon = Cesium.Math.toDegrees(cartographic.longitude);
        const lat = Cesium.Math.toDegrees(cartographic.latitude);
        const alt = viewer.camera.positionCartographic.height;
        onCoordUpdate({
          longitude: lon,
          latitude: lat,
          cameraAltitude: alt
        });
      }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
  }

  // Remove Cesium credit container elements to embed in custom bottom bar
  const creditContainer = viewer.cesiumWidget.creditContainer;
  if (creditContainer) {
    creditContainer.style.display = 'none';
  }

  return viewer;
}
