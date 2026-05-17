import { getEnv } from "../env";
import { fetchJson } from "../http";
import type { RankedRestaurant, ToolResult } from "../types";

type BrowserTask = {
  id?: string;
  sessionId?: string;
};

export async function enrichReservationPath(restaurant: RankedRestaurant): Promise<ToolResult<RankedRestaurant>> {
  const env = getEnv();
  return {
    ok: true,
    mode: env.browserUseApiKey ? "dry-run" : "missing-key",
    data: restaurant,
    message: restaurant.reservationUrl
      ? `Reservation link found: ${restaurant.reservationUrl}`
      : `No booking link found; phone fallback will use ${restaurant.phone ?? "restaurant phone if available"}.`,
  };
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
    const task = `Book a restaurant reservation for ${dinerName} at ${restaurant.name}. Use ${restaurant.reservationUrl ?? restaurant.website}. Only submit if all displayed details match the requested party/time, no deposit is required, and the final confirmation page does not require credit card details. If a deposit, credit card, login, or unclear policy appears, stop and summarize exactly what human approval is needed.`;
    const base = env.browserUseBaseUrl.replace(/\/$/, "");
    const url = base.includes("/api/v3") ? `${base}/sessions` : `${base}/tasks`;
    const response = await fetchJson<BrowserTask>(url, {
      method: "POST",
      headers: { "X-Browser-Use-API-Key": env.browserUseApiKey },
      body: JSON.stringify({
        task,
        model: "bu-mini",
        maxCostUsd: 1,
        keepAlive: false,
        enableRecording: true,
        agentmail: false,
      }),
      timeoutMs: 20000,
    });
    return {
      ok: true,
      mode: "live",
      data: `Browser task started: ${response.id ?? response.sessionId}`,
      message: `Browser Use booking task started${response.id ? `: ${response.id}` : ""}${"liveUrl" in response && response.liveUrl ? ` (${response.liveUrl})` : ""}.`,
    };
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
