require("dotenv").config();
const express  = require("express");
const cors     = require("cors");
const path     = require("path");
const fs       = require("fs");
const pool     = require("./db");
const aiRoutes = require("./routes/ai.routes");

const {
  corsOptions,
  sanitizeBody,
  statusLimiter,
  generateLimiter,
  generalLimiter,
  helmet,
  hpp,
} = require("./middleware/security");

const { notFoundHandler, errorChain } = require("../shared/middleware/errorHandler");

const app = express();

app.use(helmet());
app.set("trust proxy", 1);

app.use(cors(corsOptions));

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(hpp());
app.use(sanitizeBody);

app.get("/api/ai/generate/:taskId/status", statusLimiter);
app.get("/api/ai/lyrics/:taskId/status",   statusLimiter);

app.post("/api/ai/generate",         generateLimiter);
app.post("/api/ai/extend",           generateLimiter);
app.post("/api/ai/upload-cover",     generateLimiter);
app.post("/api/ai/upload-extend",    generateLimiter);
app.post("/api/ai/add-vocals",       generateLimiter);
app.post("/api/ai/add-instrumental", generateLimiter);
app.post("/api/ai/lyrics",           generateLimiter);
app.use(generalLimiter);

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use("/uploads", express.static(uploadsDir));

app.use("/api/ai", aiRoutes);

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", service: "AiService", db: "connected" });
  } catch (err) {
    res.status(503).json({ status: "error", service: "AiService", db: err.message });
  }
});
app.get("/", (_req, res) => res.send("AiService running"));

app.use(notFoundHandler);

app.use(...errorChain);

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
      console.log(`CORS origins: ${process.env.ALLOWED_ORIGINS || "(open)"}`);
    });

    const shutdown = (signal) => {
      console.log(`[AiService] ${signal} received — shutting down gracefully`);
      server.close(() => {
        pool.end(() => {
          console.log("[AiService] Database pool closed. Exiting.");
          process.exit(0);
        });
      });
      setTimeout(() => { process.exit(1); }, 10_000);
    };

    process.on("SIGTERM",            () => shutdown("SIGTERM"));
    process.on("SIGINT",             () => shutdown("SIGINT"));
    process.on("uncaughtException",  (err) => { console.error("[AiService] Uncaught exception:", err); shutdown("uncaughtException"); });
    process.on("unhandledRejection", (err) => { console.error("[AiService] Unhandled rejection:", err); });
  })
  .catch((err) => {
    console.error("[AiService] Failed to initialise database:", err);
    process.exit(1);
  });
