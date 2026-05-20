/**
 * Server-side session management
 * Secure cookie-based sessions with SQLite storage
 */
import { db } from '../db/db.js';
import crypto from 'crypto';
const SESSION_SECRET = process.env.SESSION_SECRET || 'default-secret-change-in-production';
const SESSION_DURATION_HOURS = 24;
// Generate secure random token
function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}
// Hash token for storage (prevents token theft from DB)
function hashToken(token) {
    return crypto.createHmac('sha256', SESSION_SECRET).update(token).digest('hex');
}
// Create new session
export function createSession() {
    const token = generateToken();
    const expiresAt = Math.floor(Date.now() / 1000) + (SESSION_DURATION_HOURS * 3600);
    const data = {
        authenticated: true,
        createdAt: Math.floor(Date.now() / 1000),
    };
    const stmt = db.prepare(`
    INSERT INTO sessions (id, token, data_json, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
    const id = crypto.randomUUID();
    stmt.run(id, hashToken(token), JSON.stringify(data), expiresAt, Math.floor(Date.now() / 1000));
    return { token, expiresAt };
}
// Validate session token
export function validateSession(token) {
    const hashed = hashToken(token);
    const now = Math.floor(Date.now() / 1000);
    const stmt = db.prepare(`
    SELECT data_json FROM sessions 
    WHERE token = ? AND expires_at > ?
  `);
    const row = stmt.get(hashed, now);
    if (!row)
        return null;
    try {
        return JSON.parse(row.data_json);
    }
    catch {
        return null;
    }
}
// Extend session
export function extendSession(token) {
    const hashed = hashToken(token);
    const newExpiry = Math.floor(Date.now() / 1000) + (SESSION_DURATION_HOURS * 3600);
    const stmt = db.prepare(`
    UPDATE sessions SET expires_at = ? WHERE token = ?
  `);
    const result = stmt.run(newExpiry, hashed);
    return result.changes > 0;
}
// Destroy session
export function destroySession(token) {
    const hashed = hashToken(token);
    const stmt = db.prepare('DELETE FROM sessions WHERE token = ?');
    stmt.run(hashed);
}
// Express middleware: require session
export function requireSession(req, res, next) {
    const token = req.cookies?.session_token;
    if (!token) {
        res.status(401).json({ error: 'Unauthorized - No session' });
        return;
    }
    const session = validateSession(token);
    if (!session || !session.authenticated) {
        res.clearCookie('session_token');
        res.status(401).json({ error: 'Unauthorized - Invalid session' });
        return;
    }
    // Extend session on each request
    extendSession(token);
    // Attach session to request
    req.session = session;
    next();
}
// Express middleware: optional session (attaches if exists)
export function optionalSession(req, _res, next) {
    const token = req.cookies?.session_token;
    if (token) {
        const session = validateSession(token);
        if (session) {
            req.session = session;
        }
    }
    next();
}
//# sourceMappingURL=session.js.map