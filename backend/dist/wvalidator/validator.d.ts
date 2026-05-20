/**
 * WhatsApp Number Validation Service
 * Uses AccountRotationManager for automatic anti-ban account rotation.
 */
import { type CancelToken } from '../jobs/queue.js';
export interface ValidationResult {
    numberId: string;
    digits: string;
    valid: boolean;
    group: 'campaign' | 'staff' | 'excluded';
    usedAccountId?: string;
    error?: string;
}
export type ValidationProgressCallback = (current: number, total: number, result: ValidationResult) => void | Promise<void>;
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
export declare function runValidationJob(options: ValidationOptions): Promise<{
    success: boolean;
    message: string;
    stats: {
        total: number;
        valid: number;
        invalid: number;
        error: number;
    };
}>;
//# sourceMappingURL=validator.d.ts.map