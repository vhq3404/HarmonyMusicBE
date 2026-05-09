require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const path    = require("path");
const fs      = require("fs");
const pool    = require("./db");
const aiRoutes = require("./routes/ai.routes");

const app = express();

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(uploadsDir));

app.use("/api/ai", aiRoutes);

app.get("/", (req, res) => {
  res.send("AiService running");
});

/* ─────────────────────────────────────────────
   DB bootstrap — create table if not exists
───────────────────────────────────────────── */
const initDb = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_generations (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id      VARCHAR(255) UNIQUE NOT NULL,
      user_id      VARCHAR(255) NOT NULL,
      status       VARCHAR(50)  NOT NULL DEFAULT 'PENDING',
      prompt       TEXT,
      style        VARCHAR(1000),
      title        VARCHAR(100),
      model        VARCHAR(50)  NOT NULL DEFAULT 'V3_5',
      custom_mode  BOOLEAN      NOT NULL DEFAULT false,
      instrumental BOOLEAN      NOT NULL DEFAULT false,
      negative_tags VARCHAR(500),
      vocal_gender VARCHAR(5),
      suno_data    JSONB,
      error_message TEXT,
      created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_ai_generations_user_id
      ON ai_generations (user_id);

    CREATE INDEX IF NOT EXISTS idx_ai_generations_status
      ON ai_generations (status);
  `);
  console.log("Database table ready");
};

const PORT = process.env.PORT || 4004;

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`AiService running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialise database:", err);
    process.exit(1);
  });
