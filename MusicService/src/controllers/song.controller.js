const Song = require("../models/Song");
const cloudinary = require("../config/cloudinary");
const fs = require("fs");
const { getUserById } = require("../utils/authClient");

exports.createSong = async (req, res) => {
  try {
    const { title, artists, publicDate } = req.body;
    const { userId } = req.body;

    const audioFile = req.files.audio[0];
    const imageFile = req.files.thumbnail[0];
    const { parseFile } = await import("music-metadata");

    const metadata = await parseFile(audioFile.path);
    const duration = Math.floor(metadata.format.duration);

    // Upload audio
    const audioUpload = await cloudinary.uploader.upload(audioFile.path, {
      resource_type: "video",
    });

    // Upload image
    const imageUpload = await cloudinary.uploader.upload(imageFile.path);

    // Xóa file local
    fs.unlinkSync(audioFile.path);
    fs.unlinkSync(imageFile.path);

    const song = await Song.create({
      userId,
      title,
      duration,
      audioUrl: audioUpload.secure_url,
      thumbnailUrl: imageUpload.secure_url,
      artists: artists ? artists.split(",") : [],
      publicDate,
    });

    res.json(song);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ===================== GET SONGS ===================== */
exports.getSongs = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const songs = await Song.find({ isPublic: true })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select("-__v");

    const total = await Song.countDocuments({ isPublic: true });

    // 👉 lấy danh sách userId (tránh gọi trùng)
    const userIds = [...new Set(songs.map((s) => s.userId))];

    // 👉 gọi AuthService cho từng user
    const userMap = {};

    await Promise.all(
      userIds.map(async (userId) => {
        try {
          const user = await getUserById(userId);
          userMap[userId] = user.username;
        } catch (err) {
          userMap[userId] = "Unknown artist";
        }
      }),
    );

    // 👉 gắn username vào từng bài hát
    const songsWithUser = songs.map((song) => ({
      ...song.toObject(),
      username: userMap[song.userId] || "Unknown artist",
    }));

    res.json({
      data: songsWithUser,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
