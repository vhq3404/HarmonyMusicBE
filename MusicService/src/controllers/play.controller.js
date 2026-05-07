const prisma = require("../config/db");

exports.createPlay = async (req, res) => {
  try {
    const { userId, songId, listenedSeconds } = req.body;

    if (!userId || !songId) {
      return res.status(400).json({ error: "Missing data" });
    }

    if (listenedSeconds < 5) {
      return res.json({ message: "Play not counted" });
    }

    await prisma.play.create({
      data: {
        userId,
        songId,
        completedAt: new Date(),
      },
    });

    await prisma.song.update({
      where: { id: songId },
      data: { playCount: { increment: 1 } },
    });

    res.json({ message: "Play counted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Create play failed" });
  }
};
