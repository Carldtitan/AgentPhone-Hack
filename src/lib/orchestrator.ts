import { getIntegrationStatuses } from "./env";
import { parseIntent } from "./intent";
import { rankRestaurants } from "./ranking";
import { saveConversation, readConversation } from "./store";
import { discoverRestaurants } from "./integrations/apify";
import { enrichReservationPath, planBrowserBooking } from "./integrations/browser-use";
import { sendConfirmationEmail } from "./integrations/agentmail";
import { addUserMemory, searchUserMemory } from "./integrations/supermemory";
import type { BookingRequest, BookingResult, SearchResponse, TimelineStep } from "./types";

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

  const ranked = rankRestaurants(intent, discovered.data ?? []);
  const enriched = await Promise.all(ranked.slice(0, 3).map((restaurant) => enrichReservationPath(restaurant)));
  enriched.forEach((result, index) => {
    timeline.push(step(`Checked booking path ${index + 1}`, result.ok ? "done" : "error", result.message, "Browser Use"));
  });

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

  const browserPlan = restaurant.reservationUrl || restaurant.website ? await planBrowserBooking(restaurant, dinerName) : null;
  if (browserPlan) {
    timeline.push(step("Prepared online booking", browserPlan.ok ? "done" : "error", browserPlan.message, "Browser Use"));
  } else {
    timeline.push(step("Prepared online booking", "skipped", "No online reservation URL was available for Browser Use.", "Browser Use"));
  }

  timeline.push(step("Phone calling", "skipped", "Phone calling is disabled for this run.", "AgentPhone"));

  const slot = restaurant.slots.find((candidate) => candidate.available);
  const liveWorkflowStarted = browserPlan?.mode === "live";
  const confirmationCode = `${liveWorkflowStarted ? "RUN" : "DEMO"}-${restaurant.name.replace(/[^A-Z0-9]/gi, "").slice(0, 5).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const userMessage = liveWorkflowStarted
    ? `${restaurant.name} live workflow started for ${dinerName}${slot ? ` near ${slot.label}` : ""}. Run id: ${confirmationCode}.`
    : `${restaurant.name} is ready for ${dinerName}${slot ? ` at ${slot.label}` : ""}. Confirmation: ${confirmationCode}.`;

  const email = await sendConfirmationEmail({
    to: request.userEmail,
    subject: `Reservation plan: ${restaurant.name}`,
    text: userMessage,
    html: `<p>${userMessage}</p><p>${restaurant.address}</p><p>${restaurant.website ?? ""}</p>`,
  });
  timeline.push(step("Sent confirmation email", email.ok ? "done" : "error", email.message, "AgentMail"));

  timeline.push(step("SMS confirmation", "skipped", "SMS is disabled while phone calling is excluded.", "AgentPhone"));

  const memory = await addUserMemory(`Booked/planned restaurant: ${restaurant.name}. Cuisine: ${restaurant.cuisine.join(", ")}. Guest: ${dinerName}.`, `${request.conversationId}-booking`);
  timeline.push(step("Stored preference memory", memory.ok ? "done" : "error", memory.message, "Supermemory"));

  const result: BookingResult = {
    status: liveWorkflowStarted ? "held" : restaurant.reservationUrl ? "dry-run" : "needs-human",
    confirmationCode,
    restaurant,
    timeline,
    userMessage,
    browserUseSession: browserPlan?.mode === "live" ? browserPlan.data : undefined,
    emailMessage: email.data,
  };

  await saveConversation({ ...conversation, selectedRestaurantId: restaurant.id, booking: result });
  return result;
}
