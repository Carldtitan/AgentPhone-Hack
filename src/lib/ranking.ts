import type { RankedRestaurant, ReservationIntent, Restaurant } from "./types";

function priceToNumber(price: Restaurant["price"]) {
  return price.length;
}

function budgetFit(intent: ReservationIntent, restaurant: Restaurant) {
  if (!intent.budgetPerPerson || !restaurant.averageSpend || restaurant.averageSpend <= 10) return 0.7;
  if (restaurant.averageSpend <= intent.budgetPerPerson) return 1;
  const overage = restaurant.averageSpend - intent.budgetPerPerson;
  return Math.max(0, 1 - overage / intent.budgetPerPerson);
}

function cuisineMatch(intent: ReservationIntent, restaurant: Restaurant) {
  const target = `${intent.cuisine ?? ""} ${intent.dish ?? ""}`.toLowerCase();
  if (!target.trim()) return 0.75;
  const haystack = [restaurant.name, ...restaurant.cuisine, ...restaurant.tags, ...restaurant.menuHighlights].join(" ").toLowerCase();
  return target
    .split(/\s+/)
    .filter((word) => word.length > 3)
    .some((word) => haystack.includes(word))
    ? 1
    : 0.25;
}

function preferenceMatch(intent: ReservationIntent, restaurant: Restaurant) {
  if (intent.preferences.length === 0) return 0.7;
  const haystack = restaurant.tags.join(" ").toLowerCase();
  const hits = intent.preferences.filter((pref) => haystack.includes(pref.toLowerCase())).length;
  return Math.min(1, hits / intent.preferences.length + 0.25);
}

function timeToMinutes(value: string) {
  const match = value.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  const suffix = match[3]?.toLowerCase();
  if (suffix === "pm" && hours < 12) hours += 12;
  if (suffix === "am" && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function displayTime(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return value;
  let hours = Number(match[1]);
  const suffix = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${hours}:${match[2]} ${suffix}`;
}

function availabilityMatch(intent: ReservationIntent, restaurant: Restaurant) {
  const requested = timeToMinutes(intent.time);
  const availableSlots = restaurant.slots.filter((slot) => slot.available);
  if (availableSlots.length === 0) return restaurant.reservationUrl || restaurant.website ? 0.55 : 0.25;
  if (requested === null) return 1;

  const bestDelta = Math.min(
    ...availableSlots.map((slot) => {
      const slotMinutes = timeToMinutes(slot.label) ?? timeToMinutes(slot.startTime) ?? requested;
      return Math.abs(slotMinutes - requested);
    }),
  );

  if (bestDelta <= 30) return 1;
  if (bestDelta <= 60) return 0.85;
  if (bestDelta <= 120) return 0.65;
  return 0.4;
}

export function rankRestaurants(intent: ReservationIntent, restaurants: Restaurant[]): RankedRestaurant[] {
  return restaurants
    .map((restaurant) => {
      const availability = availabilityMatch(intent, restaurant);
      const rating = Math.min(1, restaurant.rating / 5);
      const distance = restaurant.distanceMiles ? Math.max(0.25, 1 - restaurant.distanceMiles / 8) : 0.65;
      const price = Math.max(0.25, 1 - (priceToNumber(restaurant.price) - 1) * 0.18);
      const score =
        cuisineMatch(intent, restaurant) * 0.28 +
        availability * 0.24 +
        rating * 0.18 +
        budgetFit(intent, restaurant) * 0.12 +
        distance * 0.1 +
        preferenceMatch(intent, restaurant) * 0.08;

      const displaySpend = restaurant.averageSpend && restaurant.averageSpend > 10 ? `about $${restaurant.averageSpend}/person` : `${restaurant.price} price band`;
      const reasons = [
        `${restaurant.rating.toFixed(1)} rating across ${restaurant.reviewCount.toLocaleString()} reviews`,
        restaurant.slots.length > 0
          ? `${displayTime(restaurant.slots[0].label)} slot found`
          : restaurant.reservationUrl || restaurant.website
            ? "website booking path available"
            : "manual review may be needed",
        displaySpend,
      ];

      return {
        ...restaurant,
        score: Math.round(score * 100),
        reasons,
        bookingPlan: restaurant.reservationUrl || restaurant.website ? "online-reservation" : "fallback-demo",
      } satisfies RankedRestaurant;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}
