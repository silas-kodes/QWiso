/**
 * WhatsApp Number Validation Service
 * Uses AccountRotationManager for automatic anti-ban account rotation.
 */
import { rotatedCheck } from './rotation.js';
import { getDataset, getAllWASessions, getNumbersForValidation, updateNumberStatus, updateJobStatus, getNumbersCountByDataset, } from '../db/queries.js';
import { parseStaffNumbers, validateInternationalPhone, normalizeDigits } from '../qwiso/phone.js';
// ─── Helpers ──────────────────────────────────────────────────────────────────
function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}
// ─── Core: validate one number via the rotation engine ────────────────────────
async function validateNumber(number, timeoutMs, isStaffNumber) {
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
    }
    catch (err) {
        return {
            numberId: number.id,
            digits: number.digits,
            valid: false,
            group: 'excluded',
            error: err instanceof Error ? err.message : 'Validation failed',
        };
    }
}
// ─── Concurrency pool ─────────────────────────────────────────────────────────
async function runPool(items, fn, concurrency, onItemComplete) {
    const results = new Array(items.length);
    let index = 0;
    async function worker() {
        while (index < items.length) {
            const currentIndex = index++;
            const item = items[currentIndex];
            try {
                const result = await fn(item);
                results[currentIndex] = result;
                if (onItemComplete)
                    await onItemComplete(result, currentIndex);
            }
            catch (err) {
                console.error(`[Validator] Worker error at index ${currentIndex}:`, err);
            }
        }
    }
    const workers = [];
    for (let i = 0; i < Math.min(concurrency, items.length); i++) {
        workers.push(worker());
    }
    await Promise.all(workers);
    return results;
}
// ─── Main validation runner ───────────────────────────────────────────────────
export async function runValidationJob(options) {
    const { jobId, datasetId, batchSize = 100, concurrency = 3, // keep concurrency moderate — rotation handles distribution
    timeoutMs = 30_000, onProgress, cancelToken, } = options;
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
    const sessionStaffNumbers = new Set(getAllWASessions()
        .map(session => session.phone ? normalizeDigits(session.phone) : '')
        .filter(Boolean));
    const isStaffNumber = (digits) => envStaffNumbers.has(digits) || sessionStaffNumbers.has(digits);
    const stats = { total: 0, valid: 0, invalid: 0, error: 0 };
    let processedCount = 0;
    const processedIds = [];
    try {
        let hasMore = true;
        while (hasMore) {
            if (cancelToken?.cancelled) {
                throw new Error('Job cancelled');
            }
            const numbers = getNumbersForValidation(datasetId, batchSize, processedIds);
            if (numbers.length === 0) {
                hasMore = false;
                break;
            }
            stats.total += numbers.length;
            await runPool(numbers, async (num) => {
                const strictFormat = validateInternationalPhone(num.digits, dataset);
                if (!strictFormat.ok) {
                    return {
                        numberId: num.id,
                        digits: num.digits,
                        valid: false,
                        group: 'excluded',
                    };
                }
                return validateNumber(num, timeoutMs, isStaffNumber);
            }, concurrency, async (result) => {
                processedCount++;
                processedIds.push(result.numberId);
                // Persist result
                const status = result.error ? 'error' : result.valid ? 'valid' : 'invalid';
                const group = result.error ? 'excluded' : result.group;
                updateNumberStatus(result.numberId, status, result.error, group);
                if (result.error)
                    stats.error++;
                else if (result.valid)
                    stats.valid++;
                else
                    stats.invalid++;
                // Persist progress
                updateJobStatus(jobId, 'running', {
                    processed_items: processedCount,
                    valid_count: stats.valid,
                    invalid_count: stats.invalid,
                    error_count: stats.error,
                });
                // Broadcast progress
                if (onProgress)
                    await onProgress(processedCount, totalToValidate || stats.total, result);
            });
            hasMore = numbers.length === batchSize;
            if (hasMore)
                await sleep(1_500); // inter-batch pause
        }
        const completedAt = Math.floor(Date.now() / 1000);
        updateJobStatus(jobId, 'completed', {
            completed_at: completedAt,
            result_json: JSON.stringify(stats),
        });
        return {
            success: true,
            message: `Validation complete: ${stats.valid} valid, ${stats.invalid} invalid, ${stats.error} errors`,
            stats,
        };
    }
    catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Validation job failed';
        const completedAt = Math.floor(Date.now() / 1000);
        updateJobStatus(jobId, 'failed', {
            completed_at: completedAt,
            error_message: errorMsg,
            result_json: JSON.stringify(stats),
        });
        return { success: false, message: errorMsg, stats };
    }
}
//# sourceMappingURL=validator.js.map