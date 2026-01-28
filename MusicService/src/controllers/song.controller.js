const Song = require("../models/Song");
const cloudinary = require("../config/cloudinary");
const fs = require("fs");
const { getUserById } = require("../utils/authClient");

exports.createSong = async (req, res) => {
  try {
    const { userId, title, artists, publicDate, lyrics } = req.body;
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
      lyrics,
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

/* ===================== GET SONGS BY USER ===================== */
exports.getSongsByUser = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }

    const songs = await Song.find({ userId })
      .sort({ createdAt: -1 })
      .select("-__v");

    res.json(songs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ===================== GET SONG BY ID ===================== */
exports.getSongById = async (req, res) => {
  try {
    const { id } = req.params;

    const song = await Song.findById(id).select("-__v");
    if (!song) {
      return res.status(404).json({ message: "Song not found" });
    }

    res.json(song);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ===================== UPDATE SONG ===================== */
exports.updateSong = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, artists, album, tags, lyrics, publicDate } = req.body;

    const song = await Song.findById(id);
    if (!song) {
      return res.status(404).json({ message: "Song not found" });
    }

    /* ===== UPDATE TEXT FIELDS ===== */
    if (title !== undefined) song.title = title;
    if (artists !== undefined)
      song.artists = artists ? artists.split(",") : [];
    if (album !== undefined) song.album = album;
    if (tags !== undefined) song.tags = tags ? tags.split(",") : [];
    if (lyrics !== undefined) song.lyrics = lyrics;
    if (publicDate !== undefined) song.publicDate = publicDate;

    /* ===== UPDATE AUDIO ===== */
    if (req.files?.audio?.[0]) {
      const audioFile = req.files.audio[0];
      const { parseFile } = await import("music-metadata");

      // parse duration
      const metadata = await parseFile(audioFile.path);
      song.duration = Math.floor(metadata.format.duration);

      // xoá audio cũ
      if (song.audioUrl) {
        const publicId = song.audioUrl.split("/").pop().split(".")[0];
        await cloudinary.uploader.destroy(publicId, {
          resource_type: "video",
        });
      }

      // upload audio mới
      const audioUpload = await cloudinary.uploader.upload(audioFile.path, {
        resource_type: "video",
      });

      song.audioUrl = audioUpload.secure_url;

      fs.unlinkSync(audioFile.path);
    }

    /* ===== UPDATE THUMBNAIL ===== */
    if (req.files?.thumbnail?.[0]) {
      const imageFile = req.files.thumbnail[0];

      // xoá ảnh cũ
      if (song.thumbnailUrl) {
        const publicId = song.thumbnailUrl.split("/").pop().split(".")[0];
        await cloudinary.uploader.destroy(publicId);
      }

      // upload ảnh mới
      const imageUpload = await cloudinary.uploader.upload(imageFile.path);
      song.thumbnailUrl = imageUpload.secure_url;

      fs.unlinkSync(imageFile.path);
    }

    await song.save();

    res.json(song);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ===================== DELETE SONG ===================== */
exports.deleteSong = async (req, res) => {
  try {
    const { id } = req.params;

    const song = await Song.findById(id);
    if (!song) {
      return res.status(404).json({ message: "Song not found" });
    }

    /* ===== DELETE AUDIO ===== */
    if (song.audioUrl) {
      const audioPublicId = song.audioUrl.split("/").pop().split(".")[0];
      await cloudinary.uploader.destroy(audioPublicId, {
        resource_type: "video",
      });
    }

    /* ===== DELETE THUMBNAIL ===== */
    if (song.thumbnailUrl) {
      const imagePublicId = song.thumbnailUrl.split("/").pop().split(".")[0];
      await cloudinary.uploader.destroy(imagePublicId);
    }

    await song.deleteOne();

    res.json({ message: "Song deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
