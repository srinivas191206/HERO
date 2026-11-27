import * as Cesium from 'cesium';

/**
 * HERO Foundation Layers:
 * Future-ready architectural layers for disaster management command center:
 * - Flood Risk Inundation Zones (Creek & Low-Lying Coastal Surge)
 * - Emergency Command Posts
 * - Mesh Network Routers / Nodes
 * - Evacuation Corridors & Shelters
 */

let floodDataSource = null;
let emergencyDataSource = null;
let meshNetworkDataSource = null;

export async function createDisasterReadinessLayers(viewer) {
  floodDataSource = new Cesium.CustomDataSource('hero-flood-zones');
  emergencyDataSource = new Cesium.CustomDataSource('hero-emergency-posts');
  meshNetworkDataSource = new Cesium.CustomDataSource('hero-mesh-network');

  // 1. Flood Inundation Risk Zone (Low-lying Salt Creek basin & coastal margin)
  // Initially inactive / toggleable
  floodDataSource.entities.add({
    name: 'Salt Creek High Tide Inundation Zone',
    polygon: {
      hierarchy: Cesium.Cartesian3.fromDegreesArray([
        82.2320, 16.9420,
        82.2390, 16.9500,
        82.2480, 16.9580,
        82.2570, 16.9660,
        82.2680, 16.9720,
        82.2650, 16.9600,
        82.2450, 16.9480,
        82.2320, 16.9420
      ]),
      height: 0,
      material: Cesium.Color.fromCssColorString('#0284c7').withAlpha(0.38),
      outline: true,
      outlineColor: Cesium.Color.fromCssColorString('#38bdf8').withAlpha(0.8)
    },
    properties: {
      category: 'Flood Risk Modeling',
      riskLevel: 'Moderate to High (Tidal Backwater)',
      note: 'HERO Projected Inundation Envelope'
    }
  });

  // 2. Emergency Command Posts
  const commandPosts = [
    {
      name: 'District Collectorate Emergency Operations Center (EOC)',
      lon: 82.2475,
      lat: 16.9891,
      type: 'Primary Command Node'
    },
    {
      name: 'Port Marine Disaster Response Post',
      lon: 82.2780,
      lat: 16.9840,
      type: 'Coastal Operations Node'
    },
    {
      name: 'JNTUK Emergency Logistics Base',
      lon: 82.2415,
      lat: 16.9785,
      type: 'Relief & Staging Base'
    }
  ];

  commandPosts.forEach((post, i) => {
    emergencyDataSource.entities.add({
      id: `emergency-post-${i}`,
      name: post.name,
      position: Cesium.Cartesian3.fromDegrees(post.lon, post.lat, 25),
      point: {
        pixelSize: 12,
        color: Cesium.Color.fromCssColorString('#22c55e'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2
      },
      label: {
        text: post.name,
        font: '11px monospace',
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -14),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 15000)
      },
      properties: post
    });
  });

  // 3. Mesh Network Routers
  const meshNodes = [
    { id: 'node-1', name: 'Mesh Gateway 01 (Collectorate)', lon: 82.2475, lat: 16.9891 },
    { id: 'node-2', name: 'Mesh Relay 02 (Bhanugudi)', lon: 82.2382, lat: 16.9805 },
    { id: 'node-3', name: 'Mesh Relay 03 (JNTUK)', lon: 82.2415, lat: 16.9785 },
    { id: 'node-4', name: 'Mesh Relay 04 (Deep Port)', lon: 82.2780, lat: 16.9840 }
  ];

  meshNodes.forEach(node => {
    meshNetworkDataSource.entities.add({
      id: node.id,
      name: node.name,
      position: Cesium.Cartesian3.fromDegrees(node.lon, node.lat, 30),
      point: {
        pixelSize: 8,
        color: Cesium.Color.fromCssColorString('#eab308'),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 1.5
      }
    });
  });

  // Mesh wireless interconnect links
  const links = [
    [meshNodes[0], meshNodes[1]],
    [meshNodes[1], meshNodes[2]],
    [meshNodes[0], meshNodes[3]]
  ];

  links.forEach(([n1, n2], i) => {
    meshNetworkDataSource.entities.add({
      id: `mesh-link-${i}`,
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArrayHeights([
          n1.lon, n1.lat, 30,
          n2.lon, n2.lat, 30
        ]),
        width: 2,
        material: new Cesium.PolylineDashMaterialProperty({
          color: Cesium.Color.fromCssColorString('#eab308').withAlpha(0.85),
          dashLength: 16.0
        })
      }
    });
  });

  // Start with disaster test layers hidden by default so user sees clean 3D GIS first
  floodDataSource.show = false;
  emergencyDataSource.show = false;
  meshNetworkDataSource.show = false;

  await viewer.dataSources.add(floodDataSource);
  await viewer.dataSources.add(emergencyDataSource);
  await viewer.dataSources.add(meshNetworkDataSource);

  return {
    floodDataSource,
    emergencyDataSource,
    meshNetworkDataSource
  };
}

export function setFloodLayerVisibility(visible) {
  if (floodDataSource) floodDataSource.show = visible;
}

export function setEmergencyPostsVisibility(visible) {
  if (emergencyDataSource) emergencyDataSource.show = visible;
}

export function setMeshNetworkVisibility(visible) {
  if (meshNetworkDataSource) meshNetworkDataSource.show = visible;
}
