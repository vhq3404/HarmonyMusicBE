/**
 * Shared Security Middleware — Chain of Responsibility + Singleton
 *
 * Single source of truth for CORS, input sanitization, and rate-limiter
 * configuration across all 4 microservices.
 *
 * Pattern — Chain of Responsibility:
 *   Each exported function is a handler link in the Express security chain.
 *   They are registered in the same order in every service:
 *     helmet → cors → body-parser → hpp → sanitizeBody → [limiters] → routes
 *
 * Pattern — Singleton (via module cache):
 *   corsOptions is built once and shared across every require() of this module.
 *
 * Usage:
 *   const { corsOptions, sanitizeBody, createRateLimiter, helmet, hpp }
 *     = require("../../shared/middleware/security");
 *
 *   const generalLimiter = createRateLimiter({ max: 100 });
 */

"use strict";

const helmet    = require("helmet");
const rateLimit = require("express-rate-limit");
const hpp       = require("hpp");

/* ─── CORS ───────────────────────────────────────────────────────────────── */

/**
 * Reads the ALLOWED_ORIGINS env-var once per process.
 * Returns an empty array when the var is unset (open — useful in dev).
 */
const getAllowedOrigins = () => {
  const raw = process.env.ALLOWED_ORIGINS || "";
  return raw.split(",").map((o) => o.trim()).filter(Boolean);
};

const corsOptions = {
  origin: (origin, callback) => {
    const allowed = getAllowedOrigins();
    // Allow server-to-server requests (no Origin header)
    if (!origin) return callback(null, true);
    if (allowed.length === 0 || allowed.includes("*") || allowed.includes(origin))
      return callback(null, true);
    callback(new Error(`CORS: origin '${origin}' not allowed`));
  },
  credentials: true,
  optionsSuccessStatus: 200,
};

/* ─── Input Sanitizer ────────────────────────────────────────────────────── */

/**
 * Chain handler: strips HTML tags and "javascript:" from all string fields in req.body.
 * Protects against reflected-XSS payloads in JSON bodies.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} _res
 * @param {import('express').NextFunction} next
 */
function sanitizeBody(req, _res, next) {
  if (req.body && typeof req.body === "object") {
    const strip = (v) =>
      typeof v === "string"
        ? v.replace(/<[^>]*>/g, "").replace(/javascript:/gi, "")
        : v;

    const clean = (obj) => {
      for (const key of Object.keys(obj)) {
        if (typeof obj[key] === "string") {
          obj[key] = strip(obj[key]);
        } else if (obj[key] !== null && typeof obj[key] === "object") {
          clean(obj[key]);
        }
      }
    };

    clean(req.body);
  }
  next();
}

/* ─── Rate Limiter Factory ───────────────────────────────────────────────── */

/**
 * Creates an express-rate-limit instance with sensible defaults.
 * Each service calls this with its own configuration — no copy-pasting.
 *
 * @param {object} options
 * @param {number}   [options.windowMs=900000]       - Time window (ms). Default 15 min.
 * @param {number}   [options.max=100]               - Max requests per window.
 * @param {string}   [options.message]               - Error message on limit.
 * @param {function} [options.skip]                  - Skip function.
 * @returns {import('express-rate-limit').RateLimitRequestHandler}
 */
function createRateLimiter(options = {}) {
  return rateLimit({
    windowMs:       options.windowMs ?? 15 * 60 * 1000,
    max:            options.max      ?? 100,
    standardHeaders: true,
    legacyHeaders:   false,
    message: { error: options.message ?? "Too many requests, please try again later" },
    skip:    options.skip,
  });
}

module.exports = { corsOptions, sanitizeBody, createRateLimiter, helmet, hpp };
