import asyncio

from .db import db
from .pipeline import ingest_url
from .settings import settings

queue: list[int] = []
queued_set: set[int] = set()
active_workers = 0
_lock = asyncio.Lock()


class JobError:
    def __init__(self, code: str, retryable: bool, message: str):
        self.code = code
        self.retryable = retryable
        self.message = message


def to_job_error(error: Exception) -> JobError:
    message = str(error) if str(error) else "Unknown error"
    lower = message.lower()

    if "invalid url" in lower:
        return JobError("INVALID_URL", False, message)
    if "failed" in lower and "normalize" in lower:
        return JobError("NORMALIZE_FAILED", False, message)
    if "jina fetch failed" in message or "fetch" in lower:
        return JobError("JINA_FETCH_FAILED", True, message)
    if "abort" in lower:
        return JobError("JINA_FETCH_FAILED", True, message)
    if "extract" in lower:
        return JobError("EXTRACT_FAILED", True, message)
    if "summar" in lower:
        return JobError("SUMMARIZE_FAILED", True, message)
    if "sqlite" in lower or "constraint" in lower:
        return JobError("PERSIST_FAILED", True, message)
    return JobError("INTERNAL_ERROR", False, message)


async def process_job(job_id: int):
    running_job = db.mark_ingest_job_running(job_id)
    if not running_job:
        return

    try:
        result = await ingest_url(running_job["raw_url"])
        db.mark_ingest_job_succeeded(job_id, int(result["id"]))
    except Exception as error:  # noqa: BLE001
        job_error = to_job_error(error)
        can_retry = job_error.retryable and running_job["attempt"] < running_job["max_attempts"]
        if can_retry:
            db.mark_ingest_job_queued_for_retry(job_id, job_error.code, job_error.message)
            await enqueue_ingest_job(job_id)
            return
        db.mark_ingest_job_failed(job_id, job_error.code, job_error.message)


async def run_worker_loop():
    global active_workers

    while True:
        async with _lock:
            if not queue:
                active_workers -= 1
                return
            job_id = queue.pop(0)
            queued_set.discard(job_id)

        await process_job(job_id)


async def kick_workers():
    global active_workers

    async with _lock:
        to_spawn = 0
        while active_workers + to_spawn < settings.ingest_concurrency and queue:
            to_spawn += 1
        active_workers += to_spawn

    for _ in range(to_spawn):
        asyncio.create_task(run_worker_loop())


async def enqueue_ingest_job(job_id: int):
    async with _lock:
        if job_id in queued_set:
            return
        queued_set.add(job_id)
        queue.append(job_id)
    await kick_workers()


async def bootstrap_ingest_worker() -> dict[str, int]:
    recovered_running = db.reset_running_jobs_to_queued()
    queued_ids = db.list_queued_job_ids()

    for job_id in queued_ids:
        row = db.get_ingest_job_by_id(job_id)
        if not row:
            continue
        if row["attempt"] >= row["max_attempts"]:
            db.mark_ingest_job_failed(job_id, "INTERNAL_ERROR", "Max attempts exceeded before restart")
            continue
        await enqueue_ingest_job(job_id)

    return {"recoveredRunning": recovered_running, "queued": len(queued_ids)}
