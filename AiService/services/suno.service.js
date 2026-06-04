/**
 * SunoService — Adapter (Object Adapter)
 *
 * Adapts the Suno REST API (Adaptee) into a clean JavaScript function API (Target).
 * Callers never see base URLs, authorization headers, HTTP methods, or endpoint paths.
 *
 * Responsibilities of this Adapter:
 *  1. Own the sunoClient Axios instance (Singleton — one per process via module cache).
 *  2. Provide named domain-level functions for each Suno operation.
 *  3. Normalize Suno's inconsistent response casing:
 *       • Status-poll API  → camelCase  (audioUrl, imageUrl, ...)
 *       • Webhook callback → snake_case (audio_url, image_url, ...)
 *     normalizeSunoTrack() handles both shapes and is exported for the controller
 *     to use when processing webhook payloads.
 *
 * All raw Axios errors propagate unchanged — callers (controller / proxy) decide
 * how to translate HTTP error codes into application-level responses.
 */

"use strict";

const axios = require("axios");

/* ─── Singleton Axios client ─────────────────────────────────────────────── */

const BASE_URL = process.env.SUNO_API_BASE_URL || "https://api.sunoapi.org";

const sunoClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    Authorization:  `Bearer ${process.env.SUNO_API_KEY}`,
    "Content-Type": "application/json",
  },
  timeout: 30_000,
});

/* ─── Data normalization (Adapter responsibility) ────────────────────────── */

/**
 * Normalizes a single Suno track object to a consistent camelCase shape.
 *
 * The Suno API returns camelCase from the status-poll endpoint but snake_case
 * from webhook callbacks. This function accepts both and always returns camelCase.
 *
 * Exported so that the controller can also use it when processing webhook payloads
 * without duplicating the normalization logic.
 *
 * @param {object} track - Raw Suno track from either API variant.
 * @returns {object|null} Normalized track, or null if the input is invalid.
 */
function normalizeSunoTrack(track) {
  if (!track || typeof track !== "object") return null;
  return {
    id:             track.id                                          || "",
    audioUrl:       track.audioUrl       || track.audio_url          || "",
    streamAudioUrl: track.streamAudioUrl || track.stream_audio_url   || "",
    imageUrl:       track.imageUrl       || track.image_url          || "",
    imageLargeUrl:  track.imageLargeUrl  || track.image_large_url    || null,
    prompt:         track.prompt                                      || "",
    modelName:      track.modelName      || track.model_name         || null,
    title:          track.title                                       || "",
    tags:           track.tags                                        || null,
    duration:       track.duration                                    || null,
    createTime:     track.createTime                                  || null,
  };
}

/* ─── Music generation operations ────────────────────────────────────────── */

const generateMusic = async (params) => {
  const { data } = await sunoClient.post("/api/v1/generate", params);
  return data;
};

const extendMusic = async (params) => {
  const { data } = await sunoClient.post("/api/v1/generate/extend", params);
  return data;
};

const uploadCoverAudio = async (params) => {
  const { data } = await sunoClient.post("/api/v1/generate/upload-cover", params);
  return data;
};

const uploadExtendAudio = async (params) => {
  const { data } = await sunoClient.post("/api/v1/generate/upload-extend", params);
  return data;
};

const addVocals = async (params) => {
  const { data } = await sunoClient.post("/api/v1/generate/add-vocals", params);
  return data;
};

const addInstrumental = async (params) => {
  const { data } = await sunoClient.post("/api/v1/generate/add-instrumental", params);
  return data;
};

/* ─── Status & metadata operations ──────────────────────────────────────── */

const getGenerationStatus = async (taskId) => {
  const { data } = await sunoClient.get(
    `/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`,
  );
  return data;
};

const getCredits = async () => {
  const { data } = await sunoClient.get("/api/v1/generate/credit");
  return data;
};

const getTimestampedLyrics = async (taskId, audioId) => {
  const { data } = await sunoClient.post("/api/v1/generate/get-timestamped-lyrics", {
    taskId,
    audioId,
  });
  return data;
};

/* ─── Lyrics operations ──────────────────────────────────────────────────── */

const generateLyrics = async (params) => {
  const { data } = await sunoClient.post("/api/v1/lyrics", params);
  return data;
};

const getLyricsStatus = async (taskId) => {
  const { data } = await sunoClient.get(
    `/api/v1/lyrics/record-info?taskId=${encodeURIComponent(taskId)}`,
  );
  return data;
};

/* ─── Exports ────────────────────────────────────────────────────────────── */

module.exports = {
  // Normalization utility — exported for webhook handler in ai.controller.js
  normalizeSunoTrack,

  // Music generation
  generateMusic,
  extendMusic,
  uploadCoverAudio,
  uploadExtendAudio,
  addVocals,
  addInstrumental,

  // Status & metadata
  getGenerationStatus,
  getCredits,
  getTimestampedLyrics,

  // Lyrics
  generateLyrics,
  getLyricsStatus,
};
