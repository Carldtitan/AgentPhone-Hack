import type { RankedRestaurant, ReservationIntent, Restaurant } from "./types";

function priceToNumber(price: Restaurant["price"]) {
  return price.length;
}

function budgetFit(intent: ReservationIntent, restaurant: Restaurant) {
  if (!intent.budgetPerPerson || !restaurant.averageSpend) return 0.7;
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

export function rankRestaurants(intent: ReservationIntent, restaurants: Restaurant[]): RankedRestaurant[] {
  return restaurants
    .map((restaurant) => {
      const availability = restaurant.slots.some((slot) => slot.available) ? 1 : restaurant.phone ? 0.55 : 0.25;
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

      const reasons = [
        `${restaurant.rating.toFixed(1)} rating across ${restaurant.reviewCount.toLocaleString()} reviews`,
        restaurant.slots.length > 0 ? `${restaurant.slots[0].label} slot found` : "phone reservation fallback available",
        restaurant.averageSpend ? `about $${restaurant.averageSpend}/person` : `${restaurant.price} price band`,
      ];

      return {
        ...restaurant,
        score: Math.round(score * 100),
        reasons,
        bookingPlan: restaurant.reservationUrl
          ? "online-reservation"
          : restaurant.phone
            ? "phone-call"
            : "fallback-demo",
      } satisfies RankedRestaurant;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}
