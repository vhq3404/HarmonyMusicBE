require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const pool    = require("./db");

const {
  corsOptions,
  authLimiter,
  generalLimiter,
  sanitizeBody,
  helmet,
  hpp,
} = require("./middleware/security");

const authRoutes   = require("./routes/auth.route");
const userRoutes   = require("./routes/user.route");
const followRoutes = require("./routes/follow.routes");
const adminRoutes  = require("./routes/admin.routes");

const app = express();

/* ── Security headers ───────────────────────────── */
app.use(helmet());
app.set("trust proxy", 1);

/* ── CORS ───────────────────────────────────────── */
app.use(cors(corsOptions));

/* ── Body parsing & sanitization ───────────────── */
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(hpp());
app.use(sanitizeBody);

/* ── Rate limiting ──────────────────────────────── */
app.use("/api/auth", authLimiter);
app.use(generalLimiter);

/* ── Routes ─────────────────────────────────────── */
app.use("/api/auth",  authRoutes);
app.use("/api/users", userRoutes);
app.use("/api",       followRoutes);
app.use("/api/admin", adminRoutes);

/* ── Health check ───────────────────────────────── */
app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", service: "AuthService", db: "connected" });
  } catch (err) {
    res.status(503).json({ status: "error", service: "AuthService", db: err.message });
  }
});

/* ── Global error handler ───────────────────────── */
app.use((err, _req, res, _next) => {
  if (err.message?.startsWith("CORS")) {
    return res.status(403).json({ error: err.message });
  }
  console.error("Unhandled error:", err.message);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 4001;
const server = app.listen(PORT, () => {
  console.log(`AuthService running on port ${PORT}`);
  console.log(`CORS origins: ${process.env.ALLOWED_ORIGINS || "(open - set ALLOWED_ORIGINS in .env)"}`);
});

/* ── Graceful shutdown ──────────────────────────── */
const shutdown = (signal) => {
  console.log(`[AuthService] ${signal} received — shutting down gracefully`);
  server.close(() => {
    pool.end(() => {
      console.log("[AuthService] Database pool closed. Exiting.");
      process.exit(0);
    });
  });
  setTimeout(() => { console.error("[AuthService] Forced exit after timeout"); process.exit(1); }, 10_000);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
process.on("uncaughtException",  (err) => { console.error("[AuthService] Uncaught exception:", err); shutdown("uncaughtException"); });
process.on("unhandledRejection", (err) => { console.error("[AuthService] Unhandled rejection:", err); });
