/**
 * 3D ULPIN Vertical Property Mapper - Building Inspector Panel
 * Exact replica of the reference design in Images 1, 2, 3, 4.
 */

let containerElement = null;
let onDeselectCallback = null;
let onBackToCityCallback = null;

export function initBuildingPanel(containerEl, onDeselect, onBackToCity) {
  containerElement = containerEl;
  onDeselectCallback = onDeselect;
  onBackToCityCallback = onBackToCity;
  renderEmptyAOI();
}

export function updateAOIStats(buildingCount, roadCount) {
  const bCountEl = document.getElementById('aoi-bldg-count');
  const rCountEl = document.getElementById('aoi-road-count');
  if (bCountEl) bCountEl.textContent = buildingCount.toLocaleString();
  if (rCountEl) rCountEl.textContent = roadCount.toLocaleString();
}

export function renderEmptyAOI() {
  if (!containerElement) return;

  containerElement.innerHTML = `
    <div class="hud-panel aoi-panel-reference">
      <div class="aoi-nav-bar">
        <button class="btn-underground-badge" id="btn-aoi-underground">Underground</button>
      </div>

      <div class="aoi-ref-header">
        <div class="aoi-ref-label">AREA OF INTEREST</div>
        <div class="aoi-ref-title">Aditya University & Kakinada</div>
      </div>

      <div class="aoi-ref-stats">
        <div class="aoi-stat-row">
          <span class="k">Buildings</span>
          <span class="v" id="aoi-bldg-count">3,432</span>
        </div>
        <div class="aoi-stat-row">
          <span class="k">Utility runs</span>
          <span class="v" id="aoi-road-count">252</span>
        </div>
        <div class="aoi-stat-row">
          <span class="k">CRS</span>
          <span class="v">EPSG:4326 · Z in metres</span>
        </div>
      </div>

      <div class="aoi-ref-prompt">
        Click any building to open its vertical stack.
      </div>
    </div>
  `;
}

export function showSelectedBuilding(building) {
  if (!containerElement) return;

  if (!building) {
    renderEmptyAOI();
    return;
  }

  const ulpin = building.ulpin || {
    state: "AP",
    district: "KKD",
    sro: "3D26",
    parcel: "1123",
    bldg: "001"
  };

  containerElement.innerHTML = `
    <div class="hud-panel aoi-panel-reference building-detail-active">
      <div class="aoi-nav-bar-split">
        <button class="btn-back-city" id="btn-back-to-city">Back to city</button>
        <button class="btn-underground-badge" id="btn-bldg-underground">Underground</button>
      </div>

      <div class="bldg-section-header">
        <span class="bldg-sec-tag">BUILDING</span>
        <button class="btn-edit-tag" id="btn-edit-building">Edit</button>
      </div>

      <div class="bldg-active-name">${building.name}</div>

      <!-- ULPIN BOX -->
      <div class="ulpin-container">
        <div class="ulpin-top">
          <span class="ulpin-word">ULPIN</span>
          <button class="btn-ulpin-copy" id="btn-copy-ulpin-code">Copy</button>
        </div>
        <div class="ulpin-grid">
          <div class="u-cell"><div class="u-label">STATE</div><div class="u-val">${ulpin.state}</div></div>
          <div class="u-cell"><div class="u-label">DISTRICT</div><div class="u-val">${ulpin.district}</div></div>
          <div class="u-cell"><div class="u-label">SRO/MND</div><div class="u-val">${ulpin.sro}</div></div>
          <div class="u-cell"><div class="u-label">PARCEL</div><div class="u-val">${ulpin.parcel}</div></div>
          <div class="u-cell"><div class="u-label">BLDG</div><div class="u-val">${ulpin.bldg}</div></div>
        </div>
        <div class="ulpin-subtext">
          Unofficial vertical extension of the 14-digit ULPIN (Bhu-Aadhaar). Not an official government identifier.
        </div>
      </div>

      <!-- ATTRIBUTES TABLE -->
      <div class="bldg-attr-list">
        ${building.activeFloor && building.activeFloor !== 'all' ? `
          <div class="attr-item floor-active-card" style="background: rgba(56, 189, 248, 0.12); padding: 6px 8px; border-radius: 4px; border: 1px solid rgba(56, 189, 248, 0.4); margin-bottom: 4px;">
            <span class="a-label" style="color: #38bdf8; font-weight: 700;">ACTIVE FLOOR</span>
            <span class="a-val font-bold" style="color: #ffffff;">Storey ${building.activeFloor} · Units F01–F04</span>
          </div>
        ` : ''}
        <div class="attr-item">
          <span class="a-label">Building ID</span>
          <span class="a-val font-mono">BLD-${building.id} <span class="badge-derived">DERIVED</span></span>
        </div>
        <div class="attr-item">
          <span class="a-label">Use type</span>
          <span class="a-val">${building.useType || 'Residential'}</span>
        </div>
        <div class="attr-item">
          <span class="a-label">Building type</span>
          <span class="a-val">${building.buildingType || 'Multi-storey building'} <span class="badge-demo">DEMO</span></span>
        </div>
        <div class="attr-item address-row">
          <span class="a-label">Address</span>
          <span class="a-val">${building.address || 'Kakinada, AP'} <span class="badge-demo">DEMO</span></span>
        </div>
        <div class="attr-item">
          <span class="a-label">Height</span>
          <span class="a-val font-bold">${typeof building.height === 'number' ? building.height.toFixed(1) : '18.0'} m</span>
        </div>
        <div class="attr-item">
          <span class="a-label">Storeys</span>
          <span class="a-val">${building.levels || 5} above ground</span>
        </div>
        <div class="attr-item">
          <span class="a-label">Basements</span>
          <span class="a-val">0</span>
        </div>
        <div class="attr-item">
          <span class="a-label">Ground elevation</span>
          <span class="a-val">61.9 m · AMSL</span>
        </div>
        <div class="attr-item">
          <span class="a-label">Floor Units</span>
          <span class="a-val font-mono">${building.activeFloor && building.activeFloor !== 'all' ? `Units F01, F02, F03, F04` : `${(building.levels || 5) * 4} Total Units`} <span class="badge-derived">DERIVED</span></span>
        </div>
        <div class="attr-item">
          <span class="a-label">Built-up area</span>
          <span class="a-val font-bold">${building.builtUpArea || '1,549.8'} m² <span class="badge-derived">DERIVED</span></span>
        </div>
        <div class="attr-item">
          <span class="a-label">Occupancy</span>
          <span class="a-val">${building.occupancy || '20 / 20 units -- ~70 occupants'} <span class="badge-demo">DEMO</span></span>
        </div>
        <div class="attr-item">
          <span class="a-label">Owner / organisation</span>
          <span class="a-val">${building.name.includes('Bhavan') || building.name.includes('Aditya') ? 'Aditya Educational Trust' : 'Municipal Corporation / Private'} <span class="badge-demo">DEMO</span></span>
        </div>
      </div>
    </div>
  `;

  // Attach event listeners
  document.getElementById('btn-back-to-city')?.addEventListener('click', () => {
    if (onBackToCityCallback) onBackToCityCallback();
    else if (onDeselectCallback) onDeselectCallback();
  });

  document.getElementById('btn-copy-ulpin-code')?.addEventListener('click', (e) => {
    const full = `${ulpin.state}-${ulpin.district}-${ulpin.sro}-${ulpin.parcel}-${ulpin.bldg}`;
    navigator.clipboard?.writeText(full).catch(() => {});
    e.target.textContent = 'Copied!';
    setTimeout(() => { e.target.textContent = 'Copy'; }, 1500);
  });
}
