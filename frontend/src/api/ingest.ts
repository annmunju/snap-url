import { authFetch } from "./client";
import type { IngestJob, IngestJobListItem, IngestJobStatus } from "./types";

type CreateIngestResponse = {
  job: IngestJob;
  links: {
    self: string;
    document: string | null;
  };
};

type GetJobResponse = {
  job: IngestJob;
  links: {
    document: string | null;
  };
};

type ListIngestJobsResponse = {
  items: IngestJobListItem[];
};

export async function createIngestJob(url: string, description?: string): Promise<CreateIngestResponse> {
  return authFetch<CreateIngestResponse>("/ingest", {
    method: "POST",
    body: JSON.stringify({
      url,
      ...(description ? { description } : {}),
    }),
  });
}

export async function getIngestJob(id: number): Promise<GetJobResponse> {
  return authFetch<GetJobResponse>(`/ingest-jobs/${id}`);
}

export async function listIngestJobs(limit: number, status?: IngestJobStatus): Promise<ListIngestJobsResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (status) {
    params.set("status", status);
  }
  return authFetch<ListIngestJobsResponse>(`/ingest-jobs?${params.toString()}`);
}
