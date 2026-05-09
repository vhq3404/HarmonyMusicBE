require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const pool    = require("./db");

const {
  corsOptions,
  generalLimiter,
  reportLimiter,
  sanitizeBody,
  helmet,
  hpp,
} = require("./middleware/security");

const reportRoutes = require("./routes/report.routes");
const adminRoutes  = require("./routes/admin.routes");

const app = express();

/* ── Security headers ───────────────────────────── */
app.use(helmet());
app.set("trust proxy", 1);

/* ── CORS ───────────────────────────────────────── */
app.use(cors(corsOptions));

/* ── Body parsing & sanitization ───────────────── */
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(hpp());
app.use(sanitizeBody);

/* ── Rate limiting ──────────────────────────────── */
app.use("/api/reports", reportLimiter);
app.use(generalLimiter);

/* ── Routes ─────────────────────────────────────── */
app.use("/api",               reportRoutes);
app.use("/api/admin/reports", adminRoutes);

/* ── Health check ───────────────────────────────── */
app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", service: "ReportService", db: "connected" });
  } catch (err) {
    res.status(503).json({ status: "error", service: "ReportService", db: err.message });
  }
});

/* ── Global error handler ───────────────────────── */
app.use((err, _req, res, _next) => {
  if (err.message?.startsWith("CORS"))
    return res.status(403).json({ error: err.message });
  console.error("Unhandled error:", err.message);
  res.status(500).json({ error: "Internal server error" });
});

/* ── DB bootstrap ───────────────────────────────── */
const initDb = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reports (
      id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      reporter_id VARCHAR(255) NOT NULL,
      target_type VARCHAR(50)  NOT NULL,
      target_id   VARCHAR(255) NOT NULL,
      reason      TEXT         NOT NULL,
      description TEXT,
      status      VARCHAR(50)  NOT NULL DEFAULT 'pending',
      created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      UNIQUE (reporter_id, target_type, target_id)
    );
    CREATE INDEX IF NOT EXISTS idx_reports_status      ON reports (status);
    CREATE INDEX IF NOT EXISTS idx_reports_reporter_id ON reports (reporter_id);
  `);
  console.log("[ReportService] Database tables ready");
};

const PORT = process.env.PORT || 4003;
initDb()
  .then(() => {
    const server = app.listen(PORT, () => {
      console.log(`ReportService running on port ${PORT}`);
      console.log(`CORS origins: ${process.env.ALLOWED_ORIGINS || "(open - set ALLOWED_ORIGINS in .env)"}`);
    });

    const shutdown = (signal) => {
      console.log(`[ReportService] ${signal} received — shutting down gracefully`);
      server.close(() => {
        pool.end(() => {
          console.log("[ReportService] Database pool closed. Exiting.");
          process.exit(0);
        });
      });
      setTimeout(() => { console.error("[ReportService] Forced exit after timeout"); process.exit(1); }, 10_000);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT",  () => shutdown("SIGINT"));
    process.on("uncaughtException",  (err) => { console.error("[ReportService] Uncaught exception:", err); shutdown("uncaughtException"); });
    process.on("unhandledRejection", (err) => { console.error("[ReportService] Unhandled rejection:", err); });
  })
  .catch((err) => {
    console.error("[ReportService] Failed to initialise database:", err);
    process.exit(1);
  });
