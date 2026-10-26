const mongoose = require("mongoose");

const connectDB = async (retries = 3) => {
  const rawUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!rawUri || typeof rawUri !== "string") {
    console.warn(
      "MongoDB connection warning: MONGO_URI is not set. Skipping DB connection (development fallback)."
    );
    // Return early so the app can run in development without a DB configured.
    return;
  }

  // Defensive sanitization: trim, strip surrounding quotes, remove BOM, and
  // attempt to extract a valid mongodb scheme if extra characters were prepended.
  let uri = rawUri.trim();
  if ((uri.startsWith('"') && uri.endsWith('"')) || (uri.startsWith("'") && uri.endsWith("'"))) {
    uri = uri.slice(1, -1);
  }
  // Remove common BOM character if present
  uri = uri.replace(/\uFEFF/g, '').trim();

  // If it doesn't start with the expected scheme, try to salvage by finding
  // the first occurrence of 'mongodb' and taking the substring from there.
  if (!/^mongodb(\+srv)?:\/\//i.test(uri)) {
    const idx = uri.toLowerCase().indexOf('mongodb');
    if (idx !== -1) {
      console.warn('MongoDB URI did not start with scheme, extracting substring from first "mongodb"');
      uri = uri.slice(idx);
    } else {
      console.warn('MongoDB connection warning: MONGO_URI does not appear to be a valid MongoDB connection string. Skipping DB connection.');
      return;
    }
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`[${attempt}/${retries}] Connecting to MongoDB...`);

      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 10000,
        retryWrites: true,
        w: 'majority'
      });

      console.log("✓ MongoDB connected successfully");

      // Handle connection reconnection events
      mongoose.connection.on('disconnected', () => {
        console.warn("⚠️  MongoDB disconnected - app will attempt to reconnect");
      });

      mongoose.connection.on('error', (error) => {
        console.error("❌ MongoDB connection error:", error.message);
      });

      return; // Success - exit the retry loop

    } catch (error) {
      console.error(`❌ Connection attempt ${attempt} failed:`, error.message);

      if (attempt < retries) {
        const delayMs = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, 8s
        console.log(`⏳ Retrying in ${delayMs / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      } else {
        throw error;
      }
    }
  }
};

module.exports = connectDB;
