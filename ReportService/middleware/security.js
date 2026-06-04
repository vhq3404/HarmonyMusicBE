/**
 * ReportService — Security Middleware Configuration
 *
 * Delegates to shared/middleware/security for shared concerns.
 * Only ReportService-specific rate limits are defined here.
 *
 * Pattern — Chain of Responsibility:
 *   Handler links for the ReportService security chain:
 *     helmet → cors → body-parser → hpp → sanitizeBody
 *     → reportLimiter (on /api/reports routes)
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
} = require("../../shared/middleware/security");

// Tight hourly limit on report submission to prevent spam reports
const reportLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max:      20,
  message:  "Report rate limit exceeded",
});

const generalLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max:      100,
});

module.exports = {
  corsOptions,
  sanitizeBody,
  reportLimiter,
  generalLimiter,
  helmet,
  hpp,
};
