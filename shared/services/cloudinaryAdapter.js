/**
 * CloudinaryAdapter — Adapter + Singleton
 *
 * ── Adapter ─────────────────────────────────────────────────────────────────
 * Translates raw Cloudinary SDK calls into domain-level operations.
 * Callers express intent ("uploadAudio", "uploadImage", "deleteAsset") rather
 * than SDK method names, resource_type strings, and folder paths.
 *
 * ── Problem solved ───────────────────────────────────────────────────────────
 * Before this adapter, identical Cloudinary upload/delete patterns appeared
 * independently in three controllers:
 *   • MusicService/src/controllers/song.controller.js   (createSong, updateSong, deleteSong)
 *   • AuthService/src/controllers/user.controller.js    (updateUser — avatar upload)
 *   • AiService/controllers/ai.controller.js            (uploadAudio)
 *
 * Each had its own:
 *   cloudinary.uploader.upload(path, { resource_type: "video" })   ← audio
 *   cloudinary.uploader.upload(path)                               ← image
 *   publicId extraction from URL:  url.split("/").pop().split(".")[0]
 *   fs.unlink(localPath, () => {})                                 ← cleanup
 *   .catch(() => {})                                               ← silent delete failure
 *
 * ── Singleton ────────────────────────────────────────────────────────────────
 * The cloudinary SDK client is configured once (module-level Singleton).
 * Reads CLOUDINARY_* env-vars on first require().
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 * const cloudinaryAdapter = require("../../shared/services/cloudinaryAdapter");
 *
 * const { url } = await cloudinaryAdapter.uploadAudio("/tmp/audio.mp3");
 * const { url } = await cloudinaryAdapter.uploadImage("/tmp/thumb.jpg", "thumbnails");
 * await cloudinaryAdapter.deleteAudio(existingAudioUrl);
 * await cloudinaryAdapter.deleteImage(existingThumbnailUrl);
 */

"use strict";

const cloudinary = require("cloudinary").v2;
const fs         = require("fs");

// Singleton: configure the Cloudinary client once
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* ─── Public ID extraction ───────────────────────────────────────────────── */

/**
 * Extracts the Cloudinary public_id from a secure_url — folder-aware.
 *
 * Cloudinary URLs follow:
 *   .../upload/v<version>/<folder?>/<name>.<ext>
 *
 * The public_id is everything after the version segment, minus the extension.
 * For folder-stored assets the folder MUST be part of the public_id, otherwise
 * cloudinary.uploader.destroy() silently no-ops. The previous filename-only
 * extraction (url.split("/").pop().split(".")[0]) was a latent bug that could
 * not delete any asset stored inside a folder. This implementation handles both
 * root-level and folder-stored assets correctly.
 *
 * @param {string} url - Cloudinary secure_url
 * @returns {string} publicId (including folder path when present)
 */
function extractPublicId(url) {
  if (!url) return "";

  const afterUpload = url.split("/upload/")[1];
  if (!afterUpload) {
    // Fallback for non-standard URLs: last segment without extension
    const filename = url.split("/").pop() || "";
    return filename.split(".")[0];
  }

  // Strip leading version segment ("v123456/") then drop the file extension
  return afterUpload.replace(/^v\d+\//, "").replace(/\.[^/.]+$/, "");
}

/* ─── Local file cleanup ─────────────────────────────────────────────────── */

function unlinkSilently(localPath) {
  if (localPath) fs.unlink(localPath, () => {}); // fire-and-forget
}

/* ─── Adapter methods ────────────────────────────────────────────────────── */

/**
 * Uploads an audio file (MP3/WAV) to Cloudinary.
 * Automatically deletes the local temp file after upload.
 *
 * @param {string} localPath - Absolute path to the local file
 * @param {string} [folder="harmony-audio"] - Cloudinary folder
 * @returns {Promise<{url: string, publicId: string}>}
 */
async function uploadAudio(localPath, folder = "harmony-audio") {
  try {
    const result = await cloudinary.uploader.upload(localPath, {
      resource_type: "video", // Cloudinary uses "video" for audio files
      folder,
    });
    return { url: result.secure_url, publicId: result.public_id };
  } finally {
    unlinkSilently(localPath);
  }
}

/**
 * Uploads an image file to Cloudinary.
 * Automatically deletes the local temp file after upload.
 *
 * @param {string} localPath - Absolute path to the local file
 * @param {string} [folder="harmony-images"] - Cloudinary folder
 * @returns {Promise<{url: string, publicId: string}>}
 */
async function uploadImage(localPath, folder = "harmony-images") {
  try {
    const result = await cloudinary.uploader.upload(localPath, {
      resource_type: "image",
      folder,
    });
    return { url: result.secure_url, publicId: result.public_id };
  } finally {
    unlinkSilently(localPath);
  }
}

/**
 * Uploads a user avatar image to Cloudinary.
 *
 * @param {string} localPath
 * @returns {Promise<{url: string, publicId: string}>}
 */
async function uploadAvatar(localPath) {
  return uploadImage(localPath, "avatars");
}

/**
 * Deletes an audio asset from Cloudinary by its URL or publicId.
 * Silent on failure — deletion errors should never fail the main operation.
 *
 * @param {string} urlOrPublicId
 */
async function deleteAudio(urlOrPublicId) {
  if (!urlOrPublicId) return;
  const publicId = urlOrPublicId.startsWith("http")
    ? extractPublicId(urlOrPublicId)
    : urlOrPublicId;
  await cloudinary.uploader.destroy(publicId, { resource_type: "video" }).catch(() => {});
}

/**
 * Deletes an image asset from Cloudinary by its URL or publicId.
 * Silent on failure.
 *
 * @param {string} urlOrPublicId
 */
async function deleteImage(urlOrPublicId) {
  if (!urlOrPublicId) return;
  const publicId = urlOrPublicId.startsWith("http")
    ? extractPublicId(urlOrPublicId)
    : urlOrPublicId;
  await cloudinary.uploader.destroy(publicId, { resource_type: "image" }).catch(() => {});
}

module.exports = {
  uploadAudio,
  uploadImage,
  uploadAvatar,
  deleteAudio,
  deleteImage,
  extractPublicId, // exported for testing
};
