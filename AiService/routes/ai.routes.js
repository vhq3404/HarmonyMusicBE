const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/ai.controller");

// Music generation
router.post("/generate", ctrl.generate);
router.get("/generate/:taskId/status", ctrl.getStatus);

// User history
router.get("/history", ctrl.getHistory);

// Download proxy — serves audio with correct Content-Disposition so browsers
// trigger a file save instead of navigating (cross-origin <a download> is blocked)
router.get("/download/:taskId/:songId", ctrl.downloadSong);

// Suno webhook callback (called by Suno servers)
router.post("/callback", ctrl.handleCallback);

// Credits
router.get("/credits", ctrl.getCredits);

module.exports = router;
