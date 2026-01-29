const Song = require("../models/Song");
const Like = require("../models/Like");
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
          userMap[userId] = {
            username: user.username,
            avatar: user.avatar_url || null,
          };
        } catch (err) {
          userMap[userId] = "Unknown artist";
        }
      }),
    );

    const songsWithUser = songs.map((song) => {
      const user = userMap[song.userId];

      return {
        ...song.toObject(),
        username: user?.username || "Unknown artist",
        userAvatar: user?.avatar || null,
      };
    });

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

/* ===================== TOP LISTENED SONGS ===================== */
exports.getTopSongs = async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 10;

    const songs = await Song.find({ isPublic: true })
      .sort({ playCount: -1 })
      .limit(limit)
      .select("-__v");

    if (!songs.length) {
      return res.json({ data: [] });
    }

    /* ===== attach user info ===== */
    const userIds = [...new Set(songs.map((s) => s.userId))];
    const userMap = {};

    await Promise.all(
      userIds.map(async (uid) => {
        try {
          const user = await getUserById(uid);
          userMap[uid] = {
            username: user.username,
            avatar: user.avatar_url || null,
          };
        } catch {
          userMap[uid] = {
            username: "Unknown artist",
            avatar: null,
          };
        }
      }),
    );

    const result = songs.map((song) => ({
      ...song.toObject(),
      username: userMap[song.userId]?.username,
      userAvatar: userMap[song.userId]?.avatar,
    }));

    res.json({ data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ===================== RECOMMENDED SONGS ===================== */
exports.getRecommendedSongs = async (req, res) => {
  try {
    const { userId } = req.query;
    const limit = Number(req.query.limit) || 10;

    let recommendedSongs = [];

    if (userId) {
      const likes = await Like.find({ userId }).limit(20);
      const likedSongIds = likes.map((l) => l.songId);

      if (likedSongIds.length) {
        const likedSongs = await Song.find({ _id: { $in: likedSongIds } });

        const tags = [...new Set(likedSongs.flatMap((s) => s.tags || []))];
        const artists = [
          ...new Set(likedSongs.flatMap((s) => s.artists || [])),
        ];

        recommendedSongs = await Song.find({
          isPublic: true,
          _id: { $nin: likedSongIds },
          $or: [{ tags: { $in: tags } }, { artists: { $in: artists } }],
        })
          .sort({ playCount: -1 })
          .limit(limit);
      }
    }

    /* fallback random */
    if (!recommendedSongs.length) {
      recommendedSongs = await Song.aggregate([
        { $match: { isPublic: true } },
        { $sample: { size: limit } },
      ]);
    }

    const userIds = [...new Set(recommendedSongs.map((s) => s.userId))];
    const userMap = {};

    await Promise.all(
      userIds.map(async (uid) => {
        try {
          const user = await getUserById(uid);
          userMap[uid] = {
            username: user.username,
            avatar: user.avatar_url || null,
          };
        } catch {
          userMap[uid] = {
            username: "Unknown artist",
            avatar: null,
          };
        }
      }),
    );

    const result = recommendedSongs.map((song) => ({
      ...(song.toObject ? song.toObject() : song),
      username: userMap[song.userId]?.username,
      userAvatar: userMap[song.userId]?.avatar,
    }));

    res.json({ data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ===================== GET SONGS BY USER ===================== */
exports.getSongsByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { sort } = req.query;

    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }

    let sortOption = { createdAt: -1 }; // default

    if (sort === "play") {
      sortOption = { playCount: -1 };
    }

    const songs = await Song.find({ userId }).sort(sortOption).select("-__v");

    if (!songs.length) {
      return res.json({ data: [] });
    }

    let username = "Unknown artist";
    let userAvatar = null;

    try {
      const user = await getUserById(userId);
      if (user) {
        username = user.username || username;
        userAvatar = user.avatar_url || null;
      }
    } catch {}

    const songsWithUser = songs.map((song) => ({
      ...song.toObject(),
      username,
      userAvatar,
    }));

    res.json({ data: songsWithUser });
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

    let username = "Unknown artist";
    let userAvatar = null;

    try {
      const user = await getUserById(song.userId);
      if (user) {
        username = user.username || username;
        userAvatar = user.avatar_url || null;
      }
    } catch (err) {
      // fallback giữ nguyên
    }

    res.json({
      ...song.toObject(),
      username,
      userAvatar,
    });
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
    if (artists !== undefined) song.artists = artists ? artists.split(",") : [];
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

/* ===================== SEARCH SONGS ===================== */
exports.searchSongs = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || !q.trim()) {
      return res.json({ data: [] });
    }

    const keyword = q.trim();

    // 1️⃣ tìm bài hát (KHÔNG PHÂN BIỆT DẤU)
    const songs = await Song.find({
      isPublic: true,
      $or: [
        { title: { $regex: keyword, $options: "i" } },
        { artists: { $regex: keyword, $options: "i" } },
        { album: { $regex: keyword, $options: "i" } },
        { tags: { $regex: keyword, $options: "i" } },
      ],
    })
      .collation({
        locale: "vi",
        strength: 1, // 🔥 bỏ dấu + không phân biệt hoa thường
      })
      .sort({ createdAt: -1 })
      .limit(20)
      .select("-__v");

    if (!songs.length) {
      return res.json({ data: [] });
    }

    // 2️⃣ lấy user info (tránh gọi trùng)
    const userIds = [...new Set(songs.map((s) => s.userId))];
    const userMap = {};

    await Promise.all(
      userIds.map(async (userId) => {
        try {
          const user = await getUserById(userId);
          userMap[userId] = {
            username: user.username,
            avatar: user.avatar_url || null,
          };
        } catch {
          userMap[userId] = {
            username: "Unknown artist",
            avatar: null,
          };
        }
      }),
    );

    // 3️⃣ gắn user vào song
    const result = songs.map((song) => {
      const user = userMap[song.userId];
      return {
        ...song.toObject(),
        username: user?.username,
        userAvatar: user?.avatar,
      };
    });

    res.json({ data: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

exports.likeSong = async (req, res) => {
  try {
    const { id: songId } = req.params;
    const { userId } = req.body;

    await Like.create({ userId, songId });

    res.json({ liked: true });
  } catch (err) {
    if (err.code === 11000) {
      return res.json({ liked: true });
    }
    res.status(500).json({ error: err.message });
  }
};

exports.unlikeSong = async (req, res) => {
  try {
    const { id: songId } = req.params;
    const { userId } = req.body;

    await Like.findOneAndDelete({ userId, songId });

    res.json({ liked: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.isSongLiked = async (req, res) => {
  const { id: songId } = req.params;
  const { userId } = req.query;

  const liked = await Like.exists({ userId, songId });
  res.json({ liked: !!liked });
};

exports.getSongLikes = async (req, res) => {
  const { id: songId } = req.params;

  const count = await Like.countDocuments({ songId });
  res.json({ likes: count });
};

exports.getLikedSongs = async (req, res) => {
  try {
    const { userId } = req.params;

    // 1️⃣ lấy danh sách like
    const likes = await Like.find({ userId }).sort({ createdAt: -1 });

    if (!likes.length) {
      return res.json({ data: [] });
    }

    const songIds = likes.map((l) => l.songId);

    // 2️⃣ lấy bài hát
    const songs = await Song.find({ _id: { $in: songIds } }).select("-__v");

    // giữ thứ tự theo thời gian like
    const songMap = {};
    songs.forEach((s) => (songMap[s._id.toString()] = s));

    const orderedSongs = songIds
      .map((id) => songMap[id.toString()])
      .filter(Boolean);

    // 3️⃣ gắn username
    const userIds = [...new Set(orderedSongs.map((s) => s.userId))];
    const userMap = {};

    await Promise.all(
      userIds.map(async (uid) => {
        try {
          const user = await getUserById(uid);
          userMap[uid] = {
            username: user.username,
            avatar: user.avatar_url || null,
          };
        } catch {
          userMap[uid] = {
            username: "Unknown artist",
            avatar: null,
          };
        }
      }),
    );

    const result = orderedSongs.map((song) => ({
      ...song.toObject(),
      username: userMap[song.userId]?.username,
      userAvatar: userMap[song.userId]?.avatar,
    }));

    res.json({ data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getSongLikeCount = async (req, res) => {
  try {
    const { id: songId } = req.params;

    const count = await Like.countDocuments({ songId });

    res.json({ likes: count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
