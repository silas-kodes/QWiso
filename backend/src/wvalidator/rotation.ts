/**
 * Account Rotation Manager — Anti-Ban Engine
 *
 * Strategy:
 *  - Round-robin across all READY accounts, weighted by health score.
 *  - Per-account hard limits: max checks per hour / per session window.
 *  - Randomised inter-check jitter to mimic human behaviour.
 *  - Error-spike detection → automatic cooldown for misbehaving accounts.
 *  - Progressive backoff when errors accumulate across the pool.
 *  - Broadcasts account health events so the frontend can see what's happening.
 */

import { EventEmitter } from 'events';
import { getWhatsAppManager } from './client.js';
import { broadcastToClients } from '../websocket.js';

// ─── Tuneable Constants ───────────────────────────────────────────────────────

const ROTATION_RULES = {
  /** Maximum number-existence checks one account may do per rolling hour. */
  MAX_CHECKS_PER_HOUR: 200,

  /** Hard cap per session (restart required to reset). */
  MAX_CHECKS_PER_SESSION: 2000,

  /** After this many consecutive errors → mandatory cooldown. */
  CONSECUTIVE_ERROR_THRESHOLD: 5,

  /** Base cooldown (ms) after error threshold breach.  Doubles each breach. */
  BASE_COOLDOWN_MS: 60_000, // 1 min

  /** Maximum cooldown cap after repeated breaches. */
  MAX_COOLDOWN_MS: 20 * 60_000, // 20 min

  /** Min jitter delay between checks (ms). */
  JITTER_MIN_MS: 1_200,

  /** Max jitter delay between checks (ms). */
  JITTER_MAX_MS: 4_500,

  /** Extra sleep between account-rotation switches (ms). */
  ROTATION_PAUSE_MS: 3_000,

  /** Error-rate threshold (0–1) above which account is considered unhealthy. */
  UNHEALTHY_ERROR_RATE_THRESHOLD: 0.35,

  /** Lookback window for error-rate calculation. */
  ERROR_RATE_LOOKBACK: 20,

  /** Minimum time (ms) to leave an account "at rest" before reusing it. */
  MIN_REST_BETWEEN_USES_MS: 8_000,
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export type AccountHealth = 'healthy' | 'degraded' | 'cooldown' | 'exhausted';

export interface AccountStats {
  id: string;
  name: string;
  checksThisHour: number;
  checksThisSession: number;
  consecutiveErrors: number;
  cooldownUntil: number;  // epoch ms  (0 = not in cooldown)
  cooldownCount: number;  // how many times cooled down so far
  health: AccountHealth;
  lastUsedAt: number;     // epoch ms
  recentResults: boolean[]; // last N success flags (for error-rate calc)
}

interface RotationState {
  stats: Map<string, AccountStats>;
  hourlyResetTimer: ReturnType<typeof setTimeout> | null;
  currentIndex: number;  // round-robin pointer
}

// ─── Singleton State ──────────────────────────────────────────────────────────

const state: RotationState = {
  stats: new Map(),
  hourlyResetTimer: null,
  currentIndex: 0,
};

export const rotationEvents = new EventEmitter();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function jitter(): number {
  return (
    ROTATION_RULES.JITTER_MIN_MS +
    Math.random() * (ROTATION_RULES.JITTER_MAX_MS - ROTATION_RULES.JITTER_MIN_MS)
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function getOrCreateStats(id: string, name: string): AccountStats {
  if (!state.stats.has(id)) {
    state.stats.set(id, {
      id,
      name,
      checksThisHour: 0,
      checksThisSession: 0,
      consecutiveErrors: 0,
      cooldownUntil: 0,
      cooldownCount: 0,
      health: 'healthy',
      lastUsedAt: 0,
      recentResults: [],
    });
  }
  return state.stats.get(id)!;
}

function computeHealth(s: AccountStats): AccountHealth {
  const now = Date.now();

  if (s.checksThisSession >= ROTATION_RULES.MAX_CHECKS_PER_SESSION) return 'exhausted';
  if (s.cooldownUntil > now) return 'cooldown';

  // Error rate over last N
  if (s.recentResults.length >= 5) {
    const errors = s.recentResults.filter(ok => !ok).length;
    const rate = errors / s.recentResults.length;
    if (rate >= ROTATION_RULES.UNHEALTHY_ERROR_RATE_THRESHOLD) return 'degraded';
  }

  return 'healthy';
}

function broadcastHealth(s: AccountStats): void {
  broadcastToClients({
    type: 'account_rotation_health',
    accountId: s.id,
    accountName: s.name,
    health: s.health,
    checksThisHour: s.checksThisHour,
    checksThisSession: s.checksThisSession,
    cooldownUntil: s.cooldownUntil,
    consecutiveErrors: s.consecutiveErrors,
  });
}

function recordResult(s: AccountStats, success: boolean): void {
  s.recentResults.push(success);
  if (s.recentResults.length > ROTATION_RULES.ERROR_RATE_LOOKBACK) {
    s.recentResults.shift();
  }

  if (success) {
    s.consecutiveErrors = 0;
  } else {
    s.consecutiveErrors++;
  }

  // Trigger cooldown if error threshold hit
  if (s.consecutiveErrors >= ROTATION_RULES.CONSECUTIVE_ERROR_THRESHOLD) {
    const cooldownMs = Math.min(
      ROTATION_RULES.BASE_COOLDOWN_MS * Math.pow(2, s.cooldownCount),
      ROTATION_RULES.MAX_COOLDOWN_MS,
    );
    s.cooldownUntil = Date.now() + cooldownMs;
    s.cooldownCount++;
    s.consecutiveErrors = 0; // reset so it can re-accumulate after cooldown

    console.warn(
      `[Rotation] Account ${s.name} (${s.id}) entering cooldown for ${cooldownMs / 1000}s ` +
      `(breach #${s.cooldownCount})`
    );
  }

  s.health = computeHealth(s);
  broadcastHealth(s);
  rotationEvents.emit('health_update', { ...s });
}

// ─── Hourly Reset ─────────────────────────────────────────────────────────────

function scheduleHourlyReset(): void {
  if (state.hourlyResetTimer) return;
  state.hourlyResetTimer = setInterval(() => {
    for (const s of state.stats.values()) {
      s.checksThisHour = 0;
      s.health = computeHealth(s);
      broadcastHealth(s);
    }
    console.log('[Rotation] Hourly check quota reset for all accounts.');
  }, 60 * 60 * 1000); // 1 hour
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns all account stats (for status UI).
 */
export function getAllAccountStats(): AccountStats[] {
  return Array.from(state.stats.values());
}

/**
 * Pick the next best available account using weighted round-robin.
 * Skips exhausted / cooldown accounts. Returns null if none available.
 */
export function pickNextAccount(): AccountStats | null {
  const manager = getWhatsAppManager();
  const readyInstances = manager.getInstances().filter(i => i.state === 'ready');
  if (readyInstances.length === 0) return null;

  const now = Date.now();
  scheduleHourlyReset();

  // Build eligible pool
  const eligible = readyInstances
    .map(i => getOrCreateStats(i.id, i.name ?? i.id))
    .filter(s => {
      if (s.health === 'exhausted') return false;
      if (s.cooldownUntil > now) return false;
      if (s.checksThisHour >= ROTATION_RULES.MAX_CHECKS_PER_HOUR) return false;
      return true;
    });

  if (eligible.length === 0) {
    console.warn('[Rotation] No eligible accounts available right now.');
    return null;
  }

  // Weighted: prefer accounts with lower session-check counts & more recent rest
  eligible.sort((a, b) => {
    // Prioritise healthier accounts
    const healthPriority: Record<AccountHealth, number> = {
      healthy: 0,
      degraded: 1,
      cooldown: 2,
      exhausted: 3,
    };
    const hp = healthPriority[a.health] - healthPriority[b.health];
    if (hp !== 0) return hp;
    // Then lower session usage
    return a.checksThisSession - b.checksThisSession;
  });

  // Round-robin among the sorted eligible list
  const picked = eligible[state.currentIndex % eligible.length];
  state.currentIndex = (state.currentIndex + 1) % eligible.length;

  return picked;
}

/**
 * Execute one number-existence check through the rotation engine.
 * Handles all jitter, per-account tracking, cooldown enforcement, and
 * rotation-pause between account switches.
 *
 * @returns { valid: boolean; accountId: string } or throws if no account available.
 */
export async function rotatedCheck(
  digits: string,
  timeoutMs = 30_000,
): Promise<{ valid: boolean; accountId: string }> {
  const MAX_WAIT_FOR_ACCOUNT_MS = 5 * 60_000; // wait up to 5 min for a slot
  const POLL_INTERVAL_MS = 5_000;

  let waited = 0;
  let accountStats: AccountStats | null = null;

  // Wait for an eligible account
  while (!accountStats) {
    accountStats = pickNextAccount();
    if (!accountStats) {
      if (waited >= MAX_WAIT_FOR_ACCOUNT_MS) {
        throw new Error('No WhatsApp accounts available after waiting. All are in cooldown or exhausted.');
      }
      console.log(`[Rotation] All accounts busy/cooling — waiting ${POLL_INTERVAL_MS / 1000}s…`);
      await sleep(POLL_INTERVAL_MS);
      waited += POLL_INTERVAL_MS;
    }
  }

  const manager = getWhatsAppManager();
  const instance = manager.getInstance(accountStats.id);
  if (!instance || !instance.isReady()) {
    // Account became unavailable since we picked it — mark error and retry next tick
    recordResult(accountStats, false);
    throw new Error(`Account ${accountStats.id} became unavailable during rotation`);
  }

  // Enforce minimum rest between uses for this account
  const timeSinceLastUse = Date.now() - accountStats.lastUsedAt;
  if (timeSinceLastUse < ROTATION_RULES.MIN_REST_BETWEEN_USES_MS) {
    await sleep(ROTATION_RULES.MIN_REST_BETWEEN_USES_MS - timeSinceLastUse);
  }

  // Human-like jitter before each check
  await sleep(jitter());

  // Actually execute the check
  accountStats.lastUsedAt = Date.now();
  accountStats.checksThisHour++;
  accountStats.checksThisSession++;

  let valid = false;
  try {

    const result = await Promise.race([
      instance.checkNumberExists(digits),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout checking ${digits}`)), timeoutMs)
      ),
    ]);

    valid = result as boolean;
    recordResult(accountStats, true);
  } catch (err) {
    recordResult(accountStats, false);
    throw err;
  }

  return { valid, accountId: accountStats.id };
}

/**
 * Reset per-session stats for a specific account (e.g. on reconnect).
 */
export function resetAccountSession(id: string): void {
  const s = state.stats.get(id);
  if (s) {
    s.checksThisSession = 0;
    s.consecutiveErrors = 0;
    s.cooldownUntil = 0;
    s.health = computeHealth(s);
    broadcastHealth(s);
  }
}

/**
 * Forcibly put an account into cooldown from outside (e.g. ban detected).
 */
export function forceAccountCooldown(id: string, durationMs: number): void {
  const manager = getWhatsAppManager();
  const instance = manager.getInstance(id);
  const name = instance ? (instance.name ?? id) : id;
  const s = getOrCreateStats(id, name);
  s.cooldownUntil = Date.now() + durationMs;
  s.cooldownCount++;
  s.health = 'cooldown';
  broadcastHealth(s);
  console.warn(`[Rotation] Forced cooldown on account ${name} for ${durationMs / 1000}s`);
}
