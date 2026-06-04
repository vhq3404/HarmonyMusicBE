/**
 * CachedSunoService — Proxy (Caching Proxy)
 *
 * Wraps sunoService and transparently caches the results of status-poll operations
 * (getGenerationStatus, getLyricsStatus) for STATUS_TTL_MS milliseconds.
 *
 * ── Why a Proxy? ────────────────────────────────────────────────────────────
 * Previously, statusCache and lyricsStatusCache lived inside ai.controller.js
 * alongside HTTP handler code. This violated SRP: a controller's job is HTTP
 * handling, not cache management.
 *
 * A Caching Proxy corrects this by intercepting calls to the real service and
 * returning cached data transparently — callers (the controller) cannot tell
 * whether the result came from the cache or from Suno's API.
 *
 * ── What is cached ──────────────────────────────────────────────────────────
 * Only status-poll results (getGenerationStatus, getLyricsStatus) are cached.
 * Mutating operations (generateMusic, extendMusic, addVocals, etc.) are always
 * passed through unchanged — caching mutations would be incorrect.
 *
 * ── Singleton ────────────────────────────────────────────────────────────────
 * A single CachedSunoService instance is exported (module-level singleton).
 * One cache per process — consistent with Node.js module semantics.
 *
 * ── Cache invalidation ───────────────────────────────────────────────────────
 * The controller calls invalidateMusicStatus(taskId) / invalidateLyricsStatus(taskId)
 * when a terminal status is received (webhook or poll), ensuring subsequent reads
 * always return the final state rather than a cached in-progress snapshot.
 */

"use strict";

const sunoService = require("./suno.service");

const STATUS_TTL_MS = 4_000;   // matches typical FE polling interval
const MAX_CACHE_SIZE = 500;     // prevent unbounded growth

class CachedSunoService {
  constructor() {
    /** @type {Map<string, {data: any, expiresAt: number}>} */
    this._musicCache  = new Map();
    /** @type {Map<string, {data: any, expiresAt: number}>} */
    this._lyricsCache = new Map();

    // Periodic eviction — unref so it does not prevent process exit
    const evictTimer = setInterval(() => this._evictExpired(), 60_000);
    evictTimer.unref();
  }

  /* ── Internal cache helpers ─────────────────────────────────────────────── */

  _get(cache, key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { cache.delete(key); return null; }
    return entry.data;
  }

  _set(cache, key, data) {
    // LRU-lite: evict the oldest entry when the cache is full
    if (cache.size >= MAX_CACHE_SIZE) {
      cache.delete(cache.keys().next().value);
    }
    cache.set(key, { data, expiresAt: Date.now() + STATUS_TTL_MS });
  }

  _evictExpired() {
    const now = Date.now();
    for (const [k, v] of this._musicCache)  { if (now > v.expiresAt) this._musicCache.delete(k); }
    for (const [k, v] of this._lyricsCache) { if (now > v.expiresAt) this._lyricsCache.delete(k); }
  }

  /* ── Cached operations (Proxy behaviour) ────────────────────────────────── */

  async getGenerationStatus(taskId) {
    const cached = this._get(this._musicCache, taskId);
    if (cached) return cached;

    const result = await sunoService.getGenerationStatus(taskId);
    this._set(this._musicCache, taskId, result);
    return result;
  }

  async getLyricsStatus(taskId) {
    const cached = this._get(this._lyricsCache, taskId);
    if (cached) return cached;

    const result = await sunoService.getLyricsStatus(taskId);
    this._set(this._lyricsCache, taskId, result);
    return result;
  }

  /* ── Cache invalidation ─────────────────────────────────────────────────── */

  /** Call when a terminal music-generation status is received. */
  invalidateMusicStatus(taskId)  { this._musicCache.delete(taskId); }

  /** Call when a terminal lyrics status is received. */
  invalidateLyricsStatus(taskId) { this._lyricsCache.delete(taskId); }

  /* ── Passthrough operations (never cached) ───────────────────────────────── */

  generateMusic(params)      { return sunoService.generateMusic(params); }
  extendMusic(params)        { return sunoService.extendMusic(params); }
  uploadCoverAudio(params)   { return sunoService.uploadCoverAudio(params); }
  uploadExtendAudio(params)  { return sunoService.uploadExtendAudio(params); }
  addVocals(params)          { return sunoService.addVocals(params); }
  addInstrumental(params)    { return sunoService.addInstrumental(params); }
  generateLyrics(params)     { return sunoService.generateLyrics(params); }
  getTimestampedLyrics(t, a) { return sunoService.getTimestampedLyrics(t, a); }
  getCredits()               { return sunoService.getCredits(); }
}

// Singleton export — one instance per process
module.exports = new CachedSunoService();
