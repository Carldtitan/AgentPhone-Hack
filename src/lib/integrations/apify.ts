import { getEnv } from "../env";
import { fetchJson } from "../http";
import { searchDemoRestaurants } from "../demo-data";
import { readRestaurantCache, saveRestaurantCache } from "../store";
import type { AvailabilitySlot, ReservationIntent, Restaurant, ToolResult } from "../types";

function actorPath(actorId: string) {
  return actorId.replace("/", "~");
}

function intentCacheKey(intent: ReservationIntent) {
  return [intent.location, intent.cuisine, intent.dish, intent.date, intent.partySize].filter(Boolean).join("|").toLowerCase();
}

function normalizePrice(input: unknown): Restaurant["price"] {
  const value = typeof input === "number" ? input : typeof input === "string" ? input.length : 2;
  if (value <= 1) return "$";
  if (value === 2) return "$$";
  if (value === 3) return "$$$";
  return "$$$$";
}

function normalizeSlots(item: Record<string, unknown>, fallbackDate: string): AvailabilitySlot[] {
  const slots = Array.isArray(item.slots) ? item.slots : [];
  return slots
    .map((slot, index) => {
      if (!slot || typeof slot !== "object") return null;
      const row = slot as Record<string, unknown>;
      const startTime = String(row.startTime ?? row.availableAt ?? `${fallbackDate}T19:${index}0:00`);
      return {
        startTime,
        label: startTime.includes(" ") ? startTime.split(" ").at(-1) ?? startTime : new Date(startTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
        source: "resy" as const,
        bookingUrl: typeof row.link === "string" ? row.link : undefined,
        available: row.isAvailable !== false,
      };
    })
    .filter(Boolean) as AvailabilitySlot[];
}

function mapResyItem(item: Record<string, unknown>, intent: ReservationIntent): Restaurant {
  const cuisine = Array.isArray(item.cuisine) ? item.cuisine.map(String) : [String(item.type ?? intent.cuisine ?? "Restaurant")];
  const name = String(item.name ?? "Restaurant");
  return {
    id: `resy-${String(item.id ?? name).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name,
    cuisine,
    rating: Number(item.rating ?? 4.4),
    reviewCount: Number(item.ratingCount ?? 100),
    price: normalizePrice(item.priceRange),
    averageSpend: Number(item.averageSpendAmount ?? 0) || undefined,
    address: [item.address, item.locality, item.region].filter(Boolean).join(", "),
    neighborhood: typeof item.neighborhood === "string" ? item.neighborhood : undefined,
    phone: typeof item.phone === "string" ? item.phone : undefined,
    website: typeof item.website === "string" ? item.website : undefined,
    reservationUrl: typeof item.url === "string" ? item.url : undefined,
    imageUrl: Array.isArray(item.images) ? String(item.images[0]) : undefined,
    tags: [String(item.type ?? ""), String(item.neighborhood ?? ""), "resy"].filter(Boolean),
    source: "apify-resy",
    menuHighlights: [String(item.description ?? "")].filter(Boolean).slice(0, 3),
    slots: normalizeSlots(item, intent.date),
  };
}

function mapGoogleMapsItem(item: Record<string, unknown>): Restaurant {
  const name = String(item.title ?? item.name ?? "Restaurant");
  const categories = Array.isArray(item.categories) ? item.categories.map(String) : [String(item.categoryName ?? "Restaurant")];
  return {
    id: `maps-${String(item.placeId ?? name).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name,
    cuisine: categories,
    rating: Number(item.totalScore ?? item.rating ?? 4.3),
    reviewCount: Number(item.reviewsCount ?? 50),
    price: String(item.price ?? "$$").includes("100") ? "$$$" : "$$",
    address: String(item.address ?? ""),
    neighborhood: typeof item.neighborhood === "string" ? item.neighborhood : undefined,
    phone: typeof item.phoneUnformatted === "string" ? item.phoneUnformatted : typeof item.phone === "string" ? item.phone : undefined,
    website: typeof item.website === "string" ? item.website : undefined,
    reservationUrl: typeof item.reserveTableUrl === "string" ? item.reserveTableUrl : undefined,
    imageUrl: Array.isArray(item.imageUrls) ? String(item.imageUrls[0]) : undefined,
    tags: [...categories, "google maps"].filter(Boolean),
    source: "apify-google-maps",
    menuHighlights: [String(item.menu ?? ""), String(item.description ?? "")].filter(Boolean).slice(0, 3),
    slots: [],
  };
}

async function runActor<T>(actorId: string, input: Record<string, unknown>): Promise<T[]> {
  const env = getEnv();
  const url = `${env.apifyBaseUrl}/acts/${actorPath(actorId)}/run-sync-get-dataset-items?timeout=120`;
  return fetchJson<T[]>(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.apifyToken}` },
    body: JSON.stringify(input),
    timeoutMs: 130000,
  });
}

export async function discoverRestaurants(intent: ReservationIntent): Promise<ToolResult<Restaurant[]>> {
  const env = getEnv();
  const cacheKey = intentCacheKey(intent);
  const cached = await readRestaurantCache(cacheKey);
  if (cached && cached.length >= 3) {
    return { ok: true, mode: "fallback", data: cached, message: `Loaded ${cached.length} restaurants from local cache.` };
  }

  if (!env.apifyToken || !env.allowApifyLiveRun) {
    const restaurants = searchDemoRestaurants(intent);
    await saveRestaurantCache(cacheKey, restaurants);
    return {
      ok: true,
      mode: env.apifyToken ? "dry-run" : "missing-key",
      data: restaurants,
      message: env.apifyToken
        ? "Apify key is present, but live runs are disabled to protect credits."
        : "Apify token missing; used seed restaurant data.",
    };
  }

  try {
    const city = /san francisco|sf/i.test(intent.location) ? "San Francisco" : intent.location;
    const items = await runActor<Record<string, unknown>>(env.apifyResyActor, {
      city,
      query: intent.cuisine ?? intent.dish ?? "restaurant",
      includeAvailability: true,
      date: intent.date,
      partySize: intent.partySize,
      maxItems: 10,
    });
    const restaurants = items.map((item) => mapResyItem(item, intent)).filter((restaurant) => restaurant.name);
    await saveRestaurantCache(cacheKey, restaurants);
    return { ok: true, mode: "live", data: restaurants, message: `Apify Resy actor returned ${restaurants.length} restaurants.` };
  } catch (resyError) {
    try {
      const items = await runActor<Record<string, unknown>>(env.apifyGoogleMapsActor, {
        searchStringsArray: [`${intent.cuisine ?? intent.dish ?? "restaurants"} near ${intent.location}`],
        maxCrawledPlacesPerSearch: 10,
        language: "en",
        scrapePlaceDetailPage: true,
      });
      const restaurants = items.map(mapGoogleMapsItem);
      await saveRestaurantCache(cacheKey, restaurants);
      return { ok: true, mode: "live", data: restaurants, message: `Apify Google Maps actor returned ${restaurants.length} restaurants.` };
    } catch (mapsError) {
      const restaurants = searchDemoRestaurants(intent);
      return {
        ok: false,
        mode: "fallback",
        data: restaurants,
        message: `Apify actors failed; used seed data. Resy: ${resyError instanceof Error ? resyError.message : String(resyError)}. Maps: ${mapsError instanceof Error ? mapsError.message : String(mapsError)}`,
      };
    }
  }
}

export async function probeApifyAuth(): Promise<ToolResult<string>> {
  const env = getEnv();
  if (!env.apifyToken) {
    return { ok: false, mode: "missing-key", message: "Apify token missing." };
  }

  try {
    const data = await fetchJson<{ username?: string; id?: string }>(`${env.apifyBaseUrl}/users/me`, {
      headers: { Authorization: `Bearer ${env.apifyToken}` },
      timeoutMs: 10000,
    });
    return {
      ok: true,
      mode: "live",
      data: data.username ?? data.id ?? "authenticated",
      message: "Apify auth probe succeeded without running an actor.",
    };
  } catch (error) {
    return {
      ok: false,
      mode: "fallback",
      message: `Apify auth probe failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
