-- Qwiso Database Schema
-- SQLite with better-sqlite3

-- Datasets: metadata for generated number collections
CREATE TABLE IF NOT EXISTS datasets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  country_code TEXT NOT NULL,        -- ISO country code (e.g., 'US', 'GB')
  country_name TEXT NOT NULL,        -- Display name (e.g., '🇺🇸 United States')
  dial_code TEXT NOT NULL,           -- e.g., '+1', '+44'
  quantity INTEGER NOT NULL,
  options_json TEXT,                 -- JSON: { useDial, useSpaces, localOnly, prefixes }
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Numbers: individual phone numbers in datasets
CREATE TABLE IF NOT EXISTS numbers (
  id TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL,
  digits TEXT NOT NULL,              -- The number digits (normalized)
  raw_format TEXT NOT NULL,          -- E164-like format with dial code
  display_format TEXT NOT NULL,      -- Human-readable format
  
  -- WhatsApp validation status
  wa_status TEXT DEFAULT 'pending',  -- pending, checking, valid, invalid, error
  wa_checked_at INTEGER,             -- When validation completed
  wa_error TEXT,                     -- Error message if failed
  recipient_group TEXT DEFAULT 'unclassified', -- unclassified, campaign, staff, excluded
  
  -- Future: contact campaign fields
  contacted BOOLEAN DEFAULT FALSE,
  contacted_at INTEGER,
  contact_status TEXT,               -- delivered, read, failed
  
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  
  FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE
);

-- Jobs: track generate/validate jobs
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,                -- 'generate', 'validate', 'export'
  status TEXT NOT NULL DEFAULT 'pending', -- pending, running, completed, failed, cancelled
  
  -- Job parameters
  dataset_id TEXT,                   -- For validate/export jobs
  params_json TEXT,                  -- Job-specific parameters
  
  -- Progress tracking
  total_items INTEGER DEFAULT 0,
  processed_items INTEGER DEFAULT 0,
  valid_count INTEGER DEFAULT 0,
  invalid_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  
  -- Timing
  started_at INTEGER,
  completed_at INTEGER,
  
  -- Results
  result_json TEXT,                  -- Summary results
  error_message TEXT,
  
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  
  FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE SET NULL
);

-- Sessions: server-side session storage
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  token TEXT UNIQUE NOT NULL,
  data_json TEXT NOT NULL DEFAULT '{}',
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- WhatsApp session state persistence (optional metadata)
CREATE TABLE IF NOT EXISTS wa_sessions (
  id TEXT PRIMARY KEY DEFAULT 'main',
  name TEXT NOT NULL DEFAULT 'main', -- Session name
  state TEXT NOT NULL,               -- disconnected, connecting, qr_ready, connected
  phone TEXT,                        -- Connected phone number
  qr_code TEXT,                      -- Current QR code (base64)
  connected_at INTEGER,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_numbers_dataset ON numbers(dataset_id);
CREATE INDEX IF NOT EXISTS idx_numbers_status ON numbers(wa_status);
CREATE INDEX IF NOT EXISTS idx_numbers_status_dataset ON numbers(dataset_id, wa_status);
CREATE INDEX IF NOT EXISTS idx_numbers_dataset_group ON numbers(dataset_id, recipient_group);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_dataset ON jobs(dataset_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- Campaigns: sending messages (WhatsApp or SMS)
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  dataset_id TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'whatsapp', -- 'whatsapp' or 'sms'
  message_template TEXT NOT NULL,
  status TEXT DEFAULT 'draft',      -- draft, scheduled, running, paused, completed
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

-- Automation Rules: Keyword auto-replies
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
