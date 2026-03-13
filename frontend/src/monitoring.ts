import { Platform } from "react-native";

declare const ErrorUtils:
  | {
      getGlobalHandler?: () => ((error: unknown, isFatal?: boolean) => void) | undefined;
      setGlobalHandler?: (handler: (error: unknown, isFatal?: boolean) => void) => void;
    }
  | undefined;

function describeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    name: "UnknownError",
    message: String(error),
  };
}

export function captureFrontendError(error: unknown, context?: Record<string, unknown>) {
  const payload = {
    platform: Platform.OS,
    ...describeError(error),
    ...(context ?? {}),
  };

  console.error("[frontend-error]", JSON.stringify(payload));
}

export function installGlobalErrorHandlers() {
  const currentHandler = ErrorUtils?.getGlobalHandler?.();
  if (!ErrorUtils?.setGlobalHandler) {
    return;
  }

  ErrorUtils.setGlobalHandler((error, isFatal) => {
    captureFrontendError(error, { isFatal: Boolean(isFatal), source: "global" });
    currentHandler?.(error, isFatal);
  });
}
