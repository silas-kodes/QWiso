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
export type AccountHealth = 'healthy' | 'degraded' | 'cooldown' | 'exhausted';
export interface AccountStats {
    id: string;
    name: string;
    checksThisHour: number;
    checksThisSession: number;
    consecutiveErrors: number;
    cooldownUntil: number;
    cooldownCount: number;
    health: AccountHealth;
    lastUsedAt: number;
    recentResults: boolean[];
}
export declare const rotationEvents: EventEmitter<[never]>;
/**
 * Returns all account stats (for status UI).
 */
export declare function getAllAccountStats(): AccountStats[];
/**
 * Pick the next best available account using weighted round-robin.
 * Skips exhausted / cooldown accounts. Returns null if none available.
 */
export declare function pickNextAccount(): AccountStats | null;
/**
 * Execute one number-existence check through the rotation engine.
 * Handles all jitter, per-account tracking, cooldown enforcement, and
 * rotation-pause between account switches.
 *
 * @returns { valid: boolean; accountId: string } or throws if no account available.
 */
export declare function rotatedCheck(digits: string, timeoutMs?: number): Promise<{
    valid: boolean;
    accountId: string;
}>;
/**
 * Reset per-session stats for a specific account (e.g. on reconnect).
 */
export declare function resetAccountSession(id: string): void;
/**
 * Forcibly put an account into cooldown from outside (e.g. ban detected).
 */
export declare function forceAccountCooldown(id: string, durationMs: number): void;
//# sourceMappingURL=rotation.d.ts.map