/**
 * Centralized Job Queue
 * Processes jobs (validation, campaigns) sequentially and supports cancellation.
 */
export declare class CancelToken {
    cancelled: boolean;
    cancel(): void;
}
export type JobFunction = (token: CancelToken) => Promise<void>;
declare class JobQueue {
    private queue;
    private running;
    private activeJobs;
    enqueue(jobId: string, fn: JobFunction): void;
    cancel(jobId: string): void;
    private drain;
}
export declare const jobQueue: JobQueue;
export {};
//# sourceMappingURL=queue.d.ts.map