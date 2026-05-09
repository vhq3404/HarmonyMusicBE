const express  = require("express");
const router   = express.Router();
const { verifyToken } = require("../middleware/auth");
const controller = require("../controllers/playlist.controller");

/* ── Public reads ───────────────────────────────── */
router.get("/user/:userId", controller.getPlaylistsByUser);
router.get("/:id",          controller.getPlaylistById);

/* ── Protected mutations ────────────────────────── */
router.post("/",            verifyToken, controller.createPlaylist);
router.post("/:id/songs",   verifyToken, controller.addSongToPlaylist);
router.delete("/:id",       verifyToken, controller.deletePlaylist);

module.exports = router;
