"use strict";

const axios = require("axios");

const reportAxios = axios.create({
  baseURL: process.env.REPORT_SERVICE_URL || "http://localhost:4003",
  timeout: 5_000,
});

const STATS_TTL_MS = 30_000;
let _statsCache    = null;
let _statsExpiresAt = 0;

function _invalidateStats() {
  _statsCache    = null;
  _statsExpiresAt = 0;
}

exports.getReportStatsBySong = async () => {
  if (_statsCache && Date.now() < _statsExpiresAt) {
    return _statsCache;
  }

  const res = await reportAxios.get("/api/admin/reports/songs/stats");
  const statsMap = new Map();
  (res.data?.data || []).forEach((row) => {
    statsMap.set(String(row.song_id), Number(row.report_count));
  });

  _statsCache     = statsMap;
  _statsExpiresAt = Date.now() + STATS_TTL_MS;

  return statsMap;
};

exports.resolveReportsForSong = async (songId) => {
  await reportAxios.patch(`/api/admin/reports/songs/${songId}/resolve`);
  _invalidateStats();
};

exports.invalidateStatsCache = _invalidateStats;
