const express = require("express");
const path = require("path");
const cors = require("cors");
const session = require("express-session");
const passport = require("passport");

// Load environment
const dotenv = require('dotenv');
const envPath = path.join(__dirname, ".env");
dotenv.config({ path: envPath });

// Configure Passport (side-effect: strategies registration)
require("./config/passport");

const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
// Configure allowed CORS origins via env var `ALLOWED_ORIGINS` (comma-separated).
const defaultOrigins = [
  "http://localhost:5000",
  "http://localhost:3000",
  "http://127.0.0.1:5000",
  "http://127.0.0.1:5500",
  "http://localhost:5500"
];

const normalizeOrigin = (value) => {
  if (!value) return "";
  const trimmed = String(value).trim().replace(/\/+$/, "");
  try {
    return new URL(trimmed).origin;
  } catch (e) {
    return trimmed;
  }
};

const parseOrigins = (value) => {
  if (!value) return [];
  return String(value)
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);
};

const extraOrigins = [process.env.FRONTEND_URL, process.env.BACKEND_URL]
  .map(normalizeOrigin)
  .filter(Boolean);

const allowedOrigins = Array.from(new Set([
  ...defaultOrigins.map(normalizeOrigin),
  ...parseOrigins(process.env.ALLOWED_ORIGINS),
  ...extraOrigins
]));

console.log('CORS allowed origins:', allowedOrigins);

app.use(cors({
  origin: function (origin, callback) {
    // Allow non-browser tools (e.g., curl, server-to-server)
    if (!origin) return callback(null, true);
    const normalizedOrigin = normalizeOrigin(origin);
    if (allowedOrigins.indexOf('*') !== -1 || allowedOrigins.indexOf(normalizedOrigin) !== -1) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-admin-key"]
}));

app.use(session({
  secret: process.env.JWT_SECRET || "your_session_secret",
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
}));

app.use(passport.initialize());
app.use(passport.session());

// Request logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Optionally serve frontend static files from the backend. Set `SERVE_STATIC=false`
// in production when deploying the frontend separately (e.g., Vercel).
const serveStatic = process.env.SERVE_STATIC !== 'false';
console.log('SERVE_STATIC=', serveStatic);
if (serveStatic) {
  app.use(express.static(path.join(__dirname, "../annasetu_clients")));
}

// API routes
app.use("/api/auth", require("./routes/authroutes"));
app.use("/api/donations", require("./routes/donationroutes"));
app.use("/api/notifications", require("./routes/notificationroutes"));
app.use("/api/reviews", require("./routes/reviewroutes"));

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(err.status || 500).json({ message: err.message || 'Internal Server Error', error: process.env.NODE_ENV === 'development' ? err : {} });
});

module.exports = app;
