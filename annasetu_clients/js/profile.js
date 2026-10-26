// Profile Page JavaScript
let currentUser = null;
let isEditingProfile = false;
let isPageInitialized = false;
let initStartTime = 0;

function getUserStatsCacheKey() {
  const user = currentUser || JSON.parse(localStorage.getItem('user') || 'null');
  const userId = user?.id || user?._id || user?.email || 'unknown';
  return `auth_user_stats_${userId}`;
}

function invalidateUserStatsCache() {
  try {
    cacheDelete(getUserStatsCacheKey());
  } catch (e) { }
}

// Initialize on page load with better error handling
document.addEventListener('DOMContentLoaded', async () => {
  if (isPageInitialized) {
    console.warn('⚠️ Page already initialized, skipping...');
    return;
  }

  initStartTime = Date.now();
  console.log('=== Profile Page Loading ===');

  // Add a small delay to ensure DOM is fully painted
  await new Promise(resolve => setTimeout(resolve, 100));

  try {
    // Check authentication
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : null;

    if (!token || !user) {
      console.warn('⚠️ Not authenticated, redirecting to login...');
      setTimeout(() => {
        window.location.href = 'login.html';
      }, 500);
      return;
    }

    console.log(`✓ User authenticated: ${user.name}`);
    currentUser = user;

    // Load user profile data
    await loadProfileData();

    // Setup event listeners
    setupEventListeners();

    // Mark page as initialized
    isPageInitialized = true;
    const loadTime = Date.now() - initStartTime;
    console.log(`✓ Profile Page Ready (loaded in ${loadTime}ms)`);
  } catch (error) {
    console.error('❌ Error initializing profile page:', error);
    isPageInitialized = false;
  }
});

// Handle page visibility changes (user returns to tab)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    console.log('Profile page hidden');
    return;
  }

  console.log('Profile page visible again');
  // Verify user is still authenticated
  const token = localStorage.getItem('token');
  const user = localStorage.getItem('user');

  if (!token || !user) {
    console.warn('⚠️ Session expired, redirecting to login...');
    setTimeout(() => {
      window.location.href = 'login.html';
    }, 500);
    return;
  }

  // Refresh profile data if needed
  if (currentUser && isPageInitialized) {
    console.log('Refreshing profile data...');
    const updatedUser = JSON.parse(user);
    currentUser = updatedUser;
    displayProfileData(currentUser);
  }
});

// Load user profile data from server
async function loadProfileData() {
  try {
    const token = localStorage.getItem('token');

    if (!currentUser) {
      console.warn('No current user data available');
      return;
    }

    // For now, use data from localStorage
    displayProfileData(currentUser);

    console.log('✓ Profile data loaded successfully');

    // Also try to fetch fresh profile data from backend (to get profilePicture)
    try {
      const body = await fetchJsonWithCache(apiUrl('/api/auth/user-stats'), getUserStatsCacheKey(), {
        headers: { 'Authorization': `Bearer ${token}` }
      }, { ttl: 5 * 60 * 1000, background: true });
      if (body) {
        const serverUser = body.user;
        if (serverUser) {
          // Prefer server-provided profilePicture when available
          const profileImgEl = document.getElementById('profileImage');
          const defaultAvatar = 'images/default-avatar.svg';
          if (serverUser.profilePicture && profileImgEl) {
            profileImgEl.src = serverUser.profilePicture;
            profileImgEl.onerror = () => { profileImgEl.onerror = null; profileImgEl.src = defaultAvatar; };
          }
          // Merge server-provided fields into currentUser and persist
          currentUser = { ...currentUser, ...serverUser };
          try { localStorage.setItem('user', JSON.stringify(currentUser)); } catch (e) { }
          // Re-display with any updated fields
          displayProfileData(currentUser);
        }
      }
    } catch (err) {
      console.warn('Could not fetch fresh profile from server:', err);
    }

  } catch (error) {
    console.error('Error loading profile data:', error);
    // Display placeholders instead of failing
    if (currentUser) {
      displayProfileData(currentUser);
    }
  }
}

// Display profile data on page
function displayProfileData(user) {
  if (!user) {
    console.error('No user data to display');
    return;
  }

  try {
    // Update header
    const userNameEl = document.getElementById('userName');
    const userEmailEl = document.getElementById('userEmail');
    const joinDateEl = document.getElementById('joinDate');

    if (userNameEl) userNameEl.textContent = user.name || 'User';
    if (userEmailEl) userEmailEl.textContent = user.email || 'email@example.com';

    // Calculate join date
    const joinDate = new Date(user.createdAt || new Date());
    const monthsDiff = Math.floor((new Date() - joinDate) / (1000 * 60 * 60 * 24 * 30));
    if (joinDateEl) {
      if (monthsDiff === 0) {
        joinDateEl.textContent = 'Joined recently';
      } else if (monthsDiff === 1) {
        joinDateEl.textContent = 'Joined 1 month ago';
      } else {
        joinDateEl.textContent = `Joined ${monthsDiff} months ago`;
      }
    }

    // Update profile picture (use Google picture, then stored profileImage, then local default)
    const profileImg = document.getElementById('profileImage');
    const defaultAvatar = 'images/default-avatar.svg';
    if (profileImg) {
      const candidate = user.profilePicture || user.googleProfilePicture || user.profileImage || defaultAvatar;
      profileImg.src = candidate;
      // If the image fails to load (CORS, broken URL), fall back to default
      profileImg.onerror = () => {
        profileImg.onerror = null;
        profileImg.src = defaultAvatar;
      };
    }

    // Update stats
    const donationsMadeEl = document.getElementById('donationsMade');
    const donationsReceivedEl = document.getElementById('donationsReceived');

    if (donationsMadeEl) donationsMadeEl.textContent = user.donationsMade || 0;
    if (donationsReceivedEl) donationsReceivedEl.textContent = user.donationsReceived || 0;

    // Update personal info display
    const displayNameEl = document.getElementById('displayName');
    const displayEmailEl = document.getElementById('displayEmail');
    const displayPhoneEl = document.getElementById('displayPhone');
    const displayLocationEl = document.getElementById('displayLocation');

    if (displayNameEl) displayNameEl.textContent = user.name || '-';
    if (displayEmailEl) displayEmailEl.textContent = user.email || '-';
    if (displayPhoneEl) displayPhoneEl.textContent = user.phone || 'Not provided';
    if (displayLocationEl) displayLocationEl.textContent = user.location || 'Not provided';

    // Email notifications toggle
    const emailNotifEl = document.getElementById('emailNotifications');
    if (emailNotifEl) {
      // default to true if undefined
      emailNotifEl.checked = typeof user.emailNotifications === 'boolean' ? user.emailNotifications : true;
    }

    // Populate edit form
    const editNameEl = document.getElementById('editName');
    const editPhoneEl = document.getElementById('editPhone');
    const editLocationEl = document.getElementById('editLocation');

    if (editNameEl) editNameEl.value = user.name || '';
    if (editPhoneEl) editPhoneEl.value = user.phone || '';
    if (editLocationEl) editLocationEl.value = user.location || '';

    console.log('✓ Profile data displayed successfully');
  } catch (error) {
    console.error('Error displaying profile data:', error);
  }
}

// Setup all event listeners
function setupEventListeners() {
  // Edit profile button
  const editBtn = document.getElementById('editInfoBtn');
  if (editBtn) editBtn.addEventListener('click', toggleEditMode);

  // Cancel edit button
  const cancelBtn = document.getElementById('cancelEditBtn');
  if (cancelBtn) cancelBtn.addEventListener('click', toggleEditMode);

  // Save profile form
  const editForm = document.getElementById('editProfileForm');
  if (editForm) editForm.addEventListener('submit', saveProfileChanges);

  // Change password button
  const changePwBtn = document.getElementById('changePasswordBtn');
  if (changePwBtn) changePwBtn.addEventListener('click', openPasswordModal);

  // Password modal close
  const closePwModal = document.getElementById('closePasswordModal');
  if (closePwModal) closePwModal.addEventListener('click', closePasswordModal);

  const cancelPwBtn = document.getElementById('cancelPasswordBtn');
  if (cancelPwBtn) cancelPwBtn.addEventListener('click', closePasswordModal);

  // Password form submit
  const pwForm = document.getElementById('passwordForm');
  if (pwForm) pwForm.addEventListener('submit', changePassword);

  // Other buttons
  // Two-Factor UI removed; no DOM element to bind here.
  const emailNotifCheckbox = document.getElementById('emailNotifications');
  if (emailNotifCheckbox) {
    emailNotifCheckbox.addEventListener('change', async (e) => {
      const checked = !!e.target.checked;
      const token = localStorage.getItem('token');
      if (!token) return alert('Not authenticated');
      try {
        const resp = await fetch('/api/auth/users/preferences', {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ emailNotifications: checked })
        });
        const data = await resp.json().catch(() => ({}));
        if (resp.ok) {
          console.log('Email notification preference updated:', checked);
          try { currentUser.emailNotifications = checked; localStorage.setItem('user', JSON.stringify(currentUser)); } catch (e) { }
          invalidateUserStatsCache();
        } else {
          console.error('Failed to update preferences:', data);
          alert('Failed to save preference: ' + (data.message || `HTTP ${resp.status}`));
          // revert checkbox
          e.target.checked = !checked;
        }
      } catch (err) {
        console.error('Error updating preferences:', err);
        alert('Error updating preferences');
        e.target.checked = !checked;
      }
    });
  }

  const deleteBtn = document.getElementById('deleteAccountBtn');
  if (deleteBtn) deleteBtn.addEventListener('click', deleteAccount);

  // Logout button
  const logoutBtn = document.querySelector('.logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('Logout clicked');
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = 'index.html';
    });
  }

  // Close modal when clicking outside
  window.addEventListener('click', (e) => {
    const modal = document.getElementById('passwordModal');
    if (modal && e.target === modal) {
      closePasswordModal();
    }
  });
}

// Toggle edit mode
function toggleEditMode() {
  isEditingProfile = !isEditingProfile;
  const viewMode = document.getElementById('viewMode');
  const editMode = document.getElementById('editMode');

  if (isEditingProfile) {
    viewMode.style.display = 'none';
    editMode.style.display = 'block';
  } else {
    viewMode.style.display = 'block';
    editMode.style.display = 'none';
  }
}

// Save profile changes
async function saveProfileChanges(e) {
  e.preventDefault();

  try {
    const name = document.getElementById('editName').value.trim();
    const phone = document.getElementById('editPhone').value.trim();
    const location = document.getElementById('editLocation').value.trim();

    if (!name) {
      alert('Name is required');
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      alert('Not authenticated. Please login again.');
      return;
    }

    // Send to backend
    const response = await fetch('/api/auth/users/profile', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name, phone, location })
    });
    let data, text;
    try {
      data = await response.json();
    } catch (parseErr) {
      text = await response.text().catch(() => '');
      console.error('Failed to parse JSON response for profile update:', parseErr, text);
    }

    if (response.ok) {
      const updated = (data && data.user) ? data.user : { name, phone, location };
      // Update localStorage with new data
      currentUser = {
        ...currentUser,
        name: updated.name,
        phone: updated.phone,
        location: updated.location
      };
      try { localStorage.setItem('user', JSON.stringify(currentUser)); } catch (e) { }
      invalidateUserStatsCache();

      console.log('✓ Profile updated successfully');
      displayProfileData(currentUser);
      toggleEditMode();
      alert('Profile updated successfully!');
    } else {
      const serverMsg = data?.message || data?.error || text || `HTTP ${response.status}`;
      console.error('Profile update failed:', response.status, serverMsg, data);
      alert('Error updating profile: ' + serverMsg);
    }
  } catch (error) {
    console.error('Error saving profile:', error);
    alert('Error saving profile: ' + error.message);
  }
}

// Password modal functions
function openPasswordModal() {
  document.getElementById('passwordModal').style.display = 'flex';
}

function closePasswordModal() {
  document.getElementById('passwordModal').style.display = 'none';
  document.getElementById('passwordForm').reset();
}

// Change password
async function changePassword(e) {
  e.preventDefault();

  try {
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (!currentPassword || !newPassword || !confirmPassword) {
      alert('All fields are required');
      return;
    }

    if (newPassword !== confirmPassword) {
      alert('New passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      alert('Password must be at least 6 characters long');
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      alert('Not authenticated. Please login again.');
      return;
    }

    // Send to backend
    const response = await fetch('/api/auth/users/change-password', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    let data, text;
    try {
      data = await response.json();
    } catch (parseErr) {
      text = await response.text().catch(() => '');
      console.error('Failed to parse JSON response for change-password:', parseErr, text);
    }

    if (response.ok) {
      console.log('✓ Password changed successfully');
      alert('✅ Password changed successfully!');
      closePasswordModal();
    } else {
      const serverMsg = data?.message || data?.error || text || `HTTP ${response.status}`;
      console.error('Change password failed:', response.status, serverMsg, data);
      alert('Error: ' + serverMsg);
    }
  } catch (error) {
    console.error('Error changing password:', error);
    alert('Error: ' + error.message);
  }
}

// Enable two-factor authentication
// Two-Factor Authentication removed from UI; no-op kept intentionally for compatibility
// (feature removed) 

// Delete account
// Delete account
async function deleteAccount() {
  const proceed = window.confirm(
    '⚠️ WARNING: This will permanently delete your account and all associated data.\n\nAre you sure you want to continue?'
  );
  if (!proceed) return;

  const confirmation = window.prompt('Type DELETE to confirm account deletion:');
  if (confirmation !== 'DELETE') {
    alert('Account deletion cancelled.');
    return;
  }

  const deleteBtn = document.getElementById('deleteAccountBtn');
  if (deleteBtn) deleteBtn.disabled = true;

  try {
    const token = localStorage.getItem('token');
    if (!token) {
      alert('Not authenticated. Please login again.');
      if (deleteBtn) deleteBtn.disabled = false;
      return;
    }

    const resp = await fetch('/api/auth/users', {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    let body = {};
    try { body = await resp.json(); } catch (e) { }

    if (resp.ok) {
      // Clear local session and redirect to landing
      invalidateUserStatsCache();
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      alert('Your account has been deleted. You will be redirected.');
      window.location.href = 'index.html';
    } else {
      alert('Failed to delete account: ' + (body.message || `HTTP ${resp.status}`));
      if (deleteBtn) deleteBtn.disabled = false;
    }
  } catch (err) {
    console.error('Error deleting account:', err);
    alert('Error deleting account: ' + (err.message || err));
    if (deleteBtn) deleteBtn.disabled = false;
  }
}

// Logout
function logout() {
  const confirm = window.confirm('Are you sure you want to logout?');
  if (!confirm) return;

  localStorage.removeItem('token');
  localStorage.removeItem('user');
  console.log('User logged out');
  window.location.href = 'login.html';
}

// Debug helper: fetch public profile by email
async function fetchProfileByEmail(email) {
  if (!email) throw new Error('Email is required');
  const token = localStorage.getItem('token');
  if (!token) throw new Error('Not authenticated');
  const resp = await fetch(`/api/auth/users/by-email?email=${encodeURIComponent(email)}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.message || 'Failed to fetch profile');
  return data.user;
}
// Expose helper for quick console testing
window.fetchProfileByEmail = fetchProfileByEmail;
