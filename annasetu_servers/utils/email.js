const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: process.env.EMAIL_PORT ? Number(process.env.EMAIL_PORT) : 587,
    secure: process.env.EMAIL_SECURE === 'true' || false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Verify transporter at startup if configured
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    transporter.verify((error, success) => {
        if (error) {
            console.error('Email transporter verification failed:', error);
        } else {
            console.log('Email transporter is ready to send messages');
        }
    });
} else {
    console.log('Email notifications disabled (EMAIL_USER / EMAIL_PASS not set).');
}

async function sendVerificationEmail({ to, name, token }) {
    const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;
    const verifyUrl = `${backendUrl}/api/auth/verify-email?token=${token}`;

    const mailOptions = {
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to,
        subject: 'Verify your AnnaSetu account',
        html: `
      <p>Hi ${name || ''},</p>
      <p>Thanks for registering. Please verify your email by clicking the link below:</p>
      <p><a href="${verifyUrl}">Verify Email</a></p>
      <p>This link will expire in 24 hours.</p>
    `
    };

    console.log(`Sending verification email to ${to}`);
    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Verification email sent:', info.messageId || info.response || info);
        return info;
    } catch (err) {
        console.error('Error sending verification email:', err);
        throw err;
    }
}

async function sendPasswordResetEmail({ to, name, token }) {
    const frontendUrl = process.env.FRONTEND_URL || `http://localhost:${process.env.PORT || 5000}`;
    const resetUrl = `${frontendUrl}/reset-password.html?token=${encodeURIComponent(token)}`;

    const mailOptions = {
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to,
        subject: 'AnnaSetu Password Reset',
        html: `
      <p>Hi ${name || ''},</p>
      <p>We received a request to reset your password. Click the link below to set a new password:</p>
      <p><a href="${resetUrl}">Reset your password</a></p>
      <p>This link will expire in 1 hour. If you did not request a password reset, please ignore this email.</p>
    `
    };

    console.log(`Sending password reset email to ${to}`);
    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Password reset email sent:', info.messageId || info.response || info);
        return info;
    } catch (err) {
        console.error('Error sending password reset email:', err);
        throw err;
    }
}

async function sendNotificationEmail({ to, subject, html }) {
    const mailOptions = {
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to,
        subject: subject || 'Notification from AnnaSetu',
        html: html || '<p>You have a new notification on AnnaSetu</p>'
    };

    console.log(`Sending notification email to ${to}`);
    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Notification email sent:', info.messageId || info.response || info);
        return info;
    } catch (err) {
        console.error('Error sending notification email:', err);
        throw err;
    }
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail, sendNotificationEmail, transporter };
