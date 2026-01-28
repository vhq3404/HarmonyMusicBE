// controllers/comment.controller.js
const Comment = require("../models/Comment");
const Song = require("../models/Song");
const { getUserById } = require("../utils/authClient");

/* ===================== GET COMMENTS BY SONG ===================== */
exports.getCommentsBySong = async (req, res) => {
  try {
    const { id: songId } = req.params;

    // check song tồn tại
    const song = await Song.findById(songId).select("_id");
    if (!song) {
      return res.status(404).json({ message: "Song not found" });
    }

    const comments = await Comment.find({ songId })
      .sort({ createdAt: -1 })
      .select("-__v");

    if (!comments.length) {
      return res.json({ data: [] });
    }

    /* ===== LẤY USER INFO (tránh gọi trùng) ===== */
    const userIds = [...new Set(comments.map((c) => c.userId))];
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
            username: "Unknown user",
            avatar: null,
          };
        }
      })
    );

    const result = comments.map((c) => ({
      ...c.toObject(),
      username: userMap[c.userId]?.username,
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
    const { userId, content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ message: "Content is required" });
    }

    // check song tồn tại
    const song = await Song.findById(songId).select("_id");
    if (!song) {
      return res.status(404).json({ message: "Song not found" });
    }

    const comment = await Comment.create({
      songId,
      userId,
      content: content.trim(),
    });

    /* ===== GẮN USER INFO CHO RESPONSE ===== */
    let username = "Unknown user";
    let userAvatar = null;

    try {
      const user = await getUserById(userId);
      if (user) {
        username = user.username || username;
        userAvatar = user.avatar_url || null;
      }
    } catch {}

    res.json({
      ...comment.toObject(),
      username,
      userAvatar,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ===================== DELETE COMMENT ===================== */
exports.deleteComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.query;

    const comment = await Comment.findById(id);
    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    // chỉ cho owner xoá
    if (comment.userId !== userId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    await comment.deleteOne();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ===================== COUNT COMMENTS ===================== */
exports.getCommentCount = async (req, res) => {
  try {
    const { id: songId } = req.params;

    const count = await Comment.countDocuments({ songId });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
