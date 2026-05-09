const { PrismaClient } = require("@prisma/client");

function buildPrismaUrl(base) {
  try {
    const url = new URL(base);
    url.searchParams.set("connection_limit", "10");
    url.searchParams.set("pool_timeout",     "10");
    url.searchParams.set("connect_timeout",  "15");
    /* Required when using Neon's pgbouncer pooler (-pooler host).
       Without this, Prisma uses named prepared statements that are
       connection-scoped and break when pgbouncer recycles connections
       across clients (causes "prepared statement 's0' already exists"
       errors after prolonged usage). */
    url.searchParams.set("pgbouncer",        "true");
    return url.toString();
  } catch {
    return base;
  }
}

const prisma = new PrismaClient({
  datasources: { db: { url: buildPrismaUrl(process.env.DATABASE_URL) } },
  log: [
    { emit: "event", level: "warn" },
    { emit: "event", level: "error" },
  ],
});

prisma.$on("warn",  (e) => console.warn("[MusicService][Prisma]", e.message));
prisma.$on("error", (e) => console.error("[MusicService][Prisma]", e.message));

module.exports = prisma;
