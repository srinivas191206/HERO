/**
 * Map Controls Component
 * Matches the floating bottom bar from Images 1, 2, 3, 4 with full navigation support.
 */

export function initMapControls(containerEl, actions) {
  containerEl.innerHTML = `
    <div class="floating-controls-bar ref-controls-bar">
      <button class="gis-btn" id="btn-orbit" title="Orbit camera around active point">
        Orbit
      </button>

      <button class="gis-btn" id="btn-reset-view" title="Reset camera to initial view">
        Reset view
      </button>

      <button class="gis-btn" id="btn-campus-fast" title="Focus on Aditya University (Surampalem)">
        Aditya Campus
      </button>

      <button class="gis-btn" id="btn-kakinada-fast" title="Focus on Kakinada City">
        Kakinada City
      </button>

      <button class="gis-btn" id="btn-corridor-fast" title="Regional ADB Corridor View">
        Regional
      </button>

      <button class="gis-btn" id="btn-22a" title="22A Restricted Land Layer">
        22A ✓
      </button>

      <button class="gis-btn" id="btn-toggle-2d" title="Switch between 3D Globe and 2D GIS view">
        <span id="label-mode-2d">2D GIS</span>
      </button>

      <button class="gis-btn" id="btn-slice" title="Building Slice Inspection Tool">
        Slice
      </button>

      <div class="control-divider"></div>

      <button class="gis-btn icon-only" id="btn-zoom-in" title="Zoom in">
        <span>+</span>
      </button>
      <button class="gis-btn icon-only" id="btn-zoom-out" title="Zoom out">
        <span>−</span>
      </button>
    </div>
  `;

  let is2DMode = false;
  let isOrbitActive = false;

  const btnOrbit = document.getElementById('btn-orbit');
  const btnReset = document.getElementById('btn-reset-view');
  const btnCampus = document.getElementById('btn-campus-fast');
  const btnKakinada = document.getElementById('btn-kakinada-fast');
  const btnCorridor = document.getElementById('btn-corridor-fast');
  const btn22a = document.getElementById('btn-22a');
  const btn2D = document.getElementById('btn-toggle-2d');
  const labelMode2D = document.getElementById('label-mode-2d');
  const btnSlice = document.getElementById('btn-slice');
  const btnZoomIn = document.getElementById('btn-zoom-in');
  const btnZoomOut = document.getElementById('btn-zoom-out');

  btnOrbit?.addEventListener('click', () => {
    isOrbitActive = !isOrbitActive;
    if (isOrbitActive) {
      btnOrbit.classList.add('active');
    } else {
      btnOrbit.classList.remove('active');
    }
    actions.onToggleOrbit?.(isOrbitActive, (active) => {
      isOrbitActive = active;
      if (active) btnOrbit.classList.add('active');
      else btnOrbit.classList.remove('active');
    });
  });

  btnReset?.addEventListener('click', () => actions.onResetView?.());
  btnCampus?.addEventListener('click', () => actions.onCampusView?.());
  btnKakinada?.addEventListener('click', () => actions.onKakinadaView?.());
  btnCorridor?.addEventListener('click', () => actions.onCorridorView?.());

  btn22a?.addEventListener('click', () => {
    btn22a.classList.toggle('active');
  });

  btn2D?.addEventListener('click', () => {
    is2DMode = !is2DMode;
    if (is2DMode) {
      btn2D.classList.add('active');
      if (labelMode2D) labelMode2D.textContent = '3D Mode';
    } else {
      btn2D.classList.remove('active');
      if (labelMode2D) labelMode2D.textContent = '2D GIS';
    }
    actions.onToggle2D?.(is2DMode);
  });

  btnSlice?.addEventListener('click', () => {
    btnSlice.classList.toggle('active');
  });

  btnZoomIn?.addEventListener('click', () => actions.onZoomIn?.());
  btnZoomOut?.addEventListener('click', () => actions.onZoomOut?.());
}
