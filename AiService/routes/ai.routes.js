const express     = require("express");
const router      = express.Router();
const ctrl        = require("../controllers/ai.controller");
const audioUpload = require("../middleware/audioUpload");

// ── Audio file upload ─────────────────────────────────────────────────────────
router.post("/upload-audio", audioUpload.single("audio"), ctrl.uploadAudio);

// ── Music generation ──────────────────────────────────────────────────────────
router.post("/generate",                 ctrl.generate);
router.get("/generate/:taskId/status",   ctrl.getStatus);

// ── Extend / cover / upload operations ───────────────────────────────────────
router.post("/extend",                   ctrl.extendMusicHandler);
router.post("/upload-cover",             ctrl.uploadCoverHandler);
router.post("/upload-extend",            ctrl.uploadExtendHandler);

// ── Audio enhancement ─────────────────────────────────────────────────────────
router.post("/add-vocals",               ctrl.addVocalsHandler);
router.post("/add-instrumental",         ctrl.addInstrumentalHandler);

// ── Lyrics ────────────────────────────────────────────────────────────────────
router.post("/lyrics",                   ctrl.generateLyricsHandler);
router.get("/lyrics/history",            ctrl.getLyricsHistory);
router.get("/lyrics/:taskId/status",     ctrl.getLyricsStatusHandler);

// ── Timestamped lyrics (proxy — no DB storage) ───────────────────────────────
router.post("/timestamped-lyrics",       ctrl.getTimestampedLyricsHandler);

// ── User history (all music operation types) ─────────────────────────────────
router.get("/history",                   ctrl.getHistory);

// ── Download proxy ───────────────────────────────────────────────────────────
router.get("/download/:taskId/:songId",  ctrl.downloadSong);

// ── Suno webhook callback ─────────────────────────────────────────────────────
router.post("/callback",                 ctrl.handleCallback);

// ── Credits ───────────────────────────────────────────────────────────────────
router.get("/credits",                   ctrl.getCredits);

module.exports = router;
