const pool = require("../db");

/* ===================== CREATE REPORT ===================== */
exports.createReport = async (req, res) => {
  const { reporterId, targetType, targetId, reason, description } = req.body;

  try {
    if (!reporterId || !targetType || !targetId || !reason) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    if (!["song", "user"].includes(targetType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid targetType",
      });
    }

    if (targetType === "user" && reporterId === targetId) {
      return res.status(400).json({
        success: false,
        message: "Không thể báo cáo chính mình",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO reports
        (reporter_id, target_type, target_id, reason, description)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (reporter_id, target_type, target_id)
      DO NOTHING
      RETURNING id
      `,
      [reporterId, targetType, targetId, reason, description || null],
    );

    if (result.rowCount === 0) {
      return res.json({
        success: false,
        code: "ALREADY_REPORTED",
      });
    }

    res.json({
      success: true,
      message: "Báo cáo thành công",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Report failed",
    });
  }
};
