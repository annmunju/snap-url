import "dotenv/config";
import { randomUUID } from "node:crypto";
import express from "express";
import { z } from "zod";
import {
  createIngestJob,
  getDocumentById,
  getIngestJobById,
  getIngestJobByIdempotencyKey,
  listDocuments,
  listIngestJobs,
} from "./db.js";
import { bootstrapIngestWorker, enqueueIngestJob } from "./jobs.js";
import type { IngestJob, IngestJobStatus } from "./types.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

const ingestSchema = z.object({
  url: z.string().url(),
});

const ingestListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(["queued", "running", "succeeded", "failed"]).optional(),
});

function normalizeInputUrl(rawUrl: string): string {
  const noBackslashes = rawUrl.trim().replace(/\\+/g, "").replace(/%5C/gi, "");
  return new URL(noBackslashes).toString();
}

function mapJobResponse(job: IngestJob) {
  return {
    id: job.id,
    request_id: job.request_id,
    raw_url: job.raw_url,
    normalized_url: job.normalized_url,
    status: job.status,
    attempt: job.attempt,
    max_attempts: job.max_attempts,
    error_code: job.error_code,
    error_message: job.error_message,
    document_id: job.document_id,
    created_at: job.created_at,
    updated_at: job.updated_at,
    started_at: job.started_at,
    finished_at: job.finished_at,
  };
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/ingest", (req, res) => {
  const parsed = ingestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: "INVALID_REQUEST_BODY",
        message: "Invalid request body",
        retryable: false,
      },
      issues: parsed.error.issues,
    });
  }

  try {
    const normalizedUrl = normalizeInputUrl(parsed.data.url);
    const idempotencyKeyHeader = req.header("Idempotency-Key");
    const idempotencyKey = idempotencyKeyHeader ? idempotencyKeyHeader.trim() : "";

    if (idempotencyKey) {
      const existing = getIngestJobByIdempotencyKey(idempotencyKey, normalizedUrl);
      if (existing) {
        return res.status(202).json({
          job: mapJobResponse(existing),
          links: {
            self: `/ingest-jobs/${existing.id}`,
            document: existing.document_id ? `/documents/${existing.document_id}` : null,
          },
        });
      }
    }

    const job = createIngestJob({
      request_id: randomUUID(),
      idempotency_key: idempotencyKey || null,
      raw_url: parsed.data.url,
      normalized_url: normalizedUrl,
      max_attempts: 2,
    });

    enqueueIngestJob(job.id);

    return res.status(202).json({
      job: mapJobResponse(job),
      links: {
        self: `/ingest-jobs/${job.id}`,
        document: null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const isInvalidUrl = message.toLowerCase().includes("invalid url");
    return res.status(isInvalidUrl ? 400 : 500).json({
      error: {
        code: isInvalidUrl ? "INVALID_URL" : "INTERNAL_ERROR",
        message,
        retryable: false,
      },
    });
  }
});

app.get("/ingest-jobs/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({
      error: {
        code: "INVALID_REQUEST_BODY",
        message: "Invalid id",
        retryable: false,
      },
    });
  }

  const job = getIngestJobById(id);
  if (!job) {
    return res.status(404).json({
      error: {
        code: "JOB_NOT_FOUND",
        message: "Job not found",
        retryable: false,
      },
    });
  }

  return res.json({
    job: mapJobResponse(job),
    links: {
      document: job.document_id ? `/documents/${job.document_id}` : null,
    },
  });
});

app.get("/ingest-jobs", (req, res) => {
  const parsed = ingestListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: "INVALID_REQUEST_BODY",
        message: "Invalid query",
        retryable: false,
      },
      issues: parsed.error.issues,
    });
  }

  const limit = parsed.data.limit ?? 20;
  const status = parsed.data.status as IngestJobStatus | undefined;
  const items = listIngestJobs(limit, status).map((job) => ({
    id: job.id,
    status: job.status,
    normalized_url: job.normalized_url,
    document_id: job.document_id,
    updated_at: job.updated_at,
  }));
  return res.json({ items });
});

app.get("/documents", (req, res) => {
  const limit = Number(req.query.limit ?? "20");
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 20;
  const rows = listDocuments(safeLimit);
  res.json(rows);
});

app.get("/documents/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid id" });
  }

  const row = getDocumentById(id);
  if (!row) {
    return res.status(404).json({ error: "Not found" });
  }

  return res.json(row);
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  const boot = bootstrapIngestWorker();
  if (boot.recoveredRunning || boot.queued) {
    console.log(
      `ingest worker bootstrapped: recoveredRunning=${boot.recoveredRunning}, queued=${boot.queued}`,
    );
  }
  console.log(`snap-url API listening on port ${port}`);
});
