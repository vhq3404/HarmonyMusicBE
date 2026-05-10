const express     = require("express");
const router      = express.Router();
const ctrl        = require("../controllers/ai.controller");
const audioUpload = require("../middleware/audioUpload");
const { verifyToken } = require("../middleware/auth");

/* ── Public / webhook ─────────────────────────────────────────────────────── */
// Suno webhook — must remain unauthenticated (called by Suno servers, no JWT)
router.post("/callback",                ctrl.handleCallback);

/* ── Protected — require valid JWT ───────────────────────────────────────── */

// Audio file upload (Cloudinary proxy)
router.post("/upload-audio",            verifyToken, audioUpload.single("audio"), ctrl.uploadAudio);

// Music generation operations
router.post("/generate",                verifyToken, ctrl.generate);
router.get("/generate/:taskId/status",  verifyToken, ctrl.getStatus);
router.post("/extend",                  verifyToken, ctrl.extendMusicHandler);
router.post("/upload-cover",            verifyToken, ctrl.uploadCoverHandler);
router.post("/upload-extend",           verifyToken, ctrl.uploadExtendHandler);
router.post("/add-vocals",              verifyToken, ctrl.addVocalsHandler);
router.post("/add-instrumental",        verifyToken, ctrl.addInstrumentalHandler);

// Lyrics
router.post("/lyrics",                  verifyToken, ctrl.generateLyricsHandler);
router.get("/lyrics/history",           verifyToken, ctrl.getLyricsHistory);
router.delete("/lyrics/history",        verifyToken, ctrl.deleteLyricsMany);
router.delete("/lyrics/:taskId",        verifyToken, ctrl.deleteLyrics);
router.get("/lyrics/:taskId/status",    verifyToken, ctrl.getLyricsStatusHandler);

// Timestamped lyrics proxy
router.post("/timestamped-lyrics",      verifyToken, ctrl.getTimestampedLyricsHandler);

// User history & download
router.get("/history",                  verifyToken, ctrl.getHistory);
router.delete("/history/:taskId",       verifyToken, ctrl.deleteGeneration);
router.delete("/history",               verifyToken, ctrl.deleteGenerations);
router.get("/download/:taskId/:songId", verifyToken, ctrl.downloadSong);

// Credits
router.get("/credits",                  verifyToken, ctrl.getCredits);

module.exports = router;
