require("dotenv").config();
const express  = require("express");
const cors     = require("cors");
const path     = require("path");
const fs       = require("fs");
const pool     = require("./db");
const aiRoutes = require("./routes/ai.routes");

const {
  corsOptions,
  generalLimiter,
  generateLimiter,
  sanitizeBody,
  helmet,
  hpp,
} = require("./middleware/security");

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
app.use("/api/ai/generate",        generateLimiter);
app.use("/api/ai/extend",          generateLimiter);
app.use("/api/ai/upload-cover",    generateLimiter);
app.use("/api/ai/upload-extend",   generateLimiter);
app.use("/api/ai/add-vocals",      generateLimiter);
app.use("/api/ai/add-instrumental",generateLimiter);
app.use("/api/ai/lyrics",          generateLimiter);
app.use(generalLimiter);

/* ── Static uploads dir ─────────────────────────── */
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use("/uploads", express.static(uploadsDir));

/* ── Routes ─────────────────────────────────────── */
app.use("/api/ai", aiRoutes);

/* ── Health check ───────────────────────────────── */
app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", service: "AiService", db: "connected" });
  } catch (err) {
    res.status(503).json({ status: "error", service: "AiService", db: err.message });
  }
});
app.get("/",       (_req, res) => res.send("AiService running"));

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
    CREATE TABLE IF NOT EXISTS ai_generations (
      id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id       VARCHAR(255) UNIQUE NOT NULL,
      user_id       VARCHAR(255) NOT NULL,
      status        VARCHAR(50)  NOT NULL DEFAULT 'PENDING',
      prompt        TEXT,
      style         VARCHAR(1000),
      title         VARCHAR(100),
      model         VARCHAR(50)  NOT NULL DEFAULT 'V3_5',
      custom_mode   BOOLEAN      NOT NULL DEFAULT false,
      instrumental  BOOLEAN      NOT NULL DEFAULT false,
      negative_tags VARCHAR(500),
      vocal_gender  VARCHAR(5),
      suno_data     JSONB,
      error_message TEXT,
      created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_ai_generations_user_id ON ai_generations (user_id);
    CREATE INDEX IF NOT EXISTS idx_ai_generations_status  ON ai_generations (status);
  `);
  console.log("[AiService] Database tables ready");
};

const PORT = process.env.PORT || 4004;
initDb()
  .then(() => {
    const server = app.listen(PORT, () => {
      console.log(`AiService running on port ${PORT}`);
      console.log(`CORS origins: ${process.env.ALLOWED_ORIGINS || "(open - set ALLOWED_ORIGINS in .env)"}`);
    });

    const shutdown = (signal) => {
      console.log(`[AiService] ${signal} received — shutting down gracefully`);
      server.close(() => {
        pool.end(() => {
          console.log("[AiService] Database pool closed. Exiting.");
          process.exit(0);
        });
      });
      setTimeout(() => { console.error("[AiService] Forced exit after timeout"); process.exit(1); }, 10_000);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT",  () => shutdown("SIGINT"));
    process.on("uncaughtException",  (err) => { console.error("[AiService] Uncaught exception:", err); shutdown("uncaughtException"); });
    process.on("unhandledRejection", (err) => { console.error("[AiService] Unhandled rejection:", err); });
  })
  .catch((err) => {
    console.error("[AiService] Failed to initialise database:", err);
    process.exit(1);
  });
