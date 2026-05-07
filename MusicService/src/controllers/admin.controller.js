const prisma = require("../config/db");
const axios = require("axios");
const { getUserById } = require("../utils/authClient");
const { toSongResponse } = require("../utils/transform");

/* ================= ADMIN GET SONGS ================= */
exports.getAdminSongs = async (req, res) => {
  try {
    const songs = await prisma.song.findMany({ orderBy: { createdAt: "desc" } });

    const reportRes = await axios.get(
      "http://localhost:4003/api/admin/reports/songs/stats",
    );

    const reportMap = {};
    reportRes.data.data.forEach((r) => {
      reportMap[r.song_id] = r.report_count;
    });

    const userIds = [...new Set(songs.map((s) => s.userId))];
    const userMap = {};

    await Promise.all(
      userIds.map(async (uid) => {
        try {
          const user = await getUserById(uid);
          userMap[uid] = { username: user.username, avatar: user.avatar_url || null };
        } catch {
          userMap[uid] = { username: "Unknown", avatar: null };
        }
      }),
    );

    const data = songs.map((song) => {
      const user = userMap[song.userId] || {};
      return {
        ...toSongResponse(song),
        username: user.username,
        userAvatar: user.avatar,
        reportCount: reportMap[song.id] || 0,
      };
    });

    data.sort((a, b) => b.reportCount - a.reportCount);

    res.json({ data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

/* ================= ADMIN UPDATE SONG STATUS ================= */
exports.updateSongStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    const song = await prisma.song.update({
      where: { id },
      data: { status },
    });

    if (status === "hidden" || status === "blocked") {
      try {
        await axios.patch(
          `http://localhost:4003/api/admin/reports/songs/${id}/resolve`,
        );
      } catch (err) {
        console.error("Resolve report failed:", err.message);
      }
    }

    res.json({ success: true, song: toSongResponse(song) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
