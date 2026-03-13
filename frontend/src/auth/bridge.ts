let accessTokenProvider: (() => Promise<string | null>) | null = null;
let unauthorizedHandler: (() => Promise<void>) | null = null;

export function registerAccessTokenProvider(provider: () => Promise<string | null>) {
  accessTokenProvider = provider;
}

export async function getAccessToken(): Promise<string | null> {
  return accessTokenProvider ? accessTokenProvider() : null;
}

export function registerUnauthorizedHandler(handler: () => Promise<void>) {
  unauthorizedHandler = handler;
}

export async function handleUnauthorized() {
  if (unauthorizedHandler) {
    await unauthorizedHandler();
  }
}
