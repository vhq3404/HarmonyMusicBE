"use strict";

class Logger {
  static _instance = null;

  constructor() {
    this._serviceName = "Service";
    this._isProduction = process.env.NODE_ENV === "production";
  }

  static getInstance() {
    if (!Logger._instance) {
      Logger._instance = new Logger();
    }
    return Logger._instance;
  }

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

const loggerSingleton = Logger.getInstance();

module.exports = loggerSingleton;
