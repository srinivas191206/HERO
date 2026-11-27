/**
 * Search Panel Component
 * Integrated into the top navigation bar
 */

import { searchLocations } from '../services/geocodingService.js';

let searchInput = null;
let resultsContainer = null;
let onSelectCallback = null;
let debounceTimeout = null;

export function initSearchPanel(containerEl, onSelect) {
  onSelectCallback = onSelect;

  containerEl.innerHTML = `
    <div class="search-box">
      <span class="search-icon">🔍</span>
      <input 
        type="text" 
        id="gis-search-input" 
        placeholder="Search ULPIN, address or owner..." 
        autocomplete="off"
        spellcheck="false"
      />
      <button id="search-clear-btn" class="search-clear-btn" style="display: none;">✕</button>
      <div id="search-results-dropdown" class="search-dropdown" style="display: none;"></div>
    </div>
  `;

  searchInput = document.getElementById('gis-search-input');
  resultsContainer = document.getElementById('search-results-dropdown');
  const clearBtn = document.getElementById('search-clear-btn');

  searchInput.addEventListener('input', (e) => {
    const val = e.target.value;
    clearBtn.style.display = val ? 'block' : 'none';

    clearTimeout(debounceTimeout);
    if (!val || val.trim().length < 2) {
      hideDropdown();
      return;
    }

    debounceTimeout = setTimeout(async () => {
      showLoading();
      const results = await searchLocations(val);
      renderResults(results);
    }, 280);
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearBtn.style.display = 'none';
    hideDropdown();
    searchInput.focus();
  });

  document.addEventListener('click', (e) => {
    if (!containerEl.contains(e.target)) {
      hideDropdown();
    }
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideDropdown();
    }
  });
}

function showLoading() {
  resultsContainer.style.display = 'block';
  resultsContainer.innerHTML = `<div class="search-loading">Searching Kakinada locations...</div>`;
}

function renderResults(results) {
  if (!results || results.length === 0) {
    resultsContainer.innerHTML = `<div class="search-no-results">No geographic matches found in Kakinada region</div>`;
    resultsContainer.style.display = 'block';
    return;
  }

  let html = '';
  results.forEach((item, index) => {
    html += `
      <div class="search-result-item" data-index="${index}">
        <div class="result-title">${item.name}</div>
        <div class="result-desc">${item.category ? item.category + ' · ' : ''}${item.description || ''}</div>
        <div class="result-source">${item.source}</div>
      </div>
    `;
  });

  resultsContainer.innerHTML = html;
  resultsContainer.style.display = 'block';

  // Attach click handlers
  const items = resultsContainer.querySelectorAll('.search-result-item');
  items.forEach((el, idx) => {
    el.addEventListener('click', () => {
      const selected = results[idx];
      hideDropdown();
      searchInput.value = selected.name;
      if (onSelectCallback) {
        onSelectCallback(selected);
      }
    });
  });
}

function hideDropdown() {
  if (resultsContainer) {
    resultsContainer.style.display = 'none';
  }
}
