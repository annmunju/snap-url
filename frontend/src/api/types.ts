export type IngestJobStatus = "queued" | "running" | "succeeded" | "failed";

export type IngestJob = {
  id: number;
  request_id: string;
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

export type IngestJobListItem = {
  id: number;
  normalized_url: string | null;
  status: IngestJobStatus;
  document_id: number | null;
  error_code: string | null;
  error_message: string | null;
  updated_at: string;
};

export type ExtractedLink = {
  url: string;
  content: string;
};

export type DocumentListItem = {
  id: number;
  url: string;
  title: string;
  description: string;
  summary: string;
  category_key: string;
  is_pinned: boolean;
  created_at: string;
};

export type Document = {
  id: number;
  url: string;
  title: string;
  description: string;
  content: string;
  summary: string;
  category_key: string;
  is_pinned: boolean;
  links: ExtractedLink[];
  created_at: string;
  updated_at: string;
};

export type CategoryItem = {
  key: string;
  label: string;
  order: number;
};

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    retryable: boolean;
  };
  request_id?: string;
};
