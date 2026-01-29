const pool = require("../db");

/* ===== GET ALL USERS (ADMIN) ===== */
/* ================= GET USERS (NON-ADMIN) ================= */
exports.getUsers = async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT 
        id,
        username,
        email,
        status,
        role,
        created_at
      FROM users
      WHERE role != 'admin'
      ORDER BY created_at DESC
      `,
    );

    res.json({
      data: result.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Get users failed",
    });
  }
};

/* ===== UPDATE USER STATUS ===== */
exports.updateUserStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // active | locked

  await pool.query(`UPDATE users SET status = $1 WHERE id = $2`, [status, id]);

  res.json({ success: true });
};
