import { mkdir } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

export type DbRow = Record<string, any>;
export type Query = (sql: string, values?: unknown[]) => Promise<DbRow[]>;
type Driver = { query: Query; transaction: <T>(fn: (query: Query) => Promise<T>) => Promise<T> };
const globalDb = globalThis as typeof globalThis & { pinwuAccountDb?: Promise<Driver> };

export const accountSchema = `
CREATE TABLE IF NOT EXISTS account_users (
 id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
 password_hash TEXT NOT NULL, role TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS account_sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES account_users(id), expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS account_sessions_user ON account_sessions(user_id);
CREATE TABLE IF NOT EXISTS account_login_limits (
 id TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS account_calls (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES account_users(id), task_id TEXT NOT NULL,
 feature TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL, endpoint TEXT NOT NULL,
 user_agent TEXT NOT NULL UNIQUE, request_id TEXT, job_id TEXT, prompt TEXT NOT NULL,
 status TEXT NOT NULL, http_status INTEGER, error TEXT, started_at TEXT NOT NULL, finished_at TEXT,
 latency_ms INTEGER, media_id TEXT, storage_error TEXT
);
CREATE INDEX IF NOT EXISTS account_calls_user ON account_calls(user_id,started_at);
CREATE INDEX IF NOT EXISTS account_calls_request ON account_calls(request_id);
CREATE INDEX IF NOT EXISTS account_calls_job ON account_calls(job_id);
CREATE TABLE IF NOT EXISTS account_media (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES account_users(id), call_id TEXT NOT NULL UNIQUE,
 mime TEXT NOT NULL, location TEXT NOT NULL, storage TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS account_bills (
 request_id TEXT PRIMARY KEY, call_id TEXT UNIQUE REFERENCES account_calls(id), model TEXT NOT NULL,
 user_agent TEXT NOT NULL, billed_at TEXT NOT NULL, cost_nano BIGINT NOT NULL,
 status TEXT NOT NULL, imported_at TEXT NOT NULL, import_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS account_imports (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES account_users(id), file_hash TEXT NOT NULL,
 filename TEXT NOT NULL, row_count INTEGER NOT NULL, added_count INTEGER NOT NULL, created_at TEXT NOT NULL
);
`;

/** Additive migration: existing accounts stay approved; disabled accounts stay disabled. */
export async function initializeAccountSchema(q: Query, postgres: boolean) {
  for (const statement of accountSchema.split(";").map(v=>v.trim()).filter(Boolean)) await q(statement);
  const columns = postgres
    ? (await q("SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='account_users'")).map(r=>r.column_name)
    : (await q("PRAGMA table_info(account_users)")).map(r=>r.name);
  if (!columns.includes("approval_status")) await q("ALTER TABLE account_users ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'approved'");
  if (!columns.includes("admin_note")) await q("ALTER TABLE account_users ADD COLUMN admin_note TEXT NOT NULL DEFAULT ''");
}

async function connect(): Promise<Driver> {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  let driver: Driver;
  if (url) {
    const pool = new Pool({ connectionString: url, max: 4 });
    driver = {
      query: async (sql, values = []) => (await pool.query(sql, values)).rows,
      transaction: async (fn) => {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          // Serialize billing imports/admin updates across Vercel instances.
          await client.query("SELECT pg_advisory_xact_lock(19482831)");
          const result = await fn(async (sql, values = []) => (await client.query(sql, values)).rows);
          await client.query("COMMIT");
          return result;
        } catch (error) { await client.query("ROLLBACK"); throw error; }
        finally { client.release(); }
      }
    };
  } else {
    if (process.env.VERCEL) throw new Error("请先配置 PostgreSQL DATABASE_URL，云端不能使用本地数据库。");
    const folder = process.env.PINWU_LOCAL_DATA_DIR || path.join(process.cwd(), ".local-data");
    await mkdir(folder, { recursive: true, mode: 0o700 });
    const moduleName = "node:sqlite";
    const { DatabaseSync } = await import(/* webpackIgnore: true */ moduleName);
    const db = new DatabaseSync(path.join(folder, "accounts.sqlite"));
    db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=15000; PRAGMA foreign_keys=ON;");
    let queue = Promise.resolve();
    const exclusive = <T>(fn: () => Promise<T>) => {
      const result = queue.then(fn);
      queue = result.then(() => {}, () => {});
      return result;
    };
    const raw: Query = async (sql, values = []) => {
      const ordered: unknown[] = [];
      const statement = sql.replace(/\$(\d+)/g, (_, index) => { ordered.push(values[Number(index) - 1] ?? null); return "?"; });
      return db.prepare(statement).all(...ordered);
    };
    driver = {
      query: (sql, values) => exclusive(() => raw(sql, values)),
      transaction: (fn) => exclusive(async () => {
        db.exec("BEGIN IMMEDIATE");
        try { const result = await fn(raw); db.exec("COMMIT"); return result; }
        catch (error) { db.exec("ROLLBACK"); throw error; }
      })
    };
  }
  await driver.transaction(q=>initializeAccountSchema(q,Boolean(url)));
  return driver;
}

export function database() {
  if (!globalDb.pinwuAccountDb) globalDb.pinwuAccountDb = connect().catch((error) => { globalDb.pinwuAccountDb = undefined; throw error; });
  return globalDb.pinwuAccountDb;
}
export const query: Query = async (sql, values) => (await database()).query(sql, values);
export async function transaction<T>(fn: (query: Query) => Promise<T>) { return (await database()).transaction(fn); }
