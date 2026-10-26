// Base API URL helper — respects env.js when present, falls back to localhost for local static hosts.
const API_BASE = (function () {
  const configured = String(window.__API_PREFIX__ || window.API_BASE || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  const defaultBackend = 'http://localhost:5000';
  try {
    if (window.location.protocol === 'file:') return defaultBackend;
    const port = window.location.port;
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

  console.log('=== Checking for Google Token (Register Page) ===');
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

// Register Form Handler
document.addEventListener('DOMContentLoaded', () => {
  console.log('Register page loaded');

  // Check for Google token on page load FIRST
  if (checkForGoogleToken()) {
    return; // Exit if token was found and we're redirecting
  }

  const registerForm = document.querySelector('form');
  console.log('Form found:', !!registerForm);

  if (registerForm) {
    console.log('Attaching submit event listener');

    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      console.log('Form submitted');

      // Get form values
      const name = document.querySelector('input[name="fullname"]').value;
      const email = document.querySelector('input[name="email"]').value;
      const phone = document.querySelector('input[name="phone"]').value;
      const password = document.querySelector('input[name="password"]').value;
      const confirmPassword = document.querySelector('input[name="confirm_password"]').value;

      console.log('Form values:', { name, email, phone, password, confirmPassword });

      // Validation
      if (!name || !email || !phone || !password || !confirmPassword) {
        alert('Please fill in all fields');
        return;
      }

      if (password !== confirmPassword) {
        alert('Passwords do not match');
        return;
      }

      if (password.length < 6) {
        alert('Password must be at least 6 characters long');
        return;
      }

      try {
        console.log('Sending fetch request to: /api/auth/register');

        // Send registration request
        const response = await fetch(apiUrl('/api/auth/register'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name,
            email,
            phone,
            password
          })
        });

        console.log('Response received - Status:', response.status, 'OK:', response.ok);

        const data = await response.json();
        console.log('Response data:', data);

        if (response.ok) {
          // Show modal dialog telling the user to check their email and allowing resend
          const modal = document.getElementById('verificationModal');
          const verificationEmail = document.getElementById('verificationEmail');
          const resendBtn = document.getElementById('resendBtn');
          const closeBtn = document.getElementById('closeModalBtn');
          const resendStatus = document.getElementById('resendStatus');

          verificationEmail.textContent = email;
          resendStatus.textContent = '';
          modal.style.display = 'flex';

          let sending = false;
          resendBtn.onclick = async () => {
            if (sending) return;
            sending = true;
            resendBtn.disabled = true;
            resendBtn.textContent = 'Resending...';
            resendStatus.textContent = '';
            try {
              const r = await fetch(apiUrl('/api/auth/resend-verification'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
              });
              const resp = await r.json();
              if (r.ok) {
                resendStatus.style.color = 'green';
                resendStatus.textContent = resp.message || 'Verification email resent';
              } else {
                resendStatus.style.color = 'red';
                resendStatus.textContent = resp.message || 'Failed to resend verification email';
              }
            } catch (err) {
              console.error('Resend fetch error:', err);
              resendStatus.style.color = 'red';
              resendStatus.textContent = err.message || 'Network error';
            } finally {
              sending = false;
              resendBtn.disabled = false;
              resendBtn.textContent = 'Resend link';
            }
          };

          closeBtn.onclick = () => {
            modal.style.display = 'none';
          };

        } else {
          alert(data.message || 'Registration failed, please try again');
        }
      } catch (error) {
        console.error('Fetch Error:', error);
        alert('Error: ' + error.message);
      }
    });
  } else {
    console.error('Form not found on page');
  }
});
