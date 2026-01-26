const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../db");

/* ===================== REGISTER ===================== */
exports.register = async (req, res) => {
  const { username, email, password, phone, gender, birthdate, avatar_url } =
    req.body;

  try {
    if (!username || !email || !password) {
      return res.status(400).json({
        error: "Missing required fields",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `
      INSERT INTO users (
        username,
        email,
        password,
        phone,
        gender,
        birthdate,
        avatar_url
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, username, email, role
      `,
      [
        username,
        email,
        hashedPassword,
        phone || null,
        gender || null,
        birthdate || null,
        avatar_url || null,
      ]
    );

    res.status(201).json({
      message: "Register successful",
      user: result.rows[0],
    });
  } catch (err) {
    console.error(err);

    if (err.code === "23505") {
      return res.status(400).json({
        error: "Email already exists",
      });
    }

    res.status(500).json({
      error: "Register failed",
    });
  }
};

/* ===================== LOGIN ===================== */
exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password are required",
      });
    }

    const result = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: "Invalid email or password",
      });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({
        error: "Invalid email or password",
      });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        avatar_url: user.avatar_url,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
};
