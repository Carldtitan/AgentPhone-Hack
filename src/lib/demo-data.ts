import type { ReservationIntent, Restaurant } from "./types";

export const demoRestaurants: Restaurant[] = [
  {
    id: "demo-flour-water",
    name: "Flour + Water",
    cuisine: ["Italian", "Pasta"],
    rating: 4.6,
    reviewCount: 2450,
    price: "$$$",
    averageSpend: 68,
    address: "REDACTED, San Francisco, CA",
    neighborhood: "Mission",
    distanceMiles: 1.8,
    phone: "REDACTED",
    website: "https://www.flourandwater.com/",
    reservationUrl: "https://resy.com/cities/san-francisco-ca/venues/flour-water",
    imageUrl: "https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=1200&q=80",
    tags: ["housemade pasta", "date-night", "popular"],
    source: "demo",
    menuHighlights: ["corn raviolini", "burrata", "seasonal pasta tasting"],
    slots: [
      { startTime: "2026-05-17T19:15:00-07:00", label: "7:15 PM", source: "demo", available: true },
      { startTime: "2026-05-17T20:00:00-07:00", label: "8:00 PM", source: "demo", available: true },
    ],
  },
  {
    id: "demo-omens",
    name: "Robin",
    cuisine: ["Japanese", "Sushi", "Omakase"],
    rating: 4.7,
    reviewCount: 1150,
    price: "$$$$",
    averageSpend: 145,
    address: "REDACTED, San Francisco, CA",
    neighborhood: "Hayes Valley",
    distanceMiles: 2.4,
    phone: "REDACTED",
    website: "https://robinsanfrancisco.com/",
    reservationUrl: "https://resy.com/cities/san-francisco-ca/venues/robin",
    imageUrl: "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=1200&q=80",
    tags: ["omakase", "counter seating", "special occasion"],
    source: "demo",
    menuHighlights: ["seasonal nigiri", "uni", "wagyu supplement"],
    slots: [{ startTime: "2026-05-17T20:30:00-07:00", label: "8:30 PM", source: "demo", available: true }],
  },
  {
    id: "demo-izakaya-kou",
    name: "Izakaya KOU",
    cuisine: ["Japanese", "Izakaya", "Ramen"],
    rating: 4.5,
    reviewCount: 1320,
    price: "$$",
    averageSpend: 42,
    address: "REDACTED, San Francisco, CA",
    neighborhood: "Japantown",
    distanceMiles: 3.0,
    phone: "REDACTED",
    website: "https://www.izakayakou.com/",
    imageUrl: "https://images.unsplash.com/photo-1617196034796-73dfa7b1fd56?auto=format&fit=crop&w=1200&q=80",
    tags: ["casual", "skewers", "walk-in friendly"],
    source: "demo",
    menuHighlights: ["yakitori", "karaage", "black garlic ramen"],
    slots: [],
  },
  {
    id: "demo-state-bird",
    name: "State Bird Provisions",
    cuisine: ["American", "Californian"],
    rating: 4.7,
    reviewCount: 3100,
    price: "$$$",
    averageSpend: 95,
    address: "REDACTED, San Francisco, CA",
    neighborhood: "Western Addition",
    distanceMiles: 3.1,
    phone: "REDACTED",
    website: "https://statebirdsf.com/",
    reservationUrl: "https://resy.com/cities/san-francisco-ca/venues/state-bird-provisions",
    imageUrl: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80",
    tags: ["small plates", "award-winning", "lively"],
    source: "demo",
    menuHighlights: ["state bird with provisions", "seasonal carts", "creative small plates"],
    slots: [{ startTime: "2026-05-17T21:15:00-07:00", label: "9:15 PM", source: "demo", available: true }],
  },
  {
    id: "demo-tropisueno",
    name: "Tropisueno",
    cuisine: ["Mexican"],
    rating: 4.3,
    reviewCount: 2200,
    price: "$$",
    averageSpend: 38,
    address: "REDACTED, San Francisco, CA",
    neighborhood: "SoMa",
    distanceMiles: 0.9,
    phone: "REDACTED",
    website: "https://www.tropisueno.com/",
    imageUrl: "https://images.unsplash.com/photo-1613514785940-daed07799d9b?auto=format&fit=crop&w=1200&q=80",
    tags: ["margaritas", "group-friendly", "near YC"],
    source: "demo",
    menuHighlights: ["al pastor tacos", "mole poblano", "mezcal margarita"],
    slots: [
      { startTime: "2026-05-17T19:30:00-07:00", label: "7:30 PM", source: "demo", available: true },
      { startTime: "2026-05-17T20:15:00-07:00", label: "8:15 PM", source: "demo", available: true },
    ],
  },
  {
    id: "demo-greens",
    name: "Greens Restaurant",
    cuisine: ["Vegetarian", "Vegan", "Californian"],
    rating: 4.5,
    reviewCount: 1800,
    price: "$$$",
    averageSpend: 58,
    address: "REDACTED, San Francisco, CA",
    neighborhood: "Marina",
    distanceMiles: 4.8,
    phone: "REDACTED",
    website: "https://greensrestaurant.com/",
    reservationUrl: "https://www.opentable.com/greens-restaurant",
    imageUrl: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=1200&q=80",
    tags: ["vegetarian", "waterfront", "quiet"],
    source: "demo",
    menuHighlights: ["spring risotto", "grilled broccolini", "vegan tasting menu"],
    slots: [{ startTime: "2026-05-17T18:45:00-07:00", label: "6:45 PM", source: "demo", available: true }],
  },
  {
    id: "demo-test-bistro",
    name: "Demo Test Bistro",
    cuisine: ["Italian", "Test"],
    rating: 4.5,
    reviewCount: 12,
    price: "$$",
    averageSpend: 45,
    address: "REDACTED, San Francisco, CA",
    neighborhood: "Dogpatch",
    distanceMiles: 0.05,
    phone: "REDACTED",
    website: "https://example.com/demo-test-bistro",
    imageUrl: "https://images.unsplash.com/photo-REDACTEDa2e8c0?auto=format&fit=crop&w=1200&q=80",
    tags: ["phone-only-booking", "demo-test", "italian"],
    source: "demo",
    menuHighlights: ["agent test target", "phone reservation only"],
    slots: [],
  },
];

const SEARCH_STOPWORDS = new Set([
  "tonight",
  "tomorrow",
  "today",
  "people",
  "person",
  "table",
  "around",
  "about",
  "please",
  "find",
  "book",
  "near",
  "with",
  "restaurant",
  "restaurants",
  "reservation",
  "dinner",
  "lunch",
  "team",
  "guest",
  "guests",
  "under",
  "below",
]);

export function searchDemoRestaurants(intent: ReservationIntent) {
  const cuisine = intent.cuisine?.toLowerCase();
  const dish = intent.dish?.toLowerCase();
  const matches = demoRestaurants.filter((restaurant) => {
    const haystack = [restaurant.name, ...restaurant.cuisine, ...restaurant.tags, ...restaurant.menuHighlights]
      .join(" ")
      .toLowerCase();
    if (!cuisine && !dish) return true;
    if (cuisine && haystack.includes(cuisine)) return true;
    if (dish && haystack.includes(dish)) return true;
    const tokens = `${intent.raw} ${cuisine ?? ""} ${dish ?? ""}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 4 && !SEARCH_STOPWORDS.has(word));
    return tokens.some((word) => haystack.includes(word));
  });

  if (matches.length >= 3) return matches;

  const seen = new Set(matches.map((restaurant) => restaurant.id));
  return [...matches, ...demoRestaurants.filter((restaurant) => !seen.has(restaurant.id))].slice(0, 5);
}
