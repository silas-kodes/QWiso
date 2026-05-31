import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get database path from environment or use default
const dbPath = process.env.DB_PATH || join(__dirname, '../../../data/db/qwiso.db');

// Ensure directory exists
const dbDir = dirname(dbPath);
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

// Create database connection
export const db: Database.Database = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize schema
const schemaSQL = `
CREATE TABLE IF NOT EXISTS datasets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  country_code TEXT NOT NULL,
  country_name TEXT NOT NULL,
  dial_code TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  options_json TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS numbers (
  id TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL,
  digits TEXT NOT NULL,
  raw_format TEXT NOT NULL,
  display_format TEXT NOT NULL,
  wa_status TEXT DEFAULT 'pending',
  wa_checked_at INTEGER,
  wa_error TEXT,
  recipient_group TEXT DEFAULT 'unclassified',
  contacted BOOLEAN DEFAULT FALSE,
  contacted_at INTEGER,
  contact_status TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  dataset_id TEXT,
  params_json TEXT,
  total_items INTEGER DEFAULT 0,
  processed_items INTEGER DEFAULT 0,
  valid_count INTEGER DEFAULT 0,
  invalid_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  started_at INTEGER,
  completed_at INTEGER,
  result_json TEXT,
  error_message TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  token TEXT UNIQUE NOT NULL,
  data_json TEXT NOT NULL DEFAULT '{}',
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS wa_sessions (
  id TEXT PRIMARY KEY DEFAULT 'main',
  name TEXT NOT NULL DEFAULT 'Default Account',
  state TEXT NOT NULL,
  phone TEXT,
  qr_code TEXT,
  creds_json TEXT,
  connected_at INTEGER,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_numbers_dataset ON numbers(dataset_id);
CREATE INDEX IF NOT EXISTS idx_numbers_status ON numbers(wa_status);
CREATE INDEX IF NOT EXISTS idx_numbers_status_dataset ON numbers(dataset_id, wa_status);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_dataset ON jobs(dataset_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS automation_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL,       -- 'exact', 'contains', or 'regex'
  keyword TEXT NOT NULL,
  response_text TEXT NOT NULL,
  typing_delay INTEGER DEFAULT 0,
  webhook_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  dataset_id TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'whatsapp', -- 'whatsapp' or 'sms'
  message_template TEXT,
  image_data TEXT,
  image_mime_type TEXT,
  image_filename TEXT,
  status TEXT DEFAULT 'pending',    -- pending, scheduled, running, paused, completed, failed
  scheduled_at INTEGER,
  wa_account_ids TEXT,              -- JSON array of account IDs to rotate through (if platform=whatsapp)
  rate_per_hour INTEGER DEFAULT 50, -- Max messages per hour
  total_contacts INTEGER DEFAULT 0,
  sent_contacts INTEGER DEFAULT 0,
  failed_contacts INTEGER DEFAULT 0,
  last_processed_index INTEGER DEFAULT 0,
  last_error TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (dataset_id) REFERENCES datasets(id)
);

CREATE INDEX IF NOT EXISTS idx_campaigns_dataset ON campaigns(dataset_id);

CREATE TABLE IF NOT EXISTS dead_numbers (
  digits TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
`

db.exec(schemaSQL);

// Migration: add tracking columns if missing (for existing databases)
try {
  db.exec(`ALTER TABLE campaigns ADD COLUMN image_data TEXT`);
} catch (_) { /* column already exists */ }
try {
  db.exec(`ALTER TABLE campaigns ADD COLUMN image_mime_type TEXT`);
} catch (_) { /* column already exists */ }
try {
  db.exec(`ALTER TABLE campaigns ADD COLUMN image_filename TEXT`);
} catch (_) { /* column already exists */ }
try {
  db.exec(`ALTER TABLE campaigns ADD COLUMN total_contacts INTEGER DEFAULT 0`);
} catch (_) { /* column already exists */ }
try {
  db.exec(`ALTER TABLE campaigns ADD COLUMN sent_contacts INTEGER DEFAULT 0`);
} catch (_) { /* column already exists */ }
try {
  db.exec(`ALTER TABLE campaigns ADD COLUMN failed_contacts INTEGER DEFAULT 0`);
} catch (_) { /* column already exists */ }
try {
  db.exec(`ALTER TABLE campaigns ADD COLUMN last_processed_index INTEGER DEFAULT 0`);
} catch (_) { /* column already exists */ }
try {
  db.exec(`ALTER TABLE campaigns ADD COLUMN last_error TEXT`);
} catch (_) { /* column already exists */ }
try {
  db.exec(`ALTER TABLE numbers ADD COLUMN recipient_group TEXT DEFAULT 'unclassified'`);
} catch (_) { /* column already exists */ }
try {
  db.exec(`ALTER TABLE wa_sessions ADD COLUMN creds_json TEXT`);
} catch (_) { /* column already exists */ }
db.exec(`UPDATE numbers SET recipient_group = 'unclassified' WHERE recipient_group IS NULL`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_numbers_dataset_group ON numbers(dataset_id, recipient_group)`);
// Fix any 'draft' campaigns to 'pending'
db.exec(`UPDATE campaigns SET status = 'pending' WHERE status = 'draft'`);

console.log(`[DB] Connected to ${dbPath}`);

// Cleanup expired sessions periodically
export function cleanupExpiredSessions(): void {
  const stmt = db.prepare('DELETE FROM sessions WHERE expires_at < ?');
  const result = stmt.run(Math.floor(Date.now() / 1000));
  if (result.changes > 0) {
    console.log(`[DB] Cleaned up ${result.changes} expired sessions`);
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupExpiredSessions, 5 * 60 * 1000);

// Close database on process exit
process.on('SIGINT', () => {
  console.log('[DB] Closing connection...');
  db.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[DB] Closing connection...');
  db.close();
  process.exit(0);
});
