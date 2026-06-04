"use strict";

const {
  corsOptions,
  sanitizeBody,
  createRateLimiter,
  helmet,
  hpp,
} = require("../../../shared/middleware/security");

const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max:      20,
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
