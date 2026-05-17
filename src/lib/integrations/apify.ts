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
      const timeOnly = startTime.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
      const label = timeOnly
        ? new Date(`${fallbackDate}T${timeOnly[1].padStart(2, "0")}:${timeOnly[2]}:00`).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })
        : startTime.includes(" ")
          ? startTime.split(" ").at(-1) ?? startTime
          : new Date(startTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      return {
        startTime,
        label,
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
  const spend = Number(item.averageSpendAmount ?? 0);
  return {
    id: `resy-${String(item.id ?? name).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name,
    cuisine,
    rating: Number(item.rating ?? 4.4),
    reviewCount: Number(item.ratingCount ?? 100),
    price: normalizePrice(item.priceRange),
    averageSpend: spend > 10 ? spend : undefined,
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

function pickFirstString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string" && item.trim()) return item.trim();
      if (item && typeof item === "object") {
        const url = (item as { imageUrl?: unknown; url?: unknown }).imageUrl ?? (item as { url?: unknown }).url;
        if (typeof url === "string" && url.trim()) return url.trim();
      }
    }
  }
  return undefined;
}

const NON_RESERVATION_CATEGORY_PATTERNS = [
  /^cafe$/i,
  /coffee/i,
  /bakery/i,
  /donut/i,
  /\bdeli\b/i,
  /takeout/i,
  /takeaway/i,
  /food truck/i,
  /grocery/i,
  /convenience/i,
  /fast food/i,
  /\bbar\s*$/i,
  /ice cream/i,
  /juice bar/i,
  /tea (room|house|shop)/i,
  /smoothie/i,
];

function looksLikeRestaurant(categories: string[]): boolean {
  if (categories.length === 0) return false;
  const restauranty = categories.some((c) => /restaurant|bistro|izakaya|trattoria|brasserie|steakhouse|pizzeria|gastropub/i.test(c));
  if (restauranty) return true;
  const everyOneIsNonReservation = categories.every((c) =>
    NON_RESERVATION_CATEGORY_PATTERNS.some((p) => p.test(c)),
  );
  return !everyOneIsNonReservation;
}

function extractCoords(item: Record<string, unknown>): { lat?: number; lng?: number } {
  const loc = item.location && typeof item.location === "object" ? (item.location as Record<string, unknown>) : null;
  const lat = Number(loc?.lat ?? item.lat ?? item.latitude);
  const lng = Number(loc?.lng ?? loc?.lon ?? item.lng ?? item.lon ?? item.longitude);
  return {
    lat: Number.isFinite(lat) ? lat : undefined,
    lng: Number.isFinite(lng) ? lng : undefined,
  };
}

function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

function priceFromGoogle(item: Record<string, unknown>): Restaurant["price"] {
  const raw = typeof item.price === "string" ? item.price : "";
  const upper = (raw.match(/\d+/g) ?? []).map(Number).sort((a, b) => b - a)[0];
  if (Number.isFinite(upper) && upper) {
    if (upper <= 15) return "$";
    if (upper <= 35) return "$$";
    if (upper <= 70) return "$$$";
    return "$$$$";
  }
  const dollars = (raw.match(/\$/g) ?? []).length;
  if (dollars >= 4) return "$$$$";
  if (dollars === 3) return "$$$";
  if (dollars === 2) return "$$";
  if (dollars === 1) return "$";
  return "$$";
}

function extractOpeningHours(item: Record<string, unknown>): { day: string; hours: string }[] | undefined {
  const raw = item.openingHours;
  if (!Array.isArray(raw)) return undefined;
  const out: { day: string; hours: string }[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const day = String(row.day ?? "").trim();
    const hours = String(row.hours ?? row.value ?? "").trim();
    if (day && hours) out.push({ day, hours });
  }
  return out.length ? out : undefined;
}

function mapGoogleMapsItem(item: Record<string, unknown>, origin?: { lat: number; lng: number }): Restaurant {
  const name = String(item.title ?? item.name ?? "Restaurant");
  const categories = Array.isArray(item.categories) ? item.categories.map(String) : [String(item.categoryName ?? "Restaurant")];
  const price = priceFromGoogle(item);
  const imageUrl = pickFirstString(item.imageUrls) ?? pickFirstString(item.images) ?? (typeof item.imageUrl === "string" ? item.imageUrl : undefined);
  const phone = typeof item.phoneUnformatted === "string" ? item.phoneUnformatted : typeof item.phone === "string" ? item.phone : undefined;
  const reservationUrl = typeof item.reserveTableUrl === "string" ? item.reserveTableUrl : typeof item.bookingLinks === "object" && item.bookingLinks ? pickFirstString((item.bookingLinks as Record<string, unknown>).links) : undefined;
  const description = typeof item.description === "string" ? item.description : "";
  const coords = extractCoords(item);
  const distanceMiles =
    origin && coords.lat != null && coords.lng != null
      ? Number(haversineMiles(origin, { lat: coords.lat, lng: coords.lng }).toFixed(2))
      : undefined;
  return {
    id: `maps-${String(item.placeId ?? name).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name,
    cuisine: categories,
    rating: Number(item.totalScore ?? item.rating ?? 4.3),
    reviewCount: Number(item.reviewsCount ?? 50),
    price,
    address: String(item.address ?? ""),
    neighborhood: typeof item.neighborhood === "string" ? item.neighborhood : undefined,
    distanceMiles,
    phone,
    website: typeof item.website === "string" ? item.website : undefined,
    reservationUrl,
    imageUrl,
    tags: [...categories, "google maps"].filter(Boolean),
    source: "apify-google-maps",
    menuHighlights: description ? [description] : [],
    slots: [],
    openingHours: extractOpeningHours(item),
  };
}

function originForLocation(location: string): { lat: number; lng: number } | undefined {
  const lower = location.toLowerCase();
  if (lower.includes("560 20th") || lower.includes("ycombinator") || lower.includes("y combinator")) {
    return { lat: 37.760374, lng: -122.40825 };
  }
  if (lower.includes("san francisco") || lower.includes("sf,") || /\bsf\b/.test(lower)) {
    return { lat: 37.7749, lng: -122.4194 };
  }
  return undefined;
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

let resyDisabledUntil = 0;
const RESY_FAILURE_COOLDOWN_MS = 30 * 60 * 1000;

export async function discoverRestaurants(intent: ReservationIntent): Promise<ToolResult<Restaurant[]>> {
  const env = getEnv();
  const cacheKey = intentCacheKey(intent);
  const cached = await readRestaurantCache(cacheKey);
  const cacheHasLiveData = cached?.some((restaurant) => restaurant.source !== "demo");
  if (cached && cached.length >= 3 && (!env.allowApifyLiveRun || cacheHasLiveData)) {
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

  const skipResy = Date.now() < resyDisabledUntil;
  let resyMessage = skipResy ? "Resy actor disabled after recent failure (cooldown active)." : "";

  if (!skipResy) {
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
      if (restaurants.length === 0) throw new Error("Resy actor returned 0 items.");
      await saveRestaurantCache(cacheKey, restaurants);
      return { ok: true, mode: "live", data: restaurants, message: `Apify Resy actor returned ${restaurants.length} restaurants.` };
    } catch (resyError) {
      resyMessage = resyError instanceof Error ? resyError.message : String(resyError);
      resyDisabledUntil = Date.now() + RESY_FAILURE_COOLDOWN_MS;
    }
  }

  try {
    const items = await runActor<Record<string, unknown>>(env.apifyGoogleMapsActor, {
      searchStringsArray: [`${intent.cuisine ?? intent.dish ?? "restaurants"} near ${intent.location}`],
      maxCrawledPlacesPerSearch: 15,
      language: "en",
      scrapePlaceDetailPage: true,
    });
    const origin = originForLocation(intent.location);
    const allMapped = items.map((item) => mapGoogleMapsItem(item, origin));
    const restaurants = allMapped.filter((restaurant) => looksLikeRestaurant(restaurant.cuisine));
    const final = restaurants.length >= 3 ? restaurants : allMapped;
    await saveRestaurantCache(cacheKey, final);
    return {
      ok: true,
      mode: "live",
      data: final,
      message: `${resyMessage ? `Resy unavailable (${resyMessage.slice(0, 120)}); ` : ""}Apify Google Maps returned ${final.length} restaurants${restaurants.length < allMapped.length ? ` (filtered ${allMapped.length - restaurants.length} non-reservation places)` : ""}.`,
    };
  } catch (mapsError) {
    const restaurants = searchDemoRestaurants(intent);
    return {
      ok: false,
      mode: "fallback",
      data: restaurants,
      message: `Apify actors failed; used seed data. Resy: ${resyMessage}. Maps: ${mapsError instanceof Error ? mapsError.message : String(mapsError)}`,
    };
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
