#!/usr/bin/env node
// Provisions an AgentPhone agent + phone number for the reservation demo.
// Reads AGENTPHONE_API_KEY from .env. Idempotent-ish: prints existing agent ID
// if AGENTPHONE_AGENT_ID is already filled in.
//
// Usage:
//   node scripts/setup-agentphone.mjs

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env");

async function loadEnv() {
  const text = await readFile(envPath, "utf8");
  const env = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
  return env;
}

async function api(env, pathName, init = {}) {
  const url = `${(env.AGENTPHONE_BASE_URL || "https://api.agentphone.ai").replace(/\/$/, "")}/v1${pathName}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.AGENTPHONE_API_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${JSON.stringify(data).slice(0, 400)}`);
  }
  return data;
}

const SYSTEM_PROMPT = [
  "You are a polite reservation agent calling a restaurant on behalf of a guest.",
  "Speak naturally, in 1 to 2 short sentences per turn.",
  "Goal: confirm the reservation details (party size, date, time, name).",
  "Ask for a confirmation number before ending the call.",
  "Never share or accept payment details.",
  "If the host asks about a deposit or pre-payment, say you will text the guest and call back, then end the call.",
  "End with: 'Thank you. Have a great day.' and hang up.",
].join(" ");

async function main() {
  const env = await loadEnv();
  if (!env.AGENTPHONE_API_KEY) {
    console.error("AGENTPHONE_API_KEY missing in .env");
    process.exit(1);
  }

  if (env.AGENTPHONE_AGENT_ID) {
    console.log(`AGENTPHONE_AGENT_ID already set: ${env.AGENTPHONE_AGENT_ID}`);
    console.log("Delete the value in .env and re-run if you want to provision a new agent.");
    return;
  }

  console.log("1/3  Creating agent…");
  const agent = await api(env, "/agents", {
    method: "POST",
    body: JSON.stringify({
      name: "Reservation Agent",
      voiceMode: "hosted",
      systemPrompt: SYSTEM_PROMPT,
      beginMessage: "Hi, this is the reservation agent calling on behalf of a guest. Do you have a moment?",
    }),
  });
  const agentId = agent.id ?? agent.agentId ?? agent.data?.id;
  if (!agentId) throw new Error(`Agent create response missing id: ${JSON.stringify(agent)}`);
  console.log(`     agentId = ${agentId}`);

  console.log("2/3  Provisioning a phone number…");
  const number = await api(env, "/numbers", {
    method: "POST",
    body: JSON.stringify({}),
  });
  const numberId = number.id ?? number.data?.id;
  const numberDigits = number.phoneNumber ?? number.number ?? number.data?.phoneNumber;
  if (!numberId) throw new Error(`Number create response missing id: ${JSON.stringify(number)}`);
  console.log(`     numberId = ${numberId} (${numberDigits ?? "no digits returned"})`);

  console.log("3/3  Attaching number to agent…");
  await api(env, `/agents/${agentId}/numbers`, {
    method: "POST",
    body: JSON.stringify({ numberId }),
  });
  console.log("     attached.");

  console.log("\nNext step: paste this into .env and restart the dev server.");
  console.log(`AGENTPHONE_AGENT_ID=${agentId}`);
  if (numberDigits) {
    console.log(`AGENTPHONE_FROM_NUMBER=${numberDigits}`);
  }
}

main().catch((err) => {
  console.error("Setup failed:", err.message ?? err);
  process.exit(1);
});
