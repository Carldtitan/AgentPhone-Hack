import type { IntegrationStatus } from "./types";

function stringEnv(name: string, fallback = "") {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : fallback;
}

function boolEnv(name: string, fallback = false) {
  const value = stringEnv(name);
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function numberEnv(name: string, fallback: number) {
  const value = Number(stringEnv(name));
  return Number.isFinite(value) ? value : fallback;
}

function has(name: string) {
  return stringEnv(name).length > 0;
}

export function getEnv() {
  return {
    appBaseUrl: stringEnv("APP_BASE_URL", "http://localhost:3000"),
    demoMode: boolEnv("DEMO_MODE", true),
    demoLocation: stringEnv("DEMO_LOCATION", "REDACTED, San Francisco, CA"),
    demoTimezone: stringEnv("DEMO_TIMEZONE", "America/Los_Angeles"),
    demoEmail: stringEnv("DEMO_TEST_RECIPIENT_EMAIL"),
    demoPhone: stringEnv("DEMO_TEST_RECIPIENT_PHONE"),

    geminiApiKey: stringEnv("GEMINI_API_KEY"),
    geminiModel: stringEnv("GEMINI_MODEL", "gemini-2.5-flash-lite"),

    apifyToken: stringEnv("APIFY_TOKEN"),
    apifyBaseUrl: stringEnv("APIFY_API_BASE_URL", "https://api.apify.com/v2"),
    apifyGoogleMapsActor: stringEnv("APIFY_GOOGLE_MAPS_ACTOR", "compass/crawler-google-places"),
    apifyResyActor: stringEnv("APIFY_RESY_ACTOR", "clearpath/resy-api"),
    apifyOpenTableActor: stringEnv("APIFY_OPENTABLE_ACTOR", "canadesk/opentable"),
    apifyMaxRunChargeUsd: numberEnv("APIFY_MAX_RUN_CHARGE_USD", 10),
    allowApifyLiveRun: boolEnv("ALLOW_APIFY_LIVE_RUN", false),

    browserUseApiKey: stringEnv("BROWSER_USE_API_KEY"),
    browserUseBaseUrl: stringEnv("BROWSER_USE_API_BASE_URL", "https://api.browser-use.com/api/v3"),
    allowBrowserUseLiveTask: boolEnv("ALLOW_BROWSER_USE_LIVE_TASK", false),

    agentPhoneApiKey: stringEnv("AGENTPHONE_API_KEY"),
    agentPhoneBaseUrl: stringEnv("AGENTPHONE_BASE_URL", "https://api.agentphone.ai"),
    agentPhoneAgentId: stringEnv("AGENTPHONE_AGENT_ID"),
    agentPhoneFromNumber: stringEnv("AGENTPHONE_FROM_NUMBER"),
    allowRealRestaurantCalls: boolEnv("ALLOW_REAL_RESTAURANT_CALLS", false),
    allowRealSmsSend: boolEnv("ALLOW_REAL_SMS_SEND", false),

    agentMailApiKey: stringEnv("AGENTMAIL_API_KEY"),
    agentMailInboxId: stringEnv("AGENTMAIL_INBOX_ID"),
    agentMailBaseUrl: stringEnv("AGENTMAIL_BASE_URL", "https://api.agentmail.to"),
    allowRealEmailSend: boolEnv("ALLOW_REAL_EMAIL_SEND", false),

    supermemoryApiKey: stringEnv("SUPERMEMORY_API_KEY"),
    supermemoryUserId: stringEnv("SUPERMEMORY_USER_ID", "demo-user"),
    supermemoryProjectId: stringEnv("SUPERMEMORY_PROJECT_ID", "restaurant-reservation-agent"),
    supermemoryBaseUrl: stringEnv("SUPERMEMORY_BASE_URL", "https://api.supermemory.ai"),

    allowRealBookingSubmit: boolEnv("ALLOW_REAL_BOOKING_SUBMIT", false),
  };
}

function status(
  id: string,
  label: string,
  keyPresent: boolean,
  liveEnabled: boolean,
  configuredMessage: string,
): IntegrationStatus {
  return {
    id,
    label,
    keyPresent,
    liveEnabled,
    mode: keyPresent ? (liveEnabled ? "live" : "dry-run") : "missing-key",
    message: keyPresent ? configuredMessage : "Missing API key; using local demo fallback.",
  };
}

export function getIntegrationStatuses(): IntegrationStatus[] {
  const env = getEnv();
  return [
    status("gemini", "Gemini", has("GEMINI_API_KEY"), !env.demoMode, "Ready for live intent parsing when demo mode is off."),
    status("apify", "Apify", has("APIFY_TOKEN"), env.allowApifyLiveRun, "Ready; live actor runs require ALLOW_APIFY_LIVE_RUN=true."),
    status(
      "browser-use",
      "Browser Use",
      has("BROWSER_USE_API_KEY"),
      env.allowBrowserUseLiveTask,
      "Ready; cloud browser tasks require ALLOW_BROWSER_USE_LIVE_TASK=true.",
    ),
    status(
      "agentphone",
      "AgentPhone",
      has("AGENTPHONE_API_KEY"),
      env.allowRealRestaurantCalls || env.allowRealSmsSend,
      "Ready; real calls/SMS remain gated by safety toggles.",
    ),
    status(
      "agentmail",
      "AgentMail",
      has("AGENTMAIL_API_KEY") && has("AGENTMAIL_INBOX_ID"),
      env.allowRealEmailSend,
      "Ready; real email sends require ALLOW_REAL_EMAIL_SEND=true.",
    ),
    status("supermemory", "Supermemory", has("SUPERMEMORY_API_KEY"), !env.demoMode, "Ready; memory calls are skipped in demo mode."),
  ];
}
