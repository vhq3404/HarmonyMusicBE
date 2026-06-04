"use strict";

const logger = require("../utils/logger").forService("ErrorChain");

function prismaErrorHandler(err, _req, res, next) {
  if (typeof err.code !== "string" || !err.code.startsWith("P")) return next(err);

  switch (err.code) {
    case "P2002":
      return res.status(409).json({ error: "Resource already exists (duplicate entry)" });

    case "P2025":
      return res.status(404).json({ error: "Resource not found" });

    case "P2003":
      return res.status(400).json({ error: "Referenced resource does not exist" });

    case "P2024":
      return res.status(503).json({ error: "Database temporarily unavailable — try again" });

    default:
      return next(err);
  }
}

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

function corsErrorHandler(err, _req, res, next) {
  if (!err.message?.startsWith("CORS")) return next(err);
  return res.status(403).json({ error: err.message });
}

function genericErrorHandler(err, _req, res, _next) {
  logger.error("Unhandled error", err);
  res.status(500).json({ error: "Internal server error" });
}

function notFoundHandler(_req, res) {
  res.status(404).json({ error: "Route not found" });
}

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
