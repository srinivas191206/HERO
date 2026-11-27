/**
 * 3D ULPIN Vertical Property Mapper - Left Layer & Control Panel
 * Matches the reference design in Images 1, 2, 3, 4.
 */

let containerElement = null;

export function initLayerPanel(containerEl, callbacks = {}) {
  containerElement = containerEl;
  if (!containerElement) return;

  containerElement.innerHTML = `
    <div class="hud-panel left-gis-panel">
      <!-- LAYERS SECTION -->
      <div class="ref-sec-header">LAYERS</div>

      <div class="ref-checkbox-list">
        <label class="ref-check-label">
          <input type="checkbox" id="check-parcels" checked>
          <span class="checkmark"></span>
          <span class="label-text">Surface parcels</span>
        </label>

        <label class="ref-check-label">
          <input type="checkbox" id="check-buildings" checked>
          <span class="checkmark"></span>
          <span class="label-text">Buildings</span>
        </label>

        <label class="ref-check-label">
          <input type="checkbox" id="check-streets" checked>
          <span class="checkmark"></span>
          <span class="label-text">Streets</span>
        </label>

        <label class="ref-check-label">
          <input type="checkbox" id="check-floors">
          <span class="checkmark"></span>
          <span class="label-text">Floors & units</span>
        </label>

        <label class="ref-check-label">
          <input type="checkbox" id="check-utilities">
          <span class="checkmark"></span>
          <span class="label-text">Underground utilities</span>
        </label>

        <label class="ref-check-label">
          <input type="checkbox" id="check-dem">
          <span class="checkmark"></span>
          <span class="label-text">DEM / terrain</span>
        </label>

        <label class="ref-check-label">
          <input type="checkbox" id="check-basemap" checked>
          <span class="checkmark"></span>
          <span class="label-text">Basemap</span>
        </label>

        <label class="ref-check-label">
          <input type="checkbox" id="check-restricted">
          <span class="checkmark"></span>
          <span class="label-text">22A restricted land</span>
        </label>
      </div>

      <!-- BUILDINGS STYLE TOGGLE -->
      <div class="ref-sec-header mt-3">Buildings</div>
      <div class="ref-segmented-control">
        <button class="btn-segment active" id="btn-mode-schematic">Schematic</button>
        <button class="btn-segment" id="btn-mode-photoreal">Photoreal</button>
      </div>

      <!-- IMAGERY SELECTOR -->
      <div class="ref-sec-header mt-3">Imagery</div>
      <div class="ref-select-wrap">
        <select class="ref-dropdown" id="select-imagery-ref">
          <option value="esri" selected>Esri World Imagery</option>
          <option value="osm">OpenStreetMap Standard</option>
          <option value="carto">CartoDB Dark Matter</option>
        </select>
      </div>

      <!-- TONE TOGGLE -->
      <div class="ref-sec-header mt-3">Tone</div>
      <div class="ref-segmented-control">
        <button class="btn-segment" id="btn-tone-natural">Natural</button>
        <button class="btn-segment active" id="btn-tone-dark">GIS dark</button>
      </div>

      <!-- SUN / SHADOWS -->
      <div class="ref-slider-group mt-3">
        <div class="ref-slider-head">
          <span>Sun</span>
          <span class="num-val" id="val-sun-display">12:00</span>
        </div>
        <input type="range" min="6" max="18" value="12" step="0.5" class="ref-slider-input" id="range-sun-input">
        <div class="ref-sub-hint">
          <span>Shadows on - buildings only</span>
          <button class="btn-pill-action" id="btn-noon-preset">Noon</button>
        </div>
      </div>

      <!-- EXPLODE -->
      <div class="ref-slider-group mt-2">
        <div class="ref-slider-head">
          <span>Explode</span>
          <span class="num-val" id="val-explode-display">0%</span>
        </div>
        <input type="range" min="0" max="100" value="0" class="ref-slider-input" id="range-explode-input">
      </div>

      <!-- TRANSPARENCY -->
      <div class="ref-slider-group mt-2">
        <div class="ref-slider-head">
          <span>Transparency</span>
          <span class="num-val" id="val-transparency-display">12%</span>
        </div>
        <input type="range" min="0" max="100" value="12" class="ref-slider-input" id="range-transparency-input">
      </div>

      <!-- SLICE SECTION -->
      <div class="ref-slider-group mt-3">
        <div class="ref-slider-head">
          <span>Slice</span>
          <span class="num-val" id="val-slice-mode">off</span>
        </div>
        <div class="ref-segmented-control mt-1">
          <button class="btn-segment" id="btn-slice-ew">E–W</button>
          <button class="btn-segment" id="btn-slice-ns">N–S</button>
        </div>
        <div class="ref-slider-head mt-2">
          <span>Slice position</span>
          <span class="num-val" id="val-slice-pos-display">0%</span>
        </div>
        <input type="range" min="0" max="100" value="0" class="ref-slider-input" id="range-slice-input">
        <div class="ref-sub-hint-text">
          Section the active building. Turns Explode off.
        </div>
      </div>

      <!-- VIEW TOGGLE -->
      <div class="ref-sec-header mt-3">View</div>
      <div class="ref-segmented-control">
        <button class="btn-segment active" id="btn-view-mode-3d">3D</button>
        <button class="btn-segment" id="btn-view-mode-2d">2D</button>
        <button class="btn-segment" id="btn-view-mode-split">Split</button>
      </div>
    </div>
  `;

  // Hook up event listeners
  const checkParcels = document.getElementById('check-parcels');
  checkParcels?.addEventListener('change', (e) => callbacks.onToggleParcels?.(e.target.checked));

  const checkBuildings = document.getElementById('check-buildings');
  checkBuildings?.addEventListener('change', (e) => callbacks.onToggleBuildings?.(e.target.checked));

  const checkStreets = document.getElementById('check-streets');
  checkStreets?.addEventListener('change', (e) => callbacks.onToggleRoads?.(e.target.checked));

  const checkBasemap = document.getElementById('check-basemap');
  checkBasemap?.addEventListener('change', (e) => callbacks.onToggleImagery?.(e.target.checked));

  // Style Mode: Schematic vs Photoreal
  const btnSchematic = document.getElementById('btn-mode-schematic');
  const btnPhotoreal = document.getElementById('btn-mode-photoreal');
  btnSchematic?.addEventListener('click', () => {
    btnSchematic.classList.add('active');
    btnPhotoreal.classList.remove('active');
    callbacks.onSetBuildingStyle?.('schematic');
  });
  btnPhotoreal?.addEventListener('click', () => {
    btnPhotoreal.classList.add('active');
    btnSchematic.classList.remove('active');
    callbacks.onSetBuildingStyle?.('photoreal');
  });

  // Imagery select
  const selectImagery = document.getElementById('select-imagery-ref');
  selectImagery?.addEventListener('change', (e) => callbacks.onSwitchImagery?.(e.target.value));

  // Tone
  const btnToneNatural = document.getElementById('btn-tone-natural');
  const btnToneDark = document.getElementById('btn-tone-dark');
  btnToneNatural?.addEventListener('click', () => {
    btnToneNatural.classList.add('active');
    btnToneDark.classList.remove('active');
    callbacks.onSetTone?.('natural');
  });
  btnToneDark?.addEventListener('click', () => {
    btnToneDark.classList.add('active');
    btnToneNatural.classList.remove('active');
    callbacks.onSetTone?.('dark');
  });

  // Transparency slider
  const rangeTrans = document.getElementById('range-transparency-input');
  const valTrans = document.getElementById('val-transparency-display');
  rangeTrans?.addEventListener('input', (e) => {
    const v = e.target.value;
    if (valTrans) valTrans.textContent = `${v}%`;
    callbacks.onSetTransparency?.(parseInt(v));
  });

  // Sun slider
  const rangeSun = document.getElementById('range-sun-input');
  const valSun = document.getElementById('val-sun-display');
  rangeSun?.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    const hrs = Math.floor(v);
    const mins = (v % 1) * 60;
    if (valSun) valSun.textContent = `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  });

  document.getElementById('btn-noon-preset')?.addEventListener('click', () => {
    if (rangeSun) rangeSun.value = '12';
    if (valSun) valSun.textContent = '12:00';
  });

  // View: 3D vs 2D
  const btn3D = document.getElementById('btn-view-mode-3d');
  const btn2D = document.getElementById('btn-view-mode-2d');
  const btnSplit = document.getElementById('btn-view-mode-split');
  btn3D?.addEventListener('click', () => {
    btn3D.classList.add('active');
    btn2D?.classList.remove('active');
    btnSplit?.classList.remove('active');
    callbacks.onToggle2D?.(false);
  });
  btn2D?.addEventListener('click', () => {
    btn2D.classList.add('active');
    btn3D?.classList.remove('active');
    btnSplit?.classList.remove('active');
    callbacks.onToggle2D?.(true);
  });
}
