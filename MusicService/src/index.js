require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const prisma  = require("./config/db");

const {
  corsOptions,
  generalLimiter,
  uploadLimiter,
  sanitizeBody,
  helmet,
  hpp,
} = require("./middleware/security");

const songRoutes     = require("./routes/song.route");
const playRoutes     = require("./routes/play.route");
const playListRoutes = require("./routes/playlist.route");
const commentRoutes  = require("./routes/comment.routes");
const adminRoutes    = require("./routes/admin.routes");

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

/* ── Request timeout ────────────────────────────── */
/* 30s cap releases Prisma connections held by hung/stalled requests */
app.use((_req, res, next) => {
  res.setTimeout(30_000, () => {
    if (!res.headersSent) res.status(503).json({ error: "Request timeout" });
  });
  next();
});

/* ── Rate limiting ──────────────────────────────── */
app.use(generalLimiter);

/* ── Routes ─────────────────────────────────────── */
app.use("/api/songs",     songRoutes);
app.use("/api/plays",     playRoutes);
app.use("/api/playlists", playListRoutes);
app.use("/api",           commentRoutes);
app.use("/api/admin",     adminRoutes);

/* ── Health check ───────────────────────────────── */
app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", service: "MusicService", db: "connected" });
  } catch (err) {
    res.status(503).json({ status: "error", service: "MusicService", db: err.message });
  }
});

/* ── Global error handler ───────────────────────── */
app.use((err, _req, res, _next) => {
  if (err.message?.startsWith("CORS"))
    return res.status(403).json({ error: err.message });
  console.error("Unhandled error:", err.message);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 4002;
const server = app.listen(PORT, () => {
  console.log(`MusicService running on port ${PORT}`);
  console.log(`CORS origins: ${process.env.ALLOWED_ORIGINS || "(open - set ALLOWED_ORIGINS in .env)"}`);
});

/* ── Graceful shutdown ──────────────────────────── */
const shutdown = async (signal) => {
  console.log(`[MusicService] ${signal} received — shutting down gracefully`);
  server.close(async () => {
    await prisma.$disconnect();
    console.log("[MusicService] Prisma disconnected. Exiting.");
    process.exit(0);
  });
  setTimeout(() => { console.error("[MusicService] Forced exit after timeout"); process.exit(1); }, 10_000);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
process.on("uncaughtException",  (err) => { console.error("[MusicService] Uncaught exception:", err); shutdown("uncaughtException"); });
process.on("unhandledRejection", (err) => { console.error("[MusicService] Unhandled rejection:", err); });
