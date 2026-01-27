const mongoose = require("mongoose");
const Play = require("../models/Play");
const Song = require("../models/Song");

exports.createPlay = async (req, res) => {
  try {
    const { userId, songId, listenedSeconds } = req.body;

    if (!userId || !songId) {
      return res.status(400).json({ error: "Missing data" });
    }

    // ✅ chỉ cần nghe 5 giây
    if (listenedSeconds < 5) {
      return res.json({ message: "Play not counted" });
    }

    await Play.create({
      userId,
      songId,
      completedAt: new Date(),
    });

    await Song.findByIdAndUpdate(songId, {
      $inc: { playCount: 1 },
    });

    res.json({ message: "Play counted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Create play failed" });
  }
};
