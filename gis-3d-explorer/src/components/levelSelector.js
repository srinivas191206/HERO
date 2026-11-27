/**
 * LEVEL Selector Component
 * Renders the floating vertical floor selector seen in the 3D ULPIN reference designs.
 * Supports floor-by-floor inspection, isolation, sub-unit breakdown (F01-F04),
 * and elevation ladder ruler navigation.
 */

let levelSelectorContainer = null;
let currentBuilding = null;
let currentLevel = 'all';
let onLevelSelectedCallback = null;

export function initLevelSelector(container, onLevelSelected) {
  levelSelectorContainer = container;
  onLevelSelectedCallback = onLevelSelected;
}

export function updateLevelSelector(building, activeLevel = 'all') {
  currentBuilding = building;
  currentLevel = activeLevel;

  if (!levelSelectorContainer) return;

  if (!building) {
    levelSelectorContainer.style.display = 'none';
    levelSelectorContainer.innerHTML = '';
    return;
  }

  levelSelectorContainer.style.display = 'block';

  const levelsCount = building.levels || Math.max(1, Math.round((building.height || 16.0) / 3.5));
  
  // Build floors list from top level down to Ground and Basement:
  // e.g. [6, 5, 4, 3, 2, 1, 'G', 'B1']
  const floorList = [];
  for (let fl = levelsCount; fl >= 1; fl--) {
    floorList.push(String(fl));
  }
  floorList.push('G');
  floorList.push('B1');

  let buttonsHtml = '';
  floorList.forEach(fl => {
    const isActive = (currentLevel === fl);
    buttonsHtml += `
      <button class="level-btn ${isActive ? 'active' : ''}" data-level="${fl}" title="Inspect Level ${fl}">
        ${fl}
      </button>
    `;
  });

  // 'all' button at the bottom to reset floor-by-floor slicing and show entire building
  const isAllActive = (currentLevel === 'all');
  buttonsHtml += `
    <button class="level-btn level-btn-all ${isAllActive ? 'active' : ''}" data-level="all" title="View Full Multi-Storey Building">
      all
    </button>
  `;

  levelSelectorContainer.innerHTML = `
    <div class="level-selector-widget">
      <div class="level-header">LEVEL</div>
      <div class="level-btn-stack">
        ${buttonsHtml}
      </div>
    </div>
  `;

  // Attach event handlers
  levelSelectorContainer.querySelectorAll('.level-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const level = btn.getAttribute('data-level');
      setLevel(level);
    });
  });
}

export function setLevel(level) {
  currentLevel = level;
  if (!levelSelectorContainer) return;

  levelSelectorContainer.querySelectorAll('.level-btn').forEach(b => {
    const bl = b.getAttribute('data-level');
    if (bl === level) {
      b.classList.add('active');
    } else {
      b.classList.remove('active');
    }
  });

  if (onLevelSelectedCallback) {
    onLevelSelectedCallback(level);
  }
}

export function getActiveLevel() {
  return currentLevel;
}
