/**
 * AdminSongsService — Facade
 *
 * Hides the complexity of enriching admin song data from three separate sources:
 *   1. MusicService database (Prisma)     — song records
 *   2. AuthService (via authClient)       — username + avatar
 *   3. ReportService (via reportClient)   — report count
 *
 * ── Before this Facade ───────────────────────────────────────────────────────
 * admin.controller.js performed all four steps inline: DB query, raw HTTP call
 * to ReportService with a hardcoded localhost URL, batch AuthService resolution,
 * and manual data merging + sorting. The controller was responsible for HTTP
 * handling AND multi-service orchestration.
 *
 * ── After this Facade ────────────────────────────────────────────────────────
 * The controller calls adminSongsService.getEnrichedSongs() and receives the
 * finished array. It knows nothing about where the data came from or how it was
 * assembled. Single Responsibility is restored.
 *
 * ── Design decisions ────────────────────────────────────────────────────────
 * • ReportService failure is non-fatal — the response still returns all songs,
 *   just with reportCount: 0 for every entry. Admin pages remain functional
 *   even when ReportService is temporarily unavailable.
 * • Both authClient and reportClient maintain their own TTL caches, so repeated
 *   calls to this Facade do not hammer downstream services.
 */

"use strict";

const prisma              = require("../config/db");
const { getUserById }     = require("../utils/authClient");
const { getReportStatsBySong } = require("../utils/reportClient");
const { toSongResponse }  = require("../utils/transform");
// Singleton: shared structured logger
const logger              = require("../../../shared/utils/logger").forService("MusicService");

class AdminSongsService {
  /**
   * Returns all songs enriched with username, userAvatar, and reportCount,
   * sorted by reportCount descending (most-reported first).
   *
   * @returns {Promise<Array<object>>}
   */
  async getEnrichedSongs() {
    // Step 1 — Load all songs (no status filter: admin sees everything)
    const songs = await prisma.song.findMany({ orderBy: { createdAt: "desc" } });

    // Step 2 — Load report stats from ReportService (via Adapter + Proxy)
    let reportMap = new Map();
    try {
      reportMap = await getReportStatsBySong();
    } catch (err) {
      // Non-fatal: proceed with empty report counts rather than failing the page
      logger.warn("ReportService unavailable — proceeding without report counts", err);
    }

    // Step 3 — Batch-resolve user info from AuthService (via Facade + Proxy)
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

    // Step 4 — Merge all data sources and sort by report severity
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

// Singleton — stateless service, consistent with service layer conventions
module.exports = new AdminSongsService();
