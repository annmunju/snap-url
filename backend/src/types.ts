export type ExtractedLink = {
  url: string;
  content: string;
};

export type ExtractedData = {
  title: string;
  description: string;
  content: string;
  contentHtmls: string[];
  links: ExtractedLink[];
};

export type StoredDocument = {
  id: number;
  url: string;
  title: string;
  description: string;
  content: string;
  summary: string;
  links: ExtractedLink[];
  created_at: string;
};

export type IngestJobStatus = "queued" | "running" | "succeeded" | "failed";

export type IngestJob = {
  id: number;
  request_id: string;
  idempotency_key: string | null;
  raw_url: string;
  normalized_url: string | null;
  status: IngestJobStatus;
  attempt: number;
  max_attempts: number;
  error_code: string | null;
  error_message: string | null;
  document_id: number | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
};
