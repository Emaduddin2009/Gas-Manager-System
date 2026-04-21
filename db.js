// ============================================================
//  DATABASE — SQLite via better-sqlite3
//  All tables are created here on first run (zero setup needed)
// ============================================================
require('dotenv').config();
const Database = require('better-sqlite3');
const path     = require('path');

const dbPath = path.resolve(process.env.DATABASE_PATH || './gas_manager.db');
const db     = new Database(dbPath);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ──────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          VARCHAR(100)  NOT NULL,
    username      VARCHAR(50)   NOT NULL UNIQUE,
    password_hash VARCHAR(255)  NOT NULL,
    role          VARCHAR(20)   NOT NULL DEFAULT 'user',
    status        VARCHAR(20)   NOT NULL DEFAULT 'pending',
    created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS customers (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER      NOT NULL,
    name            VARCHAR(150) NOT NULL,
    cid             VARCHAR(100),
    phone           VARCHAR(30),
    address         TEXT,
    addon           TEXT,
    buy_date        DATE,
    pipe_expiry     DATE,
    paper_loc       VARCHAR(50),
    photo_url       TEXT,
    paper_photo_url TEXT,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS refill_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER  NOT NULL,
    user_id     INTEGER  NOT NULL,
    refilled_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    note        TEXT,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)     REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_customers_user_id   ON customers(user_id);
  CREATE INDEX IF NOT EXISTS idx_refills_customer_id ON refill_logs(customer_id);
  CREATE INDEX IF NOT EXISTS idx_refills_date        ON refill_logs(refilled_at);
`);

console.log(`✅ Database ready at: ${dbPath}`);
module.exports = db;
