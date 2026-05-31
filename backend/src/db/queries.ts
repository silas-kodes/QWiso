import { db } from './db.js';
import { v4 as uuidv4 } from 'uuid';
import { normalizeDigits } from '../qwiso/phone.js';

// Types
export interface Dataset {
  id: string;
  name: string;
  country_code: string;
  country_name: string;
  dial_code: string;
  quantity: number;
  options_json: string;
  created_at: number;
  updated_at: number;
}

export interface NumberRecord {
  id: string;
  dataset_id: string;
  digits: string;
  raw_format: string;
  display_format: string;
  wa_status: 'pending' | 'checking' | 'valid' | 'invalid' | 'error';
  wa_checked_at: number | null;
  wa_error: string | null;
  recipient_group: 'unclassified' | 'campaign' | 'staff' | 'excluded';
  contacted: boolean;
  contacted_at: number | null;
  contact_status: string | null;
  created_at: number;
}

export interface Job {
  id: string;
  type: 'generate' | 'validate' | 'export';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  dataset_id: string | null;
  params_json: string | null;
  total_items: number;
  processed_items: number;
  valid_count: number;
  invalid_count: number;
  error_count: number;
  started_at: number | null;
  completed_at: number | null;
  result_json: string | null;
  error_message: string | null;
  created_at: number;
  updated_at: number;
}

// Dataset operations
export function createDataset(
  name: string,
  countryCode: string,
  countryName: string,
  dialCode: string,
  quantity: number,
  options: Record<string, unknown>
): string {
  const id = uuidv4();
  const now = Math.floor(Date.now() / 1000);
  
  const stmt = db.prepare(`
    INSERT INTO datasets (id, name, country_code, country_name, dial_code, quantity, options_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(id, name, countryCode, countryName, dialCode, quantity, JSON.stringify(options), now, now);
  return id;
}

export function getDataset(id: string): Dataset | undefined {
  const stmt = db.prepare('SELECT * FROM datasets WHERE id = ?');
  return stmt.get(id) as Dataset | undefined;
}

export function getAllDatasets(limit = 100, offset = 0): Dataset[] {
  const stmt = db.prepare('SELECT * FROM datasets ORDER BY created_at DESC LIMIT ? OFFSET ?');
  return stmt.all(limit, offset) as Dataset[];
}

export function deleteDataset(id: string): boolean {
  const stmt = db.prepare('DELETE FROM datasets WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

// Number operations
export function createNumber(
  datasetId: string,
  digits: string,
  rawFormat: string,
  displayFormat: string
): string {
  const clean = normalizeDigits(digits);
  if (!clean) {
    throw new Error(`Cannot save number: digits is empty after sanitization (original: "${digits}")`);
  }

  const id = uuidv4();
  const now = Math.floor(Date.now() / 1000);
  
  const stmt = db.prepare(`
    INSERT INTO numbers (id, dataset_id, digits, raw_format, display_format, recipient_group, created_at)
    VALUES (?, ?, ?, ?, ?, 'unclassified', ?)
  `);
  
  stmt.run(id, datasetId, clean, rawFormat, displayFormat, now);
  return id;
}

export function createNumbersBatch(
  datasetId: string,
  numbers: { digits: string; rawFormat: string; displayFormat: string }[]
): number {
  const insert = db.prepare(`
    INSERT INTO numbers (id, dataset_id, digits, raw_format, display_format, recipient_group, created_at)
    VALUES (?, ?, ?, ?, ?, 'unclassified', ?)
  `);
  
  const now = Math.floor(Date.now() / 1000);
  
  const insertMany = db.transaction((items: typeof numbers) => {
    let inserted = 0;
    for (const item of items) {
      const clean = normalizeDigits(item.digits);
      if (!clean) {
        console.warn(`Skipping number with empty digits after sanitization (original: "${item.digits}")`);
        continue;
      }
      item.digits = clean;
      insert.run(uuidv4(), datasetId, item.digits, item.rawFormat, item.displayFormat, now);
      inserted++;
    }
    return inserted;
  });

  return insertMany(numbers) as number;
}

export function getNumbersByDataset(
  datasetId: string,
  status?: string,
  limit = 1000,
  offset = 0
): NumberRecord[] {
  let query = 'SELECT * FROM numbers WHERE dataset_id = ?';
  const params: (string | number)[] = [datasetId];
  
  if (status) {
    query += ' AND wa_status = ?';
    params.push(status);
  }
  
  query += ' ORDER BY created_at LIMIT ? OFFSET ?';
  params.push(limit, offset);
  
  const stmt = db.prepare(query);
  return stmt.all(...params) as NumberRecord[];
}

export function getNumbersCountByDataset(datasetId: string): {
  total: number;
  pending: number;
  valid: number;
  invalid: number;
  error: number;
  campaign: number;
  staff: number;
  excluded: number;
} {
  const stmt = db.prepare(`
    SELECT 
      COUNT(*) as total,
      COALESCE(SUM(CASE WHEN wa_status = 'pending' THEN 1 ELSE 0 END), 0) as pending,
      COALESCE(SUM(CASE WHEN wa_status = 'valid' THEN 1 ELSE 0 END), 0) as valid,
      COALESCE(SUM(CASE WHEN wa_status = 'invalid' THEN 1 ELSE 0 END), 0) as invalid,
      COALESCE(SUM(CASE WHEN wa_status = 'error' THEN 1 ELSE 0 END), 0) as error,
      COALESCE(SUM(CASE WHEN recipient_group = 'campaign' THEN 1 ELSE 0 END), 0) as campaign,
      COALESCE(SUM(CASE WHEN recipient_group = 'staff' THEN 1 ELSE 0 END), 0) as staff,
      COALESCE(SUM(CASE WHEN recipient_group = 'excluded' THEN 1 ELSE 0 END), 0) as excluded
    FROM numbers WHERE dataset_id = ?
  `);
  
  return stmt.get(datasetId) as {
    total: number;
    pending: number;
    valid: number;
    invalid: number;
    error: number;
    campaign: number;
    staff: number;
    excluded: number;
  };
}

export function isNumberBlacklisted(digits: string): boolean {
  const stmt = db.prepare('SELECT 1 FROM dead_numbers WHERE digits = ?');
  return stmt.get(digits) !== undefined;
}

export function addToBlacklist(digits: string): void {
  const stmt = db.prepare('INSERT OR IGNORE INTO dead_numbers (digits, created_at) VALUES (?, ?)');
  stmt.run(digits, Math.floor(Date.now() / 1000));
}

export function updateNumberStatus(
  id: string,
  status: NumberRecord['wa_status'],
  error?: string,
  recipientGroup?: NumberRecord['recipient_group'],
): void {
  const now = Math.floor(Date.now() / 1000);

  if (status === 'invalid') {
    // 1. Get the digits of this number
    const getDigitsStmt = db.prepare('SELECT digits FROM numbers WHERE id = ?');
    const row = getDigitsStmt.get(id) as { digits: string } | undefined;
    if (row) {
      // 2. Add to blacklist
      addToBlacklist(row.digits);
    }
  }

  const defaultGroup = status === 'valid'
    ? 'campaign'
    : status === 'pending' || status === 'checking'
      ? 'unclassified'
      : 'excluded';

  let group = recipientGroup ?? defaultGroup;

  // Prevent any non-valid number from being assigned to campaign targets.
  if (status !== 'valid' && group === 'campaign') {
    group = 'excluded';
  }
  if ((status === 'invalid' || status === 'error') && group !== 'excluded') {
    group = 'excluded';
  }

  const stmt = db.prepare(`
    UPDATE numbers
    SET wa_status = ?, wa_checked_at = ?, wa_error = ?, recipient_group = ?
    WHERE id = ?
  `);

  stmt.run(status, now, error || null, group, id);
}

export function resetDatasetValidationStatus(datasetId: string): void {
  const stmt = db.prepare(`
    UPDATE numbers 
    SET wa_status = 'pending', wa_checked_at = NULL, wa_error = NULL, recipient_group = 'unclassified'
    WHERE dataset_id = ?
  `);
  stmt.run(datasetId);
}

export function getNumbersForValidation(
  datasetId: string,
  batchSize = 100,
  excludeIds: string[] = []
): NumberRecord[] {
  if (excludeIds.length > 0) {
    const placeholders = excludeIds.map(() => '?').join(',');
    const stmt = db.prepare(`
      SELECT * FROM numbers 
      WHERE dataset_id = ? 
        AND wa_status IN ('pending', 'error')
        AND id NOT IN (${placeholders})
      ORDER BY created_at
      LIMIT ?
    `);
    return stmt.all(datasetId, ...excludeIds, batchSize) as NumberRecord[];
  }

  const stmt = db.prepare(`
    SELECT * FROM numbers 
    WHERE dataset_id = ? AND wa_status IN ('pending', 'error')
    ORDER BY created_at
    LIMIT ?
  `);
  return stmt.all(datasetId, batchSize) as NumberRecord[];
}

export function getValidNumbersByDataset(datasetId: string): NumberRecord[] {
  const stmt = db.prepare(`
    SELECT * FROM numbers
    WHERE dataset_id = ? AND wa_status = 'valid' AND recipient_group = 'campaign'
    ORDER BY created_at
    LIMIT 10000
  `);
  return stmt.all(datasetId) as NumberRecord[];
}

// Job operations
export function createJob(
  type: Job['type'],
  datasetId: string | null,
  params: Record<string, unknown>
): string {
  const id = uuidv4();
  const now = Math.floor(Date.now() / 1000);
  
  const stmt = db.prepare(`
    INSERT INTO jobs (id, type, dataset_id, params_json, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'pending', ?, ?)
  `);
  
  stmt.run(id, type, datasetId, JSON.stringify(params), now, now);
  return id;
}

export function getJob(id: string): Job | undefined {
  const stmt = db.prepare('SELECT * FROM jobs WHERE id = ?');
  return stmt.get(id) as Job | undefined;
}

export function updateJobStatus(
  id: string,
  status: Job['status'],
  updates?: Partial<Omit<Job, 'id' | 'type' | 'status' | 'created_at'>>
): void {
  const fields: string[] = ['status = ?', 'updated_at = ?'];
  const values: (string | number | null)[] = [status, Math.floor(Date.now() / 1000)];
  
  if (updates?.total_items !== undefined) {
    fields.push('total_items = ?');
    values.push(updates.total_items);
  }
  if (updates?.processed_items !== undefined) {
    fields.push('processed_items = ?');
    values.push(updates.processed_items);
  }
  if (updates?.valid_count !== undefined) {
    fields.push('valid_count = ?');
    values.push(updates.valid_count);
  }
  if (updates?.invalid_count !== undefined) {
    fields.push('invalid_count = ?');
    values.push(updates.invalid_count);
  }
  if (updates?.error_count !== undefined) {
    fields.push('error_count = ?');
    values.push(updates.error_count);
  }
  if (updates?.result_json !== undefined) {
    fields.push('result_json = ?');
    values.push(updates.result_json);
  }
  if (updates?.error_message !== undefined) {
    fields.push('error_message = ?');
    values.push(updates.error_message);
  }
  if (updates?.started_at !== undefined) {
    fields.push('started_at = ?');
    values.push(updates.started_at);
  }
  if (updates?.completed_at !== undefined) {
    fields.push('completed_at = ?');
    values.push(updates.completed_at);
  }
  
  values.push(id);
  
  const stmt = db.prepare(`UPDATE jobs SET ${fields.join(', ')} WHERE id = ?`);
  stmt.run(...values);
}

export function getJobsByDataset(datasetId: string): Job[] {
  const stmt = db.prepare('SELECT * FROM jobs WHERE dataset_id = ? ORDER BY created_at DESC');
  return stmt.all(datasetId) as Job[];
}

export function getRunningJobs(): Job[] {
  const stmt = db.prepare("SELECT * FROM jobs WHERE status = 'running'");
  return stmt.all() as Job[];
}

// WhatsApp Session operations
export function saveWASession(id: string, name: string, state: string, phone: string | null, credsJson?: string | null): void {
  const now = Math.floor(Date.now() / 1000);
  const stmt = db.prepare(`
    INSERT INTO wa_sessions (id, name, state, phone, creds_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      state = excluded.state,
      phone = excluded.phone,
      creds_json = excluded.creds_json,
      updated_at = excluded.updated_at
  `);
  stmt.run(id, name, state, phone, credsJson || null, now);
}

export function getAllWASessions(): { id: string, name: string, state: string, phone: string | null, creds_json: string | null }[] {
  const stmt = db.prepare('SELECT id, name, state, phone, creds_json FROM wa_sessions');
  return stmt.all() as { id: string, name: string, state: string, phone: string | null, creds_json: string | null }[];
}

export function getWASession(id: string): { id: string, name: string, state: string, phone: string | null, creds_json: string | null } | undefined {
  const stmt = db.prepare('SELECT id, name, state, phone, creds_json FROM wa_sessions WHERE id = ?');
  return stmt.get(id) as { id: string, name: string, state: string, phone: string | null, creds_json: string | null } | undefined;
}

export function deleteWASession(id: string): void {
  const stmt = db.prepare('DELETE FROM wa_sessions WHERE id = ?');
  stmt.run(id);
}

// ─── Campaigns ───────────────────────────────────────────────────────────────

export interface Campaign {
  id: string;
  name: string;
  dataset_id: string;
  dataset_name?: string;
  platform: string;
  message_template: string;
  image_data?: string | null;
  image_mime_type?: string | null;
  image_filename?: string | null;
  status: string;
  scheduled_at: number | null;
  wa_account_ids: string | null;
  rate_per_hour: number;
  total_contacts: number;
  sent_contacts: number;
  failed_contacts: number;
  last_processed_index: number;
  last_error: string | null;
  created_at: number;
  updated_at: number;
}

export function createCampaign(campaign: Omit<Campaign, 'created_at' | 'updated_at' | 'status' | 'total_contacts' | 'sent_contacts' | 'failed_contacts' | 'last_processed_index' | 'last_error'>): void {
  const stmt = db.prepare(`
    INSERT INTO campaigns (id, name, dataset_id, platform, message_template, image_data, image_mime_type, image_filename, scheduled_at, wa_account_ids, rate_per_hour)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    campaign.id,
    campaign.name,
    campaign.dataset_id,
    campaign.platform,
    campaign.message_template,
    campaign.image_data || null,
    campaign.image_mime_type || null,
    campaign.image_filename || null,
    campaign.scheduled_at,
    campaign.wa_account_ids,
    campaign.rate_per_hour
  );
}

export function getCampaign(id: string): Campaign | undefined {
  const stmt = db.prepare(`
    SELECT c.*, d.name as dataset_name 
    FROM campaigns c 
    LEFT JOIN datasets d ON c.dataset_id = d.id 
    WHERE c.id = ?
  `);
  return stmt.get(id) as Campaign | undefined;
}

export function getCampaigns(): Campaign[] {
  const stmt = db.prepare(`
    SELECT c.*, d.name as dataset_name 
    FROM campaigns c 
    LEFT JOIN datasets d ON c.dataset_id = d.id 
    ORDER BY c.created_at DESC
  `);
  return stmt.all() as Campaign[];
}

export function updateCampaignStatus(id: string, status: string): void {
  const stmt = db.prepare('UPDATE campaigns SET status = ?, last_error = NULL, updated_at = unixepoch() WHERE id = ?');
  stmt.run(status, id);
}

export function pauseCampaignAtCheckpoint(id: string, lastProcessedIndex: number, reason: string): void {
  const stmt = db.prepare(`
    UPDATE campaigns
    SET status = 'paused', last_processed_index = ?, last_error = ?, updated_at = unixepoch()
    WHERE id = ?
  `);
  stmt.run(lastProcessedIndex, reason, id);
}

export function updateCampaignProgress(id: string, sent: number, failed: number): void {
  const stmt = db.prepare(`
    UPDATE campaigns 
    SET sent_contacts = ?, failed_contacts = ?, updated_at = unixepoch() 
    WHERE id = ?
  `);
  stmt.run(sent, failed, id);
}

export function updateCampaignCheckpoint(id: string, lastProcessedIndex: number): void {
  const stmt = db.prepare(`
    UPDATE campaigns
    SET last_processed_index = ?, updated_at = unixepoch()
    WHERE id = ?
  `);
  stmt.run(lastProcessedIndex, id);
}

export function incrementCampaignFailed(id: string): void {
  const stmt = db.prepare(`
    UPDATE campaigns
    SET failed_contacts = failed_contacts + 1, updated_at = unixepoch()
    WHERE id = ?
  `);
  stmt.run(id);
}

export function setCampaignTotalContacts(id: string, total: number): void {
  const stmt = db.prepare(`
    UPDATE campaigns SET total_contacts = ?, updated_at = unixepoch() WHERE id = ?
  `);
  stmt.run(total, id);
}

export function getValidCountForDataset(datasetId: string): number {
  const stmt = db.prepare(`
    SELECT COUNT(*) as cnt FROM numbers 
    WHERE dataset_id = ? AND wa_status = 'valid' AND recipient_group = 'campaign' AND (contacted = 0 OR contacted IS NULL)
  `);
  const row = stmt.get(datasetId) as { cnt: number };
  return row.cnt;
}

export function getUncontactedNumbers(datasetId: string, limit: number): NumberRecord[] {
  const stmt = db.prepare(`
    SELECT * FROM numbers 
    WHERE dataset_id = ? AND wa_status = 'valid' AND recipient_group = 'campaign' AND (contacted = 0 OR contacted IS NULL)
    ORDER BY created_at
    LIMIT ?
  `);
  return stmt.all(datasetId, limit) as NumberRecord[];
}

export function getValidatedCampaignNumbers(datasetId: string, limit = 10000): NumberRecord[] {
  const stmt = db.prepare(`
    SELECT * FROM numbers
    WHERE dataset_id = ?
      AND wa_status = 'valid'
      AND recipient_group = 'campaign'
      AND (contacted = 0 OR contacted IS NULL)
    ORDER BY created_at
    LIMIT ?
  `);
  return stmt.all(datasetId, limit) as NumberRecord[];
}

export function getCampaignContactStatusCounts(datasetId: string): {
  sent: number;
  failed: number;
  pending: number;
  totalTargets: number;
} {
  const stmt = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN contact_status = 'sent' THEN 1 ELSE 0 END), 0) as sent,
      COALESCE(SUM(CASE WHEN contact_status = 'failed' THEN 1 ELSE 0 END), 0) as failed,
      COALESCE(SUM(CASE WHEN wa_status = 'valid' AND recipient_group = 'campaign' AND (contacted = 0 OR contacted IS NULL) THEN 1 ELSE 0 END), 0) as pending,
      COALESCE(SUM(CASE WHEN wa_status = 'valid' AND recipient_group = 'campaign' THEN 1 ELSE 0 END), 0) as totalTargets
    FROM numbers
    WHERE dataset_id = ?
  `);
  return stmt.get(datasetId) as {
    sent: number;
    failed: number;
    pending: number;
    totalTargets: number;
  };
}

export function markNumberContacted(id: string, status: string = 'sent'): void {
  const stmt = db.prepare(`
    UPDATE numbers 
    SET contacted = 1, contacted_at = unixepoch(), contact_status = ? 
    WHERE id = ?
  `);
  stmt.run(status, id);
}

export function updateNumberContactStatus(id: string, status: string): void {
  const stmt = db.prepare(`
    UPDATE numbers
    SET contact_status = ?, contacted_at = COALESCE(contacted_at, unixepoch())
    WHERE id = ?
  `);
  stmt.run(status, id);
}

export function deleteCampaign(id: string): boolean {
  const stmt = db.prepare('DELETE FROM campaigns WHERE id = ?');
  return stmt.run(id).changes > 0;
}

// ─── Automation Rules ────────────────────────────────────────────────────────

export interface AutomationRule {
  id: string;
  name: string;
  trigger_type: 'exact' | 'contains' | 'regex';
  keyword: string;
  response_text: string;
  typing_delay: number;
  webhook_url: string | null;
  is_active: boolean;
  created_at: number;
  updated_at: number;
}

export function createAutomationRule(rule: Omit<AutomationRule, 'id' | 'created_at' | 'updated_at'>): string {
  const id = uuidv4();
  const stmt = db.prepare(`
    INSERT INTO automation_rules (id, name, trigger_type, keyword, response_text, typing_delay, webhook_url, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, rule.name, rule.trigger_type, rule.keyword, rule.response_text, rule.typing_delay || 0, rule.webhook_url || null, rule.is_active ? 1 : 0);
  return id;
}

export function getAutomationRules(): AutomationRule[] {
  const stmt = db.prepare('SELECT * FROM automation_rules ORDER BY created_at DESC');
  const rules = stmt.all() as any[];
  return rules.map(r => ({
    ...r,
    is_active: Boolean(r.is_active)
  }));
}

export function getActiveAutomationRules(): AutomationRule[] {
  const stmt = db.prepare('SELECT * FROM automation_rules WHERE is_active = 1');
  const rules = stmt.all() as any[];
  return rules.map(r => ({
    ...r,
    is_active: Boolean(r.is_active)
  }));
}

export function updateAutomationRule(id: string, updates: Partial<Omit<AutomationRule, 'id' | 'created_at' | 'updated_at'>>): void {
  const fields: string[] = ['updated_at = unixepoch()'];
  const values: any[] = [];
  
  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.trigger_type !== undefined) { fields.push('trigger_type = ?'); values.push(updates.trigger_type); }
  if (updates.keyword !== undefined) { fields.push('keyword = ?'); values.push(updates.keyword); }
  if (updates.response_text !== undefined) { fields.push('response_text = ?'); values.push(updates.response_text); }
  if (updates.typing_delay !== undefined) { fields.push('typing_delay = ?'); values.push(updates.typing_delay); }
  if (updates.webhook_url !== undefined) { fields.push('webhook_url = ?'); values.push(updates.webhook_url); }
  if (updates.is_active !== undefined) { fields.push('is_active = ?'); values.push(updates.is_active ? 1 : 0); }
  
  if (fields.length === 1) return; // Nothing to update
  
  values.push(id);
  const stmt = db.prepare(`UPDATE automation_rules SET ${fields.join(', ')} WHERE id = ?`);
  stmt.run(...values);
}

export function deleteAutomationRule(id: string): void {
  const stmt = db.prepare('DELETE FROM automation_rules WHERE id = ?');
  stmt.run(id);
}
