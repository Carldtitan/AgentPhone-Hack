import { getEnv } from "../env";
import { fetchJson } from "../http";
import type { RankedRestaurant, ToolResult } from "../types";

type BrowserTask = {
  id?: string;
  sessionId?: string;
};

export async function enrichReservationPath(restaurant: RankedRestaurant): Promise<ToolResult<RankedRestaurant>> {
  const env = getEnv();
  if (!env.browserUseApiKey || !env.allowBrowserUseLiveTask) {
    return {
      ok: true,
      mode: env.browserUseApiKey ? "dry-run" : "missing-key",
      data: restaurant,
      message: restaurant.reservationUrl
        ? `Would inspect ${restaurant.reservationUrl} for final slot and policy details.`
        : `Would inspect ${restaurant.website ?? restaurant.name} for phone/booking details.`,
    };
  }

  const task = restaurant.reservationUrl
    ? `Visit ${restaurant.reservationUrl}. Check reservation availability only. Do not submit or book anything. Summarize available times and cancellation policy.`
    : `Visit ${restaurant.website}. Find the reservations page, menu highlights, and preferred booking method. Do not submit any form.`;

  try {
    const base = env.browserUseBaseUrl.replace(/\/$/, "");
    const url = base.includes("/api/v3") ? `${base}/sessions` : `${base}/tasks`;
    const response = await fetchJson<BrowserTask>(url, {
      method: "POST",
      headers: { "X-Browser-Use-API-Key": env.browserUseApiKey },
      body: JSON.stringify({ task, llm: "browser-use-2.0" }),
      timeoutMs: 20000,
    });
    return {
      ok: true,
      mode: "live",
      data: restaurant,
      message: `Started Browser Use task ${response.id ?? response.sessionId ?? "unknown"} for non-submitting availability inspection.`,
    };
  } catch (error) {
    return {
      ok: false,
      mode: "fallback",
      data: restaurant,
      message: `Browser Use task failed; continuing with known reservation URL. ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function planBrowserBooking(restaurant: RankedRestaurant, dinerName: string): Promise<ToolResult<string>> {
  const env = getEnv();
  const message = `Browser Use would open ${restaurant.reservationUrl ?? restaurant.website}, select the best slot, enter "${dinerName}", and stop before final submit.`;
  if (!env.browserUseApiKey || !env.allowBrowserUseLiveTask || !env.allowRealBookingSubmit) {
    return {
      ok: true,
      mode: env.browserUseApiKey ? "dry-run" : "missing-key",
      data: message,
      message: env.allowRealBookingSubmit ? message : "Final booking submit is disabled; generated browser booking plan only.",
    };
  }

  try {
    const task = `Book a restaurant reservation for ${dinerName} at ${restaurant.name}. Use ${restaurant.reservationUrl}. Only submit if all displayed details match the requested party/time and no deposit is required.`;
    const base = env.browserUseBaseUrl.replace(/\/$/, "");
    const url = base.includes("/api/v3") ? `${base}/sessions` : `${base}/tasks`;
    const response = await fetchJson<BrowserTask>(url, {
      method: "POST",
      headers: { "X-Browser-Use-API-Key": env.browserUseApiKey },
      body: JSON.stringify({ task, llm: "browser-use-2.0" }),
      timeoutMs: 20000,
    });
    return { ok: true, mode: "live", data: `Browser task started: ${response.id ?? response.sessionId}`, message: "Browser Use booking task started." };
  } catch (error) {
    return { ok: false, mode: "fallback", data: message, message: `Browser Use booking failed; dry-run plan kept. ${error instanceof Error ? error.message : String(error)}` };
  }
}

export async function probeBrowserUseAuth(): Promise<ToolResult<string>> {
  const env = getEnv();
  if (!env.browserUseApiKey) {
    return { ok: false, mode: "missing-key", message: "Browser Use API key missing." };
  }

  try {
    const base = env.browserUseBaseUrl.replace(/\/$/, "");
    const data = await fetchJson<{ total?: number }>(`${base}/sessions?page_size=1`, {
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
