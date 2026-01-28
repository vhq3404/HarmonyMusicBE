const pool = require("../db");

/* ===================== FOLLOW USER ===================== */
exports.followUser = async (req, res) => {
  const { followerId, followingId } = req.body;

  try {
    if (!followerId || !followingId) {
      return res.status(400).json({
        error: "Missing followerId or followingId",
      });
    }

    if (followerId === followingId) {
      return res.status(400).json({
        error: "Cannot follow yourself",
      });
    }

    await pool.query(
      `
      INSERT INTO user_follows (follower_id, following_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
      `,
      [followerId, followingId]
    );

    res.json({
      followed: true,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Follow user failed",
    });
  }
};

/* ===================== UNFOLLOW USER ===================== */
exports.unfollowUser = async (req, res) => {
  const { followerId, followingId } = req.body;

  try {
    await pool.query(
      `
      DELETE FROM user_follows
      WHERE follower_id = $1 AND following_id = $2
      `,
      [followerId, followingId]
    );

    res.json({
      followed: false,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Unfollow user failed",
    });
  }
};

/* ===================== CHECK FOLLOW ===================== */
exports.isFollowing = async (req, res) => {
  const { followerId, followingId } = req.query;

  try {
    const result = await pool.query(
      `
      SELECT 1
      FROM user_follows
      WHERE follower_id = $1 AND following_id = $2
      LIMIT 1
      `,
      [followerId, followingId]
    );

    res.json({
      following: result.rows.length > 0,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Check follow failed",
    });
  }
};

/* ===================== COUNT FOLLOWERS ===================== */
exports.getFollowerCount = async (req, res) => {
  const { userId } = req.params;

  try {
    const result = await pool.query(
      `
      SELECT COUNT(*)::int AS count
      FROM user_follows
      WHERE following_id = $1
      `,
      [userId]
    );

    res.json({
      followers: result.rows[0].count,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Get follower count failed",
    });
  }
};

/* ===================== COUNT FOLLOWING ===================== */
exports.getFollowingCount = async (req, res) => {
  const { userId } = req.params;

  try {
    const result = await pool.query(
      `
      SELECT COUNT(*)::int AS count
      FROM user_follows
      WHERE follower_id = $1
      `,
      [userId]
    );

    res.json({
      following: result.rows[0].count,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Get following count failed",
    });
  }
};

/* ===================== LIST FOLLOWERS ===================== */
exports.getFollowerList = async (req, res) => {
  const { userId } = req.params;

  try {
    const result = await pool.query(
      `
      SELECT 
        u.id,
        u.username,
        u.avatar_url
      FROM user_follows f
      JOIN users u ON f.follower_id = u.id
      WHERE f.following_id = $1
      ORDER BY f.created_at DESC
      `,
      [userId]
    );

    res.json({ data: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Get followers failed" });
  }
};

/* ===================== LIST FOLLOWING ===================== */
exports.getFollowingList = async (req, res) => {
  const { userId } = req.params;

  try {
    const result = await pool.query(
      `
      SELECT 
        u.id,
        u.username,
        u.avatar_url
      FROM user_follows f
      JOIN users u ON f.following_id = u.id
      WHERE f.follower_id = $1
      ORDER BY f.created_at DESC
      `,
      [userId]
    );

    res.json({ data: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Get following failed" });
  }
};
