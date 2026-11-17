import { createClient } from "@libsql/client";

let client;
let ready;

export function db() {
  const envUrl = process.env.TURSO_DATABASE_URL?.trim();
  const url = (!envUrl || envUrl.includes("your-db-your-org")) ? "file:local.db" : envUrl;
  client ??= createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN || undefined,
  });
  return client;
}

// Creates tables on first use (safe to run repeatedly).
export async function initDb() {
  ready ??= (async () => {
    const c = db();
    await c.batch(
      [
        `CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          chat_id TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS products (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          url TEXT NOT NULL,
          title TEXT,
          current_price REAL,
          target_price REAL NOT NULL,
          chat_id TEXT NOT NULL,
          check_interval INTEGER DEFAULT 60,
          user_id INTEGER,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS price_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id INTEGER NOT NULL,
          price REAL NOT NULL,
          checked_at TEXT DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE INDEX IF NOT EXISTS idx_history_product ON price_history(product_id, checked_at)`,
        `CREATE INDEX IF NOT EXISTS idx_products_chat ON products(chat_id)`,
        `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
      ],
      "write"
    );

    // Migrations in case tables existed before new columns were added
    try {
      await c.execute("ALTER TABLE products ADD COLUMN check_interval INTEGER DEFAULT 60");
    } catch {}
    try {
      await c.execute("ALTER TABLE products ADD COLUMN user_id INTEGER");
    } catch {}

    return c;
  })();

  await ready;
  return db();
}
