const express = require("express");
const router = express.Router();
const upload = require("../utils/upload");
const {
  createSong,
  getSongs,
  getSongsByUser,
  getSongById,
  updateSong,
  deleteSong,
} = require("../controllers/song.controller");

/* ===================== GET ===================== */
router.get("/", getSongs);
router.get("/user/:userId", getSongsByUser);
router.get("/:id", getSongById);

/* ===================== POST ===================== */
router.post(
  "/",
  upload.fields([
    { name: "audio", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 },
  ]),
  createSong
);

/* ===================== PUT ===================== */
router.put(
  "/:id",
  upload.fields([
    { name: "audio", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 },
  ]),
  updateSong
);

/* ===================== DELETE ===================== */
router.delete("/:id", deleteSong);

module.exports = router;
