import "react-native-url-polyfill/auto";
import * as SecureStore from "expo-secure-store";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECURE_STORE_CHUNK_SIZE = 1800;
const CHUNK_META_SUFFIX = "__chunks";

function getChunkKey(key: string, index: number) {
  return `${key}__part_${index}`;
}

function getChunkMetaKey(key: string) {
  return `${key}${CHUNK_META_SUFFIX}`;
}

async function removeChunkedValue(key: string) {
  const chunkCountRaw = await SecureStore.getItemAsync(getChunkMetaKey(key));
  const chunkCount = Number.parseInt(chunkCountRaw ?? "", 10);
  if (Number.isFinite(chunkCount) && chunkCount > 0) {
    await Promise.all(
      Array.from({ length: chunkCount }, (_, index) => SecureStore.deleteItemAsync(getChunkKey(key, index))),
    );
  }
  await SecureStore.deleteItemAsync(getChunkMetaKey(key));
  await SecureStore.deleteItemAsync(key);
}

const secureStoreAdapter = {
  async getItem(key: string) {
    const chunkCountRaw = await SecureStore.getItemAsync(getChunkMetaKey(key));
    const chunkCount = Number.parseInt(chunkCountRaw ?? "", 10);
    if (Number.isFinite(chunkCount) && chunkCount > 0) {
      const parts = await Promise.all(
        Array.from({ length: chunkCount }, (_, index) => SecureStore.getItemAsync(getChunkKey(key, index))),
      );
      if (parts.some((part) => part == null)) {
        await removeChunkedValue(key);
        return null;
      }
      return parts.join("");
    }

    return SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string) {
    await removeChunkedValue(key);

    if (value.length <= SECURE_STORE_CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value);
      return;
    }

    const parts = Array.from(
      { length: Math.ceil(value.length / SECURE_STORE_CHUNK_SIZE) },
      (_, index) => value.slice(index * SECURE_STORE_CHUNK_SIZE, (index + 1) * SECURE_STORE_CHUNK_SIZE),
    );

    await Promise.all(parts.map((part, index) => SecureStore.setItemAsync(getChunkKey(key, index), part)));
    await SecureStore.setItemAsync(getChunkMetaKey(key), String(parts.length));
  },
  removeItem: removeChunkedValue,
};

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  console.warn("Supabase env is not configured.");
}

export const supabase = createClient(SUPABASE_URL ?? "https://invalid.local", SUPABASE_PUBLISHABLE_KEY ?? "invalid", {
  auth: {
    storage: secureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
