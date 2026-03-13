from typing import Optional

from .settings import settings

_monitoring_enabled = False


def init_monitoring() -> None:
    global _monitoring_enabled

    dsn = (settings.sentry_dsn or "").strip()
    if not dsn:
        return

    try:
        import sentry_sdk
    except ModuleNotFoundError:
        print("monitoring disabled: sentry-sdk is not installed")
        return

    sentry_sdk.init(
        dsn=dsn,
        environment=settings.environment,
        traces_sample_rate=settings.sentry_traces_sample_rate,
    )
    _monitoring_enabled = True
    print("monitoring enabled: sentry")


def capture_backend_exception(exc: Exception, request_id: Optional[str] = None) -> None:
    if not _monitoring_enabled:
        return

    try:
        import sentry_sdk
    except ModuleNotFoundError:
        return

    with sentry_sdk.push_scope() as scope:
        if request_id:
            scope.set_tag("request_id", request_id)
        sentry_sdk.capture_exception(exc)
