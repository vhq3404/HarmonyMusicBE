/**
 * AuthService — Security Middleware Configuration
 *
 * Delegates to shared/middleware/security for shared concerns.
 * Only AuthService-specific rate limits are defined here.
 *
 * Pattern — Chain of Responsibility:
 *   Handler links for the AuthService security chain:
 *     helmet → cors → body-parser → hpp → sanitizeBody
 *     → authLimiter (on /api/auth/* routes)
 *     → generalLimiter
 *     → routes
 */

"use strict";

const {
  corsOptions,
  sanitizeBody,
  createRateLimiter,
  helmet,
  hpp,
} = require("../../../shared/middleware/security");

// Tight limit on auth endpoints (login, register) to prevent brute-force
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max:      20,
  // Skip the refresh endpoint so token auto-refresh is never rate-limited
  skip: (req) => req.path === "/api/auth/refresh",
});

const generalLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max:      200,
});

module.exports = {
  corsOptions,
  sanitizeBody,
  authLimiter,
  generalLimiter,
  helmet,
  hpp,
};
