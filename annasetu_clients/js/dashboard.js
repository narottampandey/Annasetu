// Dashboard Protection and User Display
let userCoordinates = null; // Store user's location for distance calculation

// Promise to wait for geolocation
function getGeolocation() {
  return new Promise((resolve) => {
    const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
    const LOW_OPTS = { enableHighAccuracy: false, timeout: 2500, maximumAge: 60 * 1000 };
    const HIGH_OPTS = { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 };

    // Use cached location quickly if available
    try {
      const cached = JSON.parse(localStorage.getItem('lastKnownLocation') || 'null');
      if (cached && cached.ts && (Date.now() - cached.ts) < CACHE_TTL) {
        userCoordinates = { latitude: cached.latitude, longitude: cached.longitude, accuracy: cached.accuracy || null };
        console.log('✓ Using cached location (dashboard):', userCoordinates);

        // Background refine
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
                  console.log('✓ Dashboard background refined location:', userCoordinates);
                }
              }, (err) => { console.warn('Dashboard background refine failed', err); }, HIGH_OPTS);
            } catch (e) { console.warn('Dashboard background refine exception', e); }
          }, 0);
        }

        resolve(userCoordinates);
        return;
      }
    } catch (e) { /* ignore parse errors */ }

    if (!navigator.geolocation) {
      console.warn('⚠️ Geolocation not supported');
      resolve(null);
      return;
    }

    // Quick low-accuracy attempt then refine
    navigator.geolocation.getCurrentPosition((posLow) => {
      userCoordinates = { latitude: posLow.coords.latitude, longitude: posLow.coords.longitude, accuracy: posLow.coords.accuracy || null };
      try { localStorage.setItem('lastKnownLocation', JSON.stringify({ latitude: posLow.coords.latitude, longitude: posLow.coords.longitude, accuracy: posLow.coords.accuracy || 0, ts: Date.now() })); } catch (e) { }
      console.log('✓ Quick location obtained (dashboard):', userCoordinates);

      // Background refine
      try {
        navigator.geolocation.getCurrentPosition((posRefine) => {
          if (posRefine && posRefine.coords) {
            const rlat = posRefine.coords.latitude;
            const rlon = posRefine.coords.longitude;
            const racc = posRefine.coords.accuracy;
            if (!userCoordinates.accuracy || (racc && racc < userCoordinates.accuracy - 5)) {
              userCoordinates = { latitude: rlat, longitude: rlon, accuracy: racc };
              try { localStorage.setItem('lastKnownLocation', JSON.stringify({ latitude: rlat, longitude: rlon, accuracy: racc || 0, ts: Date.now() })); } catch (e) { }
              console.log('✓ Refined location obtained (dashboard):', userCoordinates);
            }
          }
        }, (refErr) => { console.warn('Dashboard refine failed', refErr); }, HIGH_OPTS);
      } catch (e) { console.warn('Dashboard background refine exception', e); }

      resolve(userCoordinates);
    }, (lowErr) => {
      console.warn('Dashboard quick geolocation failed', lowErr, 'trying high-accuracy directly...');
      navigator.geolocation.getCurrentPosition((posHigh) => {
        userCoordinates = { latitude: posHigh.coords.latitude, longitude: posHigh.coords.longitude, accuracy: posHigh.coords.accuracy || null };
        try { localStorage.setItem('lastKnownLocation', JSON.stringify({ latitude: posHigh.coords.latitude, longitude: posHigh.coords.longitude, accuracy: posHigh.coords.accuracy || 0, ts: Date.now() })); } catch (e) { }
        console.log('✓ High-accuracy location obtained (dashboard):', userCoordinates);
        resolve(userCoordinates);
      }, (highErr) => {
        console.warn('High-accuracy geolocation failed (dashboard)', highErr);
        resolve(null);
      }, HIGH_OPTS);
    }, LOW_OPTS);
  });
}

let selectedDonation = null;
let availableDonationsCache = [];
let currentAuthToken = null;

// Cache DOM elements for the claim modal
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

function getFoodDietaryIcon(foodType) {
  const type = String(foodType || '').toLowerCase();
  if (type.includes('non')) return 'fa-drumstick-bite';
  if (type.includes('vegan')) return 'fa-seedling';
  return 'fa-leaf';
}

let currentReceiverSearch = '';
window.searchReceiverTable = function(query) {
  currentReceiverSearch = String(query || '').toLowerCase().trim();
  renderReceiverSection(availableDonationsCache);
};

function renderReceiverSection(availableList) {
  if (Array.isArray(availableList)) {
    availableDonationsCache = availableList;
  }

  const receiverTable = document.querySelector('#receiverSection table');
  if (!receiverTable) return;

  const rows = receiverTable.querySelectorAll('tr');
  rows.forEach((r, i) => { if (i > 0) r.remove(); });

  let list = availableDonationsCache || [];
  if (currentReceiverSearch) {
    list = list.filter(d => 
      (d.food || d.foodName || '').toLowerCase().includes(currentReceiverSearch) ||
      (d.foodType || '').toLowerCase().includes(currentReceiverSearch) ||
      (d.location || '').toLowerCase().includes(currentReceiverSearch)
    );
  }

  if (!list.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td colspan="4" style="text-align: center; padding: 42px 20px;">
        <i class="fa fa-map-location-dot" style="font-size: 36px; color: #cbd5e1; margin-bottom: 12px; display: block;"></i>
        <p style="font-size: 14px; font-weight: 700; color: #475569; margin: 0 0 4px;">No nearby surplus food listings right now</p>
        <p style="font-size: 12.5px; color: #94a3b8; margin: 0 0 14px;">Check back shortly or explore listings on the interactive map</p>
        <button onclick="location.href='browse.html'" class="btn-secondary" style="margin: 0 auto;">
          <i class="fa fa-compass"></i> Explore Map
        </button>
      </td>
    `;
    receiverTable.appendChild(tr);
    return;
  }

  list.forEach(d => {
    const tr = document.createElement('tr');

    // Calculate distance if location available
    let distance = 'N/A';
    if (userCoordinates && d.coordinates) {
      try {
        const dist = calculateDistance(
          userCoordinates.latitude,
          userCoordinates.longitude,
          d.coordinates.latitude,
          d.coordinates.longitude
        );
        distance = getFormattedDistance(dist);
      } catch (err) {
        distance = 'N/A';
      }
    }

    const foodName = d.food || d.foodName || 'Food Item';
    const foodType = d.foodType || 'Vegetarian';
    const foodTypeClass = foodType.toLowerCase().replace(/[^a-z0-9]/g, '');
    const locationSnippet = d.location ? d.location.split(',')[0] : '';
    const dietIcon = getFoodDietaryIcon(foodType);

    tr.innerHTML = `
      <td>
        <div class="food-cell">
          <div class="food-icon-circle ${foodTypeClass}">
            <i class="fa ${dietIcon}"></i>
          </div>
          <div class="food-info-wrap">
            <span class="food-name-title">${foodName}</span>
            <div class="food-tags">
              <span class="food-type-pill ${foodTypeClass}">${foodType}</span>
              ${locationSnippet ? `<span class="food-time-pill"><i class="fa fa-location-dot"></i> ${locationSnippet}</span>` : ''}
            </div>
          </div>
        </div>
      </td>
      <td>
        <div class="qty-pill">
          <i class="fa fa-boxes-stacked"></i>
          <span>${d.quantity || d.qty || '-'}</span>
        </div>
      </td>
      <td>
        <div class="dist-pill">
          <i class="fa fa-location-arrow"></i>
          <span>${distance}</span>
        </div>
      </td>
      <td>
        <button class="btn-request" onclick="handleClaimDonation('${d._id}', '${foodName.replace(/'/g, "\\'")}')">
          <i class="fa fa-hand-holding-heart"></i> Request Food
        </button>
      </td>
    `;
    receiverTable.appendChild(tr);
  });
}

async function fetchAvailableDonations(token) {
  if (!token) return [];

  try {
    const body2 = await fetchJsonWithCache(
      apiUrl('/api/donations/available?includeMine=1'),
      'donations_available',
      { headers: { Authorization: `Bearer ${token}` } },
      { ttl: 60 * 1000, background: true }
    );
    return (body2 && body2.donations) || [];
  } catch (err) {
    console.warn('Backend available donations unavailable, will fallback to localStorage', err);
    return [];
  }
}

// Handle claim food button
function handleClaimDonation(donationId, foodName) {
  selectedDonation = {
    id: donationId,
    food: foodName
  };

  if (!modalCache.modal) {
    modalCache.init();
  }

  // Populate donation details in modal - with sanitization
  const sanitizedFood = String(foodName).replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Find donation object to determine available quantity
  let availableQty = 1;
  try {
    const donation = availableDonationsCache.find(d => String(d._id) === String(donationId) || d._id === donationId);
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

// Claim location map helpers
let claimLocationMap = null;
let claimLocationMarker = null;

function setupClaimLocationButton() {
  const claimLocationBtn = document.getElementById('claimCurrentLocationBtn');
  if (!claimLocationBtn) return;

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
    if (statusEl) statusEl.textContent = 'Attempting quick location...';

    function showOnMap(lat, lon, accuracy) {
      window.claimCoordinates = { latitude: lat, longitude: lon };

      if (mapDiv) mapDiv.style.display = 'block';

      if (typeof L !== 'undefined') {
        try {
          if (!claimLocationMap) {
            claimLocationMap = L.map('claimLocationMap').setView([lat, lon], 18);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
              attribution: '© OpenStreetMap contributors',
              maxZoom: 19
            }).addTo(claimLocationMap);
          } else {
            claimLocationMap.setView([lat, lon], 18);
          }

          claimLocationMap.eachLayer(layer => {
            if (layer instanceof L.Circle) claimLocationMap.removeLayer(layer);
          });

          if (claimLocationMarker) {
            try { claimLocationMap.removeLayer(claimLocationMarker); } catch (err) { }
          }

          L.circle([lat, lon], {
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
            if (addressField) {
              addressField.value = `Lat: ${latLng.lat.toFixed(6)}, Lng: ${latLng.lng.toFixed(6)}`;
            }
          });

        } catch (err) {
          console.warn('Failed to render claim location map', err);
        }
      }

      if (addressField) {
        addressField.value = `Lat: ${lat.toFixed(6)}, Lng: ${lon.toFixed(6)}`;
      }

      if (statusEl) statusEl.textContent = accuracy ? `Accuracy: ${Math.round(accuracy)}m` : 'Location detected';
      btn.disabled = false;
      btn.textContent = 'Get Current Location';
    }

    navigator.geolocation.getCurrentPosition((pos) => {
      showOnMap(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
    }, (err) => {
      console.warn('Geolocation failed', err);
      if (statusEl) statusEl.textContent = 'Unable to get your location. Please enter address manually.';
      btn.disabled = false;
      btn.textContent = 'Get Current Location';
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  console.log('=== Dashboard Page Loaded ===');

  // Persist token from URL (Google OAuth) if present
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    const urlUserId = urlParams.get('userId');
    const urlUserName = urlParams.get('userName');
    const urlUserEmail = urlParams.get('userEmail');

    if (urlToken && urlUserId) {
      localStorage.setItem('token', urlToken);
      localStorage.setItem('user', JSON.stringify({ id: urlUserId, name: decodeURIComponent(urlUserName || ''), email: decodeURIComponent(urlUserEmail || '') }));
      window.history.replaceState({}, document.title, '/dashboard.html');
      console.log('Stored token from URL');
      // Try to capture a quick device location (non-blocking) so subsequent pages don't wait
      try {
        if (navigator.geolocation) {
          (async () => {
            try {
              const loc = await new Promise((resolve) => {
                let done = false;
                const timer = setTimeout(() => { if (!done) { done = true; resolve(null); } }, 900);
                navigator.geolocation.getCurrentPosition((pos) => {
                  if (done) return;
                  done = true;
                  clearTimeout(timer);
                  resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy || null, ts: Date.now() });
                }, (err) => {
                  if (done) return;
                  done = true;
                  clearTimeout(timer);
                  resolve(null);
                }, { enableHighAccuracy: false, timeout: 800, maximumAge: 60000 });
              });
              if (loc) {
                try { localStorage.setItem('lastKnownLocation', JSON.stringify(loc)); } catch (e) { console.warn('Could not cache location', e); }
                console.log('✔ Cached quick location from URL-login flow', loc);
              }
            } catch (e) { console.warn('Quick location capture failed', e); }
          })();
        }
      } catch (errLoc) { console.warn('Location capture error', errLoc); }
    }
  } catch (err) {
    console.warn('URL token handling failed', err);
  }

  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || 'null');

  if (!token || !user) {
    console.log('No token/user found; redirecting to login');
    window.location.href = 'login.html';
    return;
  }

  const currentUserId = user.id || user._id || user.email || 'unknown';
  currentAuthToken = token;
  modalCache.init();
  setupClaimLocationButton();

  // Update welcome
  const pageTitle = document.getElementById('pageTitle');
  if (pageTitle) pageTitle.textContent = `Welcome Back, ${user.name || 'User'}!`;

  // Get user's location for distance calculation
  console.log('📍 Requesting user location...');
  await getGeolocation();
  console.log('📍 Location ready. User coordinates:', userCoordinates);

  // Try to fetch user stats (non-fatal)
  try {
    const userStatsCacheKey = `auth_user_stats_${currentUserId}`;
    const stats = await fetchJsonWithCache(apiUrl('/api/auth/user-stats'), userStatsCacheKey, {
      headers: { Authorization: `Bearer ${token}` }
    }, { ttl: 5 * 60 * 1000, background: true });
    if (stats) {
      const cards = document.querySelectorAll('.stats .card');
      // Only set the donations count from the server stats if available.
      // We avoid writing the second card here because the dashboard's second card
      // is used for "Requests In" (claims on your donations) and is computed
      // later from the loaded donations. Writing it here causes inconsistent
      // values when local/cache-based counts are applied.
      if (cards.length >= 1 && typeof stats.user?.donationsMade !== 'undefined') {
        cards[0].querySelector('h3').textContent = String(stats.user.donationsMade);
      }
    }
  } catch (err) {
    console.warn('Failed to fetch stats', err);
  }

  // Load donations with retry mechanism: prefer backend/cache, fallback to localStorage
  let donations = [];
  let retryCount = 0;
  const maxRetries = 8;

  const fetchDonationsWithRetry = async () => {
    try {
      const cacheKey = `donations_my_${currentUserId}`;
      const body = await fetchJsonWithCache(apiUrl('/api/donations/my-donations'), cacheKey, { headers: { Authorization: `Bearer ${token}` } }, { ttl: 60 * 1000, background: true });
      donations = (body && body.donations) || [];

      // If donations empty and we haven't retried too many times, retry after delay
      if ((!donations || donations.length === 0) && retryCount < maxRetries) {
        retryCount++;
        const delayMs = Math.min(1000 + (retryCount * 1500), 10000); // Increase delay: 2.5s, 4s, 5.5s, etc.
        console.log(`No donations found yet. Retrying in ${delayMs}ms (attempt ${retryCount}/${maxRetries})`);
        await new Promise(r => setTimeout(r, delayMs));
        return fetchDonationsWithRetry();
      }
    } catch (err) {
      console.warn('Backend donations unavailable or cache miss, will fallback to localStorage', err);
    }

    return donations;
  };

  const availablePromise = fetchAvailableDonations(token);
  const donationsPromise = fetchDonationsWithRetry();

  // Render receiver section as soon as available donations load
  let availableDonations = await availablePromise;
  renderReceiverSection(availableDonations);

  donations = await donationsPromise;

  if (!donations.length) {
    try {
      const stored = JSON.parse(localStorage.getItem('donations') || '[]');
      donations = stored.filter(d => !d.userId || d.userId === currentUserId);

      // If availableDonations empty, derive from stored (others')
      if (!availableDonations.length) {
        availableDonations = stored.filter(d => !d.userId || d.userId !== currentUserId);
      }
    } catch (err) {
      console.warn('Failed to read local donations', err);
    }
  }

  // Refresh receiver section if localStorage fallback populated it
  renderReceiverSection(availableDonations);

  let currentDonorFilter = 'all';
  let currentDonorSearch = '';
  let cachedDonorList = [];

  window.filterDonorTable = function(status) {
    currentDonorFilter = String(status || 'all').toLowerCase();
    document.querySelectorAll('#donorFilterPills .filter-pill').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-filter') === currentDonorFilter);
    });
    renderDonorTable(cachedDonorList);
  };

  window.searchDonorTable = function(query) {
    currentDonorSearch = String(query || '').toLowerCase().trim();
    renderDonorTable(cachedDonorList);
  };

  function renderDonorTable(donationsList) {
    if (Array.isArray(donationsList)) {
      cachedDonorList = donationsList;
    }
    const table = document.querySelector('#donorSection table');
    if (!table) return;

    const rows = table.querySelectorAll('tr');
    rows.forEach((r, i) => { if (i > 0) r.remove(); });

    let list = cachedDonorList || [];

    if (currentDonorFilter !== 'all') {
      list = list.filter(d => String(d.status || 'Available').toLowerCase() === currentDonorFilter);
    }
    if (currentDonorSearch) {
      list = list.filter(d => 
        (d.food || d.foodName || '').toLowerCase().includes(currentDonorSearch) ||
        (d.foodType || '').toLowerCase().includes(currentDonorSearch) ||
        (d.quantity || d.qty || '').toLowerCase().includes(currentDonorSearch)
      );
    }

    if (!list.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td colspan="4" style="text-align: center; padding: 42px 20px;">
          <i class="fa fa-filter-circle-xmark" style="font-size: 36px; color: #cbd5e1; margin-bottom: 12px; display: block;"></i>
          <p style="font-size: 14px; font-weight: 700; color: #475569; margin: 0 0 4px;">No matching donations found</p>
          <p style="font-size: 12.5px; color: #94a3b8; margin: 0 0 14px;">Try selecting another filter or adding a new donation</p>
          <button onclick="location.href='addfood.html'" class="btn-primary" style="margin: 0 auto;">
            <i class="fa fa-plus"></i> Add New Donation
          </button>
        </td>
      `;
      table.appendChild(tr);
      return;
    }

    list.forEach(d => {
      const tr = document.createElement('tr');
      const foodName = d.food || d.foodName || 'Unnamed Food';
      const foodType = d.foodType || 'Vegetarian';
      const foodTypeClass = foodType.toLowerCase().replace(/[^a-z0-9]/g, '');
      const dietIcon = getFoodDietaryIcon(foodType);
      const statusStr = String(d.status || 'Available');
      const statusLower = statusStr.toLowerCase();
      const cookedTime = d.cookedTime ? new Date(d.cookedTime).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
      const claimsCount = Array.isArray(d.claims) ? d.claims.length : 0;

      tr.innerHTML = `
        <td>
          <div class="food-cell">
            <div class="food-icon-circle ${foodTypeClass}">
              <i class="fa ${dietIcon}"></i>
            </div>
            <div class="food-info-wrap">
              <span class="food-name-title">${foodName}</span>
              <div class="food-tags">
                <span class="food-type-pill ${foodTypeClass}">${foodType}</span>
                ${cookedTime ? `<span class="food-time-pill"><i class="fa fa-clock"></i> ${cookedTime}</span>` : ''}
              </div>
            </div>
          </div>
        </td>
        <td>
          <div class="qty-pill">
            <i class="fa fa-boxes-stacked"></i>
            <span>${d.quantity || d.qty || '-'}</span>
          </div>
        </td>
        <td>
          <span class="badge ${statusLower}">${statusStr}</span>
        </td>
        <td>
          <div class="row-actions">
            <button class="btn btn-edit" title="Edit Quantity" onclick="openEditModal('${d._id || ''}', '${foodName.replace(/'/g, "\\'")}', '${foodType}', '${(d.quantity || d.qty || '').replace(/'/g, "\\'")}', '${(d.description || '').replace(/'/g, "\\'")}', '${(d.location || '').replace(/'/g, "\\'")}')" ${!d._id ? 'disabled' : ''}>
              <i class="fa fa-pen"></i> Edit
            </button>
            ${claimsCount > 0 ? `
              <a href="manage-requests.html" class="btn btn-claims-link" title="Manage Requests">
                <i class="fa fa-tasks"></i> Claims
                <span class="claims-pill">${claimsCount}</span>
              </a>
            ` : ''}
          </div>
        </td>
      `;
      table.appendChild(tr);
    });
  }

  // Render initial donor table
  renderDonorTable(donations);

  // Receiver section is rendered earlier to avoid waiting on donation retries

  // Compute dashboard counts and update stat cards
  try {
    const cards = document.querySelectorAll('.stats .card');
    // Determine counts:
    // - donationsMade: number of donations created by current user (donations.length)
    // - requestsByOthers: count of claims on user's donations (someone requested your food)
    // - requestsMadeByUser: count of claims made by user on other's donations
    // - nearby: number of availableDonations

    const donationsMade = Array.isArray(donations) ? donations.length : 0;

    // Count claims on user's donations (Requests In - someone claimed your food)
    const requestsByOthers = Array.isArray(donations)
      ? donations.reduce((sum, d) => sum + (Array.isArray(d.claims) ? d.claims.length : 0), 0)
      : 0;

    // Count claims made by current user on other's donations (Requests Out)
    const userId = user?.id || user?._id || user?.email;
    let requestsMadeByUser = 0;
    if (userId && Array.isArray(availableDonations)) {
      requestsMadeByUser = availableDonations.reduce((sum, d) => {
        const userClaims = Array.isArray(d.claims)
          ? d.claims.filter(c => {
            const claimUserId = typeof c.userId === 'object' ? c.userId?.toString() : String(c.userId);
            return claimUserId === String(userId);
          }).length
          : 0;
        return sum + userClaims;
      }, 0);
    }

    // Compute nearby donations within a configurable radius (km). If user
    // location is not available, fall back to counting all available donations.
    const NEARBY_RADIUS_KM = 10; // consider donations within 10 km as 'nearby'
    let nearby = 0;
    if (userCoordinates && Array.isArray(availableDonations)) {
      nearby = availableDonations.reduce((count, d) => {
        try {
          if (!d || !d.coordinates) return count;
          const lat2 = Number(d.coordinates.latitude);
          const lon2 = Number(d.coordinates.longitude);
          if (isNaN(lat2) || isNaN(lon2)) return count;
          const distKm = calculateDistance(userCoordinates.latitude, userCoordinates.longitude, lat2, lon2);
          return distKm <= NEARBY_RADIUS_KM ? count + 1 : count;
        } catch (e) {
          return count;
        }
      }, 0);
    } else {
      nearby = Array.isArray(availableDonations) ? availableDonations.length : 0;
    }

    if (cards && cards.length >= 4) {
      // Map cards in order: Donations, Requests In, Requests Out, Nearby
      cards[0].querySelector('h3').textContent = String(donationsMade);
      cards[1].querySelector('h3').textContent = String(requestsByOthers || '0');      // Requests In (from others on your donations)
      cards[2].querySelector('h3').textContent = String(requestsMadeByUser || '0');    // Requests Out (made by user on others' donations)
      cards[3].querySelector('h3').textContent = String(nearby);
    }
  } catch (err) {
    console.warn('Failed to compute/update dashboard counts', err);
  }

  console.log('=== Dashboard Fully Loaded ===')
});

// Handle claim form submission (Receiver section)
document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'claimForm') return;

  e.preventDefault();

  if (!selectedDonation) {
    alert('No donation selected');
    return;
  }

  const token = currentAuthToken || localStorage.getItem('token');
  if (!token) {
    alert('Not authenticated');
    return;
  }

  try {
    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Submitting Request...';
    }

    // Collect form data
    const claimData = {
      purpose: document.getElementById('claimPurpose').value,
      beneficiaries: parseInt(document.getElementById('claimBeneficiaries').value, 10),
      address: document.getElementById('claimAddress').value,
      preferredPickupTime: document.getElementById('claimPickupTime').value || null,
      notes: document.getElementById('claimNotes').value
    };

    if (!claimData.beneficiaries || Number.isNaN(claimData.beneficiaries)) {
      claimData.beneficiaries = 1;
    }

    // Ensure beneficiaries do not exceed available quantity (defensive check)
    try {
      const donation = availableDonationsCache.find(d => String(d._id) === String(selectedDonation.id));
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

    alert(`Claim Request Submitted!\n\nFood: ${selectedDonation.food}\nBeneficiaries: ${claimData.beneficiaries}\nPurpose: ${claimData.purpose}\n\nThe donor will review your request shortly.`);
    closeModal();

    // Invalidate donation caches so pages show fresh data
    try {
      clearCachePrefix('donations_');
    } catch (err) { console.warn('Failed to clear donation caches', err); }

    // Refresh available donations list on dashboard
    try {
      const refreshed = await fetchAvailableDonations(token);
      renderReceiverSection(refreshed);
    } catch (refreshErr) {
      console.warn('Failed to refresh available donations after claim', refreshErr);
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

// Close claim modal when clicking outside
document.addEventListener('click', (e) => {
  const modal = document.getElementById('claimModal');
  if (modal && e.target === modal) {
    closeModal();
  }
});



// Edit Modal Functions
let currentEditingDonationId = null;

function openEditModal(donationId, foodName, foodType, quantity, description, location) {
  if (!donationId) {
    alert('Cannot edit this donation');
    return;
  }

  currentEditingDonationId = donationId;

  // Display read-only fields
  document.getElementById('displayFoodName').textContent = foodName;
  document.getElementById('displayFoodType').textContent = foodType;
  document.getElementById('displayLocation').textContent = location;

  // Only populate editable quantity field
  document.getElementById('editQuantity').value = quantity;

  // Show modal
  document.getElementById('editModal').style.display = 'flex';
}

function closeEditModal() {
  document.getElementById('editModal').style.display = 'none';
  currentEditingDonationId = null;
}

// Handle edit form submission
document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'editForm') return;

  e.preventDefault();

  const token = localStorage.getItem('token');
  if (!token || !currentEditingDonationId) {
    alert('Error: Not authenticated');
    return;
  }

  try {
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Saving...';

    const updateData = {
      quantity: document.getElementById('editQuantity').value
    };

    console.log(`[EDIT] Sending PATCH to /api/donations/${currentEditingDonationId}`, updateData);

    const response = await fetch(apiUrl(`/api/donations/${currentEditingDonationId}`), {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updateData)
    });

    console.log(`[EDIT] Response status: ${response.status}`);

    if (!response.ok) {
      const errorData = await response.json();
      console.error('[EDIT] Error response:', errorData);
      throw new Error(errorData.message || 'Failed to update donation');
    }

    const returnedData = await response.json();
    console.log('[EDIT] Success response:', returnedData);

    // Invalidate donation caches so pages show fresh data
    try {
      clearCachePrefix('donations_');
    } catch (e) { console.warn('Failed to clear donation caches', e); }

    alert('✅ Donation updated successfully!');
    closeEditModal();

    // Reload page to show updated donation
    console.log('[EDIT] Reloading page...');
    window.location.reload();

  } catch (error) {
    console.error('Error updating donation:', error);
    alert(`❌ Error: ${error.message}`);
  } finally {
    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = 'Save Changes';
    }
  }
});

// Close modal when clicking outside
document.addEventListener('click', (e) => {
  const modal = document.getElementById('editModal');
  if (e.target === modal) {
    closeEditModal();
  }
});
