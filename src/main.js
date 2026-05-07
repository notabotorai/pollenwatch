import './styles/index.css';
import { fetchLocation, fetchPollen, fetchAutocomplete } from './api.js';
import { getUpiColor, getUpiLabel, getPollenIcon, formatDate, getDayName, isToday } from './utils.js';

// ===== DOM References =====
const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const searchLoader = document.getElementById('search-loader');
const mainContent = document.getElementById('main-content');
const locationName = document.getElementById('location-name');
const locationDate = document.getElementById('location-date');
const demoBadge = document.getElementById('demo-badge');
const gaugeFill = document.getElementById('gauge-fill');
const gaugeValue = document.getElementById('gauge-value');
const severityCategory = document.getElementById('severity-category');
const severityRecommendation = document.getElementById('severity-recommendation');
const pollenTypesGrid = document.getElementById('pollen-types-grid');
const plantSpeciesGrid = document.getElementById('plant-species-grid');
const forecastStrip = document.getElementById('forecast-strip');
const healthRecsList = document.getElementById('health-recs-list');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');
const themeToggle = document.getElementById('theme-toggle');
const themeIcon = document.getElementById('theme-icon');
const autocompleteDropdown = document.getElementById('autocomplete-dropdown');

// ===== Autocomplete state =====
let autocompleteTimer = null;
let activeIndex = -1;
let autocompleteResults = [];

// ===== Init particles =====
function createParticles(count) {
  const container = document.getElementById('particles');
  container.innerHTML = ''; // clear existing
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left = Math.random() * 100 + '%';
    p.style.animationDuration = (12 + Math.random() * 20) + 's';
    p.style.animationDelay = (Math.random() * 15) + 's';
    p.style.width = p.style.height = (4 + Math.random() * 6) + 'px';
    container.appendChild(p);
  }
}
createParticles(20);

// ===== Theme toggle =====
function updateThemeColorMeta(theme) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', theme === 'dark' ? '#0a0e1a' : '#f0f4f8');
  }
}

function initTheme() {
  const saved = localStorage.getItem('pollenwatch-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
  themeIcon.textContent = theme === 'dark' ? '🌙' : '☀️';
  updateThemeColorMeta(theme);
}
initTheme();

themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('pollenwatch-theme', next);
  themeIcon.textContent = next === 'dark' ? '🌙' : '☀️';
  updateThemeColorMeta(next);
});

// ===== Suggestion chips =====
document.querySelectorAll('.search-suggestions__chip').forEach(chip => {
  chip.addEventListener('click', () => {
    searchInput.value = chip.dataset.query;
    searchForm.dispatchEvent(new Event('submit'));
  });
});

// ===== Autocomplete =====
searchInput.addEventListener('input', () => {
  const query = searchInput.value.trim();
  clearTimeout(autocompleteTimer);
  if (query.length < 2) {
    hideAutocomplete();
    return;
  }
  autocompleteTimer = setTimeout(async () => {
    try {
      autocompleteResults = await fetchAutocomplete(query);
      renderAutocomplete(autocompleteResults);
    } catch (e) {
      hideAutocomplete();
    }
  }, 300);
});

searchInput.addEventListener('keydown', (e) => {
  if (autocompleteDropdown.hidden) return;
  const items = autocompleteDropdown.querySelectorAll('.autocomplete-dropdown__item');
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    activeIndex = Math.min(activeIndex + 1, items.length - 1);
    updateActiveItem(items);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    activeIndex = Math.max(activeIndex - 1, 0);
    updateActiveItem(items);
  } else if (e.key === 'Enter' && activeIndex >= 0) {
    e.preventDefault();
    selectAutocomplete(autocompleteResults[activeIndex]);
  } else if (e.key === 'Escape') {
    hideAutocomplete();
  }
});

document.addEventListener('click', (e) => {
  if (!searchForm.contains(e.target)) hideAutocomplete();
});

function renderAutocomplete(results) {
  if (!results.length) { hideAutocomplete(); return; }
  activeIndex = -1;
  autocompleteDropdown.innerHTML = results.map((r, i) => `
    <li class="autocomplete-dropdown__item" data-index="${i}">
      <svg class="autocomplete-dropdown__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
      <span class="autocomplete-dropdown__text">${r.city}${r.state ? ', ' + r.state : ''}${r.country ? ' · ' + r.country : ''}</span>
    </li>
  `).join('');
  autocompleteDropdown.hidden = false;

  autocompleteDropdown.querySelectorAll('.autocomplete-dropdown__item').forEach(item => {
    item.addEventListener('click', () => {
      selectAutocomplete(autocompleteResults[parseInt(item.dataset.index)]);
    });
  });
}

function updateActiveItem(items) {
  items.forEach((item, i) => {
    item.classList.toggle('autocomplete-dropdown__item--active', i === activeIndex);
  });
}

function hideAutocomplete() {
  autocompleteDropdown.hidden = true;
  autocompleteDropdown.innerHTML = '';
  activeIndex = -1;
  autocompleteResults = [];
}

async function selectAutocomplete(result) {
  searchInput.value = result.city + (result.state ? ', ' + result.state : '');
  hideAutocomplete();
  setLoading(true);
  try {
    const pollen = await fetchPollen(result.lat, result.lng, 5);
    renderAll(result, pollen);
    mainContent.hidden = false;
    mainContent.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    showToast(err.message || 'Something went wrong');
  } finally {
    setLoading(false);
  }
}

// ===== Search handler =====
searchForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAutocomplete();
  const query = searchInput.value.trim();
  if (!query) return;

  setLoading(true);
  try {
    const location = await fetchLocation(query);
    const pollen = await fetchPollen(location.lat, location.lng, 5);
    renderAll(location, pollen);
    mainContent.hidden = false;
    mainContent.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    showToast(err.message || 'Something went wrong');
  } finally {
    setLoading(false);
  }
});

function setLoading(loading) {
  searchBtn.querySelector('.search-bar__btn-text').hidden = loading;
  searchLoader.hidden = !loading;
  searchBtn.disabled = loading;
}

function showToast(message) {
  toastMessage.textContent = message;
  toast.hidden = false;
  setTimeout(() => { toast.hidden = true; }, 4000);
}

// ===== Render everything =====
function renderAll(location, data) {
  const today = data.dailyInfo[0];

  // Location bar
  locationName.textContent = location.city + (location.state ? `, ${location.state}` : '');
  locationDate.textContent = formatDate(today.date);
  demoBadge.hidden = !data._demo;

  // Severity gauge (max UPI across pollen types)
  const maxUpi = Math.max(...today.pollenTypeInfo.map(t => t.indexInfo?.value ?? 0));
  renderGauge(maxUpi);
  
  // Update particles based on severity
  const particleCounts = [5, 10, 20, 50, 100, 200];
  createParticles(particleCounts[maxUpi] || 20);

  // Pollen type cards
  renderPollenTypes(today.pollenTypeInfo);

  // Plant species
  renderPlantSpecies(today.plantInfo || []);

  // 5-day forecast
  renderForecast(data.dailyInfo);

  // Health recommendations
  renderHealthRecs(today.pollenTypeInfo);
}

// ===== Gauge =====
function renderGauge(value) {
  const circumference = 2 * Math.PI * 85;
  const offset = circumference - (value / 5) * circumference;
  const color = getUpiColor(value);

  requestAnimationFrame(() => {
    gaugeFill.style.strokeDashoffset = offset;
    gaugeFill.style.stroke = color;
    gaugeValue.textContent = value;
    gaugeValue.style.color = color;
    severityCategory.textContent = getUpiLabel(value);
    severityCategory.style.background = color + '22';
    severityCategory.style.color = color;
  });

  const recs = {
    'None': 'No significant pollen detected. Enjoy the outdoors!',
    'Very Low': 'Pollen levels are very low. A great day to be outside!',
    'Low': 'Low pollen levels. Those with high sensitivity should take mild precautions.',
    'Moderate': 'Moderate pollen in the air. Consider limiting prolonged outdoor activities and keep windows closed.',
    'High': 'High pollen alert! Take allergy medications as needed. Avoid outdoor exercise during peak hours.',
    'Very High': 'Very high pollen! Stay indoors when possible. Use HEPA filters and wear a mask outside.',
  };
  severityRecommendation.textContent = recs[getUpiLabel(value)] || '';
}

// ===== Pollen Type Cards =====
function renderPollenTypes(types) {
  pollenTypesGrid.innerHTML = types.map((type, i) => {
    const val = type.indexInfo?.value ?? 0;
    const color = getUpiColor(val);
    const pct = (val / 5) * 100;
    const inSeason = type.inSeason;
    return `
      <div class="pollen-card" style="animation-delay:${i * 0.1}s">
        <div class="pollen-card__header">
          <div style="display:flex;align-items:center;gap:0.5rem">
            <span class="pollen-card__icon">${getPollenIcon(type.code)}</span>
            <span class="pollen-card__name">${type.displayName}</span>
          </div>
          <span class="pollen-card__season-badge ${inSeason ? 'pollen-card__season-badge--active' : 'pollen-card__season-badge--inactive'}">
            ${inSeason ? 'In Season' : 'Off Season'}
          </span>
        </div>
        <div class="pollen-card__bar-wrap">
          <div class="pollen-card__bar" style="width:0%;background:${color}" data-width="${pct}%"></div>
        </div>
        <div class="pollen-card__label">
          <span class="pollen-card__category" style="color:${color}">${getUpiLabel(val)}</span>
          <span class="pollen-card__value">UPI ${val}/5</span>
        </div>
      </div>`;
  }).join('');

  requestAnimationFrame(() => {
    pollenTypesGrid.querySelectorAll('.pollen-card__bar').forEach(bar => {
      bar.style.width = bar.dataset.width;
    });
  });
}

// ===== Plant Species =====
function renderPlantSpecies(plants) {
  const sorted = [...plants].sort((a, b) => (b.indexInfo?.value ?? 0) - (a.indexInfo?.value ?? 0));
  plantSpeciesGrid.innerHTML = sorted.map((plant, i) => {
    const val = plant.indexInfo?.value ?? 0;
    const color = getUpiColor(val);
    const desc = plant.plantDescription || {};
    const hasDetails = desc.family || desc.season || desc.crossReaction;
    return `
      <div class="plant-card" style="animation-delay:${i * 0.05}s" ${hasDetails ? 'data-expandable="true"' : ''}>
        <div class="plant-card__top">
          <img class="plant-card__thumb" src="${desc.picture || ''}" alt="${plant.displayName}" loading="lazy" onerror="this.style.display='none'" />
          <div class="plant-card__info">
            <div class="plant-card__name">${plant.displayName}</div>
            <div class="plant-card__type">${desc.type || ''}</div>
          </div>
          <span class="plant-card__badge" style="background:${color}22;color:${color}">${val > 0 ? 'UPI ' + val : 'None'}</span>
        </div>
        ${hasDetails ? `
          <div class="plant-card__details" id="plant-detail-${i}">
            ${desc.family ? `<div class="plant-card__detail-row"><span class="plant-card__detail-label">Family</span><span class="plant-card__detail-value">${desc.family}</span></div>` : ''}
            ${desc.season ? `<div class="plant-card__detail-row"><span class="plant-card__detail-label">Season</span><span class="plant-card__detail-value">${desc.season}</span></div>` : ''}
            ${desc.crossReaction ? `<div class="plant-card__detail-row"><span class="plant-card__detail-label">Cross-reaction</span><span class="plant-card__detail-value">${desc.crossReaction}</span></div>` : ''}
          </div>
          <div class="plant-card__expand-hint">tap to expand</div>` : ''}
      </div>`;
  }).join('');

  plantSpeciesGrid.querySelectorAll('[data-expandable]').forEach((card, i) => {
    card.addEventListener('click', () => {
      const details = document.getElementById(`plant-detail-${i}`);
      details?.classList.toggle('open');
      const hint = card.querySelector('.plant-card__expand-hint');
      if (hint) hint.textContent = details?.classList.contains('open') ? 'tap to collapse' : 'tap to expand';
    });
  });
}

// ===== Forecast =====
function renderForecast(days) {
  forecastStrip.innerHTML = days.map((day, i) => {
    const maxVal = Math.max(...day.pollenTypeInfo.map(t => t.indexInfo?.value ?? 0));
    const color = getUpiColor(maxVal);
    const todayFlag = isToday(day.date);
    const bars = day.pollenTypeInfo.map(t => {
      const v = t.indexInfo?.value ?? 0;
      return `<div class="forecast-card__bar-row">
        <span class="forecast-card__bar-label">${t.displayName.substring(0, 4)}</span>
        <div class="forecast-card__bar-track"><div class="forecast-card__bar-fill" style="width:0%;background:${getUpiColor(v)}" data-width="${(v / 5) * 100}%"></div></div>
      </div>`;
    }).join('');
    return `<div class="forecast-card ${todayFlag ? 'forecast-card--today' : ''}" style="animation-delay:${i * 0.08}s">
      <div class="forecast-card__day">${getDayName(day.date)}</div>
      <div class="forecast-card__date">${formatDate(day.date)}</div>
      <div class="forecast-card__dot" style="background:${color}">${maxVal}</div>
      ${bars}
    </div>`;
  }).join('');

  requestAnimationFrame(() => {
    forecastStrip.querySelectorAll('.forecast-card__bar-fill').forEach(bar => {
      bar.style.width = bar.dataset.width;
    });
  });
}

// ===== Health Recommendations =====
function renderHealthRecs(types) {
  const icons = ['🌳', '🌾', '🌿'];
  const allRecs = [];
  types.forEach((type, i) => {
    if (type.healthRecommendations) {
      type.healthRecommendations.forEach(rec => {
        allRecs.push({ icon: icons[i] || '💊', text: rec, type: type.displayName });
      });
    }
  });
  const unique = [...new Map(allRecs.map(r => [r.text, r])).values()];
  healthRecsList.innerHTML = unique.map((rec, i) => `
    <div class="health-rec" style="animation-delay:${i * 0.08}s">
      <span class="health-rec__icon">${rec.icon}</span>
      <span class="health-rec__text"><strong>${rec.type}:</strong> ${rec.text}</span>
    </div>`).join('');
}
