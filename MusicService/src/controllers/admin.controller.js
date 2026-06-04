"use strict";

const prisma              = require("../config/db");
const adminSongsService   = require("../services/adminSongs.service");
const { resolveReportsForSong } = require("../utils/reportClient");
const { toSongResponse }  = require("../utils/transform");

exports.getAdminSongs = async (req, res) => {
  try {
    const data = await adminSongsService.getEnrichedSongs();
    res.json({ data });
  } catch (err) {
    console.error("[admin.controller] getAdminSongs:", err.message);
    res.status(500).json({ error: err.message });
  }
};

exports.updateSongStatus = async (req, res) => {
  const { id }     = req.params;
  const { status } = req.body;

  try {
    const song = await prisma.song.update({ where: { id }, data: { status } });

    if (status === "hidden" || status === "blocked") {
      try {
        await resolveReportsForSong(id);
      } catch (err) {
        console.error("[admin.controller] resolveReportsForSong failed:", err.message);
      }
    }

    res.json({ success: true, song: toSongResponse(song) });
  } catch (err) {
    console.error("[admin.controller] updateSongStatus:", err.message);
    res.status(500).json({ error: err.message });
  }
};
