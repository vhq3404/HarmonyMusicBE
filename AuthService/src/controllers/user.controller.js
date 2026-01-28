const pool = require("../db");
const cloudinary = require("../config/cloudinary");
const bcrypt = require("bcrypt");
const fs = require("fs");

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

/* ===================== UPDATE USER ===================== */
exports.updateUser = async (req, res) => {
  const { id } = req.params;
  const { username, gender, birthdate, bio } = req.body;

  try {
    if (!id) {
      return res.status(400).json({ error: "User id is required" });
    }

    let avatarUrl;

    /* ===== UPLOAD AVATAR ===== */
    if (req.file) {
      const uploadResult = await cloudinary.uploader.upload(req.file.path, {
        folder: "avatars",
        resource_type: "image",
      });

      avatarUrl = uploadResult.secure_url;

      fs.unlinkSync(req.file.path); // xoá file local
    }

    const result = await pool.query(
      `
      UPDATE users
      SET
        username = COALESCE($1, username),
        gender = COALESCE($2, gender),
        birthdate = COALESCE($3, birthdate),
        bio = COALESCE($4, bio),
        avatar_url = COALESCE($5, avatar_url)
      WHERE id = $6
      RETURNING
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
      `,
      [
        username || null,
        gender || null,
        birthdate || null,
        bio || null,
        avatarUrl || null,
        id,
      ]
    );

    res.json({
      message: "Update user success",
      user: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Update user failed" });
  }
};

/* ===================== CHANGE PASSWORD ===================== */
exports.changePassword = async (req, res) => {
  const { id } = req.params;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      error: "Thiếu thông tin mật khẩu",
    });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({
      error: "Mật khẩu mới phải ít nhất 6 ký tự",
    });
  }

  try {
    // 🔍 Lấy mật khẩu hiện tại
    const result = await pool.query(
      `SELECT password FROM users WHERE id = $1 LIMIT 1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User không tồn tại" });
    }

    const hashedPassword = result.rows[0].password;

    // ❌ Sai mật khẩu cũ
    const isMatch = await bcrypt.compare(currentPassword, hashedPassword);
    if (!isMatch) {
      return res.status(400).json({
        error: "Mật khẩu hiện tại không đúng",
      });
    }

    // 🔐 Hash mật khẩu mới
    const newHashed = await bcrypt.hash(newPassword, 10);

    // ✅ Update
    await pool.query(
      `UPDATE users SET password = $1 WHERE id = $2`,
      [newHashed, id]
    );

    res.json({
      message: "Đổi mật khẩu thành công",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Đổi mật khẩu thất bại",
    });
  }
};

/* ===================== GET USERS (role = user) ===================== */
exports.getUsers = async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT 
        id,
        username,
        avatar_url,
        role
      FROM users
      WHERE role = 'user'
      ORDER BY created_at DESC
      `
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