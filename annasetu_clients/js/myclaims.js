// My Claims Page - Track claimed donations and rate them

let allClaims = [];
let filteredClaims = [];
let currentRatingDonation = null;
let searchTimeout = null;

document.addEventListener('DOMContentLoaded', async () => {
  console.log('=== My Claims Page Loaded ===');

  // Check authentication
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || 'null');

  if (!token || !user) {
    alert('Please log in first');
    window.location.href = 'login.html';
    return;
  }

  console.log(`✓ User authenticated: ${user.name}`);

  // Initialize star rating
  setupStarRating();

  // Load user claims
  await loadMyClaims();

  // Setup search and filter
  setupSearchAndFilter();

  // Setup logout
  document.querySelector('.logout').addEventListener('click', (e) => {
    e.preventDefault();
    logout();
  });

  console.log('=== My Claims Page Ready ===');
});

// Load user's claimed donations
async function loadMyClaims() {
  try {
    const token = localStorage.getItem('token');
    console.log('Fetching user claims...');

    const loadingEl = document.getElementById('loadingState');
    const containerEl = document.getElementById('claimsContainer');
    const emptyEl = document.getElementById('emptyState');

    loadingEl.style.display = 'flex';
    containerEl.innerHTML = '';
    emptyEl.style.display = 'none';

    const userObj = JSON.parse(localStorage.getItem('user') || 'null');
    const currentUserId = userObj?.id || userObj?._id || userObj?.email || 'unknown';
    const cacheKey = `donations_my_claims_${currentUserId}`;

    let data;
    try {
      data = await fetchJsonWithCache(apiUrl('/api/donations/user/my-claims'), cacheKey, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }, { ttl: 60 * 1000, background: true });

      // Server previously returned `donations` but newer endpoint returns `claims`.
      // Accept either shape for compatibility.
      const list = (data && (data.donations || data.claims)) || [];
      console.log(`✓ Fetched ${list.length} claimed donations`);
      allClaims = list;
    } catch (err) {
      console.warn('Failed to fetch claims from network, falling back to cache', err);
      const cached = cacheGet(cacheKey);
      const cachedData = cached ? cached.v : null;
      allClaims = (cachedData && (cachedData.donations || cachedData.claims)) || [];
    }
    filteredClaims = [...allClaims];

    loadingEl.style.display = 'none';
    updateStats();
    displayClaims(filteredClaims);

  } catch (error) {
    console.error('Error loading claims:', error);
    const loadingEl = document.getElementById('loadingState');
    const containerEl = document.getElementById('claimsContainer');

    loadingEl.style.display = 'none';
    containerEl.innerHTML = `
      <div style="text-align: center; padding: 40px; color: #999;">
        <i class="fa fa-exclamation-circle" style="font-size: 40px; margin-bottom: 10px;"></i>
        <p>Error loading claims: ${error.message}</p>
      </div>
    `;
  }
}

// Update statistics
function updateStats() {
  const totalClaims = allClaims.length;
  const pendingClaims = allClaims.filter(d => {
    const claimStatus = (d.claims?.[0]?.status || 'pending').toLowerCase();
    return claimStatus === 'pending';
  }).length;
  const acceptedClaims = allClaims.filter(d => {
    const claimStatus = (d.claims?.[0]?.status || 'pending').toLowerCase();
    return claimStatus === 'accepted';
  }).length;
  const completedClaims = allClaims.filter(d => String(d.status || '').toLowerCase() === 'completed').length;

  document.getElementById('totalClaimsCount').textContent = totalClaims;
  document.getElementById('pendingClaimsCount').textContent = pendingClaims;
  document.getElementById('acceptedClaimsCount').textContent = acceptedClaims;
  document.getElementById('completedClaimsCount').textContent = completedClaims;
}

// Display claims in container
function displayClaims(claims) {
  const container = document.getElementById('claimsContainer');
  const emptyState = document.getElementById('emptyState');

  if (claims.length === 0) {
    container.style.display = 'none';
    emptyState.style.display = 'flex';
    return;
  }

  container.style.display = 'grid';
  emptyState.style.display = 'none';

  try {
    const fragment = document.createDocumentFragment();
    claims.forEach((claim, index) => {
      const card = document.createElement('div');
      card.className = 'claim-card slide-in';
      card.style.animationDelay = `${index * 0.05}s`;
      card.innerHTML = createClaimCard(claim);
      fragment.appendChild(card);
    });

    container.innerHTML = '';
    container.appendChild(fragment);

    console.log(`⚡ Rendered ${claims.length} claim cards`);
  } catch (error) {
    console.error('Error displaying claims:', error);
    container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: #999;">
        <i class="fa fa-exclamation-circle" style="font-size: 40px; margin-bottom: 10px;"></i>
        <p>Error rendering claims: ${error.message}</p>
      </div>
    `;
  }
}

// Create claim card HTML
function createClaimCard(donation) {
  const claim = donation.claims?.[0];
  const claimStatus = (claim?.status || 'pending').toLowerCase();
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

  const donorName = donation.userId?.name || 'Anonymous';
  const donorLocation = donation.userId?.location || donation.location || 'Unknown';
  const cookedDate = donation.cookedTime ? new Date(donation.cookedTime).toLocaleDateString() : 'N/A';

  const isCompleted = String(donation.status || '').toLowerCase() === 'completed';
  const isRated = isCompleted && donation.rating?.score;

  let actionButtons = '';
  if (claimStatus === 'accepted') {
    if (isCompleted) {
      if (isRated) {
        actionButtons = `
          <button class="btn-small" disabled style="background: #2e7d32; cursor: not-allowed;">
            <i class="fa fa-star"></i> Rated
          </button>
        `;
      } else {
        actionButtons = `
          <button class="btn-small btn-rate" onclick="openRatingModal('${donation._id}', '${donation.food.replace(/'/g, "\\'")}')">
            <i class="fa fa-star"></i> Rate
          </button>
        `;
      }
    } else {
      actionButtons = `
        <button class="btn-small btn-complete" onclick="openDetailModal('${donation._id}')">
          <i class="fa fa-info-circle"></i> Details
        </button>
        <button class="btn-small btn-delivered" onclick="confirmDeliveryClient('${donation._id}')">
          <i class="fa fa-check"></i> Food Delivered
        </button>
      `;
    }
  }

  return `
    <div class="card-header">
      <div>
        <h3 class="food-name">${donation.food}</h3>
        <p style="margin: 0; font-size: 12px; color: #999;">${donation.foodType}</p>
      </div>
      <span class="status-badge" style="background: ${statusColors[claimStatus]};">
        <i class="fa ${statusIcons[claimStatus]}"></i> ${claimStatus.charAt(0).toUpperCase() + claimStatus.slice(1)}
      </span>
    </div>

    <div class="card-content">
      <div class="claim-details-grid">
        <div class="detail-item">
          <i class="fa fa-user"></i>
          <div>
            <span class="label">Donor</span>
            <span class="value">${donorName}</span>
          </div>
        </div>
        <div class="detail-item">
          <i class="fa fa-map-marker-alt"></i>
          <div>
            <span class="label">Location</span>
            <span class="value">${donorLocation}</span>
          </div>
        </div>
        <div class="detail-item">
          <i class="fa fa-weight"></i>
          <div>
            <span class="label">Quantity</span>
            <span class="value">${donation.quantity}</span>
          </div>
        </div>
        <div class="detail-item">
          <i class="fa fa-calendar"></i>
          <div>
            <span class="label">Cooked Date</span>
            <span class="value">${cookedDate}</span>
          </div>
        </div>
      </div>

      ${donation.description ? `
        <div class="description-box">
          <strong>Description:</strong> ${donation.description}
        </div>
      ` : ''}

      ${String(donation.status || '').toLowerCase() === 'completed' && donation.rating?.score ? `
        <div class="rating-box">
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
            <span style="color: #ffc107;">
              ${'⭐'.repeat(donation.rating.score)}
            </span>
            <span style="font-weight: 600;">${donation.rating.score}/5 Stars</span>
          </div>
          ${donation.rating.review ? `<p style="margin: 0; font-size: 13px; color: #666; font-style: italic;">"${donation.rating.review}"</p>` : ''}
        </div>
      ` : ''}

      <div class="card-actions">
        <button class="btn-small btn-view" onclick="openDetailModal('${donation._id}')">
          <i class="fa fa-eye"></i> View
        </button>
        ${actionButtons}
        ${claimStatus === 'pending' ? `
          <button class="btn-small btn-danger" onclick="unclaimDonation('${donation._id}')">
            <i class="fa fa-times"></i> Unclaim
          </button>
        ` : ''}
      </div>
    </div>
  `;
}

// Setup search and filter
function setupSearchAndFilter() {
  const searchInput = document.getElementById('searchInput');
  const statusFilter = document.getElementById('statusFilter');

  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      applyFilters();
    }, 300);
  });

  statusFilter.addEventListener('change', () => {
    applyFilters();
  });
}

// Apply filters
function applyFilters() {
  const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();
  const statusFilter = document.getElementById('statusFilter').value;

  filteredClaims = allClaims.filter(donation => {
    // Status filter
    let statusMatch = true;
    if (statusFilter) {
      const claimStatus = (donation.claims?.[0]?.status || 'pending').toLowerCase();
      const donationStatus = String(donation.status || '').toLowerCase();
      if (statusFilter === 'completed') {
        statusMatch = donationStatus === 'completed';
      } else {
        statusMatch = claimStatus === statusFilter;
      }
    }

    // Search filter
    let searchMatch = true;
    if (searchTerm) {
      const food = donation.food?.toLowerCase() || '';
      const donor = donation.userId?.name?.toLowerCase() || '';
      const location = donation.location?.toLowerCase() || '';

      searchMatch = food.includes(searchTerm) ||
        donor.includes(searchTerm) ||
        location.includes(searchTerm);
    }

    return statusMatch && searchMatch;
  });

  displayClaims(filteredClaims);
}

// Open detail modal
function openDetailModal(donationId) {
  const donation = allClaims.find(d => d._id === donationId);
  if (!donation) return;

  const claim = donation.claims?.[0];
  const claimStatus = (claim?.status || 'pending').toLowerCase();
  const statusColors = {
    'pending': '#ff9800',
    'accepted': '#4caf50',
    'rejected': '#f44336'
  };

  const claimedDate = claim?.claimedAt ? new Date(claim.claimedAt).toLocaleDateString() : 'N/A';
  const acceptedDate = claim?.acceptedAt ? new Date(claim.acceptedAt).toLocaleDateString() : 'N/A';
  const cookedDate = donation.cookedTime ? new Date(donation.cookedTime).toLocaleDateString() : 'N/A';

  const content = `
    <div class="detail-section">
      <h3>Food Details</h3>
      <div class="info-grid">
        <div class="info-row">
          <span class="label">Food Name:</span>
          <span class="value">${donation.food}</span>
        </div>
        <div class="info-row">
          <span class="label">Type:</span>
          <span class="value">${donation.foodType}</span>
        </div>
        <div class="info-row">
          <span class="label">Quantity:</span>
          <span class="value">${donation.quantity}</span>
        </div>
        <div class="info-row">
          <span class="label">Cooked Date:</span>
          <span class="value">${cookedDate}</span>
        </div>
      </div>
      ${donation.description ? `
        <div class="info-row full-width">
          <span class="label">Description:</span>
          <span class="value">${donation.description}</span>
        </div>
      ` : ''}
    </div>

    <div class="detail-section">
      <h3>Donor Information</h3>
      <div class="info-grid">
        <div class="info-row">
          <span class="label">Name:</span>
          <span class="value">${donation.userId?.name || 'Anonymous'}</span>
        </div>
        <div class="info-row">
          <span class="label">Location:</span>
          <span class="value">${donation.location || 'Not specified'}</span>
        </div>
        ${donation.userId?.phone ? `
          <div class="info-row">
            <span class="label">Phone:</span>
            <span class="value">${donation.userId.phone}</span>
          </div>
        ` : ''}
      </div>
    </div>

    <div class="detail-section">
      <h3>Claim Status</h3>
      <div class="info-grid">
        <div class="info-row">
          <span class="label">Status:</span>
          <span class="value" style="background: ${statusColors[claimStatus]}; color: white; padding: 4px 8px; border-radius: 4px; display: inline-block;">
            ${claimStatus.charAt(0).toUpperCase() + claimStatus.slice(1)}
          </span>
        </div>
        <div class="info-row">
          <span class="label">Claimed Date:</span>
          <span class="value">${claimedDate}</span>
        </div>
        ${claimStatus === 'accepted' ? `
          <div class="info-row">
            <span class="label">Accepted Date:</span>
            <span class="value">${acceptedDate}</span>
          </div>
        ` : ''}
        ${String(donation.status || '').toLowerCase() === 'completed' ? `
          <div class="info-row">
            <span class="label">Donation Status:</span>
            <span class="value">✅ Completed</span>
          </div>
        ` : ''}
      </div>
    </div>
  `;

  document.getElementById('claimDetailContent').innerHTML = content;
  document.getElementById('detailModal').style.display = 'flex';
}

// Close detail modal
function closeDetailModal() {
  document.getElementById('detailModal').style.display = 'none';
}

// Setup star rating
function setupStarRating() {
  const stars = document.querySelectorAll('.star-rating i');
  stars.forEach(star => {
    star.addEventListener('click', () => {
      const value = star.dataset.value;
      document.getElementById('ratingScore').value = value;

      const ratingTexts = {
        1: 'Poor',
        2: 'Fair',
        3: 'Good',
        4: 'Very Good',
        5: 'Excellent'
      };

      document.getElementById('ratingText').textContent = ratingTexts[value];

      // Update star display
      stars.forEach((s, index) => {
        if (index < value) {
          s.classList.remove('far');
          s.classList.add('fas');
        } else {
          s.classList.add('far');
          s.classList.remove('fas');
        }
      });
    });

    star.addEventListener('mouseover', () => {
      const value = star.dataset.value;
      stars.forEach((s, index) => {
        if (index < value) {
          s.classList.remove('far');
          s.classList.add('fas');
        } else {
          s.classList.add('far');
          s.classList.remove('fas');
        }
      });
    });
  });

  document.querySelector('.star-rating').addEventListener('mouseout', () => {
    const currentValue = document.getElementById('ratingScore').value;
    stars.forEach((s, index) => {
      if (index < currentValue) {
        s.classList.remove('far');
        s.classList.add('fas');
      } else {
        s.classList.add('far');
        s.classList.remove('fas');
      }
    });
  });
}

// Open rating modal
function openRatingModal(donationId, foodName) {
  currentRatingDonation = donationId;

  document.getElementById('donationInfo').innerHTML = `
    <div style="font-weight: 600; font-size: 16px; margin-bottom: 10px;">
      ${foodName}
    </div>
    <p style="font-size: 13px; color: #666; margin: 0;">
      Tell us about your experience with this food donation.
    </p>
  `;

  // Reset form
  document.getElementById('ratingForm').reset();
  document.getElementById('ratingScore').value = 0;
  document.getElementById('ratingText').textContent = '';
  document.querySelectorAll('.star-rating i').forEach(s => {
    s.classList.remove('fas');
    s.classList.add('far');
  });
  const fq = document.getElementById('foodQualitySelect');
  const pq = document.getElementById('packagingQualitySelect');
  if (fq) fq.value = '';
  if (pq) pq.value = '';

  document.getElementById('ratingModal').style.display = 'flex';
}

// Close rating modal
function closeRatingModal() {
  document.getElementById('ratingModal').style.display = 'none';
  currentRatingDonation = null;
}

// Handle rating form submission
document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'ratingForm') return;

  e.preventDefault();

  const token = localStorage.getItem('token');
  const score = parseInt(document.getElementById('ratingScore').value);
  const review = document.getElementById('reviewText').value.trim();

  if (!score || score < 1 || score > 5) {
    alert('Please select a rating');
    return;
  }

  try {
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '⏳ Submitting...';

    const response = await fetch(
      `/api/donations/${currentRatingDonation}/complete`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          rating: {
            score,
            review,
            foodQuality: document.getElementById('foodQualitySelect')?.value || '',
            packagingQuality: document.getElementById('packagingQualitySelect')?.value || ''
          }
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to submit rating');
    }

    console.log('✓ Rating submitted successfully');
    try { clearCachePrefix('donations_'); } catch (e) { console.warn('Failed to clear donation caches', e); }
    alert('✅ Thank you for your rating!');
    closeRatingModal();
    await loadMyClaims();

  } catch (error) {
    console.error('Error submitting rating:', error);
    alert(`❌ Error: ${error.message}`);
  } finally {
    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = 'Submit Rating';
    }
  }
});

// Unclaim donation
async function unclaimDonation(donationId) {
  if (!confirm('Are you sure you want to unclaim this donation?')) {
    return;
  }

  const token = localStorage.getItem('token');

  try {
    const response = await fetch(
      `/api/donations/${donationId}/claim`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to unclaim donation');
    }

    console.log('✓ Donation unclaimed successfully');
    try { clearCachePrefix('donations_'); } catch (e) { console.warn('Failed to clear donation caches', e); }
    alert('✅ You have unclaimed this donation');
    await loadMyClaims();

  } catch (error) {
    console.error('Error unclaiming donation:', error);
    alert(`❌ Error: ${error.message}`);
  }
}

// Confirm delivery (client) - calls server endpoint
async function confirmDeliveryClient(donationId) {
  if (!confirm('Confirm that you have received the food?')) return;

  const token = localStorage.getItem('token');
  const btns = document.querySelectorAll(`button.btn-delivered`);
  btns.forEach(b => b.disabled = true);

  try {
    const resp = await fetch(`/api/donations/${donationId}/confirm-delivery`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(body.message || `HTTP ${resp.status}`);

    alert('Delivery confirmed. You can now leave feedback.');
    try { clearCachePrefix('donations_'); } catch (e) { }
    await loadMyClaims();
  } catch (err) {
    console.error('Error confirming delivery:', err);
    alert('Failed to confirm delivery: ' + (err.message || err));
  } finally {
    btns.forEach(b => b.disabled = false);
  }
}

// Close modals when clicking outside
document.addEventListener('click', (e) => {
  const ratingModal = document.getElementById('ratingModal');
  const detailModal = document.getElementById('detailModal');

  if (e.target === ratingModal) {
    closeRatingModal();
  }
  if (e.target === detailModal) {
    closeDetailModal();
  }
});
