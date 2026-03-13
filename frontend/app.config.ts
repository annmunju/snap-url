import type { ExpoConfig } from "expo/config";
import fs from "node:fs";
import path from "node:path";

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

const appEnv = (process.env.APP_ENV || "development").trim() || "development";
const root = __dirname;

for (const fileName of [
  ".env",
  `.env.${appEnv}`,
  ".env.local",
  `.env.${appEnv}.local`,
]) {
  loadEnvFile(path.join(root, fileName));
}

const config: ExpoConfig = {
  name: "ARCHIVE-URL",
  slug: "archive-url",
  icon: "./assets/icon.png",
  newArchEnabled: true,
  scheme: "archiveurl",
  version: "1.0.0",
  orientation: "portrait",
  userInterfaceStyle: "light",
  ios: {
    icon: "./assets/icon.png",
    supportsTablet: false,
    bundleIdentifier: "com.archiveurl.app",
  },
  android: {
    package: "com.archiveurl.app",
  },
  extra: {
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:3000",
    appEnv,
  },
  plugins: ["expo-secure-store"],
};

export default config;
