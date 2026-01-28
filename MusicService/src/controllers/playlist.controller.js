const mongoose = require("mongoose");
const Playlist = require("../models/Playlist");
const Song = require("../models/Song");
const { getUserById } = require("../utils/authClient");

/* ================= CREATE PLAYLIST ================= */
exports.createPlaylist = async (req, res) => {
  try {
    const { userId, name, isPublic } = req.body;

    if (!userId || !name) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const playlist = await Playlist.create({
      userId,
      name,
      isPublic: !!isPublic,
      songIds: [],
    });

    res.json({ playlist });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ================= GET PLAYLISTS BY USER ================= */
exports.getPlaylistsByUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const playlists = await Playlist.find({ userId }).sort({
      createdAt: -1,
    });

    res.json({ data: playlists });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ================= GET PLAYLIST DETAIL ================= */
exports.getPlaylistById = async (req, res) => {
  try {
    const { id } = req.params;

    const playlist = await Playlist.findById(id);
    if (!playlist) {
      return res.status(404).json({ message: "Playlist not found" });
    }

    // 🔥 giữ đúng thứ tự bài hát trong playlist
    const songs = await Song.find({
      _id: { $in: playlist.songIds },
    }).select("-__v");

    // map songId -> song
    const songMap = {};
    songs.forEach((s) => (songMap[s._id.toString()] = s));

    const orderedSongs = playlist.songIds
      .map((id) => songMap[id.toString()])
      .filter(Boolean);

    // ===== GẮN USER INFO =====
    const userIds = [...new Set(orderedSongs.map((s) => s.userId))];
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

    const songsWithUser = orderedSongs.map((song) => {
      const user = userMap[song.userId];
      return {
        ...song.toObject(),
        username: user.username,
        userAvatar: user.avatar,
      };
    });

    res.json({
      playlist,
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

    if (!mongoose.Types.ObjectId.isValid(songId)) {
      return res.status(400).json({ message: "Invalid songId" });
    }

    const playlist = await Playlist.findById(id);
    if (!playlist) {
      return res.status(404).json({ message: "Playlist not found" });
    }

    const exists = playlist.songIds.some((sid) => sid.toString() === songId);

    if (!exists) {
      playlist.songIds.push(songId);
      await playlist.save();
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

    await Playlist.findByIdAndDelete(id);

    res.json({ message: "Playlist deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
