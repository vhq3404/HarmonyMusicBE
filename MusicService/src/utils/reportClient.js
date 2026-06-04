/**
 * ReportService Client — Adapter + Proxy (Caching)
 *
 * ── Adapter ─────────────────────────────────────────────────────────────────
 * Translates all communication with ReportService into domain-level JS functions.
 * Callers never see HTTP status codes, URL paths, response envelope shapes,
 * or Axios configuration.
 *
 * Replaces the hardcoded bare-axios calls that existed in admin.controller.js:
 *   axios.get("http://localhost:4003/api/admin/reports/songs/stats")      ← removed
 *   axios.patch(`http://localhost:4003/api/admin/reports/songs/${id}/...`) ← removed
 *
 * ── Proxy (Caching) ──────────────────────────────────────────────────────────
 * getReportStatsBySong() caches its result for STATS_TTL_MS milliseconds.
 * Admin pages that load and then immediately action a song only call
 * ReportService once per page-load, not on every row render.
 *
 * Cache is invalidated automatically after any mutation (resolveReportsForSong).
 *
 * ── Singleton ────────────────────────────────────────────────────────────────
 * reportAxios is created once at module load (Node module cache = singleton).
 * The service URL is read from REPORT_SERVICE_URL env-var with a safe default.
 */

"use strict";

const axios = require("axios");

/* ─── HTTP client — Singleton ────────────────────────────────────────────── */

const reportAxios = axios.create({
  baseURL: process.env.REPORT_SERVICE_URL || "http://localhost:4003",
  timeout: 5_000,
});

/* ─── Cache (Proxy) ──────────────────────────────────────────────────────── */

const STATS_TTL_MS = 30_000; // 30 s — safe for high-traffic admin pages
let _statsCache    = null;
let _statsExpiresAt = 0;

function _invalidateStats() {
  _statsCache    = null;
  _statsExpiresAt = 0;
}

/* ─── Public API (Adapter surface) ──────────────────────────────────────── */

/**
 * Returns a Map<songId, reportCount> for all songs.
 * Result is cached for STATS_TTL_MS milliseconds.
 *
 * @returns {Promise<Map<string, number>>}
 */
exports.getReportStatsBySong = async () => {
  // Proxy: serve from cache when fresh
  if (_statsCache && Date.now() < _statsExpiresAt) {
    return _statsCache;
  }

  // Adapter: translate HTTP response → domain Map
  const res = await reportAxios.get("/api/admin/reports/songs/stats");
  const statsMap = new Map();
  (res.data?.data || []).forEach((row) => {
    statsMap.set(String(row.song_id), Number(row.report_count));
  });

  // Proxy: store result
  _statsCache     = statsMap;
  _statsExpiresAt = Date.now() + STATS_TTL_MS;

  return statsMap;
};

/**
 * Marks all pending reports for the given song as resolved.
 * Automatically invalidates the stats cache.
 *
 * @param {string} songId
 * @returns {Promise<void>}
 */
exports.resolveReportsForSong = async (songId) => {
  await reportAxios.patch(`/api/admin/reports/songs/${songId}/resolve`);
  _invalidateStats(); // mutation → cache stale
};

/**
 * Manually invalidate the stats cache (e.g., after bulk operations).
 */
exports.invalidateStatsCache = _invalidateStats;
