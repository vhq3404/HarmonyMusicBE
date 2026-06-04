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
