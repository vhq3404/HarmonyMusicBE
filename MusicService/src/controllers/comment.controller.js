const prisma = require("../config/db");
const { getUserById } = require("../utils/authClient");
const { toCommentResponse } = require("../utils/transform");

/* ===================== GET COMMENTS BY SONG ===================== */
exports.getCommentsBySong = async (req, res) => {
  try {
    const { id: songId } = req.params;

    const song = await prisma.song.findUnique({ where: { id: songId }, select: { id: true } });
    if (!song) return res.status(404).json({ message: "Song not found" });

    const comments = await prisma.comment.findMany({
      where:   { songId },
      orderBy: { createdAt: "desc" },
    });

    if (!comments.length) return res.json({ data: [] });

    /* Batch-resolve users with caching — avoids N+1 AuthService calls */
    const userIds = [...new Set(comments.map((c) => c.userId))];
    const userMap = {};

    await Promise.all(
      userIds.map(async (uid) => {
        try {
          const user = await getUserById(uid);
          userMap[uid] = { username: user.username, avatar: user.avatar_url || null };
        } catch {
          userMap[uid] = { username: "Unknown user", avatar: null };
        }
      }),
    );

    const result = comments.map((c) => ({
      ...toCommentResponse(c),
      username:   userMap[c.userId]?.username,
      userAvatar: userMap[c.userId]?.avatar,
    }));

    res.json({ data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ===================== CREATE COMMENT ===================== */
exports.createComment = async (req, res) => {
  try {
    const { id: songId } = req.params;
    /* userId from JWT — never from request body */
    const userId  = req.user.id;
    const { content } = req.body;

    if (!content?.trim()) return res.status(400).json({ message: "Content is required" });

    const song = await prisma.song.findUnique({ where: { id: songId }, select: { id: true } });
    if (!song) return res.status(404).json({ message: "Song not found" });

    const comment = await prisma.comment.create({
      data: { songId, userId, content: content.trim() },
    });

    let username   = "Unknown user";
    let userAvatar = null;
    try {
      const user = await getUserById(userId);
      if (user) { username = user.username || username; userAvatar = user.avatar_url || null; }
    } catch {}

    res.json({ ...toCommentResponse(comment), username, userAvatar });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ===================== DELETE COMMENT ===================== */
exports.deleteComment = async (req, res) => {
  try {
    const { id }   = req.params;
    const userId   = req.user.id;
    const userRole = req.user.role;

    const comment = await prisma.comment.findUnique({ where: { id } });
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    /* Owner or admin can delete */
    if (comment.userId !== userId && userRole !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    await prisma.comment.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ===================== COUNT COMMENTS ===================== */
exports.getCommentCount = async (req, res) => {
  try {
    const { id: songId } = req.params;
    const count = await prisma.comment.count({ where: { songId } });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
