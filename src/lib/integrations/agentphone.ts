import { getEnv } from "../env";
import { fetchJson } from "../http";
import type { RankedRestaurant, ToolResult } from "../types";

type AgentPhoneAgent = {
  id: string;
  name?: string;
  voiceMode?: string;
  numbers?: Array<{ id?: string; phoneNumber?: string }>;
};

type AgentPhoneNumber = {
  id: string;
  phoneNumber?: string;
  status?: string;
  agentId?: string | null;
};

function v1(path: string) {
  return `${getEnv().agentPhoneBaseUrl.replace(/\/$/, "")}/v1${path}`;
}

function authHeaders() {
  return { Authorization: `Bearer ${getEnv().agentPhoneApiKey}` };
}

function normalizePhone(input: string | undefined) {
  if (!input) return "";
  const digits = input.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return input.startsWith("+") ? input : `+${digits}`;
}

export async function getAgentPhoneUsage(): Promise<ToolResult<unknown>> {
  const env = getEnv();
  if (!env.agentPhoneApiKey) {
    return { ok: false, mode: "missing-key", message: "AgentPhone API key missing." };
  }

  try {
    const data = await fetchJson<unknown>(v1("/usage"), {
      headers: authHeaders(),
      timeoutMs: 10000,
    });
    return { ok: true, mode: "live", data, message: "AgentPhone usage endpoint responded." };
  } catch (error) {
    return { ok: false, mode: "fallback", message: `AgentPhone usage check failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

async function listAgents(): Promise<AgentPhoneAgent[]> {
  const data = await fetchJson<{ data?: AgentPhoneAgent[] }>(v1("/agents?limit=100"), {
    headers: authHeaders(),
    timeoutMs: 10000,
  });
  return data.data ?? [];
}

async function listNumbers(): Promise<AgentPhoneNumber[]> {
  const data = await fetchJson<{ data?: AgentPhoneNumber[] }>(v1("/numbers?limit=100"), {
    headers: authHeaders(),
    timeoutMs: 10000,
  });
  return data.data ?? [];
}

async function createAgent(): Promise<AgentPhoneAgent> {
  const env = getEnv();
  return fetchJson<AgentPhoneAgent>(v1("/agents"), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      name: env.agentPhoneAgentName,
      description: "Calls a test stand-in for restaurants during Table Agent booking flows.",
      voiceMode: "hosted",
      modelTier: "turbo",
      voice: "Polly.Amy",
      beginMessage: "Hi, this is Table Agent testing a restaurant reservation call.",
      systemPrompt:
        "You are Table Agent. The recipient is a test stand-in for a restaurant. Explain the restaurant name and reservation request, ask them to respond as the restaurant host, then gather availability, policy, and confirmation details. Keep the call concise.",
    }),
    timeoutMs: 15000,
  });
}

async function attachNumber(agentId: string, numberId: string) {
  await fetchJson(v1(`/agents/${agentId}/numbers`), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ numberId }),
    timeoutMs: 10000,
  });
}

async function ensureAgentPhoneAgent(): Promise<ToolResult<string>> {
  const env = getEnv();
  if (env.agentPhoneAgentId) {
    return { ok: true, mode: "live", data: env.agentPhoneAgentId, message: "Using AGENTPHONE_AGENT_ID from env." };
  }

  if (!env.agentPhoneAutoCreateAgent) {
    return { ok: false, mode: "disabled", message: "AGENTPHONE_AGENT_ID is missing and auto-create is disabled." };
  }

  try {
    const agents = await listAgents();
    let agent = agents.find((candidate) => candidate.name === env.agentPhoneAgentName);
    if (!agent) {
      agent = await createAgent();
    }

    const numbers = await listNumbers();
    const preferredPhone = normalizePhone(env.agentPhoneFromNumber);
    const number =
      numbers.find((candidate) => env.agentPhoneNumberId && candidate.id === env.agentPhoneNumberId) ??
      numbers.find((candidate) => normalizePhone(candidate.phoneNumber) === preferredPhone) ??
      numbers.find((candidate) => candidate.status === "active") ??
      numbers[0];

    if (number && number.agentId !== agent.id) {
      await attachNumber(agent.id, number.id);
    }

    if (!number) {
      return {
        ok: false,
        mode: "fallback",
        data: agent.id,
        message: `Agent ${agent.id} is ready, but no AgentPhone number exists. Provision a number before outbound calls can start.`,
      };
    }

    return {
      ok: true,
      mode: "live",
      data: agent.id,
      message: `Agent ${agent.id} is ready with number ${number.phoneNumber ?? number.id}.`,
    };
  } catch (error) {
    return {
      ok: false,
      mode: "fallback",
      message: `AgentPhone setup failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function placeRestaurantCall(restaurant: RankedRestaurant, script: string): Promise<ToolResult<string>> {
  const env = getEnv();
  const targetNumber = normalizePhone(env.restaurantCallOverridePhone || restaurant.phone);
  const displayTarget = env.restaurantCallOverridePhone
    ? `${targetNumber} instead of ${restaurant.phone ?? restaurant.name}`
    : targetNumber || restaurant.name;
  const plan = `AgentPhone would call ${displayTarget} and say: ${script}`;
  if (!env.agentPhoneApiKey || !env.allowRealRestaurantCalls || !targetNumber) {
    return {
      ok: true,
      mode: env.agentPhoneApiKey ? "dry-run" : "missing-key",
      data: plan,
      message: "Real restaurant calls are disabled or no target phone is available.",
    };
  }

  try {
    const setup = await ensureAgentPhoneAgent();
    if (!setup.ok || !setup.data) {
      return { ok: false, mode: setup.mode, data: plan, message: setup.message };
    }

    const redirectedPrompt = env.restaurantCallOverridePhone
      ? `${script}\n\nImportant: You are not calling the real restaurant. You are calling the user's test phone number ${targetNumber}, which is standing in for ${restaurant.name}. Say that clearly at the start, then run the restaurant reservation call simulation.`
      : script;

    const data = await fetchJson<{ id?: string }>(v1("/calls"), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        agentId: setup.data,
        toNumber: targetNumber,
        initialGreeting: env.restaurantCallOverridePhone
          ? `Hi, this is Table Agent. This is a test call for ${restaurant.name}; please answer as if you are the restaurant host.`
          : "Hi, I am calling to make a restaurant reservation.",
        systemPrompt: redirectedPrompt,
      }),
      timeoutMs: 15000,
    });
    return { ok: true, mode: "live", data: `Call started: ${data.id ?? "unknown"}`, message: `AgentPhone outbound call started to ${displayTarget}.` };
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

  try {
    const setup = await ensureAgentPhoneAgent();
    if (!setup.ok || !setup.data) {
      return { ok: false, mode: setup.mode, data: plan, message: setup.message };
    }

    const data = await fetchJson<{ id?: string }>(v1("/messages"), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        agent_id: setup.data,
        to_number: normalizePhone(toNumber),
        body,
        number_id: env.agentPhoneNumberId || null,
      }),
      timeoutMs: 15000,
    });

    return {
      ok: true,
      mode: "live",
      data: `SMS sent: ${data.id ?? "unknown"}`,
      message: "AgentPhone sent the SMS confirmation.",
    };
  } catch (error) {
    return {
      ok: false,
      mode: "fallback",
      data: plan,
      message: `AgentPhone SMS failed. This usually means outbound SMS/10DLC is not enabled yet. ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
