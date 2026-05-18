const express   = require("express");
const router    = express.Router();
const { verifyToken, optionalToken } = require("../middleware/auth");
const controller = require("../controllers/playlist.controller");

/* ── Public / optional-auth reads ─────────────────────────── */
router.get("/user/:userId", controller.getPlaylistsByUser);
router.get("/:id",          optionalToken, controller.getPlaylistById);

/* ── Protected mutations ──────────────────────────────────── */
router.post("/",                    verifyToken, controller.createPlaylist);
router.patch("/:id",                verifyToken, controller.updatePlaylist);
router.post("/:id/songs",           verifyToken, controller.addSongToPlaylist);
router.delete("/:id/songs/:songId", verifyToken, controller.removeSongFromPlaylist);
router.patch("/:id/reorder",        verifyToken, controller.reorderSongs);
router.delete("/:id",               verifyToken, controller.deletePlaylist);

module.exports = router;
