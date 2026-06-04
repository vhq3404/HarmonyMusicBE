"use strict";

const prisma              = require("../config/db");
const { getUserById }     = require("../utils/authClient");
const { getReportStatsBySong } = require("../utils/reportClient");
const { toSongResponse }  = require("../utils/transform");
const logger              = require("../../../shared/utils/logger").forService("MusicService");

class AdminSongsService {
  async getEnrichedSongs() {
    const songs = await prisma.song.findMany({ orderBy: { createdAt: "desc" } });

    let reportMap = new Map();
    try {
      reportMap = await getReportStatsBySong();
    } catch (err) {
      logger.warn("ReportService unavailable — proceeding without report counts", err);
    }

    const userIds = [...new Set(songs.map((s) => s.userId))];
    const userMap = Object.create(null);

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

    const enriched = songs.map((song) => ({
      ...toSongResponse(song),
      username:    userMap[song.userId]?.username  ?? "Unknown",
      userAvatar:  userMap[song.userId]?.avatar    ?? null,
      reportCount: reportMap.get(song.id)          ?? 0,
    }));

    enriched.sort((a, b) => b.reportCount - a.reportCount);
    return enriched;
  }
}

module.exports = new AdminSongsService();
