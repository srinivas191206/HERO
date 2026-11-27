/**
 * Parcel Context 2D Preview Panel
 * Renders an authentic 2D vector schematic of the selected building footprint,
 * matching the "PARCEL CONTEXT" box in the bottom right of the reference images.
 */

let canvas = null;
let ctx = null;

export function initParcelContextPanel(containerEl) {
  containerEl.innerHTML = `
    <div class="parcel-card">
      <div class="parcel-header">
        <span class="parcel-title">PARCEL CONTEXT</span>
        <span class="parcel-scale" id="parcel-scale">250 m²</span>
      </div>
      <div class="parcel-canvas-container">
        <canvas id="parcel-canvas" width="220" height="160"></canvas>
      </div>
      <div class="parcel-footer" id="parcel-footer">
        <span class="footprint-hint">Click a 3D building to inspect footprint</span>
      </div>
    </div>
  `;

  canvas = document.getElementById('parcel-canvas');
  if (canvas) {
    ctx = canvas.getContext('2d');
    drawEmptyState();
  }
}

export function updateParcelContext(buildingData) {
  if (!canvas || !ctx) return;
  const footer = document.getElementById('parcel-footer');
  const scale = document.getElementById('parcel-scale');

  if (!buildingData || !buildingData.ringCoordinates || buildingData.ringCoordinates.length < 3) {
    drawEmptyState();
    if (footer) footer.innerHTML = `<span class="footprint-hint">Click a 3D building to inspect footprint</span>`;
    if (scale) scale.textContent = '250 m²';
    return;
  }

  const ring = buildingData.ringCoordinates;
  const area = buildingData.area || 0;
  if (scale) scale.textContent = `${Math.round(area)} m²`;
  if (footer) {
    footer.innerHTML = `
      <span class="parcel-id">OSM #${buildingData.id}</span>
      <span class="parcel-type">${buildingData.buildingType || 'Building'}</span>
    `;
  }

  drawPolygonOnCanvas(ring);
}

function drawEmptyState() {
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // Background grid
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1;
  const step = 20;
  for (let x = 0; x < w; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Ghost placeholder building shape
  ctx.strokeStyle = '#334155';
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(w / 2 - 35, h / 2 - 25, 70, 50);
  ctx.setLineDash([]);
}

function drawPolygonOnCanvas(ring) {
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // Background grid
  ctx.fillStyle = '#090d13';
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = '#161f2e';
  ctx.lineWidth = 1;
  const step = 20;
  for (let x = 0; x < w; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Calculate bounding box of coordinates
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  for (const pt of ring) {
    const x = pt[0];
    const y = pt[1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const dx = maxX - minX || 0.0001;
  const dy = maxY - minY || 0.0001;
  const padding = 28;
  const scale = Math.min((w - padding * 2) / dx, (h - padding * 2) / dy);

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  // Convert geo coordinates to canvas coordinates (flip Y because latitude increases upward)
  function toCanvas(pt) {
    const px = w / 2 + (pt[0] - cx) * scale;
    const py = h / 2 - (pt[1] - cy) * scale;
    return [px, py];
  }

  // Draw adjacent subtle context shapes
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(w / 2 - 75, h / 2 - 60, 35, 30);
  ctx.fillRect(w / 2 + 45, h / 2 + 25, 40, 35);

  // Draw polygon
  ctx.beginPath();
  const first = toCanvas(ring[0]);
  ctx.moveTo(first[0], first[1]);

  for (let i = 1; i < ring.length; i++) {
    const p = toCanvas(ring[i]);
    ctx.lineTo(p[0], p[1]);
  }
  ctx.closePath();

  // Highlight fill & stroke matching reference UI
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(255, 255, 255, 0.4)';
  ctx.shadowBlur = 10;
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#f78166'; // bright coral edge
  ctx.lineWidth = 3;
  ctx.stroke();

  // Draw centroid marker
  ctx.fillStyle = '#f78166';
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, 3.5, 0, Math.PI * 2);
  ctx.fill();
}
