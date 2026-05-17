import { describe, expect, it } from "vitest";
import { runBooking, runRestaurantSearch } from "./orchestrator";

describe("orchestrator", () => {
  it("runs a safe end-to-end demo booking flow", async () => {
    const search = await runRestaurantSearch("Find sushi near REDACTED for 2 tonight at 8pm");
    expect(search.options.length).toBeGreaterThan(0);

    const booking = await runBooking({
      conversationId: search.conversationId,
      restaurantId: search.options[0].id,
      dinerName: "Test Guest",
    });

    expect(booking.confirmationCode).toMatch(/^LOCAL-/);
    expect(booking.timeline.length).toBeGreaterThan(1);
  });
});
