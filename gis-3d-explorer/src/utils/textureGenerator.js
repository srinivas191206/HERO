/**
 * Procedural Architectural Facade & Window Matrix Texture Generator
 * Recreates the exact multi-storey window grid, mullions, and floor slab ledges
 * seen in the 3D ULPIN / Property Mapper reference designs.
 */

export function createBuildingFacadeTexture(options = {}) {
  const width = options.width || 512;
  const height = options.height || 512;
  const floors = options.floors || 6;
  const windowsPerFloor = options.windowsPerFloor || 8;
  const isPhotoreal = options.isPhotoreal !== false;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Base facade wall color (modern architectural charcoal / slate)
  const wallBase = isPhotoreal ? '#1f242d' : '#2d333f';
  ctx.fillStyle = wallBase;
  ctx.fillRect(0, 0, width, height);

  // Subtle vertical panel lines
  ctx.strokeStyle = '#181c24';
  ctx.lineWidth = 1;
  const panelW = width / (windowsPerFloor * 2);
  for (let x = 0; x < width; x += panelW) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  // Draw floors and windows
  const floorH = height / floors;
  const winW = (width / windowsPerFloor) * 0.65;
  const winMarginX = (width / windowsPerFloor) * 0.35 / 2;

  for (let f = 0; f < floors; f++) {
    const yTop = f * floorH;

    // Horizontal floor slab divider (white / silver architectural accent line)
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(0, yTop, width, 4);

    // Cantilever spandrel panel beneath windows
    ctx.fillStyle = '#2b303c';
    ctx.fillRect(0, yTop + 4, width, floorH * 0.18);

    const winH = floorH * 0.62;
    const winY = yTop + floorH * 0.22;

    for (let w = 0; w < windowsPerFloor; w++) {
      const winX = w * (width / windowsPerFloor) + winMarginX;

      // Outer window sill & trim (light silver frame)
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(winX - 1.5, winY - 1.5, winW + 3, winH + 3);

      // Window Glass: Dark tinted reflective glass with gradient
      const glassGrad = ctx.createLinearGradient(winX, winY, winX, winY + winH);
      glassGrad.addColorStop(0, '#0c1117');
      glassGrad.addColorStop(0.35, '#131b26');
      glassGrad.addColorStop(0.65, '#0e1622');
      glassGrad.addColorStop(1, '#080d13');

      ctx.fillStyle = glassGrad;
      ctx.fillRect(winX, winY, winW, winH);

      // Vertical mullion dividing window pane in half
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(winX + winW / 2, winY);
      ctx.lineTo(winX + winW / 2, winY + winH);
      ctx.stroke();

      // Soft glass interior reflection glint
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.beginPath();
      ctx.moveTo(winX, winY);
      ctx.lineTo(winX + winW * 0.4, winY);
      ctx.lineTo(winX, winY + winH * 0.7);
      ctx.closePath();
      ctx.fill();
    }
  }

  // White parapet roof trim at top
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(0, 0, width, 5);

  return canvas.toDataURL('image/png');
}

/**
 * Creates single-storey facade texture with crisp horizontal window rows
 * prevents vertical texture stretching and matches Image 2 reference.
 */
export function createSingleFloorFacadeTexture(options = {}) {
  const width = options.width || 512;
  const height = options.height || 128;
  const windowsCount = options.windowsCount || 8;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Base facade wall color (modern architectural charcoal / slate)
  ctx.fillStyle = '#282c35';
  ctx.fillRect(0, 0, width, height);

  // Top and bottom crisp white slab border
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, 4);
  ctx.fillRect(0, height - 4, width, 4);

  // Spandrel band beneath windows
  ctx.fillStyle = '#1e222a';
  ctx.fillRect(0, height - 16, width, 12);

  const winW = (width / windowsCount) * 0.65;
  const winMarginX = (width / windowsCount) * 0.35 / 2;
  const winH = height * 0.62;
  const winY = height * 0.18;

  for (let w = 0; w < windowsCount; w++) {
    const winX = w * (width / windowsCount) + winMarginX;

    // Window frame
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(winX - 1.5, winY - 1.5, winW + 3, winH + 3);

    // Dark tinted reflective glass
    const glassGrad = ctx.createLinearGradient(winX, winY, winX, winY + winH);
    glassGrad.addColorStop(0, '#0c1117');
    glassGrad.addColorStop(0.35, '#131b26');
    glassGrad.addColorStop(0.65, '#0e1622');
    glassGrad.addColorStop(1, '#080d13');

    ctx.fillStyle = glassGrad;
    ctx.fillRect(winX, winY, winW, winH);

    // Vertical center mullion
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(winX + winW / 2, winY);
    ctx.lineTo(winX + winW / 2, winY + winH);
    ctx.stroke();

    // Subtle glass glint reflection
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.beginPath();
    ctx.moveTo(winX, winY);
    ctx.lineTo(winX + winW * 0.45, winY);
    ctx.lineTo(winX, winY + winH * 0.75);
    ctx.closePath();
    ctx.fill();
  }

  return canvas.toDataURL('image/png');
}

/**
 * Creates the schematic wireframe/hatch texture seen in Image 1 & Image 3
 */
export function createSchematicFacadeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  // Translucent architectural grey background
  ctx.fillStyle = 'rgba(71, 85, 105, 0.88)';
  ctx.fillRect(0, 0, 128, 128);

  // Subtle diagonal hatching
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
  ctx.lineWidth = 1.5;
  for (let i = -128; i < 256; i += 16) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 128, 128);
    ctx.stroke();
  }

  // Horizontal floor lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 32);
  ctx.lineTo(128, 32);
  ctx.moveTo(0, 64);
  ctx.lineTo(128, 64);
  ctx.moveTo(0, 96);
  ctx.lineTo(128, 96);
  ctx.stroke();

  return canvas.toDataURL('image/png');
}
