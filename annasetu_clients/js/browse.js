// Browse Food Feature
let allDonations = [];
let filteredDonations = [];
let selectedDonation = null;
let currentFilter = 'all';
let searchTimeout = null; // For debouncing search
let userCoordinates = null; // Store user's current coordinates for distance calculation
let selectedDistanceKm = 'all';
let selectedCity = '';
let locationMode = 'nearby';

// Promise to wait for geolocation
function getGeolocation() {
  return new Promise((resolve) => {
    const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
    const LOW_OPTS = { enableHighAccuracy: false, timeout: 2500, maximumAge: 60 * 1000 };
    const HIGH_OPTS = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };

    // Prefer a recently cached location to avoid prompting the user repeatedly
    try {
      const cached = JSON.parse(localStorage.getItem('lastKnownLocation') || 'null');
      if (cached && cached.ts && (Date.now() - cached.ts) < CACHE_TTL) {
        userCoordinates = { latitude: cached.latitude, longitude: cached.longitude, accuracy: cached.accuracy || null };
        console.log('✓ Using cached location:', userCoordinates);

        // Start a non-blocking background refine to improve accuracy when available
        if (navigator.geolocation) {
          setTimeout(() => {
            try {
              navigator.geolocation.getCurrentPosition((pos) => {
                const lat = pos.coords.latitude;
                const lon = pos.coords.longitude;
                const acc = pos.coords.accuracy;
                const cachedAcc = cached.accuracy || Infinity;
                if (acc && acc < cachedAcc - 5) {
                  userCoordinates = { latitude: lat, longitude: lon, accuracy: acc };
                  try { localStorage.setItem('lastKnownLocation', JSON.stringify({ latitude: lat, longitude: lon, accuracy: acc || 0, ts: Date.now() })); } catch (e) { }
                  console.log('✓ Background refined location:', userCoordinates);
                } else {
                  console.log('Background refine returned no meaningful improvement (m):', acc);
                }
              }, (err) => { console.warn('Background refine failed', err); }, HIGH_OPTS);
            } catch (e) { console.warn('Background refine exception', e); }
          }, 0);
        }

        resolve(userCoordinates);
        return;
      }
    } catch (e) {
      // ignore parse errors and continue to request geolocation
    }

    if (!navigator.geolocation) {
      console.warn('⚠️ Geolocation not supported');
      resolve(null);
      return;
    }

    // Helper to cache and set userCoordinates object
    function cacheLocation(lat, lon, acc) {
      userCoordinates = { latitude: lat, longitude: lon, accuracy: acc || null };
      try { localStorage.setItem('lastKnownLocation', JSON.stringify({ latitude: lat, longitude: lon, accuracy: acc || 0, ts: Date.now() })); } catch (e) { }
    }

    // Try a quick low-accuracy attempt first so UI can proceed quickly,
    // then attempt a high-accuracy refine in the background and update cache if better.
    navigator.geolocation.getCurrentPosition((posLow) => {
      cacheLocation(posLow.coords.latitude, posLow.coords.longitude, posLow.coords.accuracy);
      console.log('✓ Quick location obtained:', userCoordinates);

      // Start background refine (non-blocking)
      try {
        navigator.geolocation.getCurrentPosition((posRefine) => {
          if (posRefine && posRefine.coords) {
            const rlat = posRefine.coords.latitude;
            const rlon = posRefine.coords.longitude;
            const racc = posRefine.coords.accuracy;
            if (!userCoordinates.accuracy || (racc && racc < userCoordinates.accuracy - 5)) {
              cacheLocation(rlat, rlon, racc);
              console.log('✓ Refined location obtained:', userCoordinates);
            } else {
              console.log('Refine did not improve accuracy:', racc);
            }
          }
        }, (refErr) => { console.warn('High-accuracy refine failed', refErr); }, HIGH_OPTS);
      } catch (e) { console.warn('Background refine exception', e); }

      resolve(userCoordinates);
    }, (lowErr) => {
      console.warn('Quick geolocation failed', lowErr, 'trying high-accuracy directly...');

      // Try high-accuracy directly if quick failed or was unavailable
      navigator.geolocation.getCurrentPosition((posHigh) => {
        cacheLocation(posHigh.coords.latitude, posHigh.coords.longitude, posHigh.coords.accuracy);
        console.log('✓ High-accuracy location obtained:', userCoordinates);
        resolve(userCoordinates);
      }, (highErr) => {
        console.warn('High-accuracy geolocation failed', highErr);
        resolve(null); // give up, allow page to continue
      }, HIGH_OPTS);
    }, LOW_OPTS);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  console.log('=== Browse Page Loaded ===');

  // Initialize modal cache
  modalCache.init();

  // Check authentication
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || 'null');

  if (!token || !user) {
    alert('Please log in first');
    window.location.href = 'login.html';
    return;
  }

  console.log(`✓ User authenticated: ${user.name}`);

  // Get user's current location BEFORE loading donations
  console.log('📍 Requesting user location...');
  await getGeolocation();
  console.log('📍 Location ready. User coordinates:', userCoordinates);

  // Load available donations
  await loadDonations();

  // Setup filter buttons
  setupFilterButtons();

  // Setup location filter toggle button
  setupLocationFilterToggle();

  // Setup location filter mode (nearby vs city)
  setupLocationFilterMode();

  // Setup map toggle button
  setupMapToggle();

  // Setup search input with debouncing
  const searchInput = document.getElementById('searchInput');
  searchInput.addEventListener('input', () => {
    // Clear previous timeout
    clearTimeout(searchTimeout);

    // Show loading indicator while typing
    searchTimeout = setTimeout(() => {
      handleSearch();
    }, 300); // Wait 300ms after user stops typing
  });

  // Setup distance and city filters
  const distanceSelect = document.getElementById('distanceFilter');
  if (distanceSelect) {
    distanceSelect.addEventListener('change', () => {
      selectedDistanceKm = distanceSelect.value;
      applyFiltersAndSearch();
    });
  }

  const cityInput = document.getElementById('cityFilter');
  if (cityInput) {
    cityInput.addEventListener('input', () => {
      selectedCity = cityInput.value.trim();
      applyFiltersAndSearch();
    });
  }

  console.log('=== Browse Page Ready ===');
});

// Load all available donations from server
async function loadDonations(opts = {}) {
  try {
    const token = localStorage.getItem('token');
    console.log('Fetching available donations...');

    // Show loading state
    const loadingEl = document.getElementById('loadingState');
    const gridEl = document.getElementById('donationsGrid');
    const emptyEl = document.getElementById('emptyState');

    loadingEl.classList.remove('hidden');
    gridEl.innerHTML = '';
    emptyEl.classList.add('hidden');

    const startTime = performance.now();
    const cacheKey = 'donations_available';

    // Use cached data (stale-while-revalidate) to speed up UI; fetchJsonWithCache
    // is provided by js/common-utils.js
    const forceNetwork = opts && opts.forceNetwork === true;

    let data;
    const availableUrl = apiUrl('/api/donations/available');
    try {
      if (forceNetwork) {
        const response = await fetch(availableUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          throw new Error(`Network request failed: ${response.status}`);
        }

        data = await response.json();
        try { cacheDelete(cacheKey); } catch (e) { }
      } else {
        data = await fetchJsonWithCache(availableUrl, cacheKey, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }, { ttl: 60 * 1000, background: true });
      }
    } catch (err) {
      console.warn('Network fetch failed for available donations, will fallback to cache if present', err);
      const cached = cacheGet(cacheKey);
      data = cached ? cached.v : null;

      // Retry once by swapping localhost/127.0.0.1 if running locally.
      if (!data) {
        let fallbackUrl = '';
        if (availableUrl.includes('localhost')) {
          fallbackUrl = availableUrl.replace('localhost', '127.0.0.1');
        } else if (availableUrl.includes('127.0.0.1')) {
          fallbackUrl = availableUrl.replace('127.0.0.1', 'localhost');
        }

        if (fallbackUrl) {
          try {
            const retryResponse = await fetch(fallbackUrl, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            });

            if (retryResponse.ok) {
              data = await retryResponse.json();
              try { cacheDelete(cacheKey); } catch (e) { }
            }
          } catch (retryErr) {
            console.warn('Fallback fetch failed for available donations', retryErr);
          }
        }
      }
    }

    const loadTime = performance.now() - startTime;

    if (!data || !Array.isArray(data.donations)) {
      throw new Error('Failed to fetch donations. Please make sure the backend is running.');
    }

    console.log(`✓ Fetched ${data.donations.length} available donations in ${loadTime.toFixed(2)}ms`);
    console.log('Sample donation:', data.donations[0]); // Debug: see what data looks like

    const currentUser = JSON.parse(localStorage.getItem('user') || 'null');
    const currentUserIdRaw = currentUser?._id || currentUser?.id || null;
    const currentUserId = currentUserIdRaw ? String(currentUserIdRaw) : null;
    const currentUserEmail = currentUser?.email ? String(currentUser.email).toLowerCase() : null;

    const originalDonations = data.donations || [];
    const filtered = originalDonations.filter((donation) => {
      const ownerIdRaw = donation?.userId?._id || donation?.userId?.id || donation?.userId || null;
      const ownerId = ownerIdRaw ? String(ownerIdRaw) : null;
      const ownerEmailRaw = donation?.userId?.email || donation?.userEmail || null;
      const ownerEmail = ownerEmailRaw ? String(ownerEmailRaw).toLowerCase() : null;

      if (currentUserId && ownerId && ownerId === currentUserId) return false;
      if (currentUserEmail && ownerEmail && ownerEmail === currentUserEmail) return false;
      return true;
    });
    allDonations = filtered;
    filteredDonations = [...allDonations];

    if (filtered.length !== originalDonations.length) {
      try {
        cacheSet(cacheKey, { ...data, donations: filtered, count: filtered.length });
      } catch (e) { }
    }

    buildLocationOptions();

    // Hide loading, show results
    loadingEl.classList.add('hidden');
    displayDonations(filteredDonations);

  } catch (error) {
    console.error('Error loading donations:', error);
    const loadingEl = document.getElementById('loadingState');
    const gridEl = document.getElementById('donationsGrid');

    loadingEl.classList.add('hidden');
    gridEl.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #999;">
        <i class="fa fa-exclamation-circle" style="font-size: 40px; margin-bottom: 10px;"></i>
        <p>Error loading donations: ${error.message}</p>
      </div>
    `;
  }
}

// Calculate distance between two coordinates using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
}

// Parse numeric available quantity from various formats (e.g. "5", "5 kg", "2.5 plates")
function parseAvailableQuantity(quantity) {
  if (quantity === null || quantity === undefined) return 1;
  if (typeof quantity === 'number') return Math.max(1, Math.floor(quantity));
  const s = String(quantity).trim();
  const m = s.match(/(\d+(?:\.\d+)?)/);
  if (!m) return 1;
  const num = parseFloat(m[1]);
  if (Number.isNaN(num) || num <= 0) return 1;
  return Math.max(1, Math.floor(num));
}

// Get distance text for donation card
function getDistanceText(donation) {
  if (!userCoordinates) {
    console.warn('⚠️ User coordinates not available yet');
    return 'Distance N/A';
  }

  if (!donation.coordinates) {
    console.warn('⚠️ Donation coordinates missing:', donation.food);
    return 'Distance N/A';
  }

  try {
    const distance = calculateDistance(
      userCoordinates.latitude,
      userCoordinates.longitude,
      donation.coordinates.latitude,
      donation.coordinates.longitude
    );

    if (isNaN(distance)) {
      console.warn('⚠️ Invalid distance calculation for:', donation.food);
      return 'Distance N/A';
    }

    return `${distance.toFixed(1)} km away`;
  } catch (err) {
    console.warn('❌ Distance calculation error for', donation.food, ':', err);
    return 'Distance N/A';
  }
}

// Display donations in grid with optimized rendering
function displayDonations(donations) {
  const grid = document.getElementById('donationsGrid');
  const emptyState = document.getElementById('emptyState');

  if (donations.length === 0) {
    grid.style.display = 'none';
    emptyState.classList.remove('hidden');
    return;
  }

  grid.style.display = 'grid';
  emptyState.classList.add('hidden');

  try {
    // Create all cards at once, then insert
    const fragment = document.createDocumentFragment();
    const cards = donations.map(donation => {
      const div = document.createElement('div');
      const cardHTML = createDonationCard(donation);
      div.innerHTML = cardHTML;
      return div.firstElementChild;
    }).filter(card => card !== null); // Filter out any null cards

    cards.forEach(card => fragment.appendChild(card));
    grid.innerHTML = ''; // Clear
    grid.appendChild(fragment);

    console.log(`⚡ Rendered ${donations.length} cards in grid`);
  } catch (error) {
    console.error('Error displaying donations:', error);
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #999;">
        <i class="fa fa-exclamation-circle" style="font-size: 40px; margin-bottom: 10px;"></i>
        <p>Error rendering donations: ${error.message}</p>
      </div>
    `;
  }
}

// Create donation card HTML
function createDonationCard(donation) {
  try {
    const foodIcon = getFoodIcon(donation.foodType);
    const qualityTag = donation.aiAnalysis ? getQualityTag(donation.aiAnalysis) : '';
    const donorName = donation.userId?.name || 'Anonymous';
    const donorLocation = donation.userId?.location || donation.location || 'Unknown';

    // Safe date parsing
    let cookedDate = 'Unknown Date';
    if (donation.cookedTime) {
      try {
        cookedDate = new Date(donation.cookedTime).toLocaleDateString();
      } catch (e) {
        console.warn('Invalid cookedTime:', donation.cookedTime);
        cookedDate = 'Unknown Date';
      }
    }

    return `
    <div class="donation-card">
      <div class="card-image">
        ${donation.images && donation.images.length > 0 ?
        `<img src="${donation.images[0]}" alt="${donation.food}">` :
        `<span>${foodIcon}</span>`
      }
      </div>

      <div class="card-content">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <div class="food-name">${donation.food}</div>
          ${qualityTag}
        </div>

        <div class="food-meta">
          <span class="badge ${donation.foodType.toLowerCase().replace('-', '-')}">
            ${foodIcon} ${donation.foodType}
          </span>
        </div>

        <div class="food-info">
          <div class="info-item">
            <i class="fa fa-weight"></i>
            <span>${donation.quantity}</span>
          </div>
          <div class="info-item">
            <i class="fa fa-calendar"></i>
            <span>${cookedDate}</span>
          </div>
          <div class="info-item">
            <i class="fa fa-map-marker-alt"></i>
            <span>${getDistanceText(donation)}</span>
          </div>
        </div>

        <div class="donor-info">
          <div class="donor-name"><i class="fa fa-user"></i> ${donorName}</div>
          <div class="donor-location"><i class="fa fa-map-marker"></i> ${donorLocation}</div>
        </div>

        ${donation.aiAnalysis?.recommendation ? `
          <p style="font-size: 12px; color: #666; margin-bottom: 10px;">
            <strong>AI Analysis:</strong> ${donation.aiAnalysis.recommendation.substring(0, 80)}...
          </p>
        ` : donation.description ? `
          <p style="font-size: 12px; color: #666; margin-bottom: 10px;">
            <strong>Description:</strong> ${donation.description.substring(0, 80)}...
          </p>
        ` : ''}

        <div class="claim-action">
          ${getClaimButton(donation)}
        </div>
      </div>
    </div>
  `;
  } catch (error) {
    console.error('Error creating donation card:', error, donation);
    return `
      <div class="donation-card" style="opacity: 0.5;">
        <p style="color: red;">Error loading this donation</p>
      </div>
    `;
  }
}

// Get food type emoji
function getFoodIcon(foodType) {
  const icons = {
    'Vegetarian': '',
    'Non-Veg': '',
    'Vegan': ''
  };
  return icons[foodType] || '';
}

// Get claim button based on donation status and user claims
function getClaimButton(donation) {
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (!user) return '';

    // User object can have 'id', '_id', or 'email'
    const userId = user.id || user._id || user.email;
    if (!userId) return '';

    // Check if user has already claimed this donation
    const userClaim = donation.claims?.find(c => {
      try {
        // Claims array uses 'userId' field, not 'claimedBy'
        const claimUserId = typeof c.userId === 'object' ? c.userId?.toString() : String(c.userId);
        return claimUserId === userId;
      } catch (e) {
        return false;
      }
    });

    if (userClaim) {
      const statusColors = {
        'pending': '#ff9800',
        'accepted': '#4caf50',
        'rejected': '#f44336'
      };
      const statusIcons = {
        'pending': 'fa-hourglass-half',
        'accepted': 'fa-check-circle',
        'rejected': 'fa-times-circle'
      };
      const statusText = {
        'pending': 'Pending',
        'accepted': 'Accepted',
        'rejected': 'Rejected'
      };

      return `
        <button class="claim-status-btn" style="background: ${statusColors[userClaim.status]};" disabled>
          <i class="fa ${statusIcons[userClaim.status]}"></i> ${statusText[userClaim.status]}
        </button>
      `;
    }

    // Show claim button if not claimed by anyone
    if (donation.status === 'Available') {
      return `
        <button class="claim-btn" onclick="handleClaimDonation('${donation._id}', '${donation.food.replace(/'/g, "\\'")}')">
          Claim Food
        </button>
      `;
    }

    // Show status for claimed/completed donations
    const statusText = {
      'Claimed': '🔒 Already Claimed',
      'Completed': '✅ Completed',
      'Expired': '⏰ Expired'
    };

    return `
      <button class="claim-btn disabled" style="opacity: 0.6;" disabled>
        ${statusText[donation.status] || donation.status}
      </button>
    `;
  } catch (error) {
    console.error('Error in getClaimButton:', error);
    return '<button class="claim-btn disabled" style="opacity: 0.6;" disabled>--</button>';
  }
}

// Get quality badge for AI analysis (with caching)
const qualityTagCache = {};
function getQualityTag(aiAnalysis) {
  if (!aiAnalysis) return '';

  const cacheKey = `${aiAnalysis.human}_${aiAnalysis.cattle}_${aiAnalysis.fertilizer}`;
  if (qualityTagCache[cacheKey]) return qualityTagCache[cacheKey];

  const human = aiAnalysis.human || 0;
  const cattle = aiAnalysis.cattle || 0;
  const fertilizer = aiAnalysis.fertilizer || 0;

  // Find which category it's most suitable for
  let suitability = '';
  let bgColor = '';

  if (human > cattle && human > fertilizer) {
    suitability = 'Suitable for: Human Consumption';
    bgColor = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
  } else if (cattle > human && cattle > fertilizer) {
    suitability = 'Suitable for: Animal Feed';
    bgColor = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
  } else {
    suitability = 'Suitable for: Fertilizer';
    bgColor = 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)';
  }

  const tag = `<span class="ai-tag" style="background: ${bgColor}; white-space: nowrap; padding: 4px 10px; border-radius: 10px; font-size: 15px; color: white; font-weight: 500;">${suitability}</span>`;

  qualityTagCache[cacheKey] = tag;
  return tag;
}

// Setup filter buttons
function setupFilterButtons() {
  const buttons = document.querySelectorAll('.filter-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      // Remove active from all
      buttons.forEach(b => b.classList.remove('active'));
      // Add active to clicked
      btn.classList.add('active');

      currentFilter = btn.dataset.filter;
      applyFiltersAndSearch();
    });
  });
}

function setupLocationFilterToggle() {
  const toggleBtn = document.getElementById('filterToggleBtn');
  const panel = document.getElementById('locationFilters');
  if (!toggleBtn || !panel) return;

  toggleBtn.addEventListener('click', () => {
    const isCollapsed = panel.classList.contains('collapsed');
    panel.classList.toggle('collapsed');
    toggleBtn.setAttribute('aria-expanded', String(isCollapsed));
  });
}

function setupLocationFilterMode() {
  const radios = document.querySelectorAll('input[name="locationMode"]');
  const distanceWrap = document.getElementById('distanceFilterWrap');
  const cityWrap = document.getElementById('cityFilterWrap');
  if (!radios.length || !distanceWrap || !cityWrap) return;

  const updateMode = (mode) => {
    locationMode = mode;
    if (mode === 'city') {
      distanceWrap.classList.add('hidden');
      cityWrap.classList.remove('hidden');
      selectedDistanceKm = 'all';
    } else {
      cityWrap.classList.add('hidden');
      distanceWrap.classList.remove('hidden');
      selectedCity = '';
      const cityInput = document.getElementById('cityFilter');
      if (cityInput) cityInput.value = '';
    }
    applyFiltersAndSearch();
  };

  radios.forEach(radio => {
    radio.addEventListener('change', () => updateMode(radio.value));
  });
  updateMode(locationMode);
}

// Handle search input with debouncing
function handleSearch() {
  const searchTerm = getSearchTerm();
  applyFiltersAndSearch(searchTerm);
}

// Apply both filters and search with optimized logic
function applyFiltersAndSearch(searchTerm) {
  const startTime = performance.now();
  const resolvedSearch = searchTerm === undefined ? getSearchTerm() : searchTerm;
  const normalizedSearch = String(resolvedSearch || '').toLowerCase().trim();
  const hasCityFilter = locationMode === 'city' && Boolean(selectedCity && selectedCity.trim());
  const hasDistanceFilter = locationMode === 'nearby' && selectedDistanceKm !== 'all';

  // Early exit if search term is empty and filter is 'all'
  if (!normalizedSearch && currentFilter === 'all' && !hasCityFilter && !hasDistanceFilter) {
    filteredDonations = [...allDonations];
    console.log(`⚡ No filters applied - showing all ${allDonations.length} donations`);
    displayDonations(filteredDonations);
    return;
  }

  const searchLower = normalizedSearch;
  const cityLower = (selectedCity || '').toLowerCase().trim();
  const distanceLimit = hasDistanceFilter ? parseFloat(selectedDistanceKm) : null;

  // Pre-compile filter function for reuse
  const filterFunc = (donation) => {
    // Filter by type first (faster check)
    if (currentFilter !== 'all' && donation.foodType !== currentFilter) {
      return false;
    }

    // Filter by city/town if provided
    if (locationMode === 'city' && cityLower) {
      const locText = `${donation.location || ''} ${donation.userId?.location || ''}`.toLowerCase();
      if (!locText.includes(cityLower)) return false;
    }

    // Filter by distance if selected
    if (locationMode === 'nearby' && distanceLimit !== null) {
      const distanceKm = getDonationDistanceKm(donation);
      if (distanceKm === null || distanceKm > distanceLimit) return false;
    }

    // If no search term, we're done
    if (!searchLower) return true;

    // Search across multiple fields with early exit
    const food = donation.food?.toLowerCase() || '';
    if (food.includes(searchLower)) return true;

    const location = donation.location?.toLowerCase() || '';
    if (location.includes(searchLower)) return true;

    const description = donation.description?.toLowerCase() || '';
    if (description.includes(searchLower)) return true;

    const donor = donation.userId?.name?.toLowerCase() || '';
    if (donor.includes(searchLower)) return true;

    return false;
  };

  filteredDonations = allDonations.filter(filterFunc);

  const filterTime = performance.now() - startTime;
  console.log(`⚡ Filtered ${currentFilter !== 'all' ? `by ${currentFilter}` : ''} ${searchLower ? `+ search "${searchLower}"` : ''} → ${filteredDonations.length}/${allDonations.length} donations in ${filterTime.toFixed(2)}ms`);
  displayDonations(filteredDonations);
}

// Build location options from available donations
function buildLocationOptions() {
  const datalist = document.getElementById('cityOptions');
  if (!datalist) return;

  const unique = new Set();
  allDonations.forEach(donation => {
    const loc = (donation.location || donation.userId?.location || '').trim();
    if (loc) unique.add(loc);
  });

  datalist.innerHTML = '';
  Array.from(unique).sort().forEach(loc => {
    const opt = document.createElement('option');
    opt.value = loc;
    datalist.appendChild(opt);
  });
}

// Get numeric distance for a donation (km)
function getDonationDistanceKm(donation) {
  if (!userCoordinates || !donation.coordinates) return null;
  const lat = donation.coordinates.latitude;
  const lon = donation.coordinates.longitude;
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  const distance = calculateDistance(userCoordinates.latitude, userCoordinates.longitude, lat, lon);
  return isNaN(distance) ? null : distance;
}

function getSearchTerm() {
  const input = document.getElementById('searchInput');
  return input ? input.value.toLowerCase().trim() : '';
}

// Cache DOM elements for better performance
const modalCache = {
  modal: null,
  form: null,
  details: null,

  init() {
    this.modal = document.getElementById('claimModal');
    this.form = document.getElementById('claimForm');
    this.details = document.getElementById('claimDetails');
  },

  show() {
    if (!this.modal) return;
    this.modal.classList.remove('hidden');
    this.modal.style.display = 'flex';
  },

  hide() {
    if (!this.modal) return;
    this.modal.classList.add('hidden');
    this.modal.style.display = 'none';
  }
};

// Handle claim food button
async function handleClaimDonation(donationId, foodName) {
  selectedDonation = {
    id: donationId,
    food: foodName
  };

  // Populate donation details in modal - with sanitization
  const sanitizedFood = String(foodName).replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Find donation object to determine available quantity
  let availableQty = 1;
  try {
    const donation = allDonations.find(d => String(d._id) === String(donationId) || d._id === donationId);
    if (donation && donation.quantity !== undefined) {
      availableQty = parseAvailableQuantity(donation.quantity);
    }
  } catch (err) {
    console.warn('Could not determine available quantity for donation:', donationId, err);
  }

  if (modalCache.details) {
    modalCache.details.innerHTML = `
      <div style="font-weight: 600; font-size: 14px; margin-bottom: 8px;">
        🍽️ <strong>${sanitizedFood}</strong>
      </div>
      <div style="font-size: 13px; color: #666; margin-bottom: 12px;">
        Are you sure you want to claim this food? The donor will receive a notification about your request.
      </div>
      <div style="font-size: 13px; color: #444; margin-bottom: 6px;">
        <strong>Available quantity:</strong> ${availableQty}
      </div>
    `;
  }

  // Set up beneficiaries input with max enforced and inline warning
  const beneficiariesInput = document.getElementById('claimBeneficiaries');
  if (beneficiariesInput) {
    beneficiariesInput.min = 1;
    beneficiariesInput.max = availableQty;
    if (!beneficiariesInput.value) beneficiariesInput.value = 1;

    // Create or reuse inline warning element
    let warnEl = document.getElementById('claimQuantityWarning');
    if (!warnEl) {
      warnEl = document.createElement('div');
      warnEl.id = 'claimQuantityWarning';
      warnEl.style.color = '#b71c1c';
      warnEl.style.fontSize = '13px';
      warnEl.style.marginTop = '6px';
      beneficiariesInput.parentNode.appendChild(warnEl);
    }
    warnEl.textContent = '';

    // Attach input handler to enforce max and show warning
    beneficiariesInput.oninput = () => {
      const val = parseInt(beneficiariesInput.value) || 0;
      if (val > availableQty) {
        beneficiariesInput.value = availableQty;
        warnEl.textContent = `Quantity exceeded — reduced to maximum available (${availableQty}).`;
      } else {
        warnEl.textContent = '';
      }
    };
  }

  // Show modal
  modalCache.show();

  console.log(`Claim modal opened for donation: ${donationId}`);
}

// Close modal
function closeModal() {
  modalCache.hide();
  selectedDonation = null;
}

// Setup map toggle and initialization
let donationMap = null;
let mapMarkers = [];

function setupMapToggle() {
  const toggleBtn = document.getElementById('mapToggleBtn');
  const mapDiv = document.getElementById('foodDonationsMap');

  if (!toggleBtn || !mapDiv) return;

  toggleBtn.addEventListener('click', () => {
    if (mapDiv.style.display === 'none') {
      mapDiv.style.display = 'block';
      toggleBtn.textContent = 'Hide Map';

      // Initialize map if not already done
      if (!donationMap) {
        initializeDonationMap();
      } else {
        // Refresh map bounds if already initialized
        donationMap.invalidateSize();
        updateMapMarkers();
      }
    } else {
      mapDiv.style.display = 'none';
      toggleBtn.textContent = 'Show Map';
    }
  });
}

// Initialize Leaflet map with donations
function initializeDonationMap() {
  const mapDiv = document.getElementById('foodDonationsMap');
  if (!mapDiv || donationMap) return;

  // Get default center (user location or default coordinates)
  const centerLat = userCoordinates?.latitude || 28.6139; // Default: Delhi
  const centerLng = userCoordinates?.longitude || 77.2090;

  // Create map
  donationMap = L.map('foodDonationsMap').setView([centerLat, centerLng], 12);

  // Add tile layer (OpenStreetMap)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(donationMap);

  // Add user location marker
  if (userCoordinates) {
    L.circleMarker([centerLat, centerLng], {
      radius: 8,
      fillColor: '#007bff',
      color: '#0056b3',
      weight: 3,
      opacity: 0.8,
      fillOpacity: 0.8,
      title: 'Your Location'
    }).addTo(donationMap).bindPopup('Your Location');
  }

  // Add donation markers
  updateMapMarkers();
}

// Update map markers based on filtered donations
function updateMapMarkers() {
  if (!donationMap) return;

  // Remove existing donation markers
  mapMarkers.forEach(marker => {
    donationMap.removeLayer(marker);
  });
  mapMarkers = [];

  // Add markers for each donation
  filteredDonations.forEach(donation => {
    if (!donation.coordinates || !donation.coordinates.latitude) return;

    const { latitude, longitude } = donation.coordinates;
    const suitability = getQualityTag(donation.aiAnalysis, donation.cookedTime);

    // Color code by category
    let markerColor = '#4CAF50'; // Default: green (human consumption)
    if (suitability.includes('Animal Feed')) {
      markerColor = '#FF9800'; // Orange
    } else if (suitability.includes('Fertilizer')) {
      markerColor = '#2196F3'; // Blue
    }

    const marker = L.circleMarker([latitude, longitude], {
      radius: 10,
      fillColor: markerColor,
      color: '#333',
      weight: 2,
      opacity: 0.8,
      fillOpacity: 0.7,
      title: donation.food
    }).addTo(donationMap);

    // Create popup content
    const popupContent = `
      <div style="min-width: 180px; font-size: 12px;">
        <strong>${donation.food}</strong><br>
        ${suitability}<br>
        Qty: ${donation.quantity}<br>
        <small style="color: #666;">${(donation.coordinates.latitude.toFixed(4))}, ${(donation.coordinates.longitude.toFixed(4))}</small>
      </div>
    `;

    marker.bindPopup(popupContent);
    mapMarkers.push(marker);
  });

  // Auto-zoom to fit all markers
  if (mapMarkers.length > 0) {
    const group = new L.featureGroup(mapMarkers);
    donationMap.fitBounds(group.getBounds().pad(0.1));
  }
}

// Override displayDonations to also update map
const originalDisplayDonations = displayDonations;
displayDonations = function (donations) {
  originalDisplayDonations.call(this, donations);

  // Update map markers if map is visible
  const mapDiv = document.getElementById('foodDonationsMap');
  if (mapDiv && mapDiv.style.display !== 'none') {
    updateMapMarkers();
  }
};

// Handle claim form submission
document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'claimForm') return;

  e.preventDefault();

  if (!selectedDonation) {
    alert('No donation selected');
    return;
  }

  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user'));

  try {
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Submitting Request...';

    // Collect form data
    const claimData = {
      purpose: document.getElementById('claimPurpose').value,
      beneficiaries: parseInt(document.getElementById('claimBeneficiaries').value),
      address: document.getElementById('claimAddress').value,
      preferredPickupTime: document.getElementById('claimPickupTime').value || null,
      notes: document.getElementById('claimNotes').value
    };

    // Ensure beneficiaries do not exceed available quantity (defensive check)
    try {
      const donation = allDonations.find(d => String(d._id) === String(selectedDonation.id));
      const availableQty = donation && donation.quantity !== undefined ? parseAvailableQuantity(donation.quantity) : 1;
      if (claimData.beneficiaries > availableQty) {
        claimData.beneficiaries = availableQty;
        alert(`Requested quantity exceeded available amount — reduced to ${availableQty}.`);
      }
    } catch (err) {
      console.warn('Could not validate beneficiaries vs available quantity:', err);
    }

    const response = await fetch(apiUrl(`/api/donations/${selectedDonation.id}/claim`), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(claimData)
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('[CLAIM-SUBMIT] Error response:', errorData);
      throw new Error(errorData.message || 'Failed to submit claim request');
    }

    const data = await response.json();

    // Show server-side warning if present (server may adjust beneficiaries)
    if (data.warning) {
      alert(data.warning);
    }

    applyLocalClaimUpdate(selectedDonation.id, data.claim, claimData, user);

    alert(`Claim Request Submitted!\n\nFood: ${selectedDonation.food}\nBeneficiaries: ${claimData.beneficiaries}\nPurpose: ${claimData.purpose}\n\nThe donor will review your request shortly.`);
    closeModal();

    // Invalidate donation caches so reload pulls fresh data, then reload donations
    try {
      clearCachePrefix('donations_');
    } catch (e) { console.warn('Failed to clear donation caches', e); }
    try {
      await loadDonations({ forceNetwork: true });
    } catch (reloadError) {
      // Don't throw - reload is not critical
    }

  } catch (error) {
    console.error('Error submitting claim request:', error);
    alert(`❌ Error: ${error.message}`);
  } finally {
    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fa fa-check"></i> Submit Claim Request';
    }
  }
});

function applyLocalClaimUpdate(donationId, claimFromServer, claimPayload, user) {
  try {
    if (!donationId) return;

    const userIdRaw = user?.id || user?._id || user?.email || null;
    const userId = userIdRaw ? String(userIdRaw) : null;
    const normalizedClaim = {
      status: 'pending',
      userId: claimFromServer?.userId || userId,
      userName: claimFromServer?.userName || user?.name || 'Anonymous',
      userEmail: claimFromServer?.userEmail || user?.email || '',
      userPhone: claimFromServer?.userPhone || user?.phone || '',
      purpose: claimFromServer?.purpose || claimPayload?.purpose || '',
      beneficiaries: claimFromServer?.beneficiaries || claimPayload?.beneficiaries || 0,
      notes: claimFromServer?.notes || claimPayload?.notes || '',
      address: claimFromServer?.address || claimPayload?.address || '',
      preferredPickupTime: claimFromServer?.preferredPickupTime || claimPayload?.preferredPickupTime || '',
      claimedAt: claimFromServer?.claimedAt || new Date().toISOString()
    };

    const idx = allDonations.findIndex(d => String(d._id) === String(donationId));
    if (idx === -1) return;

    const donation = allDonations[idx];
    const existingClaims = Array.isArray(donation.claims) ? donation.claims : [];
    const filteredClaims = existingClaims.filter(c => String(c.userId) !== String(normalizedClaim.userId));
    filteredClaims.push(normalizedClaim);

    allDonations[idx] = { ...donation, claims: filteredClaims };
    applyFiltersAndSearch(getSearchTerm());

    try {
      cacheSet('donations_available', { donations: allDonations, count: allDonations.length });
    } catch (e) { }
  } catch (err) {
    console.warn('applyLocalClaimUpdate failed', err);
  }
}

// Close modal when clicking outside
document.addEventListener('click', (e) => {
  const modal = document.getElementById('claimModal');
  if (e.target === modal) {
    closeModal();
  }
});

// ===== CLAIM LOCATION FUNCTIONALITY =====
// Leaflet map instance for claim location
let claimLocationMap = null;
let claimLocationMarker = null;

// Handle "Use Current Location" button for claim form
document.addEventListener('DOMContentLoaded', () => {
  const claimLocationBtn = document.getElementById('claimCurrentLocationBtn');

  if (claimLocationBtn) {
    claimLocationBtn.addEventListener('click', async (e) => {
      e.preventDefault();

      const addressField = document.getElementById('claimAddress');
      const statusEl = document.getElementById('claimLocationStatus');
      const mapDiv = document.getElementById('claimLocationMap');
      const btn = claimLocationBtn;

      if (!navigator.geolocation) {
        alert('Geolocation is not supported by your browser');
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Getting location...';
      statusEl.textContent = 'Attempting quick location...';

      // Helper to show coords on the map and create draggable marker
      function showOnMap(lat, lon, accuracy) {
        window.claimCoordinates = { latitude: lat, longitude: lon };

        try {
          // Make the container visible before Leaflet measures it.
          mapDiv.style.display = 'block';

          if (!claimLocationMap) {
            claimLocationMap = L.map('claimLocationMap').setView([lat, lon], 18);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
              attribution: '© OpenStreetMap contributors',
              maxZoom: 19
            }).addTo(claimLocationMap);
          } else {
            claimLocationMap.setView([lat, lon], 18);
          }

          // Remove previous circles and marker
          claimLocationMap.eachLayer(layer => {
            if (layer instanceof L.Circle) claimLocationMap.removeLayer(layer);
          });
          if (claimLocationMarker) {
            try { claimLocationMap.removeLayer(claimLocationMarker); } catch (e) { }
          }

          const accuracyCircle = L.circle([lat, lon], {
            radius: accuracy || 50,
            color: '#007bff',
            fill: true,
            fillColor: '#007bff',
            fillOpacity: 0.1,
            weight: 2,
            dashArray: '5, 5'
          }).addTo(claimLocationMap);

          claimLocationMarker = L.marker([lat, lon], { draggable: true, title: 'Drag to adjust location' }).addTo(claimLocationMap);

          claimLocationMarker.on('dragend', function () {
            const latLng = claimLocationMarker.getLatLng();
            window.claimCoordinates = { latitude: latLng.lat, longitude: latLng.lng };
            // Remove previous accuracy circles
            claimLocationMap.eachLayer(layer => {
              if (layer instanceof L.Circle && layer !== claimLocationMarker) {
                claimLocationMap.removeLayer(layer);
              }
            });
            updateClaimLocationAddress(latLng.lat, latLng.lng);
          });

          // Force Leaflet to recalculate layout after the modal/container is shown.
          setTimeout(() => {
            try {
              if (claimLocationMap) {
                claimLocationMap.invalidateSize(true);
              }
            } catch (e) { }
          }, 0);
        } catch (err) {
          console.warn('Map update failed:', err);
        }
      }

      // Utility: run a promise with timeout
      function withTimeout(promise, ms) {
        return Promise.race([
          promise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
        ]);
      }

      // Use cached recent location if present (ten minutes)
      try {
        const cached = JSON.parse(localStorage.getItem('lastKnownLocation') || 'null');
        if (cached && cached.ts && (Date.now() - cached.ts) < 10 * 60 * 1000) {
          showOnMap(cached.latitude, cached.longitude, cached.accuracy || 500);
          // Attempt reverse geocoding but don't block UI
          updateClaimLocationAddress(cached.latitude, cached.longitude).catch(() => { });
          statusEl.textContent = 'Using recent location (approx). Refining in background...';
        }
      } catch (e) {
        console.warn('Failed to read cached location', e);
      }

      // Quick coarse attempt (fast, low power) then refine in background
      const quickOpts = { enableHighAccuracy: false, timeout: 3000, maximumAge: 60 * 1000 };
      const refineOpts = { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 };

      let didQuick = false;

      navigator.geolocation.getCurrentPosition(async (posQuick) => {
        didQuick = true;
        const { latitude, longitude, accuracy } = posQuick.coords;
        showOnMap(latitude, longitude, accuracy);
        statusEl.textContent = `Quick location found (Accuracy: ${Math.round(accuracy || 0)}m). Refining...`;

        // Start reverse geocoding but don't block refinement
        withTimeout(updateClaimLocationAddress(latitude, longitude), 3500).catch(() => { });

        // Start refine in background
        navigator.geolocation.getCurrentPosition(async (posRefine) => {
          const { latitude: rlat, longitude: rlon, accuracy: racc } = posRefine.coords;
          showOnMap(rlat, rlon, racc);
          statusEl.textContent = `Location obtained (Accuracy: ${Math.round(racc || 0)}m). You can drag the marker to adjust.`;
          try { await updateClaimLocationAddress(rlat, rlon); } catch (e) { }
          try {
            localStorage.setItem('lastKnownLocation', JSON.stringify({ latitude: rlat, longitude: rlon, accuracy: racc || 0, ts: Date.now() }));
          } catch (e) { }
          btn.disabled = false;
          btn.textContent = 'Use Current Location';
        }, async (refineErr) => {
          console.warn('High-accuracy refine failed', refineErr);
          // If refine fails but quick exists, accept quick and leave it
          if (didQuick) {
            statusEl.textContent = 'Using approximate location. You can drag the marker to adjust.';
          }
          // Fallback to IP-based approximate location if neither quick nor refine worked
          btn.disabled = false;
          btn.textContent = 'Use Current Location';
        }, refineOpts);

      }, async (quickErr) => {
        console.warn('Quick geolocation failed', quickErr);
        statusEl.textContent = 'Quick location failed; attempting high-accuracy (may take longer)...';

        // Try high-accuracy directly
        navigator.geolocation.getCurrentPosition(async (posRefine) => {
          const { latitude, longitude, accuracy } = posRefine.coords;
          showOnMap(latitude, longitude, accuracy);
          statusEl.textContent = `Location obtained (Accuracy: ${Math.round(accuracy || 0)}m). You can drag the marker to adjust.`;
          try { await updateClaimLocationAddress(latitude, longitude); } catch (e) { }
          try { localStorage.setItem('lastKnownLocation', JSON.stringify({ latitude, longitude, accuracy: accuracy || 0, ts: Date.now() })); } catch (e) { }
          btn.disabled = false;
          btn.textContent = 'Use Current Location';
        }, async (highErr) => {
          console.warn('High-accuracy geolocation failed', highErr);
          statusEl.textContent = 'Unable to get device location quickly. Falling back to approximate IP location.';

          // Fallback: IP-based geolocation (coarse) — non-blocking and optional
          try {
            const resp = await fetch('https://ipapi.co/json/');
            if (resp.ok) {
              const ipdata = await resp.json();
              if (ipdata && ipdata.latitude && ipdata.longitude) {
                const lat = parseFloat(ipdata.latitude);
                const lon = parseFloat(ipdata.longitude);
                showOnMap(lat, lon, 1000);
                statusEl.textContent = 'Approximate location determined from IP address. You can adjust the marker if needed.';
                try { await updateClaimLocationAddress(lat, lon); } catch (e) { }
                try { localStorage.setItem('lastKnownLocation', JSON.stringify({ latitude: lat, longitude: lon, accuracy: 1000, ts: Date.now() })); } catch (e) { }
              } else {
                throw new Error('IP lookup returned no coordinates');
              }
            } else {
              throw new Error('IP lookup failed');
            }
          } catch (ipErr) {
            console.warn('IP geolocation fallback failed', ipErr);
            statusEl.textContent = 'Failed to determine location. Please enter address manually.';
            alert('Unable to obtain your location automatically. Please enter address manually or try again later.');
          } finally {
            btn.disabled = false;
            btn.textContent = 'Use Current Location';
          }

        }, refineOpts);

      }, quickOpts);

    });
  }
});

// Helper function to update address from coordinates for claim form
async function updateClaimLocationAddress(latitude, longitude) {
  const addressField = document.getElementById('claimAddress');
  const statusEl = document.getElementById('claimLocationStatus');

  console.log(`🔍 Geocoding coordinates for claim: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);

  try {
    // Use BigDataCloud first because it is CORS-friendly in the browser.
    console.log('🔁 Trying BigDataCloud reverse geocode first...');
    const bigUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`;
    let bigData = null;
    try {
      const bigResp = await fetch(bigUrl);
      if (bigResp.ok) {
        bigData = await bigResp.json();
      } else {
        console.warn('BigDataCloud response not OK:', bigResp.status);
      }
    } catch (berr) {
      console.warn('BigDataCloud lookup failed:', berr);
    }

    if (bigData) {
      const bigParts = [];
      if (bigData.locality) bigParts.push(bigData.locality);
      if (bigData.principalSubdivision) bigParts.push(bigData.principalSubdivision);
      if (bigData.countryName) bigParts.push(bigData.countryName);
      if (bigParts.length > 0) {
        const full = bigParts.join(', ');
        console.log('✅ BigDataCloud address:', full);
        addressField.value = full;
        statusEl.textContent = '✓ Address loaded (approx)';
        return;
      }
    }

    // Fallback: OpenStreetMap Nominatim if BigDataCloud did not return a usable address.
    console.log('📍 Trying OpenStreetMap Nominatim reverse geocode...');
    const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1&accept-language=en`;
    let nominatimData = null;
    try {
      const nominatimResponse = await fetch(nominatimUrl);
      if (nominatimResponse.ok) {
        nominatimData = await nominatimResponse.json();
      } else {
        console.warn('Nominatim response not OK:', nominatimResponse.status);
      }
    } catch (nerr) {
      console.warn('Nominatim fetch failed:', nerr);
    }

    if (nominatimData) {
      const addr = nominatimData.address || {};
      const parts = [];
      if (addr.house_number) parts.push(addr.house_number);
      if (addr.road && !addr.road.toLowerCase().includes('expressway') && !addr.road.toLowerCase().includes('highway')) parts.push(addr.road);
      if (addr.amenity) parts.push(addr.amenity);
      else if (addr.building) parts.push(addr.building);
      if (addr.village) parts.push(addr.village);
      else if (addr.town) parts.push(addr.town);
      else if (addr.suburb) parts.push(addr.suburb);
      else if (addr.neighbourhood) parts.push(addr.neighbourhood);
      if (addr.city) parts.push(addr.city);
      else if (addr.county) parts.push(addr.county);
      if (addr.state) parts.push(addr.state);
      if (addr.postcode) parts.push(addr.postcode);

      if (parts.length > 0) {
        const fullAddress = parts.join(', ');
        console.log('✅ Nominatim address parts:', fullAddress);
        addressField.value = fullAddress;
        statusEl.textContent = '✓ Address loaded from your location';
        return;
      }

      if (nominatimData.display_name) {
        console.log('✅ Nominatim display_name:', nominatimData.display_name);
        addressField.value = nominatimData.display_name;
        statusEl.textContent = '✓ Address loaded from your location';
        return;
      }
    }

    console.warn('⚠️ All reverse geocoding attempts failed. Using coordinates as fallback.');
    addressField.value = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
    statusEl.textContent = '⚠️ Using coordinates as fallback';

  } catch (err) {
    console.error('❌ Geocoding error:', err);
    // Fallback to coordinates
    addressField.value = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
    statusEl.textContent = '⚠️ Using coordinates as fallback';
  }

  addressField.focus();
  addressField.dispatchEvent(new Event('input', { bubbles: true }));
}

