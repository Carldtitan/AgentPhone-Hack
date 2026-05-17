import { getEnv } from "../env";
import { fetchJson } from "../http";
import type { RankedRestaurant, ToolResult } from "../types";

function v1(path: string) {
  return `${getEnv().agentPhoneBaseUrl.replace(/\/$/, "")}/v1${path}`;
}

export async function getAgentPhoneUsage(): Promise<ToolResult<unknown>> {
  const env = getEnv();
  if (!env.agentPhoneApiKey) {
    return { ok: false, mode: "missing-key", message: "AgentPhone API key missing." };
  }

  try {
    const data = await fetchJson<unknown>(v1("/usage"), {
      headers: { Authorization: `Bearer ${env.agentPhoneApiKey}` },
      timeoutMs: 10000,
    });
    return { ok: true, mode: "live", data, message: "AgentPhone usage endpoint responded." };
  } catch (error) {
    return { ok: false, mode: "fallback", message: `AgentPhone usage check failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export async function placeRestaurantCall(restaurant: RankedRestaurant, script: string): Promise<ToolResult<string>> {
  const env = getEnv();
  const plan = `AgentPhone would call ${restaurant.phone ?? "the restaurant"} and say: ${script}`;
  if (!env.agentPhoneApiKey || !env.allowRealRestaurantCalls || !env.agentPhoneAgentId || !restaurant.phone) {
    return {
      ok: true,
      mode: env.agentPhoneApiKey ? "dry-run" : "missing-key",
      data: plan,
      message: "Real restaurant calls are disabled or missing agent/phone configuration.",
    };
  }

  try {
    const data = await fetchJson<{ id?: string }>(v1("/calls"), {
      method: "POST",
      headers: { Authorization: `Bearer ${env.agentPhoneApiKey}` },
      body: JSON.stringify({
        agentId: env.agentPhoneAgentId,
        toNumber: restaurant.phone,
        initialGreeting: "Hi, I am calling to make a restaurant reservation.",
        systemPrompt: script,
      }),
      timeoutMs: 15000,
    });
    return { ok: true, mode: "live", data: `Call started: ${data.id ?? "unknown"}`, message: "AgentPhone outbound restaurant call started." };
  } catch (error) {
    return { ok: false, mode: "fallback", data: plan, message: `AgentPhone call failed; dry-run script kept. ${error instanceof Error ? error.message : String(error)}` };
  }
}

export async function sendSmsConfirmation(toNumber: string | undefined, body: string): Promise<ToolResult<string>> {
  const env = getEnv();
  const recipient = toNumber ?? env.demoPhone ?? "demo recipient";
  const plan = `AgentPhone would text ${recipient}: ${body}`;
  if (!env.agentPhoneApiKey || !env.allowRealSmsSend || !toNumber) {
    return {
      ok: true,
      mode: env.agentPhoneApiKey ? "dry-run" : "missing-key",
      data: plan,
      message: "Real SMS sending is disabled; generated SMS preview only.",
    };
  }

  return {
    ok: true,
    mode: "dry-run",
    data: plan,
    message: "AgentPhone direct outbound SMS endpoint is intentionally not called; use inbound webhook or MCP during the live hackathon account setup.",
  };
}
