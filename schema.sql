-- =============================================
--  Gas Manager Pro — SQL Schema
--  Compatible with: SQLite / PostgreSQL
-- =============================================

-- USERS TABLE
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          VARCHAR(100)  NOT NULL,
    username      VARCHAR(50)   NOT NULL UNIQUE COLLATE NOCASE,
    password_hash VARCHAR(255)  NOT NULL,
    role          VARCHAR(20)   NOT NULL DEFAULT 'user',     -- 'owner' | 'user'
    status        VARCHAR(20)   NOT NULL DEFAULT 'pending',  -- 'pending' | 'approved' | 'blocked'
    created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CUSTOMERS TABLE
CREATE TABLE IF NOT EXISTS customers (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER      NOT NULL,
    name            VARCHAR(150) NOT NULL,
    cid             VARCHAR(100),          -- Consumer ID
    phone           VARCHAR(30),
    address         TEXT,
    addon           TEXT,                  -- Add-On Info
    buy_date        DATE,
    pipe_expiry     DATE,                  -- buy_date + 5 years
    paper_loc       VARCHAR(50),           -- 'My Home' | 'Customer Home'
    photo_data      TEXT,                  -- base64 image string
    paper_photo_data TEXT,                 -- base64 document image
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- REFILL HISTORY TABLE
CREATE TABLE IF NOT EXISTS refill_logs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id  INTEGER  NOT NULL,
    user_id      INTEGER  NOT NULL,
    refilled_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    note         TEXT,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)     REFERENCES users(id)
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_customers_user_id    ON customers(user_id);
CREATE INDEX IF NOT EXISTS idx_customers_name       ON customers(name);
CREATE INDEX IF NOT EXISTS idx_refill_logs_cust_id  ON refill_logs(customer_id);
CREATE INDEX IF NOT EXISTS idx_refill_logs_date     ON refill_logs(refilled_at);
CREATE INDEX IF NOT EXISTS idx_refill_logs_user_id  ON refill_logs(user_id);
