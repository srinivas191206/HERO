import * as Cesium from 'cesium';
import { MAP_CONFIG } from '../config/mapConfig.js';
import { calculatePolygonCentroid, calculatePolygonArea } from '../utils/geoUtils.js';
import { 
  createBuildingFacadeTexture, 
  createSchematicFacadeTexture, 
  createSingleFloorFacadeTexture 
} from '../utils/textureGenerator.js';
import { highlightParcel } from './parcelsLayer.js';
import { updateLevelSelector } from '../components/levelSelector.js';

let buildingsDataSource = null;
let labelsDataSource = null;
let detailDataSource = null; // for selected building details: floors, balconies, rooftop water tank, elevator room & sub-units
let selectedEntity = null;
let originalMaterial = null;
let originalOutlineColor = null;
let showOutlines = true;
let isExtruded = true;
let currentStyleMode = 'schematic'; // 'schematic' or 'photoreal'
let currentAlpha = 0.88;
let buildingEntitiesMap = new Map();
let onBuildingSelectedCallback = null;
let viewerInstance = null;
let activeFloorLevel = 'all';

// Generate cached facade materials
let photorealTextureUrl = null;
let singleFloorTextureUrl = null;
let schematicTextureUrl = null;

export async function initBuildingsLayer(viewer, onSelectCallback) {
  viewerInstance = viewer;
  onBuildingSelectedCallback = onSelectCallback;

  if (!buildingsDataSource) {
    buildingsDataSource = new Cesium.CustomDataSource('unified-3d-buildings');
    labelsDataSource = new Cesium.CustomDataSource('prominent-building-labels');
    detailDataSource = new Cesium.CustomDataSource('selected-building-details');
    await viewer.dataSources.add(buildingsDataSource);
    await viewer.dataSources.add(labelsDataSource);
    await viewer.dataSources.add(detailDataSource);
    setupBuildingPicker(viewer);
  }

  if (!photorealTextureUrl) {
    photorealTextureUrl = createBuildingFacadeTexture({ floors: 6, windowsPerFloor: 8 });
  }
  if (!singleFloorTextureUrl) {
    singleFloorTextureUrl = createSingleFloorFacadeTexture({ windowsCount: 10 });
  }
  if (!schematicTextureUrl) {
    schematicTextureUrl = createSchematicFacadeTexture();
  }

  return { dataSource: buildingsDataSource, count: buildingsDataSource.entities.values.length };
}

export async function createBuildingsLayer(viewer, geojsonData, onSelectCallback) {
  await initBuildingsLayer(viewer, onSelectCallback);

  const features = geojsonData.features || [];
  console.log(`Processing ${features.length} 3D architectural building models...`);
  buildingsDataSource.entities.suspendEvents();
  labelsDataSource.entities.suspendEvents();

  features.forEach((feature, index) => {
    if (!feature.geometry || feature.geometry.type !== 'Polygon') return;
    const ring = feature.geometry.coordinates[0];
    if (!ring || ring.length < 3) return;

    const flatCoords = [];
    for (const pt of ring) {
      flatCoords.push(pt[0], pt[1]);
    }

    const props = feature.properties || {};
    const height = typeof props.height === 'number' && props.height > 0 ? props.height : 14.0;
    const centroid = props.centroid || calculatePolygonCentroid(feature.geometry.coordinates);
    const area = calculatePolygonArea(ring);
    const levels = props.levels || Math.max(1, Math.round(height / 3.5));

    // Facade color palette matching Image 1, 2, 3, 4
    let wallColorHex = '#334155'; // architectural dark slate
    let outlineColorHex = '#ffffff'; // clean white rim

    const name = props.name || '';
    if (name.includes('Cotton')) {
      wallColorHex = '#475569';
      outlineColorHex = '#fef08a';
    } else if (name.includes('Temple')) {
      wallColorHex = '#431407';
      outlineColorHex = '#f97316';
    } else if (name.includes('Technical Hub') || name.includes('T-Hub')) {
      wallColorHex = '#1e293b';
      outlineColorHex = '#38bdf8';
    }

    const baseColor = Cesium.Color.fromCssColorString(wallColorHex).withAlpha(currentAlpha);
    const outlineColor = Cesium.Color.fromCssColorString(outlineColorHex).withAlpha(0.9);

    const entityId = `building-${props.id || 'f'}-${index}`;
    if (buildingsDataSource.entities.getById(entityId)) return;

    const entity = buildingsDataSource.entities.add({
      id: entityId,
      name: props.name || `Building ${props.id || index}`,
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray(flatCoords),
        height: 0.0,
        extrudedHeight: isExtruded ? height : 0.0,
        material: baseColor,
        outline: showOutlines,
        outlineColor: outlineColor,
        outlineWidth: 1.5
      },
      properties: new Cesium.PropertyBag({
        id: props.id || index,
        name: props.name || `Building ${props.id || index}`,
        zone: props.zone || 'Kakinada District',
        buildingType: props.building || 'residential',
        height: height,
        heightSource: props.height_source || 'osm:estimated',
        levels: levels,
        description: props.description || '3D Cadastral Property Structure',
        centroid: centroid,
        area: area,
        ringCoordinates: ring,
        tags: props.tags || {}
      })
    });

    buildingEntitiesMap.set(entity.id, entity);

    // Prominent landmark labels (Cotton, Hanuman, T-Hub, Newton, etc.)
    const isProminent = props.name && (
      props.name.includes('Bhavan') ||
      props.name.includes('Temple') ||
      props.name.includes('Technical Hub') ||
      props.name.includes('Petroleum') ||
      props.name.includes('Aditya University') ||
      props.name.includes('Polytechnic') ||
      props.name.includes('Pharmacy') ||
      props.name.includes('Collectorate') ||
      props.name.includes('JNTU') ||
      props.name.includes('Port')
    );

    if (isProminent && centroid) {
      labelsDataSource.entities.add({
        id: `label-${entity.id}`,
        name: props.name,
        position: Cesium.Cartesian3.fromDegrees(centroid[0], centroid[1], height + 10),
        point: {
          pixelSize: 8,
          color: Cesium.Color.fromCssColorString('#38bdf8'),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 3500)
        },
        label: {
          text: props.name.toUpperCase(),
          font: 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -12),
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString('#0f172a').withAlpha(0.85),
          backgroundPadding: new Cesium.Cartesian2(6, 4),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 2500)
        }
      });
    }
  });

  buildingsDataSource.entities.resumeEvents();
  labelsDataSource.entities.resumeEvents();

  console.log(`Rendered ${buildingsDataSource.entities.values.length} 3D architectural models.`);
  return {
    dataSource: buildingsDataSource,
    count: buildingsDataSource.entities.values.length
  };
}

function setupBuildingPicker(viewer) {
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

  handler.setInputAction((movement) => {
    const pickedObject = viewer.scene.pick(movement.position);

    if (Cesium.defined(pickedObject) && pickedObject.id) {
      let entity = pickedObject.id;
      if (entity.id && typeof entity.id === 'string' && entity.id.startsWith('label-')) {
        const targetId = entity.id.replace('label-', '');
        entity = buildingEntitiesMap.get(targetId) || entity;
      }
      if (entity && entity.polygon) {
        selectBuilding(entity, true);
        return;
      }
    }
    clearBuildingSelection();
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

export function selectBuilding(entity, shouldFlyTo = false) {
  if (selectedEntity === entity) {
    if (shouldFlyTo && viewerInstance && entity?.properties?.centroid) {
      const centroid = entity.properties.centroid.getValue();
      const area = entity.properties.area ? entity.properties.area.getValue() : 1500;
      const maxDim = Math.max(Math.sqrt(area || 1500), 40);
      const offsetDist = Math.max(maxDim * 2.2, 140.0);
      const dLat = (offsetDist * 0.70) / 110574;
      const dLon = (offsetDist * 0.70) / (111320 * Math.cos(centroid[1] * Math.PI / 180));
      const camAlt = Math.max(offsetDist * 0.65, 80.0);
      viewerInstance.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(centroid[0] + dLon, centroid[1] - dLat, camAlt),
        orientation: {
          heading: Cesium.Math.toRadians(315.0),
          pitch: Cesium.Math.toRadians(-22.0),
          roll: 0.0
        },
        duration: 1.2
      });
    }
    return;
  }

  // Restore previous entity
  if (selectedEntity && selectedEntity.polygon) {
    selectedEntity.polygon.show = true;
    selectedEntity.polygon.material = originalMaterial;
    selectedEntity.polygon.outlineColor = originalOutlineColor;
    const prevLabel = labelsDataSource?.entities.getById(`label-${selectedEntity.id}`);
    if (prevLabel) prevLabel.show = true;
  }
  if (detailDataSource) {
    detailDataSource.entities.removeAll();
  }

  selectedEntity = entity;
  if (!selectedEntity || !selectedEntity.polygon) {
    highlightParcel(null);
    updateLevelSelector(null);
    if (onBuildingSelectedCallback) onBuildingSelectedCallback(null);
    return;
  }

  // Hide label on selected building so roof utilities are crystal clear
  const curLabel = labelsDataSource?.entities.getById(`label-${selectedEntity.id}`);
  if (curLabel) curLabel.show = false;

  originalMaterial = selectedEntity.polygon.material;
  originalOutlineColor = selectedEntity.polygon.outlineColor;

  const rawProps = selectedEntity.properties;
  const buildingId = rawProps.id ? rawProps.id.getValue() : selectedEntity.id;
  const height = rawProps.height ? rawProps.height.getValue() : 18.0;
  const levels = rawProps.levels ? rawProps.levels.getValue() : 5;
  const centroid = rawProps.centroid ? rawProps.centroid.getValue() : [82.2450, 16.9850];
  const ring = rawProps.ringCoordinates ? rawProps.ringCoordinates.getValue() : [];

  // Hide basic single block and activate full floor-by-floor architecture stack
  selectedEntity.polygon.show = false;
  activeFloorLevel = 'all';

  // Highlight Cadastral Parcel outline on ground
  highlightParcel(buildingId);

  // Render multi-storey floor bands, balconies, roof slab, and elevation ladder
  renderBuildingFloors(selectedEntity, 'all');

  // Smooth oblique camera framing on selection (Matches Gayatri Apartments in reference image)
  if (shouldFlyTo && viewerInstance && centroid) {
    const area = rawProps.area ? rawProps.area.getValue() : 1500;
    const maxDim = Math.max(Math.sqrt(area || 1500), 40);
    const offsetDist = Math.max(maxDim * 2.2, 140.0);
    const dLat = (offsetDist * 0.70) / 110574;
    const dLon = (offsetDist * 0.70) / (111320 * Math.cos(centroid[1] * Math.PI / 180));
    const camAlt = Math.max(offsetDist * 0.65, 80.0);

    viewerInstance.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(
        centroid[0] + dLon,
        centroid[1] - dLat,
        camAlt
      ),
      orientation: {
        heading: Cesium.Math.toRadians(315.0),
        pitch: Cesium.Math.toRadians(-22.0),
        roll: 0.0
      }
    });
  }

  // Build ULPIN & Detailed Attributes Object
  const name = rawProps.name ? rawProps.name.getValue() : 'Building ' + buildingId;
  const isKakinada = (rawProps.zone ? rawProps.zone.getValue() : '').includes('Kakinada');
  const districtCode = isKakinada ? 'KKD' : 'EGD';
  const stateCode = 'AP';
  const sroCode = '3D26';
  const parcelNum = (Math.abs(Number(buildingId) || 1123) % 8999 + 1000).toString();
  const bldgNum = '001';

  const buildingData = {
    id: buildingId,
    name: name,
    zone: rawProps.zone ? rawProps.zone.getValue() : 'Kakinada District',
    buildingType: rawProps.buildingType ? rawProps.buildingType.getValue() : 'Academic / Administrative',
    height: height,
    heightSource: rawProps.heightSource ? rawProps.heightSource.getValue() : 'osm:surveyed',
    levels: levels,
    activeFloor: 'all',
    description: rawProps.description ? rawProps.description.getValue() : '',
    centroid: centroid,
    area: rawProps.area ? rawProps.area.getValue() : 1549.8,
    ringCoordinates: ring,
    ulpin: {
      state: stateCode,
      district: districtCode,
      sro: sroCode,
      parcel: parcelNum,
      bldg: bldgNum,
      fullCode: `${stateCode}-${districtCode}-${sroCode}-${parcelNum}-${bldgNum}`
    },
    address: `${parcelNum}/c, ${name}, ${isKakinada ? 'Kakinada Smart City' : 'Aditya Nagar, Surampalem'}, AP`,
    useType: (name.includes('Bhavan') || name.includes('College') || name.includes('University') || name.includes('Tech')) ? 'Educational & Administrative' : 'Commercial / Residential'
  };

  // Update Left LEVEL selector widget
  updateLevelSelector(buildingData, 'all');

  if (onBuildingSelectedCallback) {
    onBuildingSelectedCallback(buildingData);
  }
}

export function setFloorSlice(level) {
  if (!selectedEntity) return;
  activeFloorLevel = level;
  renderBuildingFloors(selectedEntity, level);

  const rawProps = selectedEntity.properties;
  const buildingId = rawProps.id ? rawProps.id.getValue() : selectedEntity.id;
  const name = rawProps.name ? rawProps.name.getValue() : 'Building ' + buildingId;
  const isKakinada = (rawProps.zone ? rawProps.zone.getValue() : '').includes('Kakinada');
  const districtCode = isKakinada ? 'KKD' : 'EGD';
  const parcelNum = (Math.abs(Number(buildingId) || 1123) % 8999 + 1000).toString();

  const buildingData = {
    id: buildingId,
    name: name,
    height: rawProps.height ? rawProps.height.getValue() : 18.0,
    levels: rawProps.levels ? rawProps.levels.getValue() : 5,
    activeFloor: level,
    buildingType: rawProps.buildingType ? rawProps.buildingType.getValue() : 'Academic / Administrative',
    ulpin: {
      state: 'AP',
      district: districtCode,
      sro: '3D26',
      parcel: parcelNum,
      bldg: '001'
    },
    address: `${parcelNum}/c, ${name}, ${isKakinada ? 'Kakinada Smart City' : 'Aditya Nagar, Surampalem'}, AP`,
    useType: 'Educational & Administrative'
  };

  if (onBuildingSelectedCallback) {
    onBuildingSelectedCallback(buildingData);
  }
}

export function renderBuildingFloors(entity, activeLevel = 'all') {
  if (!detailDataSource || !entity) return;
  detailDataSource.entities.removeAll();

  const rawProps = entity.properties;
  const buildingId = rawProps.id ? rawProps.id.getValue() : entity.id;
  const height = rawProps.height ? rawProps.height.getValue() : 18.0;
  const levels = rawProps.levels ? rawProps.levels.getValue() : 5;
  const centroid = rawProps.centroid ? rawProps.centroid.getValue() : [82.2450, 16.9850];
  const ring = rawProps.ringCoordinates ? rawProps.ringCoordinates.getValue() : [];
  if (!ring || ring.length < 3) return;

  const flatCoords = [];
  for (const pt of ring) {
    flatCoords.push(pt[0], pt[1]);
  }

  const floorH = height / levels;
  const groundElevation = 61.9; // Base elevation in m

  // Calculate building bounds and westernmost corner for elevation ladder ticks
  const lons = ring.map(p => p[0]);
  const lats = ring.map(p => p[1]);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const midLat = (minLat + maxLat) / 2;
  const midLon = (minLon + maxLon) / 2;

  // Westernmost edge offset for elevation ruler
  const ladderOffsetLon = minLon - 0.00010;
  const tickStartLon = minLon;

  // Expanded slab ring for cantilever balcony ledges (Image 2 match)
  const slabRing = ring.map(pt => [
    centroid[0] + (pt[0] - centroid[0]) * 1.035,
    centroid[1] + (pt[1] - centroid[1]) * 1.035
  ]);
  const slabFlat = [];
  slabRing.forEach(p => slabFlat.push(p[0], p[1]));

  if (activeLevel === 'all') {
    // ----------------------------------------------------
    // FULL STACKED MULTI-STOREY ARCHITECTURAL VIEW (Image 2)
    // ----------------------------------------------------
    for (let fl = 0; fl < levels; fl++) {
      const zStart = fl * floorH;
      const zEnd = (fl + 1) * floorH;

      // Floor wall band with crisp single-storey window row texture
      detailDataSource.entities.add({
        id: `floor-band-${fl}-${buildingId}`,
        polygon: {
          hierarchy: Cesium.Cartesian3.fromDegreesArray(flatCoords),
          height: zStart,
          extrudedHeight: zEnd,
          material: new Cesium.ImageMaterialProperty({
            image: singleFloorTextureUrl,
            repeat: new Cesium.Cartesian2(4.0, 1.0)
          }),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString('#ffffff').withAlpha(0.6),
          outlineWidth: 1.5
        }
      });

      // Cantilever floor balcony slab running around the building perimeter at each storey
      detailDataSource.entities.add({
        id: `cantilever-slab-${fl}-${buildingId}`,
        polygon: {
          hierarchy: Cesium.Cartesian3.fromDegreesArray(slabFlat),
          height: zEnd - 0.25,
          extrudedHeight: zEnd + 0.35,
          material: Cesium.Color.WHITE,
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString('#cbd5e1'),
          outlineWidth: 1.5
        }
      });
    }

    // Ground base plinth slab
    detailDataSource.entities.add({
      id: `ground-plinth-${buildingId}`,
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray(slabFlat),
        height: 0,
        extrudedHeight: 0.5,
        material: Cesium.Color.fromCssColorString('#cbd5e1'),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString('#94a3b8'),
        outlineWidth: 1.5
      }
    });

    // Solid bright white roof slab on top
    detailDataSource.entities.add({
      id: `roof-cap-${buildingId}`,
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray(flatCoords),
        height: height,
        extrudedHeight: height + 0.65,
        material: Cesium.Color.WHITE,
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString('#94a3b8'),
        outlineWidth: 2.0
      }
    });

    // Rooftop Elevator Penthouse (Cube) with Antenna
    detailDataSource.entities.add({
      id: `rooftop-penthouse-${buildingId}`,
      position: Cesium.Cartesian3.fromDegrees(centroid[0] - 0.00003, centroid[1] + 0.00003, height + 2.0),
      box: {
        dimensions: new Cesium.Cartesian3(5.5, 4.5, 3.8),
        material: Cesium.Color.fromCssColorString('#64748b'),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString('#e2e8f0')
      }
    });

    detailDataSource.entities.add({
      id: `rooftop-antenna-${buildingId}`,
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArrayHeights([
          centroid[0] - 0.00003, centroid[1] + 0.00003, height + 3.8,
          centroid[0] - 0.00003, centroid[1] + 0.00003, height + 6.2
        ]),
        width: 3.0,
        material: Cesium.Color.fromCssColorString('#cbd5e1')
      }
    });

    // Rooftop cylindrical water tank
    detailDataSource.entities.add({
      id: `rooftop-tank-${buildingId}`,
      position: Cesium.Cartesian3.fromDegrees(centroid[0] + 0.00004, centroid[1] + 0.00003, height + 1.8),
      cylinder: {
        length: 3.2,
        topRadius: 2.0,
        bottomRadius: 2.0,
        material: Cesium.Color.fromCssColorString('#94a3b8'),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString('#cbd5e1')
      }
    });

    // Elevation Ladder Ruler Ticks & Labels on the left edge (Image 2 match)
    const ladderLevels = [];
    ladderLevels.push({ tag: 'R', z: height, elev: groundElevation + height });
    for (let fl = levels; fl >= 1; fl--) {
      ladderLevels.push({ tag: String(fl), z: (fl - 1) * floorH, elev: groundElevation + (fl - 1) * floorH });
    }
    ladderLevels.push({ tag: 'G', z: 0, elev: groundElevation });
    ladderLevels.push({ tag: 'B1', z: -3.2, elev: groundElevation - 3.2 });

    ladderLevels.forEach((item) => {
      detailDataSource.entities.add({
        id: `ladder-tick-${item.tag}-${buildingId}`,
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArrayHeights([
            tickStartLon, midLat, Math.max(0, item.z),
            ladderOffsetLon, midLat, Math.max(0, item.z)
          ]),
          width: 1.5,
          material: Cesium.Color.fromCssColorString('#94a3b8').withAlpha(0.65)
        }
      });

      detailDataSource.entities.add({
        id: `ladder-lbl-${item.tag}-${buildingId}`,
        position: Cesium.Cartesian3.fromDegrees(ladderOffsetLon - 0.00004, midLat, Math.max(0, item.z)),
        label: {
          text: `${item.tag} · ${item.elev.toFixed(1)} m`,
          font: '10px ui-monospace, Menlo, Consolas, monospace',
          fillColor: Cesium.Color.WHITE,
          style: Cesium.LabelStyle.FILL,
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString('#0f172a').withAlpha(0.85),
          backgroundPadding: new Cesium.Cartesian2(5, 3),
          horizontalOrigin: Cesium.HorizontalOrigin.RIGHT,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      });
    });

  } else {
    // ----------------------------------------------------
    // ISOLATED FLOOR-BY-FLOOR SLICE VIEW (Image 3)
    // ----------------------------------------------------
    let targetFl = 0;
    if (activeLevel === 'G') {
      targetFl = 0;
    } else if (activeLevel === 'B1') {
      targetFl = -1;
    } else {
      targetFl = Math.max(0, Math.min(levels - 1, parseInt(activeLevel, 10) - 1));
    }

    const zStart = targetFl < 0 ? -3.2 : targetFl * floorH;
    const zEnd = targetFl < 0 ? 0 : (targetFl + 1) * floorH;

    // 1. Ghost footprint of other floors (subtle wireframe volume)
    detailDataSource.entities.add({
      id: `ghost-volume-${buildingId}`,
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray(flatCoords),
        height: 0,
        extrudedHeight: height,
        material: Cesium.Color.fromCssColorString('#334155').withAlpha(0.06),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString('#475569').withAlpha(0.2),
        outlineWidth: 1.0
      }
    });

    // 2. Isolated Floating Floor Slice Volume (Translucent glass with white edge rim)
    detailDataSource.entities.add({
      id: `isolated-floor-volume-${activeLevel}-${buildingId}`,
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray(flatCoords),
        height: zStart,
        extrudedHeight: zEnd,
        material: Cesium.Color.fromCssColorString('#cbd5e1').withAlpha(0.32),
        outline: true,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 3.0
      }
    });

    // 3. Solid Floor Base Slab
    detailDataSource.entities.add({
      id: `isolated-floor-slab-${activeLevel}-${buildingId}`,
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray(slabFlat),
        height: zStart - 0.2,
        extrudedHeight: zStart + 0.35,
        material: Cesium.Color.fromCssColorString('#f8fafc').withAlpha(0.95),
        outline: true,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2.0
      }
    });

    // 4. Cadastral Sub-Unit Partitions (F01, F02, F03, F04) - Image 3 Match
    detailDataSource.entities.add({
      id: `unit-divider-ns-${activeLevel}-${buildingId}`,
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArrayHeights([
          midLon, minLat, zStart + 0.25,
          midLon, maxLat, zStart + 0.25
        ]),
        width: 2.5,
        material: Cesium.Color.fromCssColorString('#94a3b8').withAlpha(0.9)
      }
    });

    detailDataSource.entities.add({
      id: `unit-divider-ew-${activeLevel}-${buildingId}`,
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArrayHeights([
          minLon, midLat, zStart + 0.25,
          maxLon, midLat, zStart + 0.25
        ]),
        width: 2.5,
        material: Cesium.Color.fromCssColorString('#94a3b8').withAlpha(0.9)
      }
    });

    // Sub-Unit 3D Text Labels (F01, F02, F03, F04) - Centered on each unit
    const units = [
      { id: 'F01', lon: (minLon + midLon) / 2, lat: (minLat + midLat) / 2 },
      { id: 'F02', lon: (midLon + maxLon) / 2, lat: (minLat + midLat) / 2 },
      { id: 'F03', lon: (minLon + midLon) / 2, lat: (midLat + maxLat) / 2 },
      { id: 'F04', lon: (midLon + maxLon) / 2, lat: (midLat + maxLat) / 2 }
    ];

    units.forEach(u => {
      detailDataSource.entities.add({
        id: `unit-label-${u.id}-${activeLevel}-${buildingId}`,
        position: Cesium.Cartesian3.fromDegrees(u.lon, u.lat, zStart + 0.9),
        label: {
          text: u.id,
          font: 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          fillColor: Cesium.Color.fromCssColorString('#334155'),
          style: Cesium.LabelStyle.FILL,
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      });
    });

    // 5. Elevation Ladder Ruler highlighting active level (Image 3 Match)
    const ladderLevels = [
      { tag: 'R', z: height, elev: groundElevation + height },
      { tag: '5', z: 4 * floorH, elev: groundElevation + 4 * floorH },
      { tag: '4', z: 3 * floorH, elev: groundElevation + 3 * floorH },
      { tag: '3', z: 2 * floorH, elev: groundElevation + 2 * floorH },
      { tag: '2', z: 1 * floorH, elev: groundElevation + 1 * floorH },
      { tag: '1', z: 0 * floorH, elev: groundElevation + 0 * floorH },
      { tag: 'G', z: 0, elev: groundElevation },
      { tag: 'B1', z: -3.2, elev: groundElevation - 3.2 }
    ];

    ladderLevels.forEach(item => {
      const isSelected = (item.tag === activeLevel);
      detailDataSource.entities.add({
        id: `ladder-tick-${item.tag}-${buildingId}`,
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArrayHeights([
            tickStartLon, midLat, Math.max(0, item.z),
            ladderOffsetLon, midLat, Math.max(0, item.z)
          ]),
          width: isSelected ? 3.0 : 1.5,
          material: isSelected ? Cesium.Color.WHITE : Cesium.Color.fromCssColorString('#94a3b8').withAlpha(0.4)
        }
      });

      detailDataSource.entities.add({
        id: `ladder-lbl-${item.tag}-${buildingId}`,
        position: Cesium.Cartesian3.fromDegrees(ladderOffsetLon - 0.00004, midLat, Math.max(0, item.z)),
        label: {
          text: `${item.tag} · ${item.elev.toFixed(1)} m`,
          font: isSelected ? 'bold 11px ui-monospace, Menlo, Consolas, monospace' : '10px ui-monospace, Menlo, Consolas, monospace',
          fillColor: isSelected ? Cesium.Color.WHITE : Cesium.Color.fromCssColorString('#94a3b8'),
          style: Cesium.LabelStyle.FILL,
          showBackground: true,
          backgroundColor: isSelected ? Cesium.Color.fromCssColorString('#1e293b') : Cesium.Color.fromCssColorString('#0f172a').withAlpha(0.7),
          backgroundPadding: new Cesium.Cartesian2(6, 4),
          horizontalOrigin: Cesium.HorizontalOrigin.RIGHT,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      });
    });
  }
}

export function clearBuildingSelection() {
  if (selectedEntity && selectedEntity.polygon) {
    selectedEntity.polygon.material = originalMaterial;
    selectedEntity.polygon.outlineColor = originalOutlineColor;
    const prevLabel = labelsDataSource?.entities.getById(`label-${selectedEntity.id}`);
    if (prevLabel) prevLabel.show = true;
    selectedEntity = null;
  }
  if (detailDataSource) {
    detailDataSource.entities.removeAll();
  }
  highlightParcel(null);
  if (onBuildingSelectedCallback) {
    onBuildingSelectedCallback(null);
  }
}

export function setBuildingStyle(mode) {
  currentStyleMode = mode;
  if (!buildingsDataSource) return;

  const entities = buildingsDataSource.entities.values;
  for (const entity of entities) {
    if (entity === selectedEntity) continue;
    if (entity.polygon) {
      if (mode === 'photoreal') {
        entity.polygon.material = new Cesium.ImageMaterialProperty({
          image: photorealTextureUrl,
          repeat: new Cesium.Cartesian2(3.0, 1.0)
        });
      } else {
        entity.polygon.material = Cesium.Color.fromCssColorString('#334155').withAlpha(currentAlpha);
      }
    }
  }
}

export function setBuildingTransparency(alphaPercent) {
  currentAlpha = Math.max(0.05, Math.min(1.0, alphaPercent / 100));
  if (!buildingsDataSource) return;

  const entities = buildingsDataSource.entities.values;
  for (const entity of entities) {
    if (entity === selectedEntity) continue;
    if (entity.polygon && currentStyleMode === 'schematic') {
      entity.polygon.material = Cesium.Color.fromCssColorString('#334155').withAlpha(currentAlpha);
    }
  }
}

export function setBuildingsVisibility(visible) {
  if (buildingsDataSource) buildingsDataSource.show = visible;
  if (labelsDataSource) labelsDataSource.show = visible;
  if (detailDataSource) detailDataSource.show = visible;
}

export function toggleBuildingExtrusion(enable) {
  isExtruded = enable;
  if (!buildingsDataSource) return;

  const entities = buildingsDataSource.entities.values;
  for (const entity of entities) {
    if (entity.polygon) {
      const h = entity.properties?.height ? entity.properties.height.getValue() : 14.0;
      entity.polygon.extrudedHeight = isExtruded ? h : 0;
    }
  }
}

export function toggleBuildingOutlines(enable) {
  showOutlines = enable;
  if (!buildingsDataSource) return;

  const entities = buildingsDataSource.entities.values;
  for (const entity of entities) {
    if (entity.polygon) {
      entity.polygon.outline = showOutlines;
    }
  }
}

export function findOrCreateInspectableBuilding(options = {}) {
  if (!buildingsDataSource) return null;
  const {
    id,
    name = 'HERO Tactical Facility',
    query,
    lat,
    lng,
    kind = 'facility',
    levels = 4,
    height = 16.0,
    districtName = 'Andhra Pradesh',
    description = 'HERO Command & Emergency Inspection Structure',
    floor = 'all'
  } = options;

  const entities = buildingsDataSource.entities.values;

  // 1. Try matching by explicit name/query
  const searchTerm = (query || name || '').trim().toLowerCase();
  let matched = null;
  if (searchTerm && searchTerm.length >= 3) {
    matched = entities.find(e => e.polygon && e.name && e.name.toLowerCase().includes(searchTerm));
  }

  // 2. Try matching closest real building within ~160m of target coordinates
  if (!matched && typeof lat === 'number' && typeof lng === 'number') {
    let bestDistSq = 0.0016 * 0.0016;
    for (const e of entities) {
      if (!e.polygon || !e.properties?.centroid) continue;
      const c = e.properties.centroid.getValue();
      if (!c) continue;
      const dLon = c[0] - lng;
      const dLat = c[1] - lat;
      const distSq = dLon * dLon + dLat * dLat;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        matched = e;
      }
    }
  }

  // 3. Create an inspectable 3D tactical building footprint at (lat, lng) if outside mapped Kakinada blocks
  if (!matched && typeof lat === 'number' && typeof lng === 'number') {
    const safeId = `hero-bldg-${String(id || `${lat.toFixed(5)}-${lng.toFixed(5)}`).replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const existing = buildingsDataSource.entities.getById(safeId);
    if (existing) {
      matched = existing;
    } else {
      // Rectangular civic / station / shelter footprint (~36m x 26m)
      const halfLon = 0.00017;
      const halfLat = 0.00012;
      const ring = [
        [lng - halfLon, lat - halfLat],
        [lng + halfLon, lat - halfLat],
        [lng + halfLon, lat + halfLat],
        [lng - halfLon, lat + halfLat],
        [lng - halfLon, lat - halfLat]
      ];
      const flatCoords = ring.flat();
      const colorHex =
        kind === 'incident' ? '#7f1d1d' :
        kind === 'station' ? '#0c4a6e' :
        kind === 'shelter' ? '#064e3b' : '#1e293b';
      const outlineHex =
        kind === 'incident' ? '#f87171' :
        kind === 'station' ? '#38bdf8' :
        kind === 'shelter' ? '#34d399' : '#e2e8f0';

      matched = buildingsDataSource.entities.add({
        id: safeId,
        name,
        polygon: {
          hierarchy: Cesium.Cartesian3.fromDegreesArray(flatCoords),
          height: 0.0,
          extrudedHeight: isExtruded ? height : 0.0,
          material: Cesium.Color.fromCssColorString(colorHex).withAlpha(currentAlpha),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString(outlineHex).withAlpha(0.95),
          outlineWidth: 2.5
        },
        properties: new Cesium.PropertyBag({
          id: safeId,
          name,
          zone: districtName || 'Andhra Pradesh',
          buildingType: kind === 'station' ? 'Police Command Facility' : kind === 'shelter' ? 'Emergency Relief Shelter' : kind === 'incident' ? 'Tactical Incident Structure' : '3D Tactical Building',
          height,
          heightSource: 'hero:tactical',
          levels,
          description,
          centroid: [lng, lat],
          area: 936.0,
          ringCoordinates: ring,
          tags: { heroKind: kind }
        })
      });
      buildingEntitiesMap.set(matched.id, matched);
    }
  }

  if (matched) {
    selectBuilding(matched, true);
    if (floor && floor !== 'all') {
      setFloorSlice(String(floor));
    }
  }
  return matched;
}
