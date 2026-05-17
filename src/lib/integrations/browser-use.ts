import { getEnv } from "../env";
import { fetchJson } from "../http";
import type { BrowserUseSession, RankedRestaurant, ToolResult } from "../types";

type BrowserTask = {
  id?: string;
  sessionId?: string;
  liveUrl?: string | null;
  status?: string;
};

function sessionsUrl(baseUrl: string) {
  const base = baseUrl.replace(/\/+$/, "");
  if (base.endsWith("/sessions")) return base;
  if (base.endsWith("/api/v3")) return `${base}/sessions`;
  if (base.endsWith("/api")) return `${base}/v3/sessions`;
  return `${base}/api/v3/sessions`;
}

export async function enrichReservationPath(restaurant: RankedRestaurant): Promise<ToolResult<RankedRestaurant>> {
  const env = getEnv();
  return {
    ok: true,
    mode: env.browserUseApiKey ? "dry-run" : "missing-key",
    data: restaurant,
    message: restaurant.reservationUrl
      ? `Reservation link found: ${restaurant.reservationUrl}`
      : restaurant.website
      ? `No direct booking link found; Browser Use can inspect ${restaurant.website}.`
      : "No online booking path found; human review may be required.",
  };
}

export async function planBrowserBooking(restaurant: RankedRestaurant, dinerName: string): Promise<ToolResult<BrowserUseSession>> {
  const env = getEnv();
  const browserTarget = restaurant.reservationUrl ?? restaurant.website;
  const message = `Browser Use would open ${browserTarget}, select the best slot, enter "${dinerName}", and stop before final submit.`;
  if (!env.browserUseApiKey || !env.allowBrowserUseLiveTask || !env.allowRealBookingSubmit) {
    return {
      ok: true,
      mode: env.browserUseApiKey ? "dry-run" : "missing-key",
      data: { sessionId: "dry-run", message },
      message: env.allowRealBookingSubmit ? message : "Final booking submit is disabled; generated browser booking plan only.",
    };
  }

  try {
    const task = `You are Table Agent's browser operator.

Goal: book or hold a restaurant reservation for ${dinerName} at ${restaurant.name}.

Start here: ${browserTarget}.

Rules:
- Use the first available time that is closest to the requested slot already shown in the app.
- Do not create an account.
- Do not enter credit card, payment, or deposit details.
- Do not call any phone number.
- If login, payment, deposit, unavailable slots, or ambiguous policy appears, stop and summarize what the human must do.
- If all details are clear and no payment/login is required, complete the reservation form.
- Final answer must include whether the reservation was completed, held, blocked, or needs human approval.`;
    const response = await fetchJson<BrowserTask>(sessionsUrl(env.browserUseBaseUrl), {
      method: "POST",
      headers: { "X-Browser-Use-API-Key": env.browserUseApiKey },
      body: JSON.stringify({
        task,
        model: "bu-mini",
        maxCostUsd: 1,
        keepAlive: true,
        enableRecording: true,
        agentmail: false,
        skills: false,
        proxyCountryCode: "us",
      }),
      timeoutMs: 20000,
    });
    const sessionId = response.id ?? response.sessionId ?? "unknown";
    const liveUrl = response.liveUrl ?? undefined;
    return {
      ok: true,
      mode: "live",
      data: {
        sessionId,
        liveUrl,
        status: response.status,
        message: `Browser Use session ${sessionId} started.`,
      },
      message: `Browser Use live session started: ${sessionId}${liveUrl ? ` (${liveUrl})` : ""}.`,
    };
  } catch (error) {
    return {
      ok: false,
      mode: "fallback",
      data: { sessionId: "fallback", message },
      message: `Browser Use booking failed; dry-run plan kept. ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function stopBrowserUseSession(sessionId: string): Promise<ToolResult<string>> {
  const env = getEnv();
  if (!env.browserUseApiKey) {
    return { ok: false, mode: "missing-key", message: "Browser Use API key missing." };
  }

  try {
    await fetchJson(
      `${sessionsUrl(env.browserUseBaseUrl)}/${encodeURIComponent(sessionId)}/stop`,
      {
        method: "POST",
        headers: { "X-Browser-Use-API-Key": env.browserUseApiKey },
        body: JSON.stringify({ strategy: "session" }),
        timeoutMs: 10000,
      },
    );
    return { ok: true, mode: "live", data: sessionId, message: "Browser Use session stopped." };
  } catch (error) {
    return {
      ok: false,
      mode: "fallback",
      data: sessionId,
      message: `Could not stop Browser Use session. ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function probeBrowserUseAuth(): Promise<ToolResult<string>> {
  const env = getEnv();
  if (!env.browserUseApiKey) {
    return { ok: false, mode: "missing-key", message: "Browser Use API key missing." };
  }

  try {
    const data = await fetchJson<{ total?: number }>(`${sessionsUrl(env.browserUseBaseUrl)}?page_size=1`, {
      headers: { "X-Browser-Use-API-Key": env.browserUseApiKey },
      timeoutMs: 10000,
    });
    return {
      ok: true,
      mode: "live",
      data: `${data.total ?? 0} sessions visible`,
      message: "Browser Use auth probe succeeded without creating a session.",
    };
  } catch (error) {
    return {
      ok: false,
      mode: "fallback",
      message: `Browser Use auth probe failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
