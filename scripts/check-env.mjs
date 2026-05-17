import fs from "node:fs";
import path from "node:path";

const envPath = path.join(process.cwd(), ".env");
const raw = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
const entries = new Map();

for (const line of raw.split(/\r?\n/)) {
  if (!line || line.trim().startsWith("#")) continue;
  const index = line.indexOf("=");
  if (index === -1) continue;
  entries.set(line.slice(0, index), line.slice(index + 1));
}

const important = [
  "GEMINI_API_KEY",
  "APIFY_TOKEN",
  "BROWSER_USE_API_KEY",
  "AGENTPHONE_API_KEY",
  "AGENTMAIL_API_KEY",
  "AGENTMAIL_INBOX_ID",
  "SUPERMEMORY_API_KEY",
];

const safety = [
  "ALLOW_APIFY_LIVE_RUN",
  "ALLOW_BROWSER_USE_LIVE_TASK",
  "ALLOW_REAL_RESTAURANT_CALLS",
  "ALLOW_REAL_SMS_SEND",
  "ALLOW_REAL_EMAIL_SEND",
  "ALLOW_REAL_BOOKING_SUBMIT",
];

console.log("Env key status");
for (const name of important) {
  console.log(`${name}: ${entries.get(name) ? "set" : "missing"}`);
}

console.log("\nSafety toggles");
for (const name of safety) {
  console.log(`${name}: ${entries.get(name) || "false"}`);
}
