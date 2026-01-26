const express = require("express");
const router = express.Router();
const upload = require("../utils/upload");
const {
  createSong,
  getSongs,
} = require("../controllers/song.controller");

// 🔹 Lấy danh sách bài hát
router.get("/", getSongs);

// 🔹 Tạo bài hát (upload mp3 + ảnh)
router.post(
  "/",
  upload.fields([
    { name: "audio", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 },
  ]),
  createSong
);

module.exports = router;
