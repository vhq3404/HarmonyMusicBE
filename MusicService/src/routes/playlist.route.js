const express = require("express");
const router = express.Router();
const controller = require("../controllers/playlist.controller");

router.post("/", controller.createPlaylist);
router.get("/user/:userId", controller.getPlaylistsByUser);
router.get("/:id", controller.getPlaylistById);
router.post("/:id/songs", controller.addSongToPlaylist);
router.delete("/:id", controller.deletePlaylist);

module.exports = router;
