import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { ExtractedLink, IngestJob, IngestJobStatus, StoredDocument } from "./types.js";

const dbPath = process.env.DB_PATH ?? "./data/snap-url.db";
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    content TEXT NOT NULL,
    summary TEXT NOT NULL,
    links TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS ingest_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id TEXT NOT NULL UNIQUE,
    idempotency_key TEXT,
    raw_url TEXT NOT NULL,
    normalized_url TEXT,
    status TEXT NOT NULL CHECK(status IN ('queued','running','succeeded','failed')),
    attempt INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 2,
    error_code TEXT,
    error_message TEXT,
    document_id INTEGER,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at DATETIME,
    finished_at DATETIME,
    FOREIGN KEY(document_id) REFERENCES documents(id)
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_ingest_jobs_status_updated_at
  ON ingest_jobs(status, updated_at DESC);
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_ingest_jobs_normalized_url
  ON ingest_jobs(normalized_url);
`);

const upsertStmt = db.prepare(`
  INSERT INTO documents (url, title, description, content, summary, links)
  VALUES (@url, @title, @description, @content, @summary, @links)
  ON CONFLICT(url) DO UPDATE SET
    title=excluded.title,
    description=excluded.description,
    content=excluded.content,
    summary=excluded.summary,
    links=excluded.links
`);

const getByIdStmt = db.prepare(`
  SELECT id, url, title, description, content, summary, links, created_at
  FROM documents
  WHERE id = ?
`);

const getByUrlStmt = db.prepare(`
  SELECT id, url, title, description, content, summary, links, created_at
  FROM documents
  WHERE url = ?
`);

const listStmt = db.prepare(`
  SELECT id, url, title, description, content, summary, links, created_at
  FROM documents
  ORDER BY id DESC
  LIMIT ?
`);

const createIngestJobStmt = db.prepare(`
  INSERT INTO ingest_jobs (
    request_id,
    idempotency_key,
    raw_url,
    normalized_url,
    status,
    attempt,
    max_attempts
  )
  VALUES (
    @request_id,
    @idempotency_key,
    @raw_url,
    @normalized_url,
    'queued',
    0,
    @max_attempts
  )
`);

const getIngestJobByIdStmt = db.prepare(`
  SELECT
    id, request_id, idempotency_key, raw_url, normalized_url, status, attempt, max_attempts,
    error_code, error_message, document_id,
    created_at, updated_at, started_at, finished_at
  FROM ingest_jobs
  WHERE id = ?
`);

const getIngestJobByIdempotencyStmt = db.prepare(`
  SELECT
    id, request_id, idempotency_key, raw_url, normalized_url, status, attempt, max_attempts,
    error_code, error_message, document_id,
    created_at, updated_at, started_at, finished_at
  FROM ingest_jobs
  WHERE idempotency_key = ? AND normalized_url = ?
  ORDER BY id DESC
  LIMIT 1
`);

const listIngestJobsStmt = db.prepare(`
  SELECT
    id, request_id, idempotency_key, raw_url, normalized_url, status, attempt, max_attempts,
    error_code, error_message, document_id,
    created_at, updated_at, started_at, finished_at
  FROM ingest_jobs
  ORDER BY id DESC
  LIMIT ?
`);

const listIngestJobsByStatusStmt = db.prepare(`
  SELECT
    id, request_id, idempotency_key, raw_url, normalized_url, status, attempt, max_attempts,
    error_code, error_message, document_id,
    created_at, updated_at, started_at, finished_at
  FROM ingest_jobs
  WHERE status = ?
  ORDER BY id DESC
  LIMIT ?
`);

const markJobRunningStmt = db.prepare(`
  UPDATE ingest_jobs
  SET
    status = 'running',
    attempt = attempt + 1,
    started_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = ? AND status = 'queued'
`);

const markJobSucceededStmt = db.prepare(`
  UPDATE ingest_jobs
  SET
    status = 'succeeded',
    document_id = ?,
    error_code = NULL,
    error_message = NULL,
    finished_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

const markJobFailedStmt = db.prepare(`
  UPDATE ingest_jobs
  SET
    status = 'failed',
    error_code = ?,
    error_message = ?,
    finished_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

const markJobQueuedForRetryStmt = db.prepare(`
  UPDATE ingest_jobs
  SET
    status = 'queued',
    error_code = ?,
    error_message = ?,
    started_at = NULL,
    finished_at = NULL,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

const resetRunningJobsStmt = db.prepare(`
  UPDATE ingest_jobs
  SET
    status = 'queued',
    started_at = NULL,
    updated_at = CURRENT_TIMESTAMP
  WHERE status = 'running'
`);

const listQueuedJobIdsStmt = db.prepare(`
  SELECT id
  FROM ingest_jobs
  WHERE status = 'queued'
  ORDER BY id ASC
`);

function parseRow(row: any): StoredDocument {
  return {
    id: row.id,
    url: row.url,
    title: row.title,
    description: row.description,
    content: row.content,
    summary: row.summary,
    links: JSON.parse(row.links) as ExtractedLink[],
    created_at: row.created_at,
  };
}

function parseIngestJobRow(row: any): IngestJob {
  return {
    id: row.id,
    request_id: row.request_id,
    idempotency_key: row.idempotency_key,
    raw_url: row.raw_url,
    normalized_url: row.normalized_url,
    status: row.status as IngestJobStatus,
    attempt: row.attempt,
    max_attempts: row.max_attempts,
    error_code: row.error_code,
    error_message: row.error_message,
    document_id: row.document_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    started_at: row.started_at,
    finished_at: row.finished_at,
  };
}

export function upsertDocument(input: {
  url: string;
  title: string;
  description: string;
  content: string;
  summary: string;
  links: ExtractedLink[];
}): StoredDocument {
  upsertStmt.run({ ...input, links: JSON.stringify(input.links) });
  const row = getByUrlStmt.get(input.url);
  return parseRow(row);
}

export function getDocumentById(id: number): StoredDocument | null {
  const row = getByIdStmt.get(id);
  return row ? parseRow(row) : null;
}

export function listDocuments(limit = 20): StoredDocument[] {
  const rows = listStmt.all(limit) as any[];
  return rows.map(parseRow);
}

export function createIngestJob(input: {
  request_id: string;
  idempotency_key: string | null;
  raw_url: string;
  normalized_url: string | null;
  max_attempts: number;
}): IngestJob {
  const info = createIngestJobStmt.run(input);
  const row = getIngestJobByIdStmt.get(info.lastInsertRowid);
  return parseIngestJobRow(row);
}

export function getIngestJobById(id: number): IngestJob | null {
  const row = getIngestJobByIdStmt.get(id);
  return row ? parseIngestJobRow(row) : null;
}

export function getIngestJobByIdempotencyKey(
  idempotencyKey: string,
  normalizedUrl: string,
): IngestJob | null {
  const row = getIngestJobByIdempotencyStmt.get(idempotencyKey, normalizedUrl);
  return row ? parseIngestJobRow(row) : null;
}

export function listIngestJobs(limit = 20, status?: IngestJobStatus): IngestJob[] {
  const rows = status
    ? (listIngestJobsByStatusStmt.all(status, limit) as any[])
    : (listIngestJobsStmt.all(limit) as any[]);
  return rows.map(parseIngestJobRow);
}

export function markIngestJobRunning(id: number): IngestJob | null {
  const info = markJobRunningStmt.run(id);
  if (!info.changes) return null;
  const row = getIngestJobByIdStmt.get(id);
  return row ? parseIngestJobRow(row) : null;
}

export function markIngestJobSucceeded(id: number, documentId: number): void {
  markJobSucceededStmt.run(documentId, id);
}

export function markIngestJobFailed(id: number, errorCode: string, errorMessage: string): void {
  markJobFailedStmt.run(errorCode, errorMessage, id);
}

export function markIngestJobQueuedForRetry(id: number, errorCode: string, errorMessage: string): void {
  markJobQueuedForRetryStmt.run(errorCode, errorMessage, id);
}

export function resetRunningJobsToQueued(): number {
  const info = resetRunningJobsStmt.run();
  return info.changes;
}

export function listQueuedJobIds(): number[] {
  const rows = listQueuedJobIdsStmt.all() as { id: number }[];
  return rows.map((row) => row.id);
}
