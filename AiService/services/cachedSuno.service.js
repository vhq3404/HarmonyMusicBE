"use strict";

const sunoService = require("./suno.service");

const STATUS_TTL_MS = 4_000;
const MAX_CACHE_SIZE = 500;

class CachedSunoService {
  constructor() {
    this._musicCache  = new Map();
    this._lyricsCache = new Map();

    const evictTimer = setInterval(() => this._evictExpired(), 60_000);
    evictTimer.unref();
  }

  _get(cache, key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { cache.delete(key); return null; }
    return entry.data;
  }

  _set(cache, key, data) {
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

  invalidateMusicStatus(taskId)  { this._musicCache.delete(taskId); }

  invalidateLyricsStatus(taskId) { this._lyricsCache.delete(taskId); }

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

module.exports = new CachedSunoService();
