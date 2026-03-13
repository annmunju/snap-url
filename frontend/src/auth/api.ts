import { API_BASE_URL, ApiError } from "@/api/client";
import type { SessionUser } from "./context";

type GetMeResponse = {
  user: SessionUser;
};

function createRequestId() {
  return `auth-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatErrorMessage(message: string, requestId?: string) {
  if (!requestId) {
    return message;
  }
  return `${message}\n\n오류 ID: ${requestId}`;
}

export async function getCurrentUserProfile(accessToken: string): Promise<GetMeResponse> {
  const requestId = createRequestId();
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/me`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "X-Request-Id": requestId,
      },
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", formatErrorMessage(`사용자 정보 요청 실패: ${API_BASE_URL}/me`, requestId), false, requestId);
  }

  if (!response.ok) {
    let payload: { error?: { code?: string; message?: string; retryable?: boolean } } | null = null;
    let responseText = "";
    try {
      payload = (await response.json()) as { error?: { code?: string; message?: string; retryable?: boolean } };
    } catch {
      try {
        responseText = await response.text();
      } catch {
        responseText = "";
      }
    }

    throw new ApiError(
      response.status,
      payload?.error?.code ?? "INTERNAL_ERROR",
      formatErrorMessage(
        payload?.error?.message ?? (responseText || `사용자 정보를 불러오지 못했습니다. (HTTP ${response.status})`),
        (payload as { request_id?: string } | null)?.request_id ?? response.headers.get("X-Request-Id") ?? requestId,
      ),
      payload?.error?.retryable ?? false,
      (payload as { request_id?: string } | null)?.request_id ?? response.headers.get("X-Request-Id") ?? requestId,
    );
  }

  return (await response.json()) as GetMeResponse;
}

export async function reactivateCurrentUser(accessToken: string): Promise<GetMeResponse> {
  const requestId = createRequestId();
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/me/reactivate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "X-Request-Id": requestId,
      },
    });
  } catch {
    throw new ApiError(
      0,
      "NETWORK_ERROR",
      formatErrorMessage(`사용자 복구 요청 실패: ${API_BASE_URL}/me/reactivate`, requestId),
      false,
      requestId,
    );
  }

  if (!response.ok) {
    let payload: { error?: { code?: string; message?: string; retryable?: boolean } } | null = null;
    let responseText = "";
    try {
      payload = (await response.json()) as { error?: { code?: string; message?: string; retryable?: boolean } };
    } catch {
      try {
        responseText = await response.text();
      } catch {
        responseText = "";
      }
    }

    throw new ApiError(
      response.status,
      payload?.error?.code ?? "INTERNAL_ERROR",
      formatErrorMessage(
        payload?.error?.message ?? (responseText || `사용자 복구에 실패했습니다. (HTTP ${response.status})`),
        (payload as { request_id?: string } | null)?.request_id ?? response.headers.get("X-Request-Id") ?? requestId,
      ),
      payload?.error?.retryable ?? false,
      (payload as { request_id?: string } | null)?.request_id ?? response.headers.get("X-Request-Id") ?? requestId,
    );
  }

  return (await response.json()) as GetMeResponse;
}
