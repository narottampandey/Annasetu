/**
 * COMMON UTILITIES FOR ALL PAGES
 * Handles logout functionality and other shared operations
 */

// Initialize logout handlers on all pages
document.addEventListener('DOMContentLoaded', function () {
    initializeLogoutHandlers();
    initGlobalNotifications();
});

/**
 * Setup logout event listeners
 * This should be called on every page that has a logout button
 */
function initializeLogoutHandlers() {
    const logoutBtns = document.querySelectorAll('.logout');

    logoutBtns.forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            performLogout();
        });
    });
}

/**
 * Perform logout operation
 */
function performLogout() {
    console.log('🔓 Performing logout...');

    // Clear all user data
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('donations');
    localStorage.removeItem('requests');
    // Clear donation-related caches
    clearCachePrefix('donations_');

    // Can add confirmation if desired
    console.log('✓ User logged out successfully');

    // Redirect to login/home page
    window.location.href = 'index.html';
}

/* -------------------- Simple localStorage cache helpers -------------------- */

function cacheGet(key) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (e) {
        console.warn('cacheGet parse error', e);
        return null;
    }
}

function cacheSet(key, value) {
    try {
        const payload = { ts: Date.now(), v: value };
        localStorage.setItem(key, JSON.stringify(payload));
    } catch (e) {
        console.warn('cacheSet failed', e);
    }
}

function cacheDelete(key) {
    try { localStorage.removeItem(key); } catch (e) { console.warn('cacheDelete failed', e); }
}

function clearCachePrefix(prefix) {
    try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const k = localStorage.key(i);
            if (k && k.startsWith(prefix)) {
                localStorage.removeItem(k);
            }
        }
    } catch (e) {
        console.warn('clearCachePrefix failed', e);
    }
}

/**
 * Fetch JSON with a simple stale-while-revalidate cache.
 * - Returns cached value immediately if fresh (within ttl).
 * - If cached but stale, returns cached value and refreshes in background.
 * - If no cache, waits for network response and caches it.
 * fetchOptions are passed to window.fetch
 */
async function fetchJsonWithCache(url, cacheKey, fetchOptions = {}, opts = {}) {
    const ttl = (opts && opts.ttl) || 60 * 1000; // default 60s
    const background = opts.background !== false;

    // Only cache GET requests
    const method = (fetchOptions.method || 'GET').toUpperCase();
    if (method !== 'GET') {
        // Non-GET: do network call and return parsed JSON (no caching)
        const res = await fetch(url, fetchOptions);
        if (!res.ok) throw new Error('Network request failed: ' + res.status);
        return await res.json();
    }

    const cached = cacheGet(cacheKey);
    const now = Date.now();
    if (cached && (now - (cached.ts || 0) < ttl)) {
        return cached.v; // fresh
    }

    if (cached && background) {
        // return stale and refresh in background
        (async () => {
            try {
                const res = await fetch(url, fetchOptions);
                if (!res.ok) return;
                const json = await res.json();
                cacheSet(cacheKey, json);
                console.log('✓ Background cache refresh:', cacheKey);
            } catch (e) {
                console.warn('Background refresh failed for', cacheKey, e);
            }
        })();
        return cached.v;
    }

    // No cache: fetch and wait
    try {
        const res = await fetch(url, fetchOptions);
        if (!res.ok) throw new Error('Network request failed: ' + res.status);
        const json = await res.json();
        cacheSet(cacheKey, json);
        return json;
    } catch (err) {
        console.warn('fetchJsonWithCache network failure', err);
        // If we had a stale cache, return it as a fallback
        if (cached) return cached.v;
        throw err;
    }
}

/**
 * Update donation-related caches after creating/updating a donation.
 * Appends/prepends the supplied donation object to available + user caches when present.
 */
function updateDonationCachesAfterChange(donation, userId, userEmail) {
    try {
        const userIdStr = userId !== undefined && userId !== null ? String(userId) : null;
        const userEmailStr = userEmail ? String(userEmail).toLowerCase() : null;
        const donorIdRaw = donation?.userId?._id || donation?.userId?.id || donation?.userId || null;
        const donorIdStr = donorIdRaw ? String(donorIdRaw) : null;
        const donorEmailRaw = donation?.userId?.email || donation?.userEmail || null;
        const donorEmailStr = donorEmailRaw ? String(donorEmailRaw).toLowerCase() : null;
        const isOwnDonation = (userIdStr && donorIdStr && userIdStr === donorIdStr) ||
            (userEmailStr && donorEmailStr && userEmailStr === donorEmailStr);

        // Update user's cache
        const myKey = `donations_my_${userId}`;
        const myCached = cacheGet(myKey);
        if (myCached && Array.isArray(myCached.v.donations)) {
            const newArr = [donation].concat(myCached.v.donations);
            cacheSet(myKey, { donations: newArr });
        } else {
            cacheSet(myKey, { donations: [donation] });
        }

        // Update available cache
        const availKey = 'donations_available';
        const availCached = cacheGet(availKey);
        if (availCached && Array.isArray(availCached.v.donations)) {
            const filtered = availCached.v.donations.filter((d) => {
                const oidRaw = d?.userId?._id || d?.userId?.id || d?.userId || null;
                const oid = oidRaw ? String(oidRaw) : null;
                const oemailRaw = d?.userId?.email || d?.userEmail || null;
                const oemail = oemailRaw ? String(oemailRaw).toLowerCase() : null;

                if (userIdStr && oid && oid === userIdStr) return false;
                if (userEmailStr && oemail && oemail === userEmailStr) return false;
                return true;
            });

            if (!isOwnDonation) {
                filtered.unshift(donation);
            }

            cacheSet(availKey, { donations: filtered });
        } else if (!isOwnDonation) {
            cacheSet(availKey, { donations: [donation] });
        }
    } catch (e) {
        console.warn('updateDonationCachesAfterChange failed', e);
    }
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lon1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lon2 - Longitude of point 2
 * @returns {number} Distance in kilometers
 */
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

/**
 * Get formatted distance text for UI display
 * @param {number} distanceInKm - Distance in kilometers
 * @returns {string} Formatted distance string (e.g., "12.5 km")
 */
function getFormattedDistance(distanceInKm) {
    if (isNaN(distanceInKm) || distanceInKm < 0) {
        return 'Distance N/A';
    }

    if (distanceInKm < 0.1) {
        return '< 0.1 km';
    }

    return `${distanceInKm.toFixed(1)} km`;
}

/* -------------------- Global Notifications -------------------- */
// Initialize global notification system: request permission and connect socket
function initGlobalNotifications() {
    try {
        // Request browser notification permission (non-blocking)
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission().then(p => console.log('Notification permission:', p));
        }
    } catch (e) {
        console.warn('Notification API not available', e);
    }

    // Load Socket.io client script dynamically if needed and then setup socket
    if (typeof io === 'undefined') {
        const existing = document.querySelector('script[data-socketio-loader]');
        if (!existing) {
            const s = document.createElement('script');
            s.src = 'https://cdn.socket.io/4.7.5/socket.io.min.js';
            s.setAttribute('data-socketio-loader', '1');
            s.onload = () => setupGlobalSocket();
            s.onerror = (err) => console.error('Failed to load socket.io client', err);
            document.head.appendChild(s);
        }
    } else {
        setupGlobalSocket();
    }
}

function setupGlobalSocket() {
    // Avoid creating multiple sockets
    if (window.__annasetuSocket) return;

    try {
        const token = localStorage.getItem('token');
        // Socket endpoint can be configured at runtime by setting `window.__SOCKET_ENDPOINT__`.
        // If not set, default to local backend during development (localhost), otherwise connect to same origin.
        const socketHost = window.__SOCKET_ENDPOINT__ || (location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? 'http://localhost:5000' : undefined);
        const socket = socketHost ? io(socketHost, { auth: { token } }) : io({ auth: { token } });
        window.__annasetuSocket = socket;

        socket.on('connect', () => {
            console.log('Global socket connected:', socket.id);
        });

        socket.on('disconnect', (reason) => {
            console.log('Global socket disconnected:', reason);
        });

        socket.on('new_notification', (notif) => {
            try {
                console.log('Global new_notification received:', notif);
                // Store pending notifications locally (simple queue)
                const pending = JSON.parse(localStorage.getItem('pendingNotifications') || '[]');
                pending.unshift(notif);
                localStorage.setItem('pendingNotifications', JSON.stringify(pending));

                // Increment unseen counter
                const unseen = parseInt(localStorage.getItem('unseenNotifications') || '0', 10) || 0;
                localStorage.setItem('unseenNotifications', unseen + 1);

                // Dispatch custom event so pages can update UI
                window.dispatchEvent(new CustomEvent('annasetu:new_notification', { detail: notif }));

                // Show native browser notification if permission granted
                if ('Notification' in window && Notification.permission === 'granted') {
                    try {
                        new Notification('New Notification', { body: notif.message, icon: '/favicon.ico' });
                    } catch (e) {
                        console.warn('Failed to show browser notification', e);
                    }
                }

                // Update an on-page badge if present
                const badge = document.getElementById('notificationBadge');
                if (badge) {
                    const count = parseInt(localStorage.getItem('unseenNotifications') || '0', 10) || 0;
                    badge.textContent = count;
                    badge.style.display = count > 0 ? 'inline-block' : 'none';
                }
            } catch (err) {
                console.error('Error handling incoming notification', err);
            }
        });
    } catch (err) {
        console.error('Failed to setup global socket', err);
    }
}

// Keep notification badge in sync across tabs/windows when unseenNotifications changes
window.addEventListener('storage', (e) => {
    if (e.key === 'unseenNotifications') {
        try {
            const badge = document.getElementById('notificationBadge');
            const count = parseInt(e.newValue || '0', 10) || 0;
            if (badge) {
                badge.textContent = String(count);
                badge.style.display = count > 0 ? 'inline-block' : 'none';
            }
        } catch (err) {
            console.warn('Failed to update notification badge from storage event', err);
        }
    }
});

