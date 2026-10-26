// My Donations Page - Full donation management
let allDonations = [];
let filteredDonations = [];
let currentEditingDonationId = null;
let currentClaimsViewingId = null;

document.addEventListener('DOMContentLoaded', async () => {
    console.log('=== My Donations Page Loaded ===');

    // Check authentication
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user') || 'null');

    if (!token || !user) {
        alert('Please log in first');
        window.location.href = 'login.html';
        return;
    }

    console.log(`✓ User authenticated: ${user.name}`);

    // Load donations
    await loadMyDonations();

    // Setup event listeners
    setupEventListeners();

    console.log('=== My Donations Page Ready ===');
});

// Load all user's donations
async function loadMyDonations() {
    try {
        const token = localStorage.getItem('token');
        const loadingEl = document.getElementById('loadingState');
        const emptyEl = document.getElementById('emptyState');
        const containerEl = document.getElementById('donationsContainer');

        loadingEl.style.display = 'block';
        containerEl.innerHTML = '';
        emptyEl.style.display = 'none';


        const userObj = JSON.parse(localStorage.getItem('user') || 'null');
        const currentUserId = userObj?.id || userObj?._id || userObj?.email || 'unknown';
        const cacheKey = `donations_my_${currentUserId}`;

        let data;
        try {
            data = await fetchJsonWithCache('/api/donations/my-donations', cacheKey, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }, { ttl: 60 * 1000, background: true });
        } catch (err) {
            console.warn('Failed to fetch my-donations from network, falling back to cache if available', err);
            const cached = cacheGet(cacheKey);
            data = cached ? cached.v : null;
        }

        if (!data || !Array.isArray(data.donations)) {
            throw new Error('Failed to fetch donations or invalid response');
        }

        allDonations = data.donations || [];

        console.log(`✓ Loaded ${allDonations.length} donations`);

        // Update stats
        updateStats();

        // Initial render
        filteredDonations = [...allDonations];
        renderDonations();

        loadingEl.style.display = 'none';

        if (allDonations.length === 0) {
            emptyEl.style.display = 'block';
        }

    } catch (error) {
        console.error('Error loading donations:', error);
        document.getElementById('loadingState').style.display = 'none';
        alert('Error loading donations: ' + error.message);
    }
}

// Update stats cards
function updateStats() {
    const total = allDonations.length;
    const available = allDonations.filter(d => d.status === 'Available').length;
    const claimed = allDonations.filter(d => d.status === 'Claimed').length;
    const completed = allDonations.filter(d => d.status === 'Completed').length;

    document.getElementById('totalCreated').textContent = total;
    document.getElementById('availableCount').textContent = available;
    document.getElementById('claimedCount').textContent = claimed;
    document.getElementById('completedCount').textContent = completed;
}

// Setup event listeners
function setupEventListeners() {
    // Search input
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', handleSearch);

    // Filter select
    const filterSelect = document.getElementById('filterStatus');
    filterSelect.addEventListener('change', handleFilter);

    // Edit form submit
    const editForm = document.getElementById('editForm');
    editForm.addEventListener('submit', handleEditSubmit);

    // Modal close on outside click
    window.addEventListener('click', (e) => {
        const editModal = document.getElementById('editModal');
        const claimsModal = document.getElementById('claimsModal');

        if (e.target === editModal) closeEditModal();
        if (e.target === claimsModal) closeClaimsModal();
    });
}

// Search donations
function handleSearch() {
    const query = document.getElementById('searchInput').value.toLowerCase();
    const status = document.getElementById('filterStatus').value;

    filteredDonations = allDonations.filter(donation => {
        const matchesQuery =
            donation.food.toLowerCase().includes(query) ||
            donation.description.toLowerCase().includes(query) ||
            donation.location.toLowerCase().includes(query);

        const matchesStatus = !status || donation.status === status;

        return matchesQuery && matchesStatus;
    });

    renderDonations();
}

// Filter by status
function handleFilter() {
    handleSearch(); // Re-filter with current search
}

// Render donations as cards
function renderDonations() {
    const container = document.getElementById('donationsContainer');
    container.innerHTML = '';

    if (filteredDonations.length === 0) {
        container.innerHTML = '<p class="no-results">No donations match your search</p>';
        return;
    }

    const fragment = document.createDocumentFragment();

    filteredDonations.forEach((donation, index) => {
        const card = createDonationCard(donation);
        card.style.animationDelay = `${index * 0.05}s`;
        fragment.appendChild(card);
    });

    container.appendChild(fragment);
}

// Create donation card
function createDonationCard(donation) {
    const card = document.createElement('div');
    card.className = 'donation-card slide-in';

    const statusColor = {
        'Available': '#2e7d32',
        'Claimed': '#ff9800',
        'Completed': '#2196f3'
    };

    const claimsCount = donation.claims ? donation.claims.length : 0;
    const pendingClaims = donation.claims ? donation.claims.filter(c => c.status === 'pending').length : 0;

    card.innerHTML = `
        <div class="card-header">
            <span class="status-badge" style="background: ${statusColor[donation.status] || '#999'}">
                ${donation.status}
            </span>
            <span class="created-date">${formatDate(donation.createdAt)}</span>
        </div>

        <div class="card-content">
            <div class="food-info">
                <h3 class="food-name">${donation.food}</h3>
                <p class="food-type">
                    <i class="fa fa-leaf"></i> ${donation.foodType}
                </p>
            </div>

            <div class="donation-details">
                <p><strong>Quantity:</strong> ${donation.quantity}</p>
                <p><strong>Cooked:</strong> ${formatTime(donation.cookedTime)}</p>
                <p><strong>Location:</strong> ${donation.location}</p>
                <p class="description">${donation.description}</p>
            </div>

            ${donation.claimedBy ? `
                <div class="claimed-info">
                    <i class="fa fa-check-circle"></i>
                    <strong>Claimed</strong> - Waiting for pickup or completion
                </div>
            ` : ''}

            ${claimsCount > 0 ? `
                <div class="claims-info">
                    <i class="fa fa-users"></i>
                    <strong>${claimsCount} claim${claimsCount !== 1 ? 's' : ''}</strong>
                    ${pendingClaims > 0 ? `<span class="pending-badge">${pendingClaims} pending</span>` : ''}
                </div>
            ` : ''}

            ${donation.rating ? `
                <div class="rating-info">
                    <i class="fa fa-star" style="color: #ffc107;"></i>
                    <strong>${donation.rating.score}/5 stars</strong>
                    ${donation.rating.review ? `<p class="review">"${donation.rating.review}"</p>` : ''}
                </div>
            ` : ''}
        </div>

        <div class="card-actions">
            ${donation.status === 'Available' ? `
                <button onclick="openEditModal('${donation._id}')" class="btn-small btn-edit">
                    <i class="fa fa-edit"></i> Edit
                </button>
            ` : ''}

            ${donation.status === 'Available' || donation.status === 'Claimed' ? `
                <button onclick="deleteDonation('${donation._id}')" class="btn-small btn-delete">
                    <i class="fa fa-trash"></i> Delete
                </button>
            ` : ''}

            ${claimsCount > 0 && (donation.status === 'Available' || donation.status === 'Claimed') ? `
                <button onclick="viewClaims('${donation._id}')" class="btn-small btn-claims">
                    <i class="fa fa-list"></i> ${claimsCount} Claim${claimsCount !== 1 ? 's' : ''}
                </button>
            ` : ''}
        </div>
    `;

    return card;
}

// Open edit modal
async function openEditModal(donationId) {
    currentEditingDonationId = donationId;
    const donation = allDonations.find(d => d._id === donationId);

    if (!donation) {
        alert('Donation not found');
        return;
    }

    // Can only edit if available
    if (donation.status !== 'Available') {
        alert('Cannot edit a claimed or completed donation');
        return;
    }

    // Display read-only fields
    document.getElementById('displayFood').value = donation.food;
    document.getElementById('displayFoodType').value = donation.foodType;
    document.getElementById('displayLocation').value = donation.location;

    // Only populate editable quantity field
    document.getElementById('editQuantity').value = donation.quantity;

    document.getElementById('editModal').style.display = 'flex';
}

function closeEditModal() {
    document.getElementById('editModal').style.display = 'none';
    document.getElementById('editForm').reset();
    currentEditingDonationId = null;
}

// Handle edit form submit
async function handleEditSubmit(e) {
    e.preventDefault();

    if (!currentEditingDonationId) {
        alert('Error: No donation selected');
        return;
    }

    try {
        const token = localStorage.getItem('token');

        const updateData = {
            quantity: document.getElementById('editQuantity').value.trim()
        };

        const response = await fetch(`/api/donations/${currentEditingDonationId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updateData)
        });

        const data = await response.json();

        if (response.ok) {
            console.log('✓ Donation updated successfully');
            // Invalidate donation caches so reload pulls fresh data
            try { clearCachePrefix('donations_'); } catch (e) { console.warn('Failed to clear donation caches', e); }
            alert('✅ Donation updated successfully!');
            closeEditModal();
            await loadMyDonations();
        } else {
            alert('Error: ' + (data.message || 'Failed to update donation'));
        }
    } catch (error) {
        console.error('Error updating donation:', error);
        alert('Error: ' + error.message);
    }
}

// Delete donation
async function deleteDonation(donationId) {
    if (!confirm('Are you sure you want to delete this donation?')) {
        return;
    }

    try {
        const token = localStorage.getItem('token');

        const response = await fetch(`/api/donations/${donationId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (response.ok) {
            console.log('✓ Donation deleted');
            try { clearCachePrefix('donations_'); } catch (e) { console.warn('Failed to clear donation caches', e); }
            alert('✅ Donation deleted successfully!');
            await loadMyDonations();
        } else {
            alert('Error: ' + (data.message || 'Failed to delete donation'));
        }
    } catch (error) {
        console.error('Error deleting donation:', error);
        alert('Error: ' + error.message);
    }
}

// View claims for a donation
function viewClaims(donationId) {
    currentClaimsViewingId = donationId;
    const donation = allDonations.find(d => d._id === donationId);

    if (!donation || !donation.claims || donation.claims.length === 0) {
        document.getElementById('claimsList').innerHTML = '';
        document.getElementById('noClaimsMessage').style.display = 'block';
        document.getElementById('claimsModal').style.display = 'flex';
        return;
    }

    const claimsHtml = donation.claims.map(claim => `
        <div class="claim-item" data-claim-status="${claim.status}">
            <div class="claim-header">
                <div>
                    <h4>${claim.userName}</h4>
                    <p class="claim-email">${claim.userEmail}</p>
                </div>
                <span class="claim-status-badge" style="background: ${getClaimStatusColor(claim.status)}">
                    ${claim.status.charAt(0).toUpperCase() + claim.status.slice(1)}
                </span>
            </div>
            
            <p class="claim-date">Claimed on ${formatTime(claim.claimedAt)}</p>

            ${claim.status === 'pending' ? `
                <div class="claim-actions">
                    <button onclick="acceptClaim('${donationId}', '${claim.userId}')" class="btn-small btn-success">
                        <i class="fa fa-check"></i> Accept
                    </button>
                    <button onclick="rejectClaim('${donationId}', '${claim.userId}')" class="btn-small btn-danger">
                        <i class="fa fa-times"></i> Reject
                    </button>
                </div>
            ` : ''}
        </div>
    `).join('');

    document.getElementById('claimsList').innerHTML = claimsHtml;
    document.getElementById('noClaimsMessage').style.display = 'none';
    document.getElementById('claimsModal').style.display = 'flex';
}

function closeClaimsModal() {
    document.getElementById('claimsModal').style.display = 'none';
    currentClaimsViewingId = null;
}

// Accept a claim
async function acceptClaim(donationId, userId) {
    if (!confirm('Accept this claim?')) return;

    try {
        const token = localStorage.getItem('token');

        const response = await fetch(`/api/donations/${donationId}/claims/${userId}/accept`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (response.ok) {
            console.log('✓ Claim accepted');
            try { clearCachePrefix('donations_'); } catch (e) { console.warn('Failed to clear donation caches', e); }
            alert('✅ Claim accepted! User has been notified.');
            closeClaimsModal();
            await loadMyDonations();
        } else {
            alert('Error: ' + (data.message || 'Failed to accept claim'));
        }
    } catch (error) {
        console.error('Error accepting claim:', error);
        alert('Error: ' + error.message);
    }
}

// Reject a claim
async function rejectClaim(donationId, userId) {
    if (!confirm('Reject this claim?')) return;

    try {
        const token = localStorage.getItem('token');

        const response = await fetch(`/api/donations/${donationId}/claims/${userId}/reject`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (response.ok) {
            console.log('✓ Claim rejected');
            try { clearCachePrefix('donations_'); } catch (e) { console.warn('Failed to clear donation caches', e); }
            alert('✅ Claim rejected.');
            closeClaimsModal();
            await loadMyDonations();
        } else {
            alert('Error: ' + (data.message || 'Failed to reject claim'));
        }
    } catch (error) {
        console.error('Error rejecting claim:', error);
        alert('Error: ' + error.message);
    }
}

// Helper functions
function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function formatTime(dateString) {
    return new Date(dateString).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getClaimStatusColor(status) {
    const colors = {
        'pending': '#ff9800',
        'accepted': '#2e7d32',
        'rejected': '#f44336'
    };
    return colors[status] || '#999';
}
