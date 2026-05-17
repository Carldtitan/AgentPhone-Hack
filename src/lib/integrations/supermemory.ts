import { getEnv } from "../env";
import { fetchJson } from "../http";
import type { ToolResult } from "../types";

type SearchResponse = {
  results?: Array<{ memory?: string; chunk?: string; similarity?: number }>;
};

export async function searchUserMemory(query: string): Promise<ToolResult<string[]>> {
  const env = getEnv();
  if (env.demoMode || !env.supermemoryApiKey) {
    return {
      ok: true,
      mode: env.supermemoryApiKey ? "dry-run" : "missing-key",
      data: ["Prefers practical dinner plans, clear confirmations, and low-friction booking."],
      message: "Supermemory search skipped in demo mode.",
    };
  }

  try {
    const data = await fetchJson<SearchResponse>(`${env.supermemoryBaseUrl.replace(/\/$/, "")}/v4/search`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.supermemoryApiKey}` },
      body: JSON.stringify({
        q: query,
        containerTag: env.supermemoryUserId,
        searchMode: "hybrid",
        limit: 5,
      }),
      timeoutMs: 45000,
    });
    const memories = (data.results ?? []).map((result) => result.memory ?? result.chunk ?? "").filter(Boolean);
    return { ok: true, mode: "live", data: memories, message: `Supermemory returned ${memories.length} memories.` };
  } catch (error) {
    return {
      ok: false,
      mode: "fallback",
      data: [],
      message: `Supermemory search failed. ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function addUserMemory(content: string, customId: string): Promise<ToolResult<string>> {
  const env = getEnv();
  if (env.demoMode || !env.supermemoryApiKey) {
    return {
      ok: true,
      mode: env.supermemoryApiKey ? "dry-run" : "missing-key",
      data: "memory-write-preview",
      message: "Supermemory write skipped in demo mode.",
    };
  }

  try {
    const data = await fetchJson<{ id?: string; status?: string }>(`${env.supermemoryBaseUrl.replace(/\/$/, "")}/v3/documents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.supermemoryApiKey}` },
      body: JSON.stringify({
        content,
        customId,
        containerTag: env.supermemoryUserId,
        metadata: {
          project: env.supermemoryProjectId,
          source: "restaurant-agent",
        },
      }),
      timeoutMs: 45000,
    });
    return { ok: true, mode: "live", data: data.id ?? data.status ?? "queued", message: "Supermemory queued the conversation memory." };
  } catch (error) {
    return {
      ok: false,
      mode: "fallback",
      data: "memory-write-preview",
      message: `Supermemory write failed. ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
