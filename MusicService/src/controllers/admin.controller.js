const Song = require("../models/Song");
const axios = require("axios");
const { getUserById } = require("../utils/authClient");

/* ================= ADMIN GET SONGS ================= */
exports.getAdminSongs = async (req, res) => {
  try {
    // 1️⃣ lấy toàn bộ bài hát
    const songs = await Song.find().sort({ createdAt: -1 }).lean();

    // 2️⃣ gọi ReportService để lấy report stats
    const reportRes = await axios.get(
      "http://localhost:4003/api/admin/reports/songs/stats",
    );

    const reportMap = {};
    reportRes.data.data.forEach((r) => {
      reportMap[r.song_id] = r.report_count;
    });

    // 3️⃣ lấy danh sách userId
    const userIds = [...new Set(songs.map((s) => s.userId))];

    // 4️⃣ map userId -> user info
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
            username: "Unknown",
            avatar: null,
          };
        }
      }),
    );

    // 5️⃣ merge toàn bộ data
    const data = songs.map((song) => {
      const user = userMap[song.userId] || {};

      return {
        ...song,
        username: user.username,
        userAvatar: user.avatar,
        reportCount: reportMap[song._id.toString()] || 0,
      };
    });

    // 6️⃣ sort theo reportCount DESC
    data.sort((a, b) => b.reportCount - a.reportCount);

    res.json({ data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

exports.updateSongStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const song = await Song.findByIdAndUpdate(
    id,
    { status },
    { new: true },
  );

  if (status === "hidden" || status === "blocked") {
    try {
      await axios.patch(
        `http://localhost:4003/api/reports/admin/songs/${id}/resolve`,
      );
    } catch (err) {
      console.error("Resolve report failed:", err.message);
    }
  }

  res.json({ success: true, song });
};