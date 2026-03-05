import {
  getIngestJobById,
  listQueuedJobIds,
  markIngestJobFailed,
  markIngestJobQueuedForRetry,
  markIngestJobRunning,
  markIngestJobSucceeded,
  resetRunningJobsToQueued,
} from "./db.js";
import { ingestUrl } from "./pipeline.js";

const queue: number[] = [];
const queuedSet = new Set<number>();
let workerRunning = false;

type JobError = {
  code: string;
  retryable: boolean;
  message: string;
};

function toJobError(error: unknown): JobError {
  const message = error instanceof Error ? error.message : "Unknown error";
  const lower = message.toLowerCase();

  if (message.includes("Jina fetch failed") || lower.includes("fetch")) {
    return { code: "JINA_FETCH_FAILED", retryable: true, message };
  }
  if (lower.includes("invalid url")) {
    return { code: "INVALID_URL", retryable: false, message };
  }
  if (lower.includes("abort")) {
    return { code: "JINA_FETCH_FAILED", retryable: true, message };
  }
  return { code: "INTERNAL_ERROR", retryable: false, message };
}

async function runWorkerLoop() {
  if (workerRunning) return;
  workerRunning = true;

  while (queue.length > 0) {
    const id = queue.shift();
    if (!id) continue;
    queuedSet.delete(id);
    await processJob(id);
  }

  workerRunning = false;
}

async function processJob(id: number) {
  const runningJob = markIngestJobRunning(id);
  if (!runningJob) return;

  try {
    const result = await ingestUrl(runningJob.raw_url);
    markIngestJobSucceeded(id, result.id);
  } catch (error) {
    const jobError = toJobError(error);
    const canRetry = jobError.retryable && runningJob.attempt < runningJob.max_attempts;

    if (canRetry) {
      markIngestJobQueuedForRetry(id, jobError.code, jobError.message);
      enqueueIngestJob(id);
      return;
    }

    markIngestJobFailed(id, jobError.code, jobError.message);
  }
}

export function enqueueIngestJob(jobId: number): void {
  if (queuedSet.has(jobId)) return;
  queuedSet.add(jobId);
  queue.push(jobId);
  void runWorkerLoop();
}

export function bootstrapIngestWorker(): { recoveredRunning: number; queued: number } {
  const recoveredRunning = resetRunningJobsToQueued();
  const queuedIds = listQueuedJobIds();
  for (const id of queuedIds) {
    const row = getIngestJobById(id);
    if (!row) continue;
    if (row.attempt >= row.max_attempts) {
      markIngestJobFailed(id, "INTERNAL_ERROR", "Max attempts exceeded before restart");
      continue;
    }
    enqueueIngestJob(id);
  }
  return { recoveredRunning, queued: queuedIds.length };
}
