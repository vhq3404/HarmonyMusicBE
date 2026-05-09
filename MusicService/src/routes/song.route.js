const express  = require("express");
const router   = express.Router();
const upload   = require("../utils/upload");
const { verifyToken, optionalToken } = require("../middleware/auth");
const { uploadLimiter } = require("../middleware/security");
const {
  createSong,
  searchSongs,
  getSongs,
  getTopSongs,
  getRecommendedSongs,
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

/* ── Public reads ───────────────────────────────── */
router.get("/search",           searchSongs);
router.get("/top",              getTopSongs);
router.get("/recommend",        getRecommendedSongs);
router.get("/users/:userId/liked-songs", getLikedSongs);
router.get("/user/:userId",     getSongsByUser);
router.get("/:id/likes",        getSongLikeCount);
router.get("/:id/liked",        optionalToken, isSongLiked);
router.get("/",                 getSongs);
router.get("/:id",              getSongById);

/* ── Protected mutations ────────────────────────── */
router.post("/:id/like",        verifyToken, likeSong);
router.delete("/:id/like",      verifyToken, unlikeSong);

router.post(
  "/",
  uploadLimiter,
  verifyToken,
  upload.fields([{ name: "audio", maxCount: 1 }, { name: "thumbnail", maxCount: 1 }]),
  createSong,
);

router.put(
  "/:id",
  uploadLimiter,
  verifyToken,
  upload.fields([{ name: "audio", maxCount: 1 }, { name: "thumbnail", maxCount: 1 }]),
  updateSong,
);

router.delete("/:id", verifyToken, deleteSong);

module.exports = router;
