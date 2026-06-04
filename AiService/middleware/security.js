"use strict";

const {
  corsOptions,
  sanitizeBody,
  createRateLimiter,
  helmet,
  hpp,
} = require("../../shared/middleware/security");

const statusLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max:      500,
  message:  "Too many status requests, please try again later",
});

const generateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max:      20,
  message:  "AI generation rate limit exceeded, please try again later",
});

const generalLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max:      100,
});

module.exports = {
  corsOptions,
  sanitizeBody,
  statusLimiter,
  generateLimiter,
  generalLimiter,
  helmet,
  hpp,
};
