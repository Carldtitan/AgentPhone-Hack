import { getEnv } from "../env";
import { fetchJson } from "../http";
import type { AvailabilitySlot, BrowserUseSession, RankedRestaurant, Restaurant, ToolResult } from "../types";

type BrowserTask = {
  id?: string;
  sessionId?: string;
  liveUrl?: string | null;
  status?: string;
};

type SessionResponse = {
  id: string;
  status: "created" | "idle" | "running" | "stopped" | "timed_out" | "error";
  output?: unknown;
  isTaskSuccessful?: boolean | null;
};

const SLOT_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    bookable: { type: "boolean", description: "true if the page allows online reservation booking" },
    closestSlots: {
      type: "array",
      items: {
        type: "object",
        properties: {
          time: { type: "string", description: "Time in 24-hour format like '19:30'" },
          label: { type: "string", description: "Display label like '7:30 PM'" },
          available: { type: "boolean" },
        },
        required: ["time", "label", "available"],
      },
    },
    notes: { type: "string", description: "One short sentence on what was found, e.g. waitlist only" },
  },
  required: ["bookable", "closestSlots"],
} as const;

function sessionsUrl(baseUrl: string) {
  const base = baseUrl.replace(/\/+$/, "");
  if (base.endsWith("/sessions")) return base;
  if (base.endsWith("/api/v3")) return `${base}/sessions`;
  if (base.endsWith("/api")) return `${base}/v3/sessions`;
  return `${base}/api/v3/sessions`;
}

async function getSession(sessionId: string): Promise<SessionResponse> {
  const env = getEnv();
  return fetchJson<SessionResponse>(`${sessionsUrl(env.browserUseBaseUrl)}/${encodeURIComponent(sessionId)}`, {
    headers: { "X-Browser-Use-API-Key": env.browserUseApiKey },
    timeoutMs: 10000,
  });
}

async function pollSession(sessionId: string, opts: { intervalMs: number; timeoutMs: number }): Promise<SessionResponse> {
  const start = Date.now();
  let last: SessionResponse | null = null;
  while (Date.now() - start < opts.timeoutMs) {
    last = await getSession(sessionId);
    if (last.status === "stopped" || last.status === "error" || last.status === "timed_out") return last;
    await new Promise((resolve) => setTimeout(resolve, opts.intervalMs));
  }
  // Final grace fetch in case the session settled between our last poll and the timeout boundary.
  try {
    last = await getSession(sessionId);
  } catch {
    // ignore; fall through to last known state
  }
  return last ?? { id: sessionId, status: "timed_out" };
}

type SlotOutput = {
  bookable?: boolean;
  closestSlots?: Array<{ time?: string; label?: string; available?: boolean }>;
  notes?: string;
};

function coerceSlots(output: unknown, intentDate: string): AvailabilitySlot[] {
  if (!output || typeof output !== "object") return [];
  const data = output as SlotOutput;
  if (!Array.isArray(data.closestSlots)) return [];
  return data.closestSlots
    .map((slot) => {
      if (!slot || typeof slot !== "object") return null;
      const label = String(slot.label ?? slot.time ?? "");
      const time = String(slot.time ?? slot.label ?? "");
      if (!label || !time) return null;
      return {
        startTime: time.includes("T") ? time : `${intentDate}T${time.padStart(5, "0")}:00`,
        label,
        source: "browser-use" as const,
        available: slot.available !== false,
      };
    })
    .filter(Boolean) as AvailabilitySlot[];
}

export async function confirmBookability(
  restaurant: Restaurant,
  requestedTime: string,
  intentDate: string,
): Promise<ToolResult<AvailabilitySlot[]>> {
  const env = getEnv();
  const targetUrl = restaurant.reservationUrl ?? restaurant.website;
  if (!targetUrl) {
    return { ok: true, mode: "fallback", data: [], message: `${restaurant.name} has no reservation URL or website to inspect.` };
  }
  if (!env.browserUseApiKey || !env.allowBrowserUseLiveTask) {
    return {
      ok: true,
      mode: env.browserUseApiKey ? "dry-run" : "missing-key",
      data: [],
      message: `Would inspect ${targetUrl} for slots near ${requestedTime}.`,
    };
  }

  const task = [
    `Visit ${targetUrl}.`,
    `Goal: check whether a table for the user is bookable around ${requestedTime} on ${intentDate}.`,
    `Do NOT submit any form. Only read the availability calendar/widget.`,
    `If the page redirects to a third-party reservation provider, follow the redirect once and read the slots there.`,
    `Return the closest available time slots near ${requestedTime} (up to 4). If no booking widget exists, set bookable=false and closestSlots=[].`,
  ].join(" ");

  try {
    const created = await fetchJson<SessionResponse>(sessionsUrl(env.browserUseBaseUrl), {
      method: "POST",
      headers: { "X-Browser-Use-API-Key": env.browserUseApiKey },
      body: JSON.stringify({
        task,
        model: "bu-mini",
        outputSchema: SLOT_OUTPUT_SCHEMA,
      }),
      timeoutMs: 20000,
    });
    const final = await pollSession(created.id, { intervalMs: 6000, timeoutMs: 150000 });
    const slots = coerceSlots(final.output, intentDate);

    if (final.status !== "stopped") {
      if (slots.length > 0) {
        return {
          ok: true,
          mode: "live",
          data: slots,
          message: `Browser Use task ${created.id} still ${final.status}, but partial output had ${slots.length} slots for ${restaurant.name}.`,
        };
      }
      return {
        ok: false,
        mode: "fallback",
        data: [],
        message: `Browser Use task ${created.id} ${final.status === "running" ? "did not complete in 150s" : `ended as ${final.status}`} for ${restaurant.name}.`,
      };
    }

    return {
      ok: true,
      mode: "live",
      data: slots,
      message: slots.length
        ? `Browser Use found ${slots.length} slots near ${requestedTime} for ${restaurant.name}.`
        : `Browser Use returned no bookable slots near ${requestedTime} for ${restaurant.name}.`,
    };
  } catch (error) {
    return {
      ok: false,
      mode: "fallback",
      data: [],
      message: `Browser Use slot check failed for ${restaurant.name}. ${error instanceof Error ? error.message : String(error)}`,
    };
  }
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
