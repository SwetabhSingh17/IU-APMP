import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import * as schema from '@shared/schema';
import pg from 'pg';
const { Pool } = pg;

interface DbConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

/**
 * Resolves database configuration with a single source of truth policy:
 *
 * 1. DATABASE_URL — takes precedence when set. It is the canonical connection
 *    string (drizzle-kit has always used it exclusively), so the runtime server
 *    follows it too. This prevents split-brain where the schema is pushed to
 *    one database while the server reads another.
 * 2. DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD — fallback style.
 * 3. Local development defaults as a last resort.
 */
function resolveDbConfig(): DbConfig {
  const { DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, DATABASE_URL } = process.env;

  if (DATABASE_URL) {
    try {
      const url = new URL(DATABASE_URL);
      const database = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
      if (!database) throw new Error('no database name in path');
      let host = url.hostname || '127.0.0.1';
      if (host === 'localhost') host = '127.0.0.1';
      return {
        host,
        port: url.port ? parseInt(url.port) : 5432,
        database,
        user: url.username ? decodeURIComponent(url.username) : 'postgres',
        password: url.password ? decodeURIComponent(url.password) : '',
      };
    } catch (error: any) {
      console.warn(`⚠️  Could not parse DATABASE_URL (${error.message}). Falling back to DB_* variables.`);
    }
  }

  let host = DB_HOST || '127.0.0.1';
  if (host === 'localhost') host = '127.0.0.1';

  if (DB_HOST || DB_NAME || DB_USER) {
    return {
      host,
      port: parseInt(DB_PORT || '5432'),
      database: DB_NAME || 'integral_project_hub',
      user: DB_USER || 'postgres',
      password: DB_PASSWORD || '',
    };
  }

  return {
    host: '127.0.0.1',
    port: 5432,
    database: 'integral_project_hub',
    user: 'postgres',
    password: '',
  };
}

const dbConfig = resolveDbConfig();

// When DATABASE_URL is the source it is used raw so extra options (sslmode,
// etc.) are preserved; otherwise the URL is constructed from the resolved
// config. Either way the postgres.js client and the pg session Pool target
// the SAME database.
const usingDatabaseUrl = !!process.env.DATABASE_URL;
const databaseUrl = usingDatabaseUrl
  ? process.env.DATABASE_URL!
  : `postgres://${encodeURIComponent(dbConfig.user)}:${encodeURIComponent(dbConfig.password)}@${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`;

// Initialize postgres client for Drizzle
const client = postgres(databaseUrl);
export const db = drizzle(client, { schema });

// Initialize pg Pool for session store with 5s connection timeout
export const pool = new Pool(
  usingDatabaseUrl
    ? { connectionString: databaseUrl, connectionTimeoutMillis: 5000 }
    : { ...dbConfig, connectionTimeoutMillis: 5000 }
);

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL pool client:', err.message);
});

/**
 * The exact database URL the running server is using. ensure_db.ts injects
 * this into drizzle-kit child processes so schema operations always target
 * the same database as the application, even if .env contains conflicting
 * configuration styles.
 */
export function getResolvedDatabaseUrl(): string {
  return databaseUrl;
}

/** Core application tables — every one of them must exist before serving traffic. */
const CORE_TABLES = [
  'users',
  'student_groups',
  'student_group_members',
  'project_topics',
  'student_projects',
  'project_assessments',
  'project_milestones',
  'notifications',
  'session',
  'user_notification_preferences',
] as const;

/**
 * Returns the names of core application tables that do not exist yet.
 * An empty array means the schema is fully present.
 */
export async function getMissingCoreTables(): Promise<string[]> {
  const missing: string[] = [];
  for (const table of CORE_TABLES) {
    const result: any = await db.execute(sql`SELECT to_regclass(${`public.${table}`}) AS reg`);
    const row = Array.isArray(result) ? result[0] : result?.rows?.[0];
    if (!row || row.reg === null) {
      missing.push(table);
    }
  }
  return missing;
}

/**
 * Verify database connectivity AND schema presence on startup.
 *
 * This project uses `drizzle-kit push` (npm run db:ensure / db:setup) to
 * synchronize the schema — file-based migrations are not used. Connectivity
 * alone is not enough: a fresh database previously passed this check and the
 * server started serving 500s ("relation users does not exist"). Now the
 * startup fails fast with an actionable message instead.
 */
export async function runMigrations() {
  try {
    await db.execute(sql`SELECT 1`);
    console.log('Database connection verified successfully');
  } catch (error) {
    console.error('Database connection failed:', error);
    throw error;
  }

  // Ensure supervisor-specific columns, indexes, and user_notification_preferences exist
  try {
    await db.execute(sql`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS emp_id TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS prefix TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS designation TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS department TEXT;
      CREATE INDEX IF NOT EXISTS emp_id_idx ON users (emp_id);

      ALTER TABLE project_topics ADD COLUMN IF NOT EXISTS topic_code TEXT;
      CREATE INDEX IF NOT EXISTS topic_code_idx ON project_topics (topic_code);

      CREATE TABLE IF NOT EXISTS user_notification_preferences (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        email_notifications BOOLEAN NOT NULL DEFAULT true,
        project_updates BOOLEAN NOT NULL DEFAULT true,
        deadline_reminders BOOLEAN NOT NULL DEFAULT true,
        system_announcements BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT user_notification_preferences_user_id_unique UNIQUE (user_id)
      );
      CREATE INDEX IF NOT EXISTS user_notification_preferences_user_id_idx ON user_notification_preferences (user_id);

      CREATE UNIQUE INDEX IF NOT EXISTS student_group_members_accepted_user_idx ON student_group_members (user_id) WHERE status = 'accepted';
    `);
  } catch (colErr) {
    console.warn('Notice: Custom columns/tables check/migration:', colErr);
  }

  const missing = await getMissingCoreTables();
  if (missing.length > 0) {
    throw new Error(
      `Database schema is not initialized (missing tables: ${missing.join(', ')}).\n` +
      `Run "npm run db:ensure" (safe — creates what is missing) or "npm run db:setup" ` +
      `(full reset) and restart the server.`
    );
  }
}

