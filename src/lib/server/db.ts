// Server-only. Single shared Postgres pool for the app's route handlers, matching what
// scripts/apply-migrations.mjs already uses (plain `pg`, no ORM) — introduced here rather
// than earlier because this is the first server code that needs it at request time
// instead of as a one-off script.
import "server-only";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

declare global {
  // Reused across hot-reloads in dev so we don't open a new pool per edit.
  var __nexusPgPool: Pool | undefined;
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Missing required environment variable: DATABASE_URL");
  }
  return new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 10,
  });
}

function getPool(): Pool {
  if (!global.__nexusPgPool) {
    global.__nexusPgPool = createPool();
  }
  return global.__nexusPgPool;
}

/**
 * Runs a parameterized query and returns its rows, typed by the caller. Every route
 * handler should go through this rather than importing `pg` directly, so pooling and
 * SSL config stay in exactly one place.
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const pool = getPool();
  const result = await pool.query<T>(text, params);
  return result.rows;
}

/** Same as query(), but throws if the query didn't return exactly one row — for lookups
 * by primary key/slug where "not found" and "found two" are both bugs, not valid states. */
export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  if (rows.length > 1) {
    throw new Error(`Expected at most one row, got ${rows.length}. Query: ${text}`);
  }
  return rows[0] ?? null;
}

/** A single client, checked out for the lifetime of the callback, with its own
 * query/queryOne bound to that same connection — so writes inside `fn` share one
 * transaction instead of racing across separate pool connections. */
export interface TransactionClient {
  query<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<T[]>;
  queryOne<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<T | null>;
}

function bindClient(client: PoolClient): TransactionClient {
  return {
    async query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
      const result = await client.query<T>(text, params);
      return result.rows;
    },
    async queryOne<T extends QueryResultRow = QueryResultRow>(
      text: string,
      params: unknown[] = [],
    ): Promise<T | null> {
      const result = await client.query<T>(text, params);
      if (result.rows.length > 1) {
        throw new Error(`Expected at most one row, got ${result.rows.length}. Query: ${text}`);
      }
      return result.rows[0] ?? null;
    },
  };
}

/** Runs `fn` inside a BEGIN/COMMIT, rolling back on any thrown error — for a multi-insert
 * write where a partial failure must not leave an orphaned row visible to other queries
 * (e.g. a video row with no rights/categories, found via a real partial-failure case in
 * videoPublishing.ts's publishVideo()). */
export async function withTransaction<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await fn(bindClient(client));
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
