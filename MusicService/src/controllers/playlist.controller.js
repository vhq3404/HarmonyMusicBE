const prisma = require("../config/db");
const { getUserById } = require("../utils/authClient");
const { toSongResponse, toPlaylistResponse } = require("../utils/transform");

/* ─── Ownership guard ───────────────────────────────────────── */
async function assertOwner(id, userId, res) {
  const playlist = await prisma.playlist.findUnique({ where: { id } });
  if (!playlist) { res.status(404).json({ error: "Playlist not found" }); return null; }
  if (playlist.userId !== userId) { res.status(403).json({ error: "Not authorised" }); return null; }
  return playlist;
}

/* ================= CREATE ================= */
exports.createPlaylist = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, isPublic } = req.body;

    if (!name?.trim()) return res.status(400).json({ error: "Name is required" });
    if (name.trim().length > 100) return res.status(400).json({ error: "Name too long (max 100 chars)" });

    const playlist = await prisma.playlist.create({
      data: { userId, name: name.trim(), isPublic: !!isPublic },
    });

    res.status(201).json({ playlist: toPlaylistResponse(playlist, []) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ================= UPDATE ================= */
exports.updatePlaylist = async (req, res) => {
  try {
    const { id } = req.params;
    const owner = await assertOwner(id, req.user.id, res);
    if (!owner) return;

    const { name, isPublic } = req.body;
    const data = {};
    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ error: "Name is required" });
      if (name.trim().length > 100) return res.status(400).json({ error: "Name too long" });
      data.name = name.trim();
    }
    if (isPublic !== undefined) data.isPublic = !!isPublic;

    if (!Object.keys(data).length) return res.status(400).json({ error: "Nothing to update" });

    const updated = await prisma.playlist.update({ where: { id }, data });
    const songIds = (
      await prisma.playlistSong.findMany({
        where: { playlistId: id },
        orderBy: { position: "asc" },
        select: { songId: true },
      })
    ).map((ps) => ps.songId);

    res.json({ playlist: toPlaylistResponse(updated, songIds) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ================= GET BY USER ================= */
exports.getPlaylistsByUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const playlists = await prisma.playlist.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { playlistSongs: { orderBy: { position: "asc" } } },
    });

    const data = playlists.map((p) => {
      const songIds = p.playlistSongs.map((ps) => ps.songId);
      return toPlaylistResponse(p, songIds);
    });

    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ================= GET BY ID ================= */
exports.getPlaylistById = async (req, res) => {
  try {
    const { id } = req.params;

    const playlist = await prisma.playlist.findUnique({
      where: { id },
      include: { playlistSongs: { orderBy: { position: "asc" } } },
    });

    if (!playlist) return res.status(404).json({ error: "Playlist not found" });

    /* Private playlist: only the owner may view */
    if (!playlist.isPublic && playlist.userId !== req.user?.id) {
      return res.status(403).json({ error: "This playlist is private" });
    }

    const orderedSongIds = playlist.playlistSongs.map((ps) => ps.songId);

    const songs = orderedSongIds.length
      ? await prisma.song.findMany({ where: { id: { in: orderedSongIds } } })
      : [];

    const songMap = {};
    songs.forEach((s) => (songMap[s.id] = s));
    const orderedSongs = orderedSongIds.map((sid) => songMap[sid]).filter(Boolean);

    const userIds = [...new Set(orderedSongs.map((s) => s.userId))];
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

    const songsWithUser = orderedSongs.map((song) => ({
      ...toSongResponse(song),
      username: userMap[song.userId]?.username,
      userAvatar: userMap[song.userId]?.avatar,
    }));

    res.json({
      playlist: toPlaylistResponse(playlist, orderedSongIds),
      songs: songsWithUser,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ================= ADD SONG ================= */
exports.addSongToPlaylist = async (req, res) => {
  try {
    const { id } = req.params;
    const { songId } = req.body;
    if (!songId) return res.status(400).json({ error: "songId is required" });

    const owner = await assertOwner(id, req.user.id, res);
    if (!owner) return;

    const existing = await prisma.playlistSong.findUnique({
      where: { playlistId_songId: { playlistId: id, songId } },
    });
    if (existing) return res.status(409).json({ error: "Song already in playlist" });

    const count = await prisma.playlistSong.count({ where: { playlistId: id } });
    await prisma.playlistSong.create({
      data: { playlistId: id, songId, position: count },
    });

    res.json({ message: "Added to playlist" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ================= REMOVE SONG ================= */
exports.removeSongFromPlaylist = async (req, res) => {
  try {
    const { id, songId } = req.params;

    const owner = await assertOwner(id, req.user.id, res);
    if (!owner) return;

    await prisma.playlistSong.deleteMany({ where: { playlistId: id, songId } });

    /* Renumber positions to keep them contiguous */
    const remaining = await prisma.playlistSong.findMany({
      where: { playlistId: id },
      orderBy: { position: "asc" },
    });
    if (remaining.length) {
      await prisma.$transaction(
        remaining.map((ps, i) =>
          prisma.playlistSong.update({ where: { id: ps.id }, data: { position: i } })
        )
      );
    }

    res.json({ message: "Removed from playlist" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ================= REORDER ================= */
exports.reorderSongs = async (req, res) => {
  try {
    const { id } = req.params;
    const { songIds } = req.body;

    if (!Array.isArray(songIds)) {
      return res.status(400).json({ error: "songIds must be an array" });
    }

    const owner = await assertOwner(id, req.user.id, res);
    if (!owner) return;

    const existing = await prisma.playlistSong.findMany({ where: { playlistId: id } });
    const existingIdSet = new Set(existing.map((ps) => ps.songId));

    if (
      songIds.length !== existingIdSet.size ||
      songIds.some((sid) => !existingIdSet.has(sid))
    ) {
      return res.status(400).json({ error: "Invalid song list" });
    }

    await prisma.$transaction(
      songIds.map((songId, i) =>
        prisma.playlistSong.update({
          where: { playlistId_songId: { playlistId: id, songId } },
          data: { position: i },
        })
      )
    );

    res.json({ message: "Reordered" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ================= DELETE ================= */
exports.deletePlaylist = async (req, res) => {
  try {
    const { id } = req.params;

    const owner = await assertOwner(id, req.user.id, res);
    if (!owner) return;

    await prisma.playlist.delete({ where: { id } });
    res.json({ message: "Playlist deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
