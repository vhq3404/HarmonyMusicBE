require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max:                    20,
  idleTimeoutMillis:  30_000,
  connectionTimeoutMillis: 5_000,
  query_timeout:      30_000,
});

pool.on("error", (err) => {
  console.error("[ReportService] Unexpected pool error:", err.message);
});

module.exports = pool;
