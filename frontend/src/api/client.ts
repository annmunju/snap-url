import { NativeModules } from "react-native";
import { getAccessToken, handleUnauthorized } from "@/auth/bridge";
import type { ApiErrorBody } from "./types";

class ApiError extends Error {
  status: number;
  code: string;
  retryable: boolean;
  requestId?: string;

  constructor(status: number, code: string, message: string, retryable: boolean, requestId?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.requestId = requestId;
  }
}

const explicitBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
const inferredBaseUrl = inferBaseUrlFromMetroHost();
const fallbackBaseUrl = "http://localhost:3000";

export const API_BASE_URL = explicitBaseUrl ?? inferredBaseUrl ?? fallbackBaseUrl;

export { ApiError };

function createRequestId() {
  return `app-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatErrorMessage(message: string, requestId?: string) {
  if (!requestId) {
    return message;
  }
  return `${message}\n\n오류 ID: ${requestId}`;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  return baseFetch<T>(path, init);
}

export async function authFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    await handleUnauthorized();
    throw new ApiError(401, "UNAUTHORIZED", "로그인이 필요합니다.", false);
  }

  return baseFetch<T>(path, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

async function baseFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const requestId = createRequestId();
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": requestId,
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new Error(`API 연결 실패: ${API_BASE_URL}\n\n오류 ID: ${requestId}`);
  }

  if (!response.ok) {
    let errorBody: ApiErrorBody | null = null;
    try {
      errorBody = (await response.json()) as ApiErrorBody;
    } catch {
      errorBody = null;
    }

    const error = new ApiError(
      response.status,
      errorBody?.error.code ?? "INTERNAL_ERROR",
      formatErrorMessage(
        errorBody?.error.message ?? "요청 처리 중 오류가 발생했습니다.",
        errorBody?.request_id ?? response.headers.get("X-Request-Id") ?? requestId,
      ),
      errorBody?.error.retryable ?? false,
      errorBody?.request_id ?? response.headers.get("X-Request-Id") ?? requestId,
    );
    if (
      response.status === 401 ||
      error.code === "ACCOUNT_DISABLED" ||
      error.code === "ACCOUNT_DELETED" ||
      error.code === "TOKEN_EXPIRED"
    ) {
      await handleUnauthorized();
    }
    throw error;
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
function inferBaseUrlFromMetroHost(): string | null {
  const scriptURL = NativeModules.SourceCode?.scriptURL as string | undefined;
  if (!scriptURL) return null;
  try {
    const bundleUrl = new URL(scriptURL);
    if (!bundleUrl.hostname) return null;
    return `http://${bundleUrl.hostname}:3000`;
  } catch {
    return null;
  }
}
