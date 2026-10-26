// Notifications Page JavaScript
let isPageInitialized = false;
let initStartTime = 0;
let notifications = [];
let notificationsCacheKey = null;

// Initialize on page load with better error handling

// Track unseen notifications
let unseenNotificationCount = 0;

// Request browser notification permission
function requestNotificationPermission() {
  if ('Notification' in window) {
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }
}

// Show browser notification
function showBrowserNotification(title, message) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body: message, icon: '/favicon.ico' });
  }
}

// Update bell badge
function updateNotificationBadge() {
  const badge = document.getElementById('notificationBadge');
  if (!badge) return;
  if (unseenNotificationCount > 0) {
    badge.textContent = unseenNotificationCount;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // Ask for browser notification permission
  requestNotificationPermission();
  if (isPageInitialized) {
    console.warn('⚠️ Page already initialized, skipping...');
    return;
  }

  initStartTime = Date.now();
  console.log('=== Notifications Page Loading ===');

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

    // Load notifications from backend
    await loadNotifications();
    // Initialize unseen count from localStorage
    unseenNotificationCount = parseInt(localStorage.getItem('unseenNotifications') || '0', 10) || 0;
    updateNotificationBadge();

    // Setup event listeners
    setupEventListeners();

    // When the user opens the Notifications page consider notifications as "seen"
    // and clear the unseen counter so the badge hides. Persist to localStorage
    // so other tabs/windows can observe the change.
    try {
      if (unseenNotificationCount > 0) {
        unseenNotificationCount = 0;
        localStorage.setItem('unseenNotifications', '0');
        updateNotificationBadge();
      }
    } catch (e) { console.warn('Failed to clear unseenNotifications', e); }

    // Reset badge when clicking the bell link (defensive). Persist change.
    const bellLink = document.getElementById('notificationBellLink');
    if (bellLink) {
      bellLink.addEventListener('click', () => {
        try {
          unseenNotificationCount = 0;
          localStorage.setItem('unseenNotifications', '0');
        } catch (e) { console.warn('Failed to clear unseenNotifications on click', e); }
        updateNotificationBadge();
      });
    }

    // Keep the badge in sync across browser tabs/windows when localStorage changes
    window.addEventListener('storage', (e) => {
      if (e.key === 'unseenNotifications') {
        unseenNotificationCount = parseInt(e.newValue || '0', 10) || 0;
        updateNotificationBadge();
      }
    });

    // Setup listeners for real-time notifications (global socket)
    setupSocketNotifications();

    // Mark page as initialized
    isPageInitialized = true;
    const loadTime = Date.now() - initStartTime;
    console.log(`✓ Notifications Page Ready (loaded in ${loadTime}ms)`);
  } catch (error) {
    console.error('❌ Error initializing notifications page:', error);
    isPageInitialized = false;
  }
});

// Handle page visibility changes (user returns to tab)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    console.log('Notifications page hidden');
    return;
  }

  console.log('Notifications page visible again');
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

  // Refresh notifications if needed
  if (isPageInitialized) {
    console.log('Refreshing notifications...');
    loadNotifications();
    // Mark notifications as seen when the page becomes visible
    try {
      localStorage.setItem('unseenNotifications', '0');
      unseenNotificationCount = 0;
      updateNotificationBadge();
    } catch (e) { console.warn('Failed to clear unseenNotifications on visibilitychange', e); }
  }
});

// Load notifications from backend
async function loadNotifications() {
  try {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    const userId = user?.id || user?._id || user?.email || 'unknown';
    notificationsCacheKey = `notifications_${userId}`;

    const data = await fetchJsonWithCache(apiUrl('/api/notifications'), notificationsCacheKey, {
      headers: { 'Authorization': `Bearer ${token}` }
    }, { ttl: 30 * 1000, background: true });

    notifications = (data.notifications || []).map(n => ({
      message: n.message,
      title: n.title || 'Notification',
      icon: 'fa-bell',
      timestamp: n.createdAt,
      notificationId: n._id,
      foodId: n.foodId,
      addedBy: n.addedBy
    }));
    displayNotifications();
    console.log('✓ Notifications loaded successfully');
  } catch (error) {
    console.error('Error loading notifications:', error);
    displayNotifications();
  }
}
// Setup listeners for real-time notifications using the global socket
function setupSocketNotifications() {
  // Use custom event dispatched by `common-utils` when a notification arrives
  window.addEventListener('annasetu:new_notification', (e) => {
    const notif = e.detail;
    console.log('🔔 New notification received (page):', notif);
    // Add to notifications array and update UI
    notifications.unshift({
      message: notif.message,
      title: 'Notification',
      icon: 'fa-bell',
      timestamp: notif.createdAt,
      notificationId: notif.notificationId,
      foodId: notif.foodId,
      addedBy: notif.addedBy
    });
    displayNotifications();

    try {
      if (notificationsCacheKey) {
        cacheSet(notificationsCacheKey, {
          notifications: notifications.map(n => ({
            _id: n.notificationId,
            message: n.message,
            title: n.title,
            createdAt: n.timestamp,
            foodId: n.foodId,
            addedBy: n.addedBy
          }))
        });
      }
    } catch (cacheErr) {
      console.warn('Failed to update notifications cache', cacheErr);
    }

    // Sync unseen count from localStorage (global handler updated it)
    unseenNotificationCount = parseInt(localStorage.getItem('unseenNotifications') || '0', 10) || 0;
    updateNotificationBadge();
  });

  // If global socket not present yet, common-utils will create it when loaded.
  if (window.__annasetuSocket) {
    console.log('🔔 Using global notification socket');
  } else {
    console.log('🔔 Waiting for global socket to initialize');
  }
}

// Display notifications on page
function displayNotifications() {
  try {
    const container = document.getElementById('notificationsContainer');

    if (!container) {
      console.warn('Notifications container not found');
      return;
    }

    if (notifications.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-inbox" style="font-size: 48px; color: #ccc; margin-bottom: 15px;"></i>
          <h3 style="color: #666; margin-bottom: 10px;">No Notifications Yet</h3>
          <p style="color: #999;">When you receive notifications, they'll appear here.</p>
        </div>
      `;
      return;
    }

    const notificationsList = notifications.map(notif => `
      <div class="notification-item">
        <div class="notification-icon">
          <i class="fas ${notif.icon || 'fa-bell'}"></i>
        </div>
        <div class="notification-content">
          ${(notif.title && notif.title !== 'Notification')
        ? `<h4>${notif.title}</h4><p>${notif.message || ''}</p>`
        : `<h4>${notif.message || ''}</h4>`}
          <span class="notification-time">${formatTime(notif.timestamp)}</span>
        </div>
        <button class="notification-close" onclick="closeNotification(this)">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `).join('');

    container.innerHTML = notificationsList;
    console.log(`✓ ${notifications.length} notifications displayed`);
  } catch (error) {
    console.error('Error displaying notifications:', error);
  }
}

// Close notification
function closeNotification(element) {
  element.closest('.notification-item').remove();
}

// Format time
function formatTime(timestamp) {
  if (!timestamp) return 'Just now';

  const date = new Date(timestamp);
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);

  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} min ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
  return date.toLocaleDateString();
}

// Setup event listeners
function setupEventListeners() {
  // Add any notification-related event listeners here
  console.log('Notification event listeners setup complete');
}
