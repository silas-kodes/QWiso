/**
 * Centralized Job Queue
 * Processes jobs (validation, campaigns) sequentially and supports cancellation.
 */

export class CancelToken {
  public cancelled = false;
  
  cancel() {
    this.cancelled = true;
  }
}

export type JobFunction = (token: CancelToken) => Promise<void>;

interface QueuedJob {
  id: string;
  fn: JobFunction;
  cancelToken: CancelToken;
}

class JobQueue {
  private queue: QueuedJob[] = [];
  private running = false;
  private activeJobs: Map<string, CancelToken> = new Map();

  enqueue(jobId: string, fn: JobFunction) {
    console.log(`[JobQueue] Enqueueing job ${jobId}, current queue length: ${this.queue.length}, running: ${this.running}`);
    const token = new CancelToken();
    this.queue.push({ id: jobId, fn, cancelToken: token });
    this.activeJobs.set(jobId, token);
    console.log(`[JobQueue] Job ${jobId} added to queue, active jobs: ${this.activeJobs.size}`);
    
    // Start processing if not already
    this.drain().catch(err => console.error('[JobQueue] Drain error:', err));
  }

  cancel(jobId: string) {
    const token = this.activeJobs.get(jobId);
    if (token) {
      token.cancel();
      this.activeJobs.delete(jobId);
    }
    
    // Remove from pending queue if it hasn't started yet
    this.queue = this.queue.filter(j => j.id !== jobId);
  }

  private async drain() {
    if (this.running) {
      console.log(`[JobQueue] Drain already running, queue length: ${this.queue.length}`);
      return;
    }
    console.log(`[JobQueue] Starting drain, queue length: ${this.queue.length}`);
    this.running = true;

    try {
      while (this.queue.length > 0) {
        const job = this.queue.shift();
        if (!job) break;

        console.log(`[JobQueue] Processing job ${job.id}, cancelled: ${job.cancelToken.cancelled}`);
        if (job.cancelToken.cancelled) {
          this.activeJobs.delete(job.id);
          console.log(`[JobQueue] Job ${job.id} was cancelled, skipping`);
          continue;
        }

        try {
          console.log(`[JobQueue] Starting job ${job.id}`);
          await job.fn(job.cancelToken);
          console.log(`[JobQueue] Completed job ${job.id}`);
        } catch (err) {
          console.error(`[JobQueue] Error in job ${job.id}:`, err);
        } finally {
          this.activeJobs.delete(job.id);
          console.log(`[JobQueue] Job ${job.id} removed from active jobs, remaining active: ${this.activeJobs.size}`);
        }
      }
      console.log(`[JobQueue] Drain completed, queue empty`);
    } finally {
      this.running = false;
      console.log(`[JobQueue] Drain finished, running flag reset`);
      if (this.queue.length > 0) {
        console.log(`[JobQueue] Queue not empty after drain, triggering another drain`);
        this.drain().catch(err => console.error('[JobQueue] Drain error:', err));
      }
    }
  }
}

export const jobQueue = new JobQueue();
