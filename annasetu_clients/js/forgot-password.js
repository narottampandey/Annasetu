document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('forgotForm');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value.trim();
        if (!email) return alert('Please enter your email');

        try {
            const resp = await fetch('/api/auth/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            const data = await resp.json().catch(() => ({}));
            if (resp.ok) {
                alert('If that email is registered, a password reset link has been sent.');
                window.location.href = 'login.html';
            } else {
                alert('Error: ' + (data.message || `HTTP ${resp.status}`));
            }
        } catch (err) {
            console.error('forgot-password error:', err);
            alert('An error occurred. Please try again later.');
        }
    });
});
