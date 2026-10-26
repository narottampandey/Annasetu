// Base API URL helper — respects env.js when present, falls back to localhost for local static hosts.
const API_BASE = (function () {
  const configured = String(window.__API_PREFIX__ || window.API_BASE || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  const defaultBackend = 'http://localhost:5000';
  try {
    if (window.location.protocol === 'file:') return defaultBackend;
    const port = window.location.port;
    // If running from a static dev server (e.g. Live Server at :5500), use local backend
    if (port && port !== '5000') return defaultBackend;
    return '';
  } catch (e) { return defaultBackend; }
})();

const apiUrl = (path) => {
  if (!path) return API_BASE;
  if (/^https?:\/\//i.test(path)) return path;
  if (!API_BASE) return path;
  if (path === '/api' || path.startsWith('/api/')) return API_BASE + path;
  return path;
};

// Ensure Google auth link points to backend when serving frontend from a different origin
document.addEventListener('DOMContentLoaded', () => {
  try {
    const googleLink = document.querySelector('.google-btn-primary');
    if (googleLink) googleLink.href = apiUrl('/api/auth/google');
  } catch (e) { /* ignore */ }
});

// Check for token in URL (from Google OAuth redirect)
function checkForGoogleToken() {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  const userId = urlParams.get('userId');
  const userName = urlParams.get('userName');
  const userEmail = urlParams.get('userEmail');

  console.log('=== Checking for Google Token ===');
  console.log('Token:', token ? '✓ Found' : '✗ Not found');
  console.log('URL Params:', { token: !!token, userId, userName, userEmail });

  if (token && userId && userName && userEmail) {
    console.log('✓ All credentials found, storing and redirecting...');
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify({
      id: userId,
      name: decodeURIComponent(userName),
      email: decodeURIComponent(userEmail)
    }));

    // Clear the URL parameters
    window.history.replaceState({}, document.title, window.location.pathname);

    // Redirect to dashboard
    console.log('Redirecting to dashboard...');
    window.location.href = 'dashboard.html';
    return true;
  }
  console.log('=== No valid token found ===');
  return false;
}

// Google OAuth callback handler
function handleCredentialResponse(response) {
  console.log("Google Sign-In successful");
  const token = response.credential;

  // Redirect to the Google auth callback
  window.location.href = apiUrl(`/api/auth/google/callback?token=${token}`);
}

// Login Form Handler
document.addEventListener("DOMContentLoaded", () => {
  console.log("Login page loaded");

  // Show verification success message if redirected from email verification
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('verified') === '1') {
    alert('Email verified successfully! You can now log in.');
    // Remove query param from URL
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  // Check for Google token on page load FIRST
  if (checkForGoogleToken()) {
    return; // Exit if token was found and we're redirecting
  }

  const loginForm = document.querySelector("form");
  console.log("Form found:", !!loginForm);
  if (loginForm) {
    console.log("Attaching submit event listener");

    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      console.log("Form submitted");

      // Get form values
      const email = document.querySelector('input[name="email"]').value;
      const password = document.querySelector('input[name="password"]').value;

      console.log("Form values:", { email, password });

      // Validation
      if (!email || !password) {
        alert("Please fill in all fields");
        return;
      }

      try {
        console.log(
          "Sending fetch request to: /api/auth/login",
        );

        // Send login request
        const response = await fetch(apiUrl('/api/auth/login'), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
            password,
          }),
        });

        console.log(
          "Response received - Status:",
          response.status,
          "OK:",
          response.ok,
        );

        const data = await response.json();
        console.log("Response data:", data);

        if (response.ok) {
          // Store token in localStorage
          localStorage.setItem("token", data.token);
          localStorage.setItem("user", JSON.stringify(data.user));

          // Migrate old global donations to user-specific key if they exist
          const oldDonations = localStorage.getItem("donations");
          if (oldDonations) {
            const userDonationsKey = `donations_${data.user.id}`;
            localStorage.setItem(userDonationsKey, oldDonations);
            localStorage.removeItem("donations");
          }

          // Try to capture a quick device location and cache it (won't block long)
          try {
            // Wait up to 900ms to reduce perceived delay; many devices respond fast
            const locationPromise = new Promise((resolve) => {
              if (!navigator.geolocation) return resolve(null);
              let finished = false;
              const timer = setTimeout(() => { if (!finished) { finished = true; resolve(null); } }, 900);
              navigator.geolocation.getCurrentPosition((pos) => {
                if (finished) return;
                finished = true;
                clearTimeout(timer);
                resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy || null, ts: Date.now() });
              }, (err) => {
                if (finished) return;
                finished = true;
                clearTimeout(timer);
                resolve(null);
              }, { enableHighAccuracy: false, timeout: 800, maximumAge: 60000 });
            });

            const quickLoc = await locationPromise;
            if (quickLoc) {
              try { localStorage.setItem('lastKnownLocation', JSON.stringify(quickLoc)); } catch (e) { console.warn('Could not cache location', e); }
            }
          } catch (e) {
            console.warn('Location capture failed at login:', e);
          }

          alert("Login successful! Redirecting to dashboard...");
          window.location.href = "dashboard.html";
        } else {
          alert(data.message || "Login failed, please try again");
        }
      } catch (error) {
        console.error("Fetch Error:", error);
        alert("Error: " + error.message);
      }
    });
  } else {
    console.error("Form not found on page");
  }
});

