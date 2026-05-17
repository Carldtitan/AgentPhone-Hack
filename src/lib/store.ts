import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Restaurant, StoredConversation } from "./types";

const dataDir = path.join(process.cwd(), ".data");

async function ensureDataDir() {
  await mkdir(dataDir, { recursive: true });
}

function jsonPath(name: string) {
  return path.join(dataDir, name);
}

export async function saveConversation(conversation: StoredConversation) {
  await ensureDataDir();
  await writeFile(jsonPath(`${conversation.conversationId}.json`), JSON.stringify(conversation, null, 2), "utf8");
}

export async function readConversation(conversationId: string): Promise<StoredConversation | null> {
  try {
    const raw = await readFile(jsonPath(`${conversationId}.json`), "utf8");
    return JSON.parse(raw) as StoredConversation;
  } catch {
    return null;
  }
}

export async function saveRestaurantCache(cacheKey: string, restaurants: Restaurant[]) {
  await ensureDataDir();
  await writeFile(
    jsonPath("restaurant-cache.json"),
    JSON.stringify({ cacheKey, restaurants, updatedAt: new Date().toISOString() }, null, 2),
    "utf8",
  );
}

export async function readRestaurantCache(cacheKey?: string): Promise<Restaurant[] | null> {
  try {
    const raw = await readFile(jsonPath("restaurant-cache.json"), "utf8");
    const parsed = JSON.parse(raw) as { cacheKey: string; restaurants: Restaurant[] };
    if (cacheKey && parsed.cacheKey !== cacheKey) return null;
    return parsed.restaurants;
  } catch {
    return null;
  }
}
