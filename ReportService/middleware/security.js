"use strict";

const {
  corsOptions,
  sanitizeBody,
  createRateLimiter,
  helmet,
  hpp,
} = require("../../shared/middleware/security");

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
