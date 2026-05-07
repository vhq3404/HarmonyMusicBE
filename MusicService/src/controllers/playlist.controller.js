const prisma = require("../config/db");
const { getUserById } = require("../utils/authClient");
const { toSongResponse, toPlaylistResponse } = require("../utils/transform");

/* ================= CREATE PLAYLIST ================= */
exports.createPlaylist = async (req, res) => {
  try {
    const { userId, name, isPublic } = req.body;

    if (!userId || !name) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const playlist = await prisma.playlist.create({
      data: {
        userId,
        name,
        isPublic: !!isPublic,
      },
    });

    res.json({ playlist: toPlaylistResponse(playlist, []) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ================= GET PLAYLISTS BY USER ================= */
exports.getPlaylistsByUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const playlists = await prisma.playlist.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        playlistSongs: { orderBy: { position: "asc" } },
      },
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

/* ================= GET PLAYLIST DETAIL ================= */
exports.getPlaylistById = async (req, res) => {
  try {
    const { id } = req.params;

    const playlist = await prisma.playlist.findUnique({
      where: { id },
      include: {
        playlistSongs: { orderBy: { position: "asc" } },
      },
    });

    if (!playlist) return res.status(404).json({ message: "Playlist not found" });

    const orderedSongIds = playlist.playlistSongs.map((ps) => ps.songId);

    const songs = await prisma.song.findMany({
      where: { id: { in: orderedSongIds } },
    });

    const songMap = {};
    songs.forEach((s) => (songMap[s.id] = s));
    const orderedSongs = orderedSongIds.map((id) => songMap[id]).filter(Boolean);

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

/* ================= ADD SONG TO PLAYLIST ================= */
exports.addSongToPlaylist = async (req, res) => {
  try {
    const { id } = req.params;
    const { songId } = req.body;

    const playlist = await prisma.playlist.findUnique({
      where: { id },
      include: { playlistSongs: { orderBy: { position: "asc" } } },
    });

    if (!playlist) return res.status(404).json({ message: "Playlist not found" });

    const exists = playlist.playlistSongs.some((ps) => ps.songId === songId);

    if (!exists) {
      const nextPosition = playlist.playlistSongs.length;
      await prisma.playlistSong.create({
        data: { playlistId: id, songId, position: nextPosition },
      });
    }

    res.json({ message: "Added to playlist" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ================= DELETE PLAYLIST ================= */
exports.deletePlaylist = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.playlist.delete({ where: { id } });
    res.json({ message: "Playlist deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
