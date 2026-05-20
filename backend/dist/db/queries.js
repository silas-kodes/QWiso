import { db } from './db.js';
import { v4 as uuidv4 } from 'uuid';
import { normalizeDigits } from '../qwiso/phone.js';
// Dataset operations
export function createDataset(name, countryCode, countryName, dialCode, quantity, options) {
    const id = uuidv4();
    const now = Math.floor(Date.now() / 1000);
    const stmt = db.prepare(`
    INSERT INTO datasets (id, name, country_code, country_name, dial_code, quantity, options_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
    stmt.run(id, name, countryCode, countryName, dialCode, quantity, JSON.stringify(options), now, now);
    return id;
}
export function getDataset(id) {
    const stmt = db.prepare('SELECT * FROM datasets WHERE id = ?');
    return stmt.get(id);
}
export function getAllDatasets(limit = 100, offset = 0) {
    const stmt = db.prepare('SELECT * FROM datasets ORDER BY created_at DESC LIMIT ? OFFSET ?');
    return stmt.all(limit, offset);
}
export function deleteDataset(id) {
    const stmt = db.prepare('DELETE FROM datasets WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
}
// Number operations
export function createNumber(datasetId, digits, rawFormat, displayFormat) {
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
export function createNumbersBatch(datasetId, numbers) {
    const insert = db.prepare(`
    INSERT INTO numbers (id, dataset_id, digits, raw_format, display_format, recipient_group, created_at)
    VALUES (?, ?, ?, ?, ?, 'unclassified', ?)
  `);
    const now = Math.floor(Date.now() / 1000);
    const insertMany = db.transaction((items) => {
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
    return insertMany(numbers);
}
export function getNumbersByDataset(datasetId, status, limit = 1000, offset = 0) {
    let query = 'SELECT * FROM numbers WHERE dataset_id = ?';
    const params = [datasetId];
    if (status) {
        query += ' AND wa_status = ?';
        params.push(status);
    }
    query += ' ORDER BY created_at LIMIT ? OFFSET ?';
    params.push(limit, offset);
    const stmt = db.prepare(query);
    return stmt.all(...params);
}
export function getNumbersCountByDataset(datasetId) {
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
    return stmt.get(datasetId);
}
export function isNumberBlacklisted(digits) {
    const stmt = db.prepare('SELECT 1 FROM dead_numbers WHERE digits = ?');
    return stmt.get(digits) !== undefined;
}
export function addToBlacklist(digits) {
    const stmt = db.prepare('INSERT OR IGNORE INTO dead_numbers (digits, created_at) VALUES (?, ?)');
    stmt.run(digits, Math.floor(Date.now() / 1000));
}
export function updateNumberStatus(id, status, error, recipientGroup) {
    const now = Math.floor(Date.now() / 1000);
    if (status === 'invalid') {
        // 1. Get the digits of this number
        const getDigitsStmt = db.prepare('SELECT digits FROM numbers WHERE id = ?');
        const row = getDigitsStmt.get(id);
        if (row) {
            // 2. Add to blacklist
            addToBlacklist(row.digits);
        }
    }
    const group = recipientGroup ?? (status === 'valid' ? 'campaign' : status === 'pending' || status === 'checking' ? 'unclassified' : 'excluded');
    const stmt = db.prepare(`
    UPDATE numbers
    SET wa_status = ?, wa_checked_at = ?, wa_error = ?, recipient_group = ?
    WHERE id = ?
  `);
    stmt.run(status, now, error || null, group, id);
}
export function resetDatasetValidationStatus(datasetId) {
    const stmt = db.prepare(`
    UPDATE numbers 
    SET wa_status = 'pending', wa_checked_at = NULL, wa_error = NULL, recipient_group = 'unclassified'
    WHERE dataset_id = ?
  `);
    stmt.run(datasetId);
}
export function getNumbersForValidation(datasetId, batchSize = 100, excludeIds = []) {
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
        return stmt.all(datasetId, ...excludeIds, batchSize);
    }
    const stmt = db.prepare(`
    SELECT * FROM numbers 
    WHERE dataset_id = ? AND wa_status IN ('pending', 'error')
    ORDER BY created_at
    LIMIT ?
  `);
    return stmt.all(datasetId, batchSize);
}
export function getValidNumbersByDataset(datasetId) {
    const stmt = db.prepare(`
    SELECT * FROM numbers
    WHERE dataset_id = ? AND wa_status = 'valid' AND recipient_group = 'campaign'
    ORDER BY created_at
    LIMIT 10000
  `);
    return stmt.all(datasetId);
}
// Job operations
export function createJob(type, datasetId, params) {
    const id = uuidv4();
    const now = Math.floor(Date.now() / 1000);
    const stmt = db.prepare(`
    INSERT INTO jobs (id, type, dataset_id, params_json, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'pending', ?, ?)
  `);
    stmt.run(id, type, datasetId, JSON.stringify(params), now, now);
    return id;
}
export function getJob(id) {
    const stmt = db.prepare('SELECT * FROM jobs WHERE id = ?');
    return stmt.get(id);
}
export function updateJobStatus(id, status, updates) {
    const fields = ['status = ?', 'updated_at = ?'];
    const values = [status, Math.floor(Date.now() / 1000)];
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
export function getJobsByDataset(datasetId) {
    const stmt = db.prepare('SELECT * FROM jobs WHERE dataset_id = ? ORDER BY created_at DESC');
    return stmt.all(datasetId);
}
export function getRunningJobs() {
    const stmt = db.prepare("SELECT * FROM jobs WHERE status = 'running'");
    return stmt.all();
}
// WhatsApp Session operations
export function saveWASession(id, name, state, phone) {
    const now = Math.floor(Date.now() / 1000);
    const stmt = db.prepare(`
    INSERT INTO wa_sessions (id, name, state, phone, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      state = excluded.state,
      phone = excluded.phone,
      updated_at = excluded.updated_at
  `);
    stmt.run(id, name, state, phone, now);
}
export function getAllWASessions() {
    const stmt = db.prepare('SELECT id, name, state, phone FROM wa_sessions');
    return stmt.all();
}
export function deleteWASession(id) {
    const stmt = db.prepare('DELETE FROM wa_sessions WHERE id = ?');
    stmt.run(id);
}
export function createCampaign(campaign) {
    const stmt = db.prepare(`
    INSERT INTO campaigns (id, name, dataset_id, platform, message_template, scheduled_at, wa_account_ids, rate_per_hour)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
    stmt.run(campaign.id, campaign.name, campaign.dataset_id, campaign.platform, campaign.message_template, campaign.scheduled_at, campaign.wa_account_ids, campaign.rate_per_hour);
}
export function getCampaign(id) {
    const stmt = db.prepare(`
    SELECT c.*, d.name as dataset_name 
    FROM campaigns c 
    LEFT JOIN datasets d ON c.dataset_id = d.id 
    WHERE c.id = ?
  `);
    return stmt.get(id);
}
export function getCampaigns() {
    const stmt = db.prepare(`
    SELECT c.*, d.name as dataset_name 
    FROM campaigns c 
    LEFT JOIN datasets d ON c.dataset_id = d.id 
    ORDER BY c.created_at DESC
  `);
    return stmt.all();
}
export function updateCampaignStatus(id, status) {
    const stmt = db.prepare('UPDATE campaigns SET status = ?, last_error = NULL, updated_at = unixepoch() WHERE id = ?');
    stmt.run(status, id);
}
export function pauseCampaignAtCheckpoint(id, lastProcessedIndex, reason) {
    const stmt = db.prepare(`
    UPDATE campaigns
    SET status = 'paused', last_processed_index = ?, last_error = ?, updated_at = unixepoch()
    WHERE id = ?
  `);
    stmt.run(lastProcessedIndex, reason, id);
}
export function updateCampaignProgress(id, sent, failed) {
    const stmt = db.prepare(`
    UPDATE campaigns 
    SET sent_contacts = ?, failed_contacts = ?, updated_at = unixepoch() 
    WHERE id = ?
  `);
    stmt.run(sent, failed, id);
}
export function updateCampaignCheckpoint(id, lastProcessedIndex) {
    const stmt = db.prepare(`
    UPDATE campaigns
    SET last_processed_index = ?, updated_at = unixepoch()
    WHERE id = ?
  `);
    stmt.run(lastProcessedIndex, id);
}
export function incrementCampaignFailed(id) {
    const stmt = db.prepare(`
    UPDATE campaigns
    SET failed_contacts = failed_contacts + 1, updated_at = unixepoch()
    WHERE id = ?
  `);
    stmt.run(id);
}
export function setCampaignTotalContacts(id, total) {
    const stmt = db.prepare(`
    UPDATE campaigns SET total_contacts = ?, updated_at = unixepoch() WHERE id = ?
  `);
    stmt.run(total, id);
}
export function getValidCountForDataset(datasetId) {
    const stmt = db.prepare(`
    SELECT COUNT(*) as cnt FROM numbers 
    WHERE dataset_id = ? AND wa_status = 'valid' AND recipient_group = 'campaign' AND (contacted = 0 OR contacted IS NULL)
  `);
    const row = stmt.get(datasetId);
    return row.cnt;
}
export function getUncontactedNumbers(datasetId, limit) {
    const stmt = db.prepare(`
    SELECT * FROM numbers 
    WHERE dataset_id = ? AND wa_status = 'valid' AND recipient_group = 'campaign' AND (contacted = 0 OR contacted IS NULL)
    ORDER BY created_at
    LIMIT ?
  `);
    return stmt.all(datasetId, limit);
}
export function markNumberContacted(id, status = 'sent') {
    const stmt = db.prepare(`
    UPDATE numbers 
    SET contacted = 1, contacted_at = unixepoch(), contact_status = ? 
    WHERE id = ?
  `);
    stmt.run(status, id);
}
export function updateNumberContactStatus(id, status) {
    const stmt = db.prepare(`
    UPDATE numbers
    SET contact_status = ?, contacted_at = COALESCE(contacted_at, unixepoch())
    WHERE id = ?
  `);
    stmt.run(status, id);
}
export function deleteCampaign(id) {
    const stmt = db.prepare('DELETE FROM campaigns WHERE id = ?');
    return stmt.run(id).changes > 0;
}
export function createAutomationRule(rule) {
    const id = uuidv4();
    const stmt = db.prepare(`
    INSERT INTO automation_rules (id, name, trigger_type, keyword, response_text, typing_delay, webhook_url, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
    stmt.run(id, rule.name, rule.trigger_type, rule.keyword, rule.response_text, rule.typing_delay || 0, rule.webhook_url || null, rule.is_active ? 1 : 0);
    return id;
}
export function getAutomationRules() {
    const stmt = db.prepare('SELECT * FROM automation_rules ORDER BY created_at DESC');
    const rules = stmt.all();
    return rules.map(r => ({
        ...r,
        is_active: Boolean(r.is_active)
    }));
}
export function getActiveAutomationRules() {
    const stmt = db.prepare('SELECT * FROM automation_rules WHERE is_active = 1');
    const rules = stmt.all();
    return rules.map(r => ({
        ...r,
        is_active: Boolean(r.is_active)
    }));
}
export function updateAutomationRule(id, updates) {
    const fields = ['updated_at = unixepoch()'];
    const values = [];
    if (updates.name !== undefined) {
        fields.push('name = ?');
        values.push(updates.name);
    }
    if (updates.trigger_type !== undefined) {
        fields.push('trigger_type = ?');
        values.push(updates.trigger_type);
    }
    if (updates.keyword !== undefined) {
        fields.push('keyword = ?');
        values.push(updates.keyword);
    }
    if (updates.response_text !== undefined) {
        fields.push('response_text = ?');
        values.push(updates.response_text);
    }
    if (updates.typing_delay !== undefined) {
        fields.push('typing_delay = ?');
        values.push(updates.typing_delay);
    }
    if (updates.webhook_url !== undefined) {
        fields.push('webhook_url = ?');
        values.push(updates.webhook_url);
    }
    if (updates.is_active !== undefined) {
        fields.push('is_active = ?');
        values.push(updates.is_active ? 1 : 0);
    }
    if (fields.length === 1)
        return; // Nothing to update
    values.push(id);
    const stmt = db.prepare(`UPDATE automation_rules SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
}
export function deleteAutomationRule(id) {
    const stmt = db.prepare('DELETE FROM automation_rules WHERE id = ?');
    stmt.run(id);
}
//# sourceMappingURL=queries.js.map