/**
 * MusicService — Security Middleware Configuration
 *
 * Delegates to shared/middleware/security for shared concerns.
 * Only MusicService-specific rate limits are defined here.
 *
 * Pattern — Chain of Responsibility:
 *   Handler links for the MusicService security chain:
 *     helmet → cors → body-parser → hpp → sanitizeBody → generalLimiter → routes
 *     (uploadLimiter applied per-route, not application-wide)
 */

"use strict";

const {
  corsOptions,
  sanitizeBody,
  createRateLimiter,
  helmet,
  hpp,
} = require("../../../shared/middleware/security");

const generalLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max:      300,
});

// Per-route limiter applied to upload endpoints (song create/update)
const uploadLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max:      30,
  message:  "Upload rate limit exceeded, please try again later",
});

module.exports = {
  corsOptions,
  sanitizeBody,
  generalLimiter,
  uploadLimiter,
  helmet,
  hpp,
};
