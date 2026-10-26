# Google OAuth Setup Guide

## Overview
This guide will help you set up Google OAuth authentication for the Annasetu application.

## Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click on the project dropdown at the top
3. Click **NEW PROJECT**
4. Enter project name: `Annasetu` (or your preferred name)
5. Click **CREATE**
6. Wait for the project to be created

## Step 2: Enable Google+ API

1. In the Google Cloud Console, go to **APIs & Services** → **Library**
2. Search for **"Google+ API"**
3. Click on it and then click **ENABLE**
4. Now search for **"User Identity and Access Management API"** and enable it too

## Step 3: Create OAuth 2.0 Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **+ CREATE CREDENTIALS** at the top
3. Choose **OAuth Client ID**
4. If prompted, click **CONFIGURE CONSENT SCREEN** first
   - Choose **External** user type
   - Click **CREATE**
   - Fill in the required fields:
     - **App name**: Annasetu
     - **User support email**: your-email@example.com
     - **Developer contact info**: your-email@example.com
   - Click **SAVE AND CONTINUE**
   - On the next screen, click **SAVE AND CONTINUE** (scopes are optional)
   - Click **SAVE AND CONTINUE** again (optional info)
   - Review and click **BACK TO DASHBOARD**

5. Now go back to **Credentials** and click **+ CREATE CREDENTIALS** again
6. Choose **OAuth Client ID**
7. Select **Web application**
8. Add **Authorized JavaScript origins**:
   - `http://localhost:5000`
   - `http://localhost:3000`
   - `http://127.0.0.1:5000`

9. Add **Authorized redirect URIs**:
   - `http://localhost:5000/api/auth/google/callback`

10. Click **CREATE**
11. A popup will show your credentials - **SAVE THESE**

## Step 4: Update Your Environment Variables

1. Open the `.env` file in your project root
2. Replace the Google OAuth placeholders with your credentials:

```env
GOOGLE_CLIENT_ID=your_client_id_here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_CALLBACK_URL=http://localhost:5000/api/auth/google/callback
```

## Step 5: Install Dependencies

Run this command in your project directory:

```bash
npm install
```

This will install:
- `passport` - Authentication middleware
- `passport-google-oauth20` - Google OAuth strategy
- `express-session` - Session management

## Step 6: Test Google OAuth

1. Start your server:
   ```bash
   npm start
   # or for development with auto-reload:
   npm run dev
   ```

2. Go to `http://localhost:5000/login.html`
3. Click the **"Sign in with Google"** button
4. You should be redirected to Google's login
5. After login, you should be redirected back to your dashboard

## Step 7 (Optional): Use Google Sign-In Widget

If you want to use Google's official sign-in widget instead of the button:

1. In [login.html](annasetu_clients/login.html), find this line:
   ```html
   data-client_id="YOUR_GOOGLE_CLIENT_ID"
   ```

2. Replace `YOUR_GOOGLE_CLIENT_ID` with your actual Google Client ID

The widget will appear and users can sign in from there.

## Troubleshooting

### Issue: "Failed to load credentials"
- **Solution**: Make sure your `.env` file has the correct `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`

### Issue: "Redirect URI mismatch"
- **Solution**: Ensure the callback URL in Google Cloud Console matches exactly:
  - Google Console: `http://localhost:5000/api/auth/google/callback`
  - `.env` file: `GOOGLE_CALLBACK_URL=http://localhost:5000/api/auth/google/callback`

### Issue: "Invalid OAuth client"
- **Solution**: Your credentials might be copied incorrectly. Go back to Google Cloud Console and verify they match exactly

### Issue: Users can't login with Google
- **Solution**: 
  1. Check browser console for errors (F12 → Console tab)
  2. Check server logs for error messages
  3. Make sure your MongoDB is running
  4. Make sure port 5000 is not already in use

## How It Works

1. **User clicks "Sign in with Google"**
   - Redirected to Google login page

2. **User authorizes your app**
   - Google redirects back to your callback URL with authorization code

3. **Backend exchanges code for user info**
   - Passport handles this in the background

4. **User is created or updated in database**
   - Stored with Google ID and basic info

5. **JWT token is generated**
   - User is logged in and redirected to dashboard

## Security Notes

- Never commit your `.env` file to git (it's in .gitignore)
- In production, use HTTPS (change `http://` to `https://`)
- Use environment variables for all sensitive data
- Add your production domain to Google Cloud Console credentials

## What Changed in Your Code

### New Files:
- `config/passport.js` - Google OAuth strategy configuration

### Updated Files:
- `package.json` - Added passport dependencies
- `.env` - Added Google OAuth credentials
- `server.js` - Added Passport initialization
- `models/user.js` - Added Google ID fields
- `controllers/authcontrollers.js` - Added Google callback handler
- `routes/authroutes.js` - Added Google OAuth routes
- `login.html` - Added Google Sign-In button
- `js/login.js` - Added Google callback handler
- `css/login.css` - Added Google button styling

## Next Steps

Once Google OAuth is working, you can:
- Add more OAuth providers (GitHub, Facebook, etc.)
- Customize user profile page with Google profile picture
- Add "Connect Google Account" option in user settings
- Implement forgot password with Google authentication fallback
