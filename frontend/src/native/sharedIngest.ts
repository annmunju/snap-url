import { NativeModules, Platform } from "react-native";

type SharedIngestModuleShape = {
  consumePendingSharedUrl(): Promise<{ url: string; note?: string } | null>;
  syncSharedIngestAuthContext(accessToken: string, apiBaseUrl: string): Promise<boolean>;
  clearSharedIngestAuthContext(): Promise<boolean>;
};

const nativeModule = NativeModules.SharedIngestModule as SharedIngestModuleShape | undefined;

export async function consumePendingSharedUrl() {
  if (Platform.OS !== "ios" || !nativeModule) {
    return null;
  }

  const sharedPayload = await nativeModule.consumePendingSharedUrl();
  return sharedPayload || null;
}

export async function syncSharedIngestAuthContext(accessToken: string, apiBaseUrl: string) {
  if (Platform.OS !== "ios" || !nativeModule) {
    return;
  }

  await nativeModule.syncSharedIngestAuthContext(accessToken, apiBaseUrl);
}

export async function clearSharedIngestAuthContext() {
  if (Platform.OS !== "ios" || !nativeModule) {
    return;
  }

  await nativeModule.clearSharedIngestAuthContext();
}
