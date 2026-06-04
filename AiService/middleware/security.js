/**
 * AiService — Security Middleware Configuration
 *
 * Delegates shared concerns (CORS, sanitization, helmet, hpp) to the
 * shared/middleware/security module — the single source of truth.
 *
 * Only AiService-specific rate limits are defined here, using the shared
 * createRateLimiter factory to avoid duplicating express-rate-limit config.
 *
 * Pattern — Chain of Responsibility:
 *   This file supplies the handler links that AiService/index.js registers
 *   in the following security chain order:
 *     helmet → cors → body-parser → hpp → sanitizeBody
 *     → [statusLimiter on polling routes]
 *     → [generateLimiter on creation routes]
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

// Generous limit for status-polling — FE polls every 3–20 s
const statusLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max:      500,
  message:  "Too many status requests, please try again later",
});

// Tight limit for expensive AI-generation operations
const generateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max:      20,
  message:  "AI generation rate limit exceeded, please try again later",
});

// Fallback for all other routes
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
