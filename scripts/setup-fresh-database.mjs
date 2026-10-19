import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import pg from "pg";

// Deliberately separate from schema push and from migrations on existing data.
// This command refuses an existing application database unless it contains
// the journal created by an earlier invocation of this same setup command.
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
  connectionTimeoutMillis: 15_000,
  max: 1,
});
const client = await pool.connect();
try {
  await client.query("SELECT pg_advisory_lock(64019501)");
  const existing = await client.query(`SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_type='BASE TABLE'`);
  if (existing.rowCount && !existing.rows.some(row => row.table_name === "agriconnect_setup_migrations")) {
    throw new Error("Refusing an existing database. Use a separate empty database for initial setup.");
  }
  await client.query(`CREATE TABLE IF NOT EXISTS agriconnect_setup_migrations (
    name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const directory = new URL("../database/migrations/", import.meta.url);
  // 0041/0042 transfer existing catalogue ownership to an existing user. They
  // are intentionally excluded from fresh installations.
  const files = (await readdir(directory)).filter(name => /^\d{4}_.*\.sql$/.test(name) && Number(name.slice(0, 4)) <= 40).sort();
  for (const name of files) {
    const sql = await readFile(new URL(name, directory), "utf8");
    const checksum = createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex");
    const applied = await client.query("SELECT sha256 FROM agriconnect_setup_migrations WHERE name=$1", [name]);
    if (applied.rowCount) {
      if (applied.rows[0].sha256 !== checksum) throw new Error(`Applied migration changed: ${name}`);
      continue;
    }
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO agriconnect_setup_migrations(name,sha256) VALUES($1,$2)", [name, checksum]);
      await client.query("COMMIT");
      console.log(`Applied ${name}`);
    } catch (error) {
      await client.query("ROLLBACK");
      console.error(`Migration failed: ${name}; code=${error.code || "unknown"}`);
      throw new Error("Fresh database setup stopped; completed migrations are retained for a safe retry.");
    }
  }
  console.log("Fresh database schema and reference data are ready. No local application records were copied.");
} finally {
  await client.query("SELECT pg_advisory_unlock(64019501)").catch(() => {});
  client.release();
  await pool.end();
}
