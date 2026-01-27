const pool = require("../db");

/* ===================== GET USER BY ID ===================== */
exports.getUserById = async (req, res) => {
  const { id } = req.params;

  try {
    if (!id) {
      return res.status(400).json({
        error: "User id is required",
      });
    }

    const result = await pool.query(
      `
      SELECT 
        id,
        username,
        email,
        phone,
        gender,
        birthdate,
        avatar_url,
        bio,
        status,
        role,
        created_at
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "User not found",
      });
    }

    res.json({
      user: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Get user failed",
    });
  }
};
