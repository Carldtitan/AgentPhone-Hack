import { describe, expect, it } from "vitest";
import { parseIntentDeterministic } from "./intent";
import { searchDemoRestaurants, demoRestaurants } from "./demo-data";
import { rankRestaurants } from "./ranking";
import type { Restaurant } from "./types";

describe("intent parser", () => {
  it("parses a hackathon dinner request", () => {
    const intent = parseIntentDeterministic("Book Italian near REDACTED for 3 tonight at 7:30pm under $80");
    expect(intent.cuisine).toBe("italian");
    expect(intent.partySize).toBe(3);
    expect(intent.budgetPerPerson).toBe(80);
    expect(intent.time).toBe("7:30 PM");
  });

  it("captures table-for-N and around-budget patterns", () => {
    const intent = parseIntentDeterministic("Sushi table for 4 around $90 with patio for an anniversary");
    expect(intent.partySize).toBe(4);
    expect(intent.budgetPerPerson).toBe(90);
    expect(intent.preferences).toContain("outdoor seating");
    expect(intent.preferences).toContain("date-night");
  });
});

describe("reservation ranking", () => {
  it("returns ranked demo restaurants with booking plans", () => {
    const intent = parseIntentDeterministic("Find Italian for 3 near YC tonight at 7:30pm");
    const ranked = rankRestaurants(intent, searchDemoRestaurants(intent));
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked[0].score).toBeGreaterThan(50);
    expect(["online-reservation", "phone-call", "fallback-demo"]).toContain(ranked[0].bookingPlan);
  });

  it("prefers cuisine matches over higher-rated unrelated places", () => {
    const intent = parseIntentDeterministic("Italian dinner for 2 tonight at 7:30pm");
    const ranked = rankRestaurants(intent, demoRestaurants);
    expect(ranked[0].cuisine.map((c) => c.toLowerCase())).toContain("italian");
  });

  it("prefers slots closer to the requested time", () => {
    const intent = parseIntentDeterministic("Italian for 2 tonight at 7:15pm");
    const ranked = rankRestaurants(intent, demoRestaurants);
    const top = ranked.find((r) => r.cuisine.map((c) => c.toLowerCase()).includes("italian"));
    expect(top?.reasons.join(" ")).toMatch(/7:15/);
  });

  it("hard-filters non-vegan options when intent is vegan", () => {
    const intent = parseIntentDeterministic("Vegan dinner for 2 tonight at 7pm");
    const ranked = rankRestaurants(intent, demoRestaurants);
    expect(ranked.length).toBeGreaterThan(0);
    for (const r of ranked) {
      const haystack = [...r.cuisine, ...r.tags, ...r.menuHighlights].join(" ").toLowerCase();
      expect(haystack).toContain("vegan");
    }
  });

  it("dedupes restaurants with the same name and address prefix", () => {
    const intent = parseIntentDeterministic("Italian for 2 tonight at 7:30pm");
    const dup: Restaurant = { ...demoRestaurants[0], id: "dup-flour-water" };
    const ranked = rankRestaurants(intent, [...demoRestaurants, dup]);
    const flourCount = ranked.filter((r) => r.name === demoRestaurants[0].name).length;
    expect(flourCount).toBe(1);
  });

  it("rewards restaurants that match user preferences", () => {
    const intent = parseIntentDeterministic("Quiet waterfront dinner for 2 tonight at 7pm");
    const ranked = rankRestaurants(intent, demoRestaurants);
    const greens = ranked.find((r) => r.name === "Greens Restaurant");
    expect(greens).toBeTruthy();
    expect(greens!.reasons.join(" ").toLowerCase()).toMatch(/quiet|waterfront/);
  });
});
