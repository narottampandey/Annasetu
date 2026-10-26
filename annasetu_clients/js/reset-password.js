document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const info = document.getElementById('resetInfo');
    const form = document.getElementById('resetForm');

    if (!token) {
        if (info) info.textContent = 'Invalid or missing token. Please request a new password reset.';
        if (form) form.style.display = 'none';
        return;
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newPassword = document.getElementById('newPassword').value;
        const confirm = document.getElementById('confirmPassword').value;
        if (!newPassword || !confirm) return alert('Please fill both fields');
        if (newPassword !== confirm) return alert('Passwords do not match');
        if (newPassword.length < 6) return alert('Password must be at least 6 characters');

        try {
            const resp = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, newPassword })
            });
            const data = await resp.json().catch(() => ({}));
            if (resp.ok) {
                alert('Password updated successfully. Please login with your new password.');
                window.location.href = 'login.html';
            } else {
                alert('Error: ' + (data.message || `HTTP ${resp.status}`));
            }
        } catch (err) {
            console.error('reset-password error:', err);
            alert('An error occurred. Please try again later.');
        }
    });
});
