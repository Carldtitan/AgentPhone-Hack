import { getIntegrationStatuses } from "./env";
import { parseIntent } from "./intent";
import { rankRestaurants } from "./ranking";
import { saveConversation, readConversation } from "./store";
import { discoverRestaurants } from "./integrations/apify";
import { confirmBookability, planBrowserBooking } from "./integrations/browser-use";
import { sendConfirmationEmail } from "./integrations/agentmail";
import { placeRestaurantCall, sendSmsConfirmation } from "./integrations/agentphone";
import { addUserMemory, searchUserMemory } from "./integrations/supermemory";
import { filterByOpeningHours } from "./opening-hours";
import type {
  BookingRequest,
  BookingResult,
  BrowserUseSession,
  RankedRestaurant,
  SearchResponse,
  TimelineStep,
} from "./types";

function id(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function step(label: string, status: TimelineStep["status"], detail: string, source?: string): TimelineStep {
  return { id: id("step"), label, status, detail, source };
}

export async function runRestaurantSearch(message: string): Promise<SearchResponse> {
  const timeline: TimelineStep[] = [];
  const parsed = await parseIntent(message);
  const intent = parsed.data!;
  timeline.push(step("Parsed dinner request", parsed.ok ? "done" : "error", parsed.message, "Gemini/local parser"));

  const memory = await searchUserMemory(message);
  timeline.push(step("Pulled user memory", memory.ok ? "done" : "error", memory.message, "Supermemory"));

  const discovered = await discoverRestaurants(intent);
  timeline.push(step("Discovered restaurants", discovered.ok ? "done" : "error", discovered.message, "Apify/cache"));

  const { kept, dropped } = filterByOpeningHours(discovered.data ?? [], intent);
  if (dropped.length) {
    timeline.push(
      step(
        "Filtered by opening hours",
        "done",
        `Dropped ${dropped.length} closed: ${dropped.slice(0, 3).map((d) => d.restaurant.name).join(", ")}${dropped.length > 3 ? "…" : ""}.`,
        "Hours filter",
      ),
    );
  }

  const ranked = rankRestaurants(intent, kept, memory.data ?? []);
  timeline.push(
    step(
      "Ranked candidates",
      "done",
      `Returned ${ranked.length} ranked options. Click 'Verify availability' on a restaurant to confirm bookable slots.`,
      "Ranking",
    ),
  );

  const response: SearchResponse = {
    conversationId: id("conv"),
    intent,
    options: ranked,
    timeline,
    integrations: getIntegrationStatuses(),
    memoryContext: memory.data ?? [],
    generatedAt: new Date().toISOString(),
  };

  await addUserMemory(`User request: ${message}\nParsed intent: ${JSON.stringify(intent)}\nTop restaurants: ${ranked.map((r) => r.name).join(", ")}`, response.conversationId);
  await saveConversation(response);
  return response;
}

export type VerifyResult = {
  conversationId: string;
  restaurant: RankedRestaurant;
  timelineStep: TimelineStep;
};

export async function verifyRestaurantBookability(conversationId: string, restaurantId: string): Promise<VerifyResult> {
  const conversation = await readConversation(conversationId);
  if (!conversation) throw new Error("Conversation not found.");
  const target = conversation.options.find((option) => option.id === restaurantId);
  if (!target) throw new Error("Restaurant not found in this conversation.");

  const result = await confirmBookability(target, conversation.intent.time, conversation.intent.date);
  const status = result.ok && result.mode === "live" ? "done" : result.ok ? "skipped" : "error";
  const timelineStep = step(`Confirmed bookability: ${target.name}`, status, result.message, "Browser Use");

  let updated = target;
  if (result.ok && result.mode === "live" && (result.data?.length ?? 0) > 0) {
    updated = { ...target, slots: result.data ?? [], bookabilityChecked: true } as RankedRestaurant;
  } else {
    updated = { ...target, bookabilityChecked: true } as RankedRestaurant;
  }

  const newOptions = rankRestaurants(
    conversation.intent,
    conversation.options.map((option) => (option.id === restaurantId ? updated : option)),
    conversation.memoryContext ?? [],
  );

  await saveConversation({
    ...conversation,
    options: newOptions,
    timeline: [...conversation.timeline, timelineStep],
  });

  const refreshed = newOptions.find((option) => option.id === restaurantId) ?? updated;
  return { conversationId, restaurant: refreshed, timelineStep };
}

function bookingScript(request: BookingRequest, restaurantName: string) {
  return [
    `You are a concise reservation agent calling ${restaurantName}.`,
    `Ask for a table for ${request.dinerName || "the guest"}.`,
    "Confirm date, time, party size, cancellation policy, and confirmation code.",
    "Do not provide payment details. If a deposit is required, ask them to hold while you text the human.",
  ].join(" ");
}

type ChannelOutcome = {
  attempted: boolean;
  confirmed: boolean;
  externalReference?: string;
  detail: string;
  mode: "live" | "dry-run" | "missing-key" | "fallback" | "disabled";
};

function pathFor(restaurant: RankedRestaurant): "online" | "phone" | "none" {
  if (restaurant.reservationUrl || restaurant.website) return "online";
  if (restaurant.phone) return "phone";
  return "none";
}

function statusFromOutcomes(
  path: "online" | "phone" | "none",
  online: ChannelOutcome,
  call: ChannelOutcome,
): BookingResult["status"] {
  if (path === "online" && online.confirmed) return "confirmed";
  if (path === "phone" && call.confirmed) return "confirmed";
  if (path === "online" && online.attempted && online.mode === "dry-run") return "dry-run";
  if (path === "phone" && call.attempted && call.mode === "dry-run") return "dry-run";
  return "needs-human";
}

function buildUserMessage(
  restaurant: RankedRestaurant,
  status: BookingResult["status"],
  confirmationCode: string,
  dinerName: string,
  slotLabel: string | undefined,
): string {
  const when = slotLabel ? ` at ${slotLabel}` : "";
  if (status === "confirmed") {
    return `${restaurant.name} is confirmed for ${dinerName}${when}. Confirmation: ${confirmationCode}.`;
  }
  if (status === "dry-run") {
    return `${restaurant.name} dry-run plan ready for ${dinerName}${when}. Live booking is disabled, no real reservation made. Reference: ${confirmationCode}.`;
  }
  return `${restaurant.name} needs a human to finish booking for ${dinerName}${when}. Reference: ${confirmationCode}.`;
}

function buildEmailSubject(status: BookingResult["status"], restaurantName: string): string {
  if (status === "confirmed") return `Reservation confirmed: ${restaurantName}`;
  if (status === "dry-run") return `Reservation plan (dry-run): ${restaurantName}`;
  return `Reservation needs your attention: ${restaurantName}`;
}

function buildEmailHtml(restaurant: RankedRestaurant, status: BookingResult["status"], userMessage: string): string {
  const banner =
    status === "confirmed"
      ? `<p style="background:#d1f7e3;padding:10px;border-radius:6px;font-weight:600;">Booking confirmed</p>`
      : status === "dry-run"
        ? `<p style="background:#fff5d1;padding:10px;border-radius:6px;font-weight:600;">Dry-run plan, no reservation made</p>`
        : `<p style="background:#fde2e2;padding:10px;border-radius:6px;font-weight:600;">Action needed: human follow-up required</p>`;
  return [
    banner,
    `<p>${userMessage}</p>`,
    `<p><strong>${restaurant.name}</strong><br/>${restaurant.address}</p>`,
    restaurant.reservationUrl ? `<p><a href="${restaurant.reservationUrl}">Open booking page</a></p>` : "",
    restaurant.phone ? `<p>Restaurant phone: ${restaurant.phone}</p>` : "",
  ]
    .filter(Boolean)
    .join("");
}

export async function runBooking(request: BookingRequest): Promise<BookingResult> {
  const conversation = await readConversation(request.conversationId);
  if (!conversation) {
    throw new Error("Conversation not found. Run a search first.");
  }

  const restaurant = conversation.options.find((option) => option.id === request.restaurantId);
  if (!restaurant) {
    throw new Error("Restaurant not found in this conversation.");
  }

  const timeline: TimelineStep[] = [];
  const dinerName = request.dinerName?.trim() || "Hackathon Demo Guest";
  const path = pathFor(restaurant);
  timeline.push(
    step(
      "Selected booking path",
      "done",
      path === "online"
        ? `Will use ${restaurant.reservationUrl ?? restaurant.website} for online booking.`
        : path === "phone"
          ? `Will call ${restaurant.phone} (no online URL).`
          : `No reservation channel exists. Manual booking needed.`,
      "Orchestrator",
    ),
  );

  const onlineOutcome: ChannelOutcome = { attempted: false, confirmed: false, detail: "Not attempted.", mode: "disabled" };
  const callOutcome: ChannelOutcome = { attempted: false, confirmed: false, detail: "Not attempted.", mode: "disabled" };
  let browserSession: BrowserUseSession | undefined;

  if (path === "online") {
    const browser = await planBrowserBooking(restaurant, dinerName);
    onlineOutcome.attempted = true;
    onlineOutcome.mode = browser.mode === "live" ? "live" : browser.mode;
    onlineOutcome.confirmed = browser.ok && browser.mode === "live";
    onlineOutcome.externalReference = onlineOutcome.confirmed ? browser.data?.sessionId : undefined;
    onlineOutcome.detail = browser.message;
    if (browser.mode === "live" && browser.data) {
      browserSession = browser.data;
    }
    timeline.push(
      step(
        "Attempted online booking",
        onlineOutcome.confirmed ? "done" : browser.ok ? "skipped" : "error",
        browser.message,
        "Browser Use",
      ),
    );
  }

  if (path === "phone") {
    const call = await placeRestaurantCall(restaurant, bookingScript(request, restaurant.name));
    callOutcome.attempted = true;
    callOutcome.mode = call.mode === "live" ? "live" : call.mode;
    callOutcome.confirmed = call.ok && call.mode === "live";
    callOutcome.externalReference = callOutcome.confirmed && typeof call.data === "string" ? call.data : undefined;
    callOutcome.detail = call.message;
    timeline.push(
      step(
        "Attempted phone call",
        callOutcome.confirmed ? "done" : call.ok ? "skipped" : "error",
        call.message,
        "AgentPhone",
      ),
    );
  }

  const status = statusFromOutcomes(path, onlineOutcome, callOutcome);
  const slot = restaurant.slots.find((candidate) => candidate.available);
  const liveCode =
    onlineOutcome.externalReference ??
    callOutcome.externalReference ??
    undefined;
  const confirmationCode =
    liveCode ??
    `LOCAL-${restaurant.name.replace(/[^A-Z0-9]/gi, "").slice(0, 5).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const userMessage = buildUserMessage(restaurant, status, confirmationCode, dinerName, slot?.label);

  const email = await sendConfirmationEmail({
    to: request.userEmail,
    subject: buildEmailSubject(status, restaurant.name),
    text: userMessage,
    html: buildEmailHtml(restaurant, status, userMessage),
  });
  timeline.push(
    step(
      status === "confirmed" ? "Sent confirmation email" : "Sent status email",
      email.ok ? "done" : "error",
      email.message,
      "AgentMail",
    ),
  );

  const sms = await sendSmsConfirmation(request.userPhone, userMessage);
  timeline.push(step("Sent SMS confirmation", sms.ok ? "done" : "skipped", sms.message, "AgentPhone"));

  const memory = await addUserMemory(
    `Booking ${status}: ${restaurant.name}. Path: ${path}. Cuisine: ${restaurant.cuisine.join(", ")}. Guest: ${dinerName}.`,
    `${request.conversationId}-booking`,
  );
  timeline.push(step("Stored preference memory", memory.ok ? "done" : "error", memory.message, "Supermemory"));

  const result: BookingResult = {
    status,
    confirmationCode,
    restaurant,
    timeline,
    userMessage,
    browserUseSession: browserSession,
    emailMessage: email.data,
    smsMessage: sms.data,
  };

  await saveConversation({ ...conversation, selectedRestaurantId: restaurant.id, booking: result });
  return result;
}
