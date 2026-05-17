import { describe, expect, it } from "vitest";
import { parseIntentDeterministic } from "./intent";
import { searchDemoRestaurants } from "./demo-data";
import { rankRestaurants } from "./ranking";

describe("reservation ranking", () => {
  it("parses a hackathon dinner request", () => {
    const intent = parseIntentDeterministic("Book Italian near REDACTED for 3 tonight at 7:30pm under $80");
    expect(intent.cuisine).toBe("italian");
    expect(intent.partySize).toBe(3);
    expect(intent.budgetPerPerson).toBe(80);
    expect(intent.time).toBe("7:30 PM");
  });

  it("returns ranked demo restaurants with booking plans", () => {
    const intent = parseIntentDeterministic("Find Italian for 3 near YC tonight at 7:30pm");
    const ranked = rankRestaurants(intent, searchDemoRestaurants(intent));
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked[0].score).toBeGreaterThan(50);
    expect(["online-reservation", "phone-call", "fallback-demo"]).toContain(ranked[0].bookingPlan);
  });
});
