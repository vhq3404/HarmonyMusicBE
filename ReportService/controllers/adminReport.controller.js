const pool = require("../db");

exports.getAllReports = async (req, res) => {
  const result = await pool.query(`
    SELECT *
    FROM reports
    ORDER BY created_at DESC
  `);

  res.json({ data: result.rows });
};

/* ===== GET REPORT COUNT BY SONG ===== */
exports.getSongReportStats = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        target_id AS song_id,
        COUNT(*)::int AS report_count
      FROM reports
      WHERE target_type = 'song'
        AND status = 'pending'
      GROUP BY target_id
    `);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
};

exports.resolveReportsBySong = async (req, res) => {
  const { songId } = req.params;

  try {
    await pool.query(
      `
      UPDATE reports
      SET status = 'resolved'
      WHERE target_type = 'song'
        AND target_id = $1
        AND status = 'pending'
      `,
      [songId],
    );

    res.json({
      success: true,
      message: "All reports resolved",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
};

/* ===== GET REPORTS OF A SONG ===== */
exports.getReportsBySong = async (req, res) => {
  const { songId } = req.params;

  try {
    const result = await pool.query(
      `
      SELECT
        id,
        reporter_id,
        reason,
        description,
        created_at
      FROM reports
      WHERE target_type = 'song'
        AND target_id = $1
        AND status = 'pending'
      ORDER BY created_at DESC
      `,
      [songId],
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
};
