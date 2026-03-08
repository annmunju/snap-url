import { API_BASE_URL, ApiError } from "@/api/client";
import type { SessionUser } from "./context";

type GetMeResponse = {
  user: SessionUser;
};

export async function getCurrentUserProfile(accessToken: string): Promise<GetMeResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/me`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", `사용자 정보 요청 실패: ${API_BASE_URL}/me`, false);
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
      payload?.error?.message ?? (responseText || `사용자 정보를 불러오지 못했습니다. (HTTP ${response.status})`),
      payload?.error?.retryable ?? false,
    );
  }

  return (await response.json()) as GetMeResponse;
}

export async function reactivateCurrentUser(accessToken: string): Promise<GetMeResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/me/reactivate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", `사용자 복구 요청 실패: ${API_BASE_URL}/me/reactivate`, false);
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
      payload?.error?.message ?? (responseText || `사용자 복구에 실패했습니다. (HTTP ${response.status})`),
      payload?.error?.retryable ?? false,
    );
  }

  return (await response.json()) as GetMeResponse;
}
