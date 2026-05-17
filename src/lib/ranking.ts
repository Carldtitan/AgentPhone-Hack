import type { AvailabilitySlot, RankedRestaurant, ReservationIntent, Restaurant } from "./types";

const STRONG_DIET_TERMS = ["vegan", "vegetarian"];

const PREF_STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "near",
  "tonight",
  "tomorrow",
  "today",
  "people",
  "person",
  "table",
  "request",
  "user",
  "parsed",
  "intent",
  "around",
  "about",
  "please",
  "find",
  "book",
  "restaurant",
  "restaurants",
  "reservation",
  "preferences",
]);

type FeatureScores = {
  cuisine: number;
  time: { score: number; bestSlot?: AvailabilitySlot };
  availability: number;
  rating: number;
  preference: { score: number; matched: string[] };
  price: number;
  distance: number;
};

function priceLevel(price: Restaurant["price"]) {
  return price.length;
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^a-z0-9$]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length > 2);
}

function timeToMinutes(input: string | undefined | null): number | null {
  if (!input) return null;
  const iso = input.match(/T(\d{2}):(\d{2})/);
  if (iso) return Number(iso[1]) * 60 + Number(iso[2]);
  const m = input.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const meridiem = m[3]?.toLowerCase();
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  return hour * 60 + minute;
}

function cuisineFit(intent: ReservationIntent, restaurant: Restaurant): number {
  const target = (intent.cuisine ?? intent.dish ?? "").trim().toLowerCase();
  if (!target) return 0.7;

  const cuisineList = restaurant.cuisine.map((c) => c.toLowerCase());
  if (cuisineList.some((c) => c === target || c.includes(target) || target.includes(c))) {
    return 1;
  }

  const tagList = restaurant.tags.map((t) => t.toLowerCase());
  if (tagList.some((t) => t.includes(target))) return 0.7;

  const softHay = [restaurant.name, ...restaurant.menuHighlights].join(" ").toLowerCase();
  if (softHay.includes(target)) return 0.5;

  const intentWords = tokenize(`${intent.cuisine ?? ""} ${intent.dish ?? ""}`);
  const fullHay = [...cuisineList, ...tagList, restaurant.name, ...restaurant.menuHighlights]
    .join(" ")
    .toLowerCase();
  if (intentWords.some((w) => !PREF_STOPWORDS.has(w) && fullHay.includes(w))) return 0.35;

  return 0.15;
}

function timeFit(intent: ReservationIntent, restaurant: Restaurant): FeatureScores["time"] {
  const target = timeToMinutes(intent.time);
  const availableSlots = restaurant.slots.filter((slot) => slot.available);
  if (availableSlots.length === 0) return { score: 0 };
  if (target === null) return { score: 0.7, bestSlot: availableSlots[0] };

  let best = availableSlots[0];
  let bestDelta = Infinity;
  for (const slot of availableSlots) {
    const minutes = timeToMinutes(slot.startTime) ?? timeToMinutes(slot.label);
    if (minutes === null) continue;
    const delta = Math.abs(minutes - target);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = slot;
    }
  }

  if (bestDelta === Infinity) return { score: 0.6, bestSlot: best };
  if (bestDelta <= 15) return { score: 1, bestSlot: best };
  if (bestDelta >= 90) return { score: 0.15, bestSlot: best };
  return { score: 1 - (bestDelta - 15) / 75, bestSlot: best };
}

function availabilityFit(restaurant: Restaurant): number {
  if (restaurant.slots.some((slot) => slot.available)) return 1;
  if (restaurant.reservationUrl) return 0.85;
  if (restaurant.phone) return 0.55;
  return 0.2;
}

function ratingFit(restaurant: Restaurant): number {
  const base = Math.max(0, Math.min(1, (restaurant.rating - 3.5) / 1.5));
  const confidence = Math.min(1, Math.log10(Math.max(1, restaurant.reviewCount)) / 3);
  return base * (0.6 + 0.4 * confidence);
}

function priceFit(intent: ReservationIntent, restaurant: Restaurant): number {
  if (intent.budgetPerPerson && restaurant.averageSpend) {
    if (restaurant.averageSpend <= intent.budgetPerPerson) return 1;
    const overage = restaurant.averageSpend - intent.budgetPerPerson;
    return Math.max(0, 1 - overage / intent.budgetPerPerson);
  }
  const cheapPref = intent.preferences.some((p) => /not too expensive|cheap|affordable|budget/i.test(p));
  if (cheapPref) {
    return [1, 0.85, 0.5, 0.2][priceLevel(restaurant.price) - 1] ?? 0.5;
  }
  if (intent.budgetPerPerson && !restaurant.averageSpend) {
    return [1, 0.9, 0.7, 0.5][priceLevel(restaurant.price) - 1] ?? 0.6;
  }
  return 0.7;
}

function distanceFit(restaurant: Restaurant): number {
  if (restaurant.distanceMiles == null) return 0.65;
  if (restaurant.distanceMiles <= 1) return 1;
  if (restaurant.distanceMiles >= 8) return 0.2;
  return 1 - ((restaurant.distanceMiles - 1) / 7) * 0.8;
}

function preferenceFit(
  intent: ReservationIntent,
  restaurant: Restaurant,
  memoryContext: string[],
): FeatureScores["preference"] {
  const haystack = [
    ...restaurant.tags,
    ...restaurant.cuisine,
    ...restaurant.menuHighlights,
    restaurant.neighborhood ?? "",
    restaurant.name,
  ]
    .join(" ")
    .toLowerCase();

  const userPrefs = intent.preferences.map((p) => p.toLowerCase()).filter(Boolean);
  const memoryTokens = Array.from(
    new Set(
      memoryContext
        .flatMap((memory) => tokenize(memory))
        .filter((token) => token.length > 4 && !PREF_STOPWORDS.has(token)),
    ),
  );

  if (userPrefs.length === 0 && memoryTokens.length === 0) {
    return { score: 0.65, matched: [] };
  }

  const userHits = userPrefs.filter((pref) => pref.split(/\s+/).every((word) => haystack.includes(word)));
  const memoryHits = memoryTokens.filter((token) => haystack.includes(token));

  const userScore = userPrefs.length ? userHits.length / userPrefs.length : 0;
  const memoryScore = memoryTokens.length
    ? Math.min(1, memoryHits.length / Math.min(memoryTokens.length, 5))
    : 0;

  const userWeight = userPrefs.length ? 0.8 : 0;
  const memoryWeight = memoryTokens.length ? (userWeight ? 0.2 : 1) : 0;

  const combined = userScore * userWeight + memoryScore * memoryWeight;
  return {
    score: Math.min(1, combined + (userHits.length || memoryHits.length ? 0.1 : 0)),
    matched: [...userHits, ...memoryHits.slice(0, 2)],
  };
}

function dietaryDisqualifies(intent: ReservationIntent, restaurant: Restaurant): boolean {
  const required = STRONG_DIET_TERMS.filter((term) => {
    const inPrefs = intent.preferences.some((pref) => pref.toLowerCase().includes(term));
    const inCuisine = (intent.cuisine ?? "").toLowerCase() === term;
    return inPrefs || inCuisine;
  });
  if (required.length === 0) return false;
  const haystack = [...restaurant.cuisine, ...restaurant.tags, ...restaurant.menuHighlights]
    .join(" ")
    .toLowerCase();
  return !required.every((term) => haystack.includes(term));
}

function dedupe(restaurants: Restaurant[]): Restaurant[] {
  const seen = new Set<string>();
  const out: Restaurant[] = [];
  for (const restaurant of restaurants) {
    const key = `${restaurant.name.toLowerCase().replace(/\s+/g, "")}|${restaurant.address
      .slice(0, 14)
      .toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(restaurant);
  }
  return out;
}

function buildReasons(
  intent: ReservationIntent,
  restaurant: Restaurant,
  features: FeatureScores,
): string[] {
  const reasons: string[] = [];
  const cuisineLabel = intent.cuisine ?? intent.dish;

  if (features.cuisine >= 0.9 && cuisineLabel) {
    reasons.push(`matches ${cuisineLabel} request`);
  } else if (features.cuisine >= 0.6 && cuisineLabel) {
    reasons.push(`tagged for ${cuisineLabel}`);
  }

  if (features.time.score >= 0.85 && features.time.bestSlot) {
    reasons.push(`${features.time.bestSlot.label} slot is close to ${intent.time}`);
  } else if (features.time.bestSlot) {
    reasons.push(`${features.time.bestSlot.label} slot available`);
  } else if (restaurant.reservationUrl) {
    reasons.push("online reservation available");
  } else if (restaurant.phone) {
    reasons.push("call to reserve");
  }

  if (features.rating >= 0.55) {
    reasons.push(
      `${restaurant.rating.toFixed(1)} stars across ${restaurant.reviewCount.toLocaleString()} reviews`,
    );
  }

  if (
    intent.budgetPerPerson &&
    restaurant.averageSpend &&
    restaurant.averageSpend <= intent.budgetPerPerson
  ) {
    reasons.push(`about $${restaurant.averageSpend}/person fits $${intent.budgetPerPerson} budget`);
  } else if (restaurant.averageSpend && restaurant.averageSpend > 10) {
    reasons.push(`about $${restaurant.averageSpend}/person`);
  }

  if (features.preference.matched.length) {
    reasons.push(`matches ${features.preference.matched.slice(0, 2).join(", ")}`);
  }

  if (reasons.length === 0) {
    reasons.push(`${restaurant.price} price band`, `${restaurant.rating.toFixed(1)} stars`);
  }

  return reasons.slice(0, 4);
}

export function rankRestaurants(
  intent: ReservationIntent,
  restaurants: Restaurant[],
  memoryContext: string[] = [],
): RankedRestaurant[] {
  const candidates = dedupe(restaurants).filter((restaurant) => !dietaryDisqualifies(intent, restaurant));
  const anyHasSlots = candidates.some((r) => r.slots.some((s) => s.available));

  return candidates
    .map((restaurant) => {
      const features: FeatureScores = {
        cuisine: cuisineFit(intent, restaurant),
        time: timeFit(intent, restaurant),
        availability: availabilityFit(restaurant),
        rating: ratingFit(restaurant),
        preference: preferenceFit(intent, restaurant, memoryContext),
        price: priceFit(intent, restaurant),
        distance: distanceFit(restaurant),
      };

      const weights = anyHasSlots
        ? { cuisine: 0.22, time: 0.18, availability: 0.12, rating: 0.14, preference: 0.12, price: 0.1, distance: 0.08 }
        : { cuisine: 0.24, time: 0, availability: 0.2, rating: 0.18, preference: 0.14, price: 0.12, distance: 0.12 };

      const score =
        features.cuisine * weights.cuisine +
        features.time.score * weights.time +
        features.availability * weights.availability +
        features.rating * weights.rating +
        features.preference.score * weights.preference +
        features.price * weights.price +
        features.distance * weights.distance;

      const bookingPlan: RankedRestaurant["bookingPlan"] = restaurant.reservationUrl
        ? "online-reservation"
        : restaurant.phone
          ? "phone-call"
          : "fallback-demo";

      return {
        ...restaurant,
        score: Math.round(score * 100),
        reasons: buildReasons(intent, restaurant, features),
        bookingPlan,
      } satisfies RankedRestaurant;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}
