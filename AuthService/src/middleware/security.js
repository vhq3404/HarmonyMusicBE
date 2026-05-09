const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const hpp = require("hpp");

/* ── CORS whitelist ─────────────────────────────── */
const getAllowedOrigins = () => {
  const raw = process.env.ALLOWED_ORIGINS || "";
  return raw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
};

const corsOptions = {
  origin: (origin, callback) => {
    const allowed = getAllowedOrigins();
    // Allow same-origin / server-to-server requests (no Origin header)
    if (!origin) return callback(null, true);
    if (allowed.length === 0 || allowed.includes("*") || allowed.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error(`CORS: origin '${origin}' not allowed`));
  },
  credentials: true,
  optionsSuccessStatus: 200,
};

/* ── Rate limiters ──────────────────────────────── */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
  skip: (req) => req.path === "/api/auth/refresh",
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

/* ── Input sanitizer (strip XSS from string fields) */
function sanitizeBody(req, _res, next) {
  if (req.body && typeof req.body === "object") {
    const strip = (v) =>
      typeof v === "string"
        ? v.replace(/<[^>]*>/g, "").replace(/javascript:/gi, "")
        : v;
    const clean = (obj) => {
      for (const key of Object.keys(obj)) {
        if (typeof obj[key] === "string") obj[key] = strip(obj[key]);
        else if (typeof obj[key] === "object" && obj[key] !== null)
          clean(obj[key]);
      }
    };
    clean(req.body);
  }
  next();
}

module.exports = { corsOptions, authLimiter, generalLimiter, sanitizeBody, helmet, hpp };
