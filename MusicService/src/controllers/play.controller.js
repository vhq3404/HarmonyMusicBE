const prisma = require("../config/db");

exports.createPlay = async (req, res) => {
  try {
    /* userId comes from JWT middleware — never trust the request body */
    const userId  = req.user.id;
    const { songId, listenedSeconds } = req.body;

    if (!songId) return res.status(400).json({ error: "songId is required" });

    /* Verify song exists before recording play */
    const song = await prisma.song.findUnique({ where: { id: songId }, select: { id: true } });
    if (!song) return res.status(404).json({ error: "Song not found" });

    await prisma.play.create({ data: { userId, songId, completedAt: new Date() } });

    /* Atomically increment playCount so it stays consistent with the plays table */
    await prisma.song.update({ where: { id: songId }, data: { playCount: { increment: 1 } } });

    res.json({ message: "Play counted" });
  } catch (err) {
    console.error("createPlay error:", err.message);
    res.status(500).json({ error: "Create play failed" });
  }
};

exports.getPlayStats = async (req, res) => {
  try {
    const { userId } = req.params;

    const [totalPlays, topSongs] = await Promise.all([
      prisma.play.count({ where: { userId } }),
      prisma.play.groupBy({
        by:       ["songId"],
        where:    { userId },
        _count:   { songId: true },
        orderBy:  { _count: { songId: "desc" } },
        take:     10,
      }),
    ]);

    const songIds  = topSongs.map((p) => p.songId);
    const songs    = await prisma.song.findMany({ where: { id: { in: songIds } } });
    const songMap  = Object.fromEntries(songs.map((s) => [s.id, s]));

    const result = topSongs.map((p) => ({
      song:      songMap[p.songId] ?? null,
      playCount: p._count.songId,
    }));

    res.json({ totalPlays, topSongs: result });
  } catch (err) {
    console.error("getPlayStats error:", err.message);
    res.status(500).json({ error: "Get stats failed" });
  }
};
