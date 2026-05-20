/**
 * WhatsApp Number Validation Service
 * Uses AccountRotationManager for automatic anti-ban account rotation.
 */

import { rotatedCheck } from './rotation.js';
import {
  getDataset,
  getAllWASessions,
  getNumbersForValidation,
  updateNumberStatus,
  updateJobStatus,
  getNumbersCountByDataset,
  type NumberRecord,
} from '../db/queries.js';
import { type CancelToken } from '../jobs/queue.js';
import { parseStaffNumbers, validateInternationalPhone, normalizeDigits } from '../qwiso/phone.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ValidationResult {
  numberId: string;
  digits: string;
  valid: boolean;
  group: 'campaign' | 'staff' | 'excluded';
  usedAccountId?: string;
  error?: string;
}

export type ValidationProgressCallback = (
  current: number,
  total: number,
  result: ValidationResult
) => void | Promise<void>;

export interface ValidationOptions {
  jobId: string;
  datasetId: string;
  /** Preferred starting account — rotation will still spread load automatically. */
  waClientId?: string;
  batchSize?: number;
  concurrency?: number;
  timeoutMs?: number;
  totalCount?: number;
  onProgress?: ValidationProgressCallback;
  cancelToken?: CancelToken;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ─── Core: validate one number via the rotation engine ────────────────────────

async function validateNumber(
  number: NumberRecord,
  timeoutMs: number,
  isStaffNumber: (digits: string) => boolean,
): Promise<ValidationResult> {
  if (isStaffNumber(number.digits)) {
    return {
      numberId: number.id,
      digits: number.digits,
      valid: true,
      group: 'staff',
    };
  }

  try {
    const { valid, accountId } = await rotatedCheck(number.digits, timeoutMs);
    return {
      numberId: number.id,
      digits: number.digits,
      valid,
      group: valid ? 'campaign' : 'excluded',
      usedAccountId: accountId,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Validation failed';
    console.error(`[Validator] Error validating ${number.digits}:`, errorMsg, err);
    return {
      numberId: number.id,
      digits: number.digits,
      valid: false,
      group: 'excluded',
      error: errorMsg,
    };
  }
}

// ─── Concurrency pool ─────────────────────────────────────────────────────────

async function runPool<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number,
  onItemComplete?: (result: R, index: number) => void | Promise<void>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const currentIndex = index++;
      const item = items[currentIndex];
      try {
        const result = await fn(item);
        results[currentIndex] = result;
        if (onItemComplete) await onItemComplete(result, currentIndex);
      } catch (err) {
        console.error(`[Validator] Worker error at index ${currentIndex}:`, err);
      }
    }
  }

  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, items.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

// ─── Main validation runner ───────────────────────────────────────────────────

export async function runValidationJob(
  options: ValidationOptions,
): Promise<{ success: boolean; message: string; stats: { total: number; valid: number; invalid: number; error: number } }> {
  const {
    jobId,
    datasetId,
    batchSize = 100,
    concurrency = 3,   // keep concurrency moderate — rotation handles distribution
    timeoutMs = 30_000,
    onProgress,
    cancelToken,
  } = options;

  console.log(`[Validator] Starting validation job ${jobId} for dataset ${datasetId}`);

  // Count pending numbers for job tracking
  // Use passed-in totalCount from generator if available, else query DB
  let totalToValidate = options.totalCount ?? 0;
  if (totalToValidate === 0) {
    const initialCounts = getNumbersCountByDataset(datasetId);
    totalToValidate = initialCounts ? (initialCounts.pending + initialCounts.error) : 0;
  }

  const now = Math.floor(Date.now() / 1000);
  updateJobStatus(jobId, 'running', { started_at: now, total_items: totalToValidate });

  const dataset = getDataset(datasetId);
  const envStaffNumbers = parseStaffNumbers(process.env.STAFF_NUMBERS || '');
  const sessionStaffNumbers = new Set(
    getAllWASessions()
      .map(session => session.phone ? normalizeDigits(session.phone) : '')
      .filter(Boolean),
  );
  const isStaffNumber = (digits: string) => envStaffNumbers.has(digits) || sessionStaffNumbers.has(digits);

  const stats = { total: 0, valid: 0, invalid: 0, error: 0 };
  let processedCount = 0;
  const processedIds: string[] = [];

  try {
    let hasMore = true;

    while (hasMore) {
      if (cancelToken?.cancelled) {
        throw new Error('Job cancelled');
      }
      const numbers = getNumbersForValidation(datasetId, batchSize, processedIds);
      if (numbers.length === 0) { hasMore = false; break; }

      stats.total += numbers.length;

      await runPool(
        numbers,
        async (num) => {
          const strictFormat = validateInternationalPhone(num.digits, dataset);
          if (!strictFormat.ok) {
            return {
              numberId: num.id,
              digits: num.digits,
              valid: false,
              group: 'excluded' as const,
            };
          }
          return validateNumber(num, timeoutMs, isStaffNumber);
        },
        concurrency,
        async (result) => {
          processedCount++;
          processedIds.push(result.numberId);

          // Persist result
          const status = result.error ? 'error' : result.valid ? 'valid' : 'invalid';
          const group = result.error ? 'excluded' : result.group;
          updateNumberStatus(result.numberId, status, result.error, group);

          if (result.error) stats.error++;
          else if (result.valid) stats.valid++;
          else stats.invalid++;

          // Persist progress
          updateJobStatus(jobId, 'running', {
            processed_items: processedCount,
            valid_count: stats.valid,
            invalid_count: stats.invalid,
            error_count: stats.error,
          });

          // Broadcast progress
          if (onProgress) await onProgress(processedCount, totalToValidate || stats.total, result);
        },
      );

      hasMore = numbers.length === batchSize;
      if (hasMore) await sleep(1_500); // inter-batch pause
    }

    const completedAt = Math.floor(Date.now() / 1000);
    updateJobStatus(jobId, 'completed', {
      completed_at: completedAt,
      result_json: JSON.stringify(stats),
    });

    const message = `Validation complete: ${stats.valid} valid, ${stats.invalid} invalid, ${stats.error} errors`;
    console.log(`[Validator] Job ${jobId} completed:`, message, stats);
    return {
      success: true,
      message,
      stats,
    };

  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Validation job failed';
    console.error(`[Validator] Job ${jobId} failed:`, errorMsg, err);
    const completedAt = Math.floor(Date.now() / 1000);
    updateJobStatus(jobId, 'failed', {
      completed_at: completedAt,
      error_message: errorMsg,
      result_json: JSON.stringify(stats),
    });
    return { success: false, message: errorMsg, stats };
  }
}
