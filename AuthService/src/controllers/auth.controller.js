const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const pool = require("../db");

const ACCESS_TOKEN_EXPIRES  = "15m";
const REFRESH_TOKEN_EXPIRES = "7d";
const REFRESH_TOKEN_EXPIRES_MS = 7 * 24 * 60 * 60 * 1000;

function generateAccessToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES });
}

function generateRefreshToken() {
  return crypto.randomBytes(64).toString("hex");
}

/* Ensure refresh_tokens table exists on first run */
;(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id    UUID        NOT NULL,
        token_hash VARCHAR(128) UNIQUE NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_rt_user ON refresh_tokens (user_id)`
    );
    /* Clean up expired tokens on startup */
    await pool.query(`DELETE FROM refresh_tokens WHERE expires_at < NOW()`);
  } catch (e) {
    console.warn("refresh_tokens table init warning:", e.message);
  }
})();

/* ===================== REGISTER ===================== */
exports.register = async (req, res) => {
  const { username, email, password, phone, gender, birthdate, avatar_url } = req.body;

  try {
    if (!username || !email || !password) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (username, email, password, phone, gender, birthdate, avatar_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, username, email, role`,
      [username, email, hashedPassword, phone || null, gender || null, birthdate || null, avatar_url || null]
    );

    res.status(201).json({ message: "Register successful", user: result.rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(400).json({ error: "Email already exists" });
    }
    console.error("register error:", err.message);
    res.status(500).json({ error: "Register failed" });
  }
};

/* ===================== LOGIN ===================== */
exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (!result.rows.length) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    if (user.status === "banned") {
      return res.status(403).json({ error: "Account has been suspended" });
    }

    const accessToken  = generateAccessToken({ id: user.id, role: user.role });
    const refreshToken = generateRefreshToken();
    const tokenHash    = crypto.createHash("sha256").update(refreshToken).digest("hex");
    const expiresAt    = new Date(Date.now() + REFRESH_TOKEN_EXPIRES_MS);

    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [user.id, tokenHash, expiresAt]
    );

    res.json({
      message: "Login successful",
      accessToken,
      refreshToken,
      /* Keep 'token' alias for graceful backward-compat with any cached clients */
      token: accessToken,
      user: {
        id:         user.id,
        username:   user.username,
        email:      user.email,
        role:       user.role,
        avatar_url: user.avatar_url,
      },
    });
  } catch (err) {
    console.error("login error:", err.message);
    res.status(500).json({ error: "Login failed" });
  }
};

/* ===================== REFRESH TOKEN ===================== */
exports.refresh = async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: "refreshToken is required" });

  const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");

  try {
    const { rows } = await pool.query(
      `SELECT rt.*, u.id as uid, u.role
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1 AND rt.expires_at > NOW()`,
      [tokenHash]
    );

    if (!rows.length) {
      return res.status(401).json({ error: "Invalid or expired refresh token" });
    }

    const row = rows[0];

    /* Rotate: delete old token, issue new pair */
    await pool.query("DELETE FROM refresh_tokens WHERE token_hash = $1", [tokenHash]);

    const newAccessToken  = generateAccessToken({ id: row.uid, role: row.role });
    const newRefreshToken = generateRefreshToken();
    const newHash         = crypto.createHash("sha256").update(newRefreshToken).digest("hex");
    const expiresAt       = new Date(Date.now() + REFRESH_TOKEN_EXPIRES_MS);

    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [row.uid, newHash, expiresAt]
    );

    res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken, token: newAccessToken });
  } catch (err) {
    console.error("refresh error:", err.message);
    res.status(500).json({ error: "Token refresh failed" });
  }
};

/* ===================== LOGOUT ===================== */
exports.logout = async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");
    await pool.query("DELETE FROM refresh_tokens WHERE token_hash = $1", [tokenHash]).catch(() => {});
  }
  res.json({ message: "Logged out successfully" });
};

/* ===================== LOGOUT ALL DEVICES ===================== */
exports.logoutAll = async (req, res) => {
  const userId = req.user?.id;
  if (userId) {
    await pool.query("DELETE FROM refresh_tokens WHERE user_id = $1", [userId]).catch(() => {});
  }
  res.json({ message: "Logged out from all devices" });
};
