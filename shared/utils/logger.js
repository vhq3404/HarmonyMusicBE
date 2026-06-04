/**
 * LoggerService — Singleton
 *
 * Single structured logger instance shared across all microservices.
 * Replaces 50+ scattered console.log/error/warn calls with a unified,
 * context-aware logging interface.
 *
 * ── Singleton ────────────────────────────────────────────────────────────────
 * The Logger class enforces one instance per process via a static _instance
 * field. The module export provides the global access point. Node's module
 * cache gives the same guarantee, but the explicit class Singleton pattern
 * makes the intent clear for educational review.
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 * const logger = require("../../shared/utils/logger").forService("MusicService");
 * logger.info("Song created", { songId: "abc" });
 * logger.error("DB error", err);
 * logger.warn("Cache miss", { key: "top_songs" });
 *
 * ── Why not a third-party library? ───────────────────────────────────────────
 * Adding pino/winston would require package.json changes in each service.
 * This wrapper uses native console with structured JSON output — production-ready,
 * zero-dependency, and trivially swappable for a real logger later.
 */

"use strict";

class Logger {
  /** @type {Logger|null} */
  static _instance = null;

  constructor() {
    this._serviceName = "Service";
    this._isProduction = process.env.NODE_ENV === "production";
  }

  /** Singleton access point */
  static getInstance() {
    if (!Logger._instance) {
      Logger._instance = new Logger();
    }
    return Logger._instance;
  }

  /**
   * Returns a child logger scoped to a specific service name.
   * All log entries include the service name for easy log filtering.
   *
   * @param {string} serviceName
   * @returns {ServiceLogger}
   */
  forService(serviceName) {
    return new ServiceLogger(serviceName, this._isProduction);
  }
}

class ServiceLogger {
  constructor(serviceName, isProduction) {
    this._service    = serviceName;
    this._isProd     = isProduction;
  }

  _entry(level, message, meta) {
    const entry = {
      ts:      new Date().toISOString(),
      level,
      service: this._service,
      message,
    };

    if (meta instanceof Error) {
      entry.error   = meta.message;
      entry.stack   = this._isProd ? undefined : meta.stack;
    } else if (meta && typeof meta === "object") {
      Object.assign(entry, meta);
    }

    return entry;
  }

  info(message, meta)  { console.log(JSON.stringify(this._entry("INFO",  message, meta))); }
  warn(message, meta)  { console.warn(JSON.stringify(this._entry("WARN",  message, meta))); }
  error(message, meta) { console.error(JSON.stringify(this._entry("ERROR", message, meta))); }
  debug(message, meta) {
    if (!this._isProd) {
      console.log(JSON.stringify(this._entry("DEBUG", message, meta)));
    }
  }
}

// Global singleton — one logger per process
const loggerSingleton = Logger.getInstance();

module.exports = loggerSingleton;
