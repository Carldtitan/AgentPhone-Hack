export type IntegrationMode = "live" | "dry-run" | "fallback" | "missing-key" | "disabled";

export type IntegrationStatus = {
  id: string;
  label: string;
  keyPresent: boolean;
  mode: IntegrationMode;
  liveEnabled: boolean;
  message: string;
};

export type ReservationIntent = {
  raw: string;
  cuisine?: string;
  dish?: string;
  location: string;
  date: string;
  time: string;
  partySize: number;
  budgetPerPerson?: number;
  preferences: string[];
};

export type AvailabilitySlot = {
  startTime: string;
  label: string;
  source: "resy" | "opentable" | "restaurant" | "demo" | "browser-use";
  bookingUrl?: string;
  available: boolean;
};

export type Restaurant = {
  id: string;
  name: string;
  cuisine: string[];
  rating: number;
  reviewCount: number;
  price: "$" | "$$" | "$$$" | "$$$$";
  averageSpend?: number;
  address: string;
  neighborhood?: string;
  distanceMiles?: number;
  phone?: string;
  website?: string;
  reservationUrl?: string;
  imageUrl?: string;
  tags: string[];
  source: "demo" | "apify-google-maps" | "apify-resy" | "apify-opentable" | "yelp";
  menuHighlights: string[];
  slots: AvailabilitySlot[];
  openingHours?: OpeningHours[];
  bookabilityChecked?: boolean;
};

export type OpeningHours = {
  day: string;
  hours: string;
};

export type RankedRestaurant = Restaurant & {
  score: number;
  reasons: string[];
  bookingPlan: "online-reservation" | "phone-call" | "email-confirmation" | "fallback-demo";
};

export type TimelineStep = {
  id: string;
  label: string;
  status: "done" | "skipped" | "planned" | "error";
  detail: string;
  source?: string;
};

export type SearchResponse = {
  conversationId: string;
  intent: ReservationIntent;
  options: RankedRestaurant[];
  timeline: TimelineStep[];
  integrations: IntegrationStatus[];
  memoryContext: string[];
  generatedAt: string;
};

export type BookingRequest = {
  conversationId: string;
  restaurantId: string;
  dinerName?: string;
  userEmail?: string;
  userPhone?: string;
};

export type BookingResult = {
  status: "confirmed" | "held" | "dry-run" | "needs-human";
  confirmationCode: string;
  restaurant: RankedRestaurant;
  timeline: TimelineStep[];
  userMessage: string;
  browserUseSession?: BrowserUseSession;
  emailMessage?: string;
  smsMessage?: string;
};

export type BrowserUseSession = {
  sessionId: string;
  liveUrl?: string;
  status?: string;
  message: string;
};

export type StoredConversation = SearchResponse & {
  selectedRestaurantId?: string;
  booking?: BookingResult;
};

export type ToolResult<T> = {
  ok: boolean;
  mode: IntegrationMode;
  data?: T;
  message: string;
};
