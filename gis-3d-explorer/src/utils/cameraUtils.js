import * as Cesium from 'cesium';
import { MAP_CONFIG } from '../config/mapConfig.js';

let isOrbiting = false;
let orbitRemoveListener = null;

export function flyToAdityaCampus(viewer, duration = 2.0) {
  stopOrbit(viewer);
  const cfg = MAP_CONFIG.camera.adityaCampus;
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(cfg.longitude, cfg.latitude, cfg.height),
    orientation: {
      heading: Cesium.Math.toRadians(cfg.heading),
      pitch: Cesium.Math.toRadians(cfg.pitch),
      roll: Cesium.Math.toRadians(cfg.roll)
    },
    duration
  });
}

export function flyToRegionalCorridor(viewer, duration = 2.2) {
  stopOrbit(viewer);
  const cfg = MAP_CONFIG.camera.regionalCorridor;
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(cfg.longitude, cfg.latitude, cfg.height),
    orientation: {
      heading: Cesium.Math.toRadians(cfg.heading),
      pitch: Cesium.Math.toRadians(cfg.pitch),
      roll: Cesium.Math.toRadians(cfg.roll)
    },
    duration
  });
}

export function flyToKakinadaCity(viewer, duration = 2.2) {
  stopOrbit(viewer);
  const cfg = MAP_CONFIG.camera.kakinadaCity;
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(cfg.longitude, cfg.latitude, cfg.height),
    orientation: {
      heading: Cesium.Math.toRadians(cfg.heading),
      pitch: Cesium.Math.toRadians(cfg.pitch),
      roll: Cesium.Math.toRadians(cfg.roll)
    },
    duration
  });
}

export function flyToGlobeView(viewer, duration = 2.8) {
  stopOrbit(viewer);
  const cfg = MAP_CONFIG.camera.globeView;
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(cfg.longitude, cfg.latitude, cfg.height),
    orientation: {
      heading: Cesium.Math.toRadians(cfg.heading),
      pitch: Cesium.Math.toRadians(cfg.pitch),
      roll: Cesium.Math.toRadians(cfg.roll)
    },
    duration
  });
}

export function flyToAndhraPradesh(viewer, duration = 1.8) {
  stopOrbit(viewer);
  const cfg = MAP_CONFIG.camera.andhraPradeshState;
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(cfg.longitude, cfg.latitude, cfg.height),
    orientation: {
      heading: Cesium.Math.toRadians(cfg.heading),
      pitch: Cesium.Math.toRadians(cfg.pitch),
      roll: Cesium.Math.toRadians(cfg.roll)
    },
    duration
  });
}

export function flyToTarget(viewer, longitude, latitude, altitude = 500, duration = 1.8) {
  stopOrbit(viewer);
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, altitude),
    orientation: {
      heading: viewer.camera.heading,
      pitch: Cesium.Math.toRadians(-40.0),
      roll: 0.0
    },
    duration
  });
}

export function toggleOrbit(viewer, onStateChange) {
  if (isOrbiting) {
    stopOrbit(viewer);
    if (onStateChange) onStateChange(false);
    return false;
  } else {
    startOrbit(viewer);
    if (onStateChange) onStateChange(true);
    return true;
  }
}

export function startOrbit(viewer) {
  if (isOrbiting) return;
  isOrbiting = true;

  const rotateSpeed = 0.0016;
  const onTick = () => {
    if (!isOrbiting) return;
    viewer.camera.rotate(Cesium.Cartesian3.UNIT_Z, rotateSpeed);
  };

  orbitRemoveListener = viewer.clock.onTick.addEventListener(onTick);
}

export function stopOrbit(viewer) {
  if (orbitRemoveListener) {
    orbitRemoveListener();
    orbitRemoveListener = null;
  }
  isOrbiting = false;
}

export function zoomIn(viewer) {
  viewer.camera.zoomIn(viewer.camera.positionCartographic.height * 0.35);
}

export function zoomOut(viewer) {
  viewer.camera.zoomOut(viewer.camera.positionCartographic.height * 0.45);
}

export function tiltView(viewer, deltaPitch = -15) {
  const currentPitch = Cesium.Math.toDegrees(viewer.camera.pitch);
  const targetPitch = Math.max(-89, Math.min(-15, currentPitch + deltaPitch));
  
  viewer.camera.flyTo({
    destination: viewer.camera.position,
    orientation: {
      heading: viewer.camera.heading,
      pitch: Cesium.Math.toRadians(targetPitch),
      roll: viewer.camera.roll
    },
    duration: 0.8
  });
}

export function toggle2D3D(viewer, is2D) {
  if (is2D) {
    viewer.scene.morphTo2D(1.5);
  } else {
    viewer.scene.morphTo3D(1.5);
  }
}
