const express = require("express");
const router = express.Router();
const upload = require("../utils/upload");
const {
  createSong,
  searchSongs,
  getSongs,
  getSongsByUser,
  getSongById,
  getSongLikeCount,
  updateSong,
  deleteSong,

  likeSong,
  unlikeSong,
  isSongLiked,
  getLikedSongs,
} = require("../controllers/song.controller");

/* ===================== GET ===================== */
router.get("/search", searchSongs);
router.get("/users/:userId/liked-songs", getLikedSongs);
router.get("/:id/likes", getSongLikeCount);
router.get("/:id/liked", isSongLiked);
router.get("/", getSongs);
router.get("/user/:userId", getSongsByUser);
router.get("/:id", getSongById);

/* ===================== POST ===================== */
router.post("/:id/like", likeSong);
router.post(
  "/",
  upload.fields([
    { name: "audio", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 },
  ]),
  createSong,
);

/* ===================== PUT ===================== */
router.put(
  "/:id",
  upload.fields([
    { name: "audio", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 },
  ]),
  updateSong,
);

/* ===================== DELETE ===================== */
router.delete("/:id/like", unlikeSong);
router.delete("/:id", deleteSong);

module.exports = router;
