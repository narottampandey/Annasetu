const passport = require("passport");
const User = require("../models/user");

// Debug: Check if credentials are loaded
console.log("=== Passport Configuration ===");
console.log("Google Client ID:", process.env.GOOGLE_CLIENT_ID ? "✓ Loaded" : "✗ NOT LOADED");
console.log("Google Client Secret:", process.env.GOOGLE_CLIENT_SECRET ? "✓ Loaded" : "✗ NOT LOADED");
console.log("Google Callback URL:", process.env.GOOGLE_CALLBACK_URL);
console.log("==============================\n");

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Google OAuth Strategy
// Register Google OAuth Strategy only when credentials are provided
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_CALLBACK_URL) {
  const GoogleStrategy = require("passport-google-oauth20").Strategy;
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          // Check if user already exists
          let user = await User.findOne({ googleId: profile.id });

          if (user) {
            // Update refresh token and profile picture when available
            const update = {};
            if (refreshToken) update.googleRefreshToken = refreshToken;
            if (profile.photos && profile.photos[0] && profile.photos[0].value) update.googleProfilePicture = profile.photos[0].value;
            if (Object.keys(update).length) {
              user = await User.findByIdAndUpdate(user._id, update, { new: true });
            }
            return done(null, user);
          }

          // Check if user exists by email
          user = await User.findOne({ email: profile.emails[0].value });

          if (user) {
            // Update existing user with Google info
            user = await User.findByIdAndUpdate(
              user._id,
              {
                googleId: profile.id,
                googleName: profile.displayName,
                googleEmail: profile.emails[0].value,
                googleProfilePicture: profile.photos[0]?.value,
                googleRefreshToken: refreshToken || user.googleRefreshToken,
                authMethod: 'google'
              },
              { new: true }
            );
          } else {
            // Create new user
            user = await User.create({
              name: profile.displayName,
              email: profile.emails[0].value,
              googleId: profile.id,
              googleName: profile.displayName,
              googleEmail: profile.emails[0].value,
              googleProfilePicture: profile.photos[0]?.value,
              googleRefreshToken: refreshToken || undefined,
              authMethod: 'google'
            });
          }

          return done(null, user);
        } catch (error) {
          return done(error, null);
        }
      }
    )
  );
} else {
  console.warn('Google OAuth not configured - skipping GoogleStrategy registration. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_CALLBACK_URL to enable it.');
}
