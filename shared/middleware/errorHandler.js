/**
 * Error Classification Chain — Chain of Responsibility
 *
 * Each function is a handler link in the Express 4-argument error-handling chain.
 * A handler inspects the error type: if it recognises it, it responds immediately;
 * otherwise it calls next(err) to pass to the next link.
 *
 * Chain order (register in this order with app.use):
 *   prismaErrorHandler
 *   → multerErrorHandler
 *   → jwtErrorHandler
 *   → corsErrorHandler
 *   → genericErrorHandler         ← final fallback
 *
 * Plus a route-not-found terminator (non-error middleware):
 *   notFoundHandler               ← register AFTER all routes, BEFORE error chain
 *
 * Usage:
 *   const { errorChain, notFoundHandler } = require("../../shared/middleware/errorHandler");
 *   app.use(notFoundHandler);   // 404 for unmatched routes
 *   app.use(...errorChain);     // classify and respond to thrown errors
 */

"use strict";

// Singleton: shared structured logger
const logger = require("../utils/logger").forService("ErrorChain");

/* ─── Handler 1: Prisma ORM errors ──────────────────────────────────────── */

function prismaErrorHandler(err, _req, res, next) {
  // Prisma error codes are strings starting with "P" (e.g. "P2002")
  if (typeof err.code !== "string" || !err.code.startsWith("P")) return next(err);

  switch (err.code) {
    case "P2002": // Unique constraint violation
      return res.status(409).json({ error: "Resource already exists (duplicate entry)" });

    case "P2025": // Record not found / operation requires existing record
      return res.status(404).json({ error: "Resource not found" });

    case "P2003": // Foreign key constraint violation
      return res.status(400).json({ error: "Referenced resource does not exist" });

    case "P2024": // Pool connection timeout
      return res.status(503).json({ error: "Database temporarily unavailable — try again" });

    default:
      return next(err);
  }
}

/* ─── Handler 2: Multer file-upload errors ───────────────────────────────── */

const MULTER_CODES = new Set([
  "LIMIT_FILE_SIZE",
  "LIMIT_FILE_COUNT",
  "LIMIT_UNEXPECTED_FILE",
  "INVALID_TYPE",
]);

function multerErrorHandler(err, _req, res, next) {
  if (!err.code || !MULTER_CODES.has(err.code)) return next(err);

  switch (err.code) {
    case "LIMIT_FILE_SIZE":
      return res.status(413).json({ error: "File size exceeds the allowed limit" });
    case "LIMIT_FILE_COUNT":
      return res.status(400).json({ error: "Too many files in a single upload" });
    case "LIMIT_UNEXPECTED_FILE":
      return res.status(400).json({ error: "Unexpected file field name" });
    case "INVALID_TYPE":
      return res.status(400).json({ error: err.message || "Invalid file type" });
    default:
      return next(err);
  }
}

/* ─── Handler 3: JWT / jsonwebtoken errors ───────────────────────────────── */

const JWT_ERROR_NAMES = new Set([
  "JsonWebTokenError",
  "TokenExpiredError",
  "NotBeforeError",
]);

function jwtErrorHandler(err, _req, res, next) {
  if (!JWT_ERROR_NAMES.has(err.name)) return next(err);

  if (err.name === "TokenExpiredError")
    return res.status(401).json({ error: "Token has expired — please log in again" });

  return res.status(401).json({ error: "Invalid authentication token" });
}

/* ─── Handler 4: CORS errors ──────────────────────────────────────────────── */

function corsErrorHandler(err, _req, res, next) {
  if (!err.message?.startsWith("CORS")) return next(err);
  return res.status(403).json({ error: err.message });
}

/* ─── Handler 5: Generic fallback (must be last) ─────────────────────────── */

function genericErrorHandler(err, _req, res, _next) {
  // Singleton logger: structured, service-tagged error output
  logger.error("Unhandled error", err);
  res.status(500).json({ error: "Internal server error" });
}

/* ─── Route not-found terminator ─────────────────────────────────────────── */

/**
 * Returns a JSON 404 for any route that was not matched by the router.
 * Must be registered AFTER all app.use(router) calls, BEFORE error handlers.
 *
 * @param {import('express').Request}  _req
 * @param {import('express').Response} res
 */
function notFoundHandler(_req, res) {
  res.status(404).json({ error: "Route not found" });
}

/* ─── Convenience export ─────────────────────────────────────────────────── */

/**
 * Spread this array into app.use() to register the entire error chain:
 *   app.use(...errorChain);
 */
const errorChain = [
  prismaErrorHandler,
  multerErrorHandler,
  jwtErrorHandler,
  corsErrorHandler,
  genericErrorHandler,
];

module.exports = {
  prismaErrorHandler,
  multerErrorHandler,
  jwtErrorHandler,
  corsErrorHandler,
  genericErrorHandler,
  notFoundHandler,
  errorChain,
};
