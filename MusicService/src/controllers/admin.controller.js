/**
 * Admin Song Controller
 *
 * Thin HTTP-to-service delegation layer.
 * All multi-service orchestration has moved to AdminSongsService (Facade).
 * All ReportService communication goes through reportClient (Adapter + Proxy).
 *
 * Before refactor:
 *   • This controller contained raw axios.get("http://localhost:4003/...") calls.
 *   • It performed DB queries, AuthService calls, and report stat merging inline.
 *   • The hardcoded localhost:4003 URL was a critical architectural violation.
 *
 * After refactor:
 *   • getAdminSongs → adminSongsService.getEnrichedSongs() (Facade delegation)
 *   • updateSongStatus → resolveReportsForSong() (Adapter delegation)
 *   • Controller knows nothing about inter-service HTTP or data merging.
 */

"use strict";

const prisma              = require("../config/db");
const adminSongsService   = require("../services/adminSongs.service");
const { resolveReportsForSong } = require("../utils/reportClient");
const { toSongResponse }  = require("../utils/transform");

/* ── GET /api/admin/songs ────────────────────────────────────────────────── */

exports.getAdminSongs = async (req, res) => {
  try {
    // Facade: single call replaces DB query + 2 HTTP calls + merge + sort
    const data = await adminSongsService.getEnrichedSongs();
    res.json({ data });
  } catch (err) {
    console.error("[admin.controller] getAdminSongs:", err.message);
    res.status(500).json({ error: err.message });
  }
};

/* ── PATCH /api/admin/songs/:id/status ───────────────────────────────────── */

exports.updateSongStatus = async (req, res) => {
  const { id }     = req.params;
  const { status } = req.body;

  try {
    const song = await prisma.song.update({ where: { id }, data: { status } });

    // Adapter: resolveReportsForSong replaces the raw axios.patch call.
    // Only resolve when the song is being actioned (not when re-activating).
    if (status === "hidden" || status === "blocked") {
      try {
        await resolveReportsForSong(id);
      } catch (err) {
        // Non-fatal: song status has already been updated — log and continue
        console.error("[admin.controller] resolveReportsForSong failed:", err.message);
      }
    }

    res.json({ success: true, song: toSongResponse(song) });
  } catch (err) {
    console.error("[admin.controller] updateSongStatus:", err.message);
    res.status(500).json({ error: err.message });
  }
};
