const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const hpp = require("hpp");

const getAllowedOrigins = () => {
  const raw = process.env.ALLOWED_ORIGINS || "";
  return raw.split(",").map((o) => o.trim()).filter(Boolean);
};

const corsOptions = {
  origin: (origin, callback) => {
    const allowed = getAllowedOrigins();
    if (!origin) return callback(null, true);
    if (allowed.length === 0 || allowed.includes("*") || allowed.includes(origin))
      return callback(null, true);
    callback(new Error(`CORS: origin '${origin}' not allowed`));
  },
  credentials: true,
  optionsSuccessStatus: 200,
};

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Upload rate limit exceeded, please try again later" },
});

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

module.exports = { corsOptions, generalLimiter, uploadLimiter, sanitizeBody, helmet, hpp };
