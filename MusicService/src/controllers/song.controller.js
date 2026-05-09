const { Prisma } = require("@prisma/client");
const prisma = require("../config/db");
const cloudinary = require("../config/cloudinary");
const fs = require("fs");
const { getUserById } = require("../utils/authClient");
const { toSongResponse } = require("../utils/transform");
const removeVietnameseTones = require("../utils/removeVietnameseTones");

/* 30-second TTL in-memory cache for top songs — prevents pool exhaustion on burst home page loads */
const _topCache = { data: null, limit: 0, expiresAt: 0 };

async function attachUserInfo(songs) {
  if (!songs.length) return [];

  const userIds = [...new Set(songs.map((s) => s.userId))];
  const userMap = {};

  await Promise.all(
    userIds.map(async (uid) => {
      try {
        const user = await getUserById(uid);
        userMap[uid] = { username: user.username, avatar: user.avatar_url || null };
      } catch {
        userMap[uid] = { username: "Unknown artist", avatar: null };
      }
    }),
  );

  return songs.map((song) => ({
    ...toSongResponse(song),
    username:   userMap[song.userId]?.username,
    userAvatar: userMap[song.userId]?.avatar,
  }));
}

/* ===================== CREATE SONG ===================== */
exports.createSong = async (req, res) => {
  try {
    /* userId from JWT */
    const userId = req.user.id;
    const { title, artists, publicDate, lyrics } = req.body;
    const audioFile = req.files?.audio?.[0];
    const imageFile = req.files?.thumbnail?.[0];

    if (!audioFile || !imageFile) {
      return res.status(400).json({ error: "Audio and thumbnail files are required" });
    }

    const { parseFile } = await import("music-metadata");
    const metadata  = await parseFile(audioFile.path);
    const duration  = Math.floor(metadata.format.duration);

    const [audioUpload, imageUpload] = await Promise.all([
      cloudinary.uploader.upload(audioFile.path, { resource_type: "video" }),
      cloudinary.uploader.upload(imageFile.path),
    ]);

    fs.unlink(audioFile.path, () => {});
    fs.unlink(imageFile.path, () => {});

    const song = await prisma.song.create({
      data: {
        userId,
        title,
        duration,
        audioUrl:     audioUpload.secure_url,
        thumbnailUrl: imageUpload.secure_url,
        artists:      artists ? artists.split(",").map((a) => a.trim()) : [],
        lyrics:       lyrics || "",
        publicDate:   new Date(publicDate),
      },
    });

    res.json(toSongResponse(song));
  } catch (err) {
    console.error("createSong error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

/* ===================== GET SONGS ===================== */
exports.getSongs = async (req, res) => {
  try {
    const page  = Number(req.query.page)  || 1;
    const limit = Number(req.query.limit) || 10;
    const skip  = (page - 1) * limit;

    const [songs, total] = await Promise.all([
      prisma.song.findMany({ where: { isPublic: true }, orderBy: { createdAt: "desc" }, skip, take: limit }),
      prisma.song.count({ where: { isPublic: true } }),
    ]);

    const songsWithUser = await attachUserInfo(songs);

    res.json({
      data: songsWithUser,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ===================== TOP LISTENED SONGS ===================== */
exports.getTopSongs = async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 10;
    const now   = Date.now();

    if (_topCache.data && _topCache.limit === limit && now < _topCache.expiresAt) {
      return res.json({ data: _topCache.data });
    }

    const songs = await prisma.song.findMany({
      where:   { isPublic: true },
      orderBy: { playCount: "desc" },
      take:    limit,
    });

    if (!songs.length) {
      _topCache.data = []; _topCache.limit = limit; _topCache.expiresAt = now + 30_000;
      return res.json({ data: [] });
    }
    const result = await attachUserInfo(songs);
    _topCache.data = result; _topCache.limit = limit; _topCache.expiresAt = now + 30_000;
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
      const likes = await prisma.like.findMany({
        where: { userId }, take: 20, orderBy: { createdAt: "desc" },
      });

      if (likes.length) {
        const likedSongIds = likes.map((l) => l.songId);
        const likedSongs   = await prisma.song.findMany({ where: { id: { in: likedSongIds } } });
        const artists      = [...new Set(likedSongs.flatMap((s) => s.artists || []))];

        if (artists.length) {
          recommendedSongs = await prisma.song.findMany({
            where:   { isPublic: true, id: { notIn: likedSongIds }, artists: { hasSome: artists } },
            orderBy: { playCount: "desc" },
            take:    limit,
          });
        }
      }
    }

    if (!recommendedSongs.length) {
      recommendedSongs = await prisma.$queryRaw(Prisma.sql`
        SELECT
          id,
          user_id       AS "userId",
          title,
          duration,
          audio_url     AS "audioUrl",
          thumbnail_url AS "thumbnailUrl",
          artists,
          lyrics,
          public_date   AS "publicDate",
          is_public     AS "isPublic",
          status,
          play_count    AS "playCount",
          created_at    AS "createdAt",
          updated_at    AS "updatedAt"
        FROM songs
        WHERE is_public = true
        ORDER BY RANDOM()
        LIMIT ${limit}
      `);
    }

    const result = await attachUserInfo(recommendedSongs);
    res.json({ data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ===================== GET SONGS BY USER ===================== */
exports.getSongsByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { sort }   = req.query;

    if (!userId) return res.status(400).json({ message: "userId is required" });

    const orderBy = sort === "play" ? { playCount: "desc" } : { createdAt: "desc" };
    const songs   = await prisma.song.findMany({ where: { userId }, orderBy });

    if (!songs.length) return res.json({ data: [] });

    let username   = "Unknown artist";
    let userAvatar = null;
    try {
      const user = await getUserById(userId);
      if (user) { username = user.username || username; userAvatar = user.avatar_url || null; }
    } catch {}

    const songsWithUser = songs.map((song) => ({ ...toSongResponse(song), username, userAvatar }));
    res.json({ data: songsWithUser });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ===================== GET SONG BY ID ===================== */
exports.getSongById = async (req, res) => {
  try {
    const { id } = req.params;
    const song   = await prisma.song.findUnique({ where: { id } });
    if (!song) return res.status(404).json({ message: "Song not found" });

    let username = "Unknown artist"; let userAvatar = null;
    try {
      const user = await getUserById(song.userId);
      if (user) { username = user.username || username; userAvatar = user.avatar_url || null; }
    } catch {}

    res.json({ ...toSongResponse(song), username, userAvatar });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ===================== UPDATE SONG ===================== */
exports.updateSong = async (req, res) => {
  try {
    const { id }   = req.params;
    const userId   = req.user.id;
    const userRole = req.user.role;
    const { title, artists, lyrics, publicDate } = req.body;

    const existing = await prisma.song.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: "Song not found" });

    /* Only owner or admin can update */
    if (existing.userId !== userId && userRole !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const updateData = {};
    if (title      !== undefined) updateData.title     = title;
    if (artists    !== undefined) updateData.artists   = artists ? artists.split(",").map((a) => a.trim()) : [];
    if (lyrics     !== undefined) updateData.lyrics    = lyrics;
    if (publicDate !== undefined) updateData.publicDate = new Date(publicDate);

    if (req.files?.audio?.[0]) {
      const audioFile        = req.files.audio[0];
      const { parseFile }    = await import("music-metadata");
      const metadata         = await parseFile(audioFile.path);
      updateData.duration    = Math.floor(metadata.format.duration);

      if (existing.audioUrl) {
        const publicId = existing.audioUrl.split("/").pop().split(".")[0];
        await cloudinary.uploader.destroy(publicId, { resource_type: "video" }).catch(() => {});
      }

      const audioUpload   = await cloudinary.uploader.upload(audioFile.path, { resource_type: "video" });
      updateData.audioUrl = audioUpload.secure_url;
      fs.unlink(audioFile.path, () => {});
    }

    if (req.files?.thumbnail?.[0]) {
      const imageFile = req.files.thumbnail[0];
      if (existing.thumbnailUrl) {
        const publicId = existing.thumbnailUrl.split("/").pop().split(".")[0];
        await cloudinary.uploader.destroy(publicId).catch(() => {});
      }
      const imageUpload        = await cloudinary.uploader.upload(imageFile.path);
      updateData.thumbnailUrl  = imageUpload.secure_url;
      fs.unlink(imageFile.path, () => {});
    }

    const song = await prisma.song.update({ where: { id }, data: updateData });
    res.json(toSongResponse(song));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ===================== DELETE SONG ===================== */
exports.deleteSong = async (req, res) => {
  try {
    const { id }   = req.params;
    const userId   = req.user.id;
    const userRole = req.user.role;

    const song = await prisma.song.findUnique({ where: { id } });
    if (!song) return res.status(404).json({ message: "Song not found" });

    if (song.userId !== userId && userRole !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    await Promise.all([
      song.audioUrl     && cloudinary.uploader.destroy(song.audioUrl.split("/").pop().split(".")[0],     { resource_type: "video" }).catch(() => {}),
      song.thumbnailUrl && cloudinary.uploader.destroy(song.thumbnailUrl.split("/").pop().split(".")[0]).catch(() => {}),
    ]);

    await prisma.song.delete({ where: { id } });
    res.json({ message: "Song deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ===================== SEARCH SONGS ===================== */
exports.searchSongs = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q?.trim()) return res.json({ data: [] });

    const keyword    = q.trim();
    const normalized = removeVietnameseTones(keyword);

    const orClauses = [{ title: { contains: keyword, mode: "insensitive" } }];
    if (normalized !== keyword.toLowerCase()) {
      orClauses.push({ title: { contains: normalized, mode: "insensitive" } });
    }

    const songs = await prisma.song.findMany({
      where:   { isPublic: true, OR: orClauses },
      orderBy: { createdAt: "desc" },
      take:    20,
    });

    if (!songs.length) return res.json({ data: [] });
    const result = await attachUserInfo(songs);
    res.json({ data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ===================== LIKE / UNLIKE ===================== */
exports.likeSong = async (req, res) => {
  try {
    const { id: songId } = req.params;
    const userId         = req.user.id;

    await prisma.like.create({ data: { userId, songId } });
    res.json({ liked: true });
  } catch (err) {
    if (err.code === "P2002") return res.json({ liked: true });
    res.status(500).json({ error: err.message });
  }
};

exports.unlikeSong = async (req, res) => {
  try {
    const { id: songId } = req.params;
    const userId         = req.user.id;

    await prisma.like.deleteMany({ where: { userId, songId } });
    res.json({ liked: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.isSongLiked = async (req, res) => {
  try {
    const { id: songId } = req.params;
    /* Prefer JWT-authenticated user; fall back to query param for unauthenticated checks */
    const userId = req.user?.id || req.query.userId;
    if (!userId) return res.json({ liked: false });

    const like = await prisma.like.findUnique({
      where: { userId_songId: { userId, songId } },
    });
    res.json({ liked: !!like });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getSongLikeCount = async (req, res) => {
  try {
    const { id: songId } = req.params;
    const count = await prisma.like.count({ where: { songId } });
    res.json({ likes: count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ===================== LIKED SONGS ===================== */
exports.getLikedSongs = async (req, res) => {
  try {
    const { userId } = req.params;
    const likes      = await prisma.like.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });

    if (!likes.length) return res.json({ data: [] });

    const songIds = likes.map((l) => l.songId);
    const songs   = await prisma.song.findMany({ where: { id: { in: songIds } } });

    const songMap    = Object.fromEntries(songs.map((s) => [s.id, s]));
    const ordered    = songIds.map((id) => songMap[id]).filter(Boolean);
    const result     = await attachUserInfo(ordered);
    res.json({ data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
