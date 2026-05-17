"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BrainCircuit,
  Calendar,
  CheckCircle2,
  Database,
  Globe2,
  Loader2,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  Sparkles,
  Utensils,
  Users,
} from "lucide-react";
import type { BookingResult, IntegrationStatus, RankedRestaurant, SearchResponse } from "@/lib/types";

type HealthResponse = {
  demoMode: boolean;
  generatedAt: string;
  integrations: IntegrationStatus[];
  safety: Record<string, boolean>;
};

const samplePrompt =
  "Find and book Italian near REDACTED in San Francisco for 3 people tonight around 7:30pm, not too expensive, good for a team dinner.";

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Request failed");
  return data as T;
}

function modeLabel(status: IntegrationStatus) {
  if (status.mode === "live") return "live";
  if (status.mode === "missing-key") return "missing";
  if (status.mode === "disabled") return "off";
  return "safe";
}

function formatSlotLabel(value: string | undefined, restaurant?: { reservationUrl?: string; phone?: string }) {
  if (value) {
    const timeOnly = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!timeOnly) return value;
    let hours = Number(timeOnly[1]);
    const suffix = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    return `${hours}:${timeOnly[2]} ${suffix}`;
  }
  if (restaurant?.reservationUrl) return "online booking";
  if (restaurant?.phone) return "call to reserve";
  return "website";
}

function iconFor(id: string) {
  if (id === "apify") return <Database size={16} />;
  if (id === "browser-use") return <Globe2 size={16} />;
  if (id === "agentphone") return <Phone size={16} />;
  if (id === "agentmail") return <Mail size={16} />;
  if (id === "supermemory") return <BrainCircuit size={16} />;
  return <Sparkles size={16} />;
}

export function ReservationAgent() {
  const [prompt, setPrompt] = useState(samplePrompt);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [booking, setBooking] = useState<BookingResult | null>(null);
  const [dinerName, setDinerName] = useState("Hackathon Demo Guest");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState<"search" | "book" | "ingest" | "health" | "verify" | "stop-browser" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => searchResult?.options.find((option) => option.id === selectedId) ?? searchResult?.options[0],
    [searchResult, selectedId],
  );

  const trace = [...(searchResult?.timeline ?? []), ...(booking?.timeline ?? [])];

  async function refreshHealth(live = false) {
    setLoading("health");
    setError(null);
    try {
      const response = await fetch(`/api/health${live ? "?live=1" : ""}`);
      setHealth((await response.json()) as HealthResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Health check failed");
    } finally {
      setLoading(null);
    }
  }

  async function runSearch() {
    setLoading("search");
    setError(null);
    setBooking(null);
    try {
      const result = await postJson<SearchResponse>("/api/search", { message: prompt });
      setSearchResult(result);
      setSelectedId(result.options[0]?.id ?? null);
      setHealth((current) => current ?? { demoMode: false, generatedAt: result.generatedAt, integrations: result.integrations, safety: {} });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(null);
    }
  }

  async function runIngest() {
    setLoading("ingest");
    setError(null);
    try {
      await postJson("/api/ingest", { query: prompt });
      await runSearch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ingestion failed");
      setLoading(null);
    }
  }

  async function runBooking() {
    if (!searchResult || !selected) return;
    setLoading("book");
    setError(null);
    try {
      const result = await postJson<BookingResult>("/api/book", {
        conversationId: searchResult.conversationId,
        restaurantId: selected.id,
        dinerName,
        userEmail: email,
        userPhone: phone,
      });
      setBooking(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Booking failed");
    } finally {
      setLoading(null);
    }
  }

  async function stopBrowserSession() {
    const sessionId = booking?.browserUseSession?.sessionId;
    if (!sessionId) return;
    setLoading("stop-browser");
    setError(null);
    try {
      await postJson("/api/browser-use/stop", { sessionId });
      setBooking((current) =>
        current
          ? {
              ...current,
              browserUseSession: current.browserUseSession
                ? { ...current.browserUseSession, status: "stopped", message: "Browser Use session stopped." }
                : undefined,
            }
          : current,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not stop Browser Use session");
    } finally {
      setLoading(null);
    }
  }

  async function runVerify() {
    if (!searchResult || !selected) return;
    setLoading("verify");
    setError(null);
    try {
      const result = await postJson<{ restaurant: RankedRestaurant; timelineStep: SearchResponse["timeline"][number] }>(
        "/api/verify",
        {
          conversationId: searchResult.conversationId,
          restaurantId: selected.id,
        },
      );
      setSearchResult((current) => {
        if (!current) return current;
        const options = current.options
          .map((option) => (option.id === result.restaurant.id ? result.restaurant : option))
          .sort((a, b) => b.score - a.score);
        return { ...current, options, timeline: [...current.timeline, result.timelineStep] };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(null);
    }
  }

  useEffect(() => {
    refreshHealth();
  }, []);

  return (
    <main className="app-shell">
      <div className="app-frame">
        <header className="topbar">
          <div className="brand">
            <div className="brand-mark">
              <Utensils size={22} />
            </div>
            <div>
              <p className="eyebrow">Restaurant reservation agent</p>
              <h1>Table Agent</h1>
            </div>
          </div>
          <div className="top-actions">
            <span className="live-note">Phone calls disabled. Browser Use runs live.</span>
            <button className="secondary-button" type="button" onClick={() => refreshHealth(true)} disabled={loading === "health"}>
              {loading === "health" ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
              Check tools
            </button>
          </div>
        </header>

        <section className="tool-strip" aria-label="Tool status">
          {(health?.integrations ?? []).map((integration) => (
            <div className="tool-pill" key={integration.id} title={integration.message}>
              {iconFor(integration.id)}
              <span>{integration.label}</span>
              <b className={`mode mode-${modeLabel(integration)}`}>{modeLabel(integration)}</b>
            </div>
          ))}
        </section>

        <section className="request-card">
          <div className="request-header">
            <div>
              <p className="eyebrow">Request</p>
              <h2>Find a restaurant and run the booking flow.</h2>
            </div>
            <div className="quick-facts">
              <span>
                <MapPin size={15} /> SF
              </span>
              <span>
                <Users size={15} /> Party
              </span>
              <span>
                <Calendar size={15} /> Time
              </span>
            </div>
          </div>
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} aria-label="Restaurant request" />
          <div className="button-row">
            <button className="secondary-button" type="button" onClick={runIngest} disabled={loading !== null}>
              {loading === "ingest" ? <Loader2 className="spin" size={18} /> : <Database size={18} />}
              Refresh data
            </button>
            <button className="primary-button" type="button" onClick={runSearch} disabled={loading !== null}>
              {loading === "search" ? <Loader2 className="spin" size={18} /> : <Search size={18} />}
              Find tables
            </button>
          </div>
        </section>

        {error ? (
          <div className="error-bar">
            <AlertTriangle size={18} />
            {error}
          </div>
        ) : null}

        <section className="work-grid">
          <section className="panel" aria-label="Restaurant options">
            <div className="section-title">
              <h3>Options</h3>
              <span>{searchResult ? `${searchResult.options.length} found` : "waiting"}</span>
            </div>
            <div className="restaurant-list">
              {(searchResult?.options ?? []).map((restaurant) => (
                <RestaurantOption
                  key={restaurant.id}
                  restaurant={restaurant}
                  selected={selected?.id === restaurant.id}
                  onSelect={() => setSelectedId(restaurant.id)}
                />
              ))}
              {!searchResult ? <EmptyState icon={<Search size={24} />} text="Search to see ranked restaurants." /> : null}
            </div>
          </section>

          <section className="panel" aria-label="Booking panel">
            <div className="section-title">
              <h3>Selected action</h3>
              <span>{selected?.bookingPlan ?? "none"}</span>
            </div>
            {selected ? (
              <>
                <div className="selected-summary">
                  <ImageWithFallback src={selected.imageUrl} alt={`${selected.name} dining room or dish`} />
                  <div>
                    <h4>{selected.name}</h4>
                    <p>{selected.address}</p>
                    <strong>{selected.score}/100 match</strong>
                  </div>
                </div>
                <div className="reason-list">
                  {selected.reasons.map((reason) => (
                    <span key={reason}>{reason}</span>
                  ))}
                </div>
                <div className="form-grid">
                  <label>
                    Name
                    <input value={dinerName} onChange={(event) => setDinerName(event.target.value)} />
                  </label>
                  <label>
                    Email confirmation
                    <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="uses .env fallback if blank" />
                  </label>
                  <label>
                    Phone (optional)
                    <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="for SMS confirmation" />
                  </label>
                </div>
                <button className="primary-button wide" type="button" onClick={runBooking} disabled={loading !== null}>
                  {loading === "book" ? <Loader2 className="spin" size={18} /> : <CheckCircle2 size={18} />}
                  Execute booking plan
                </button>
                <button
                  className="secondary-button wide"
                  type="button"
                  onClick={runVerify}
                  disabled={loading !== null || !(selected.reservationUrl || selected.website)}
                >
                  {loading === "verify" ? <Loader2 className="spin" size={18} /> : <Globe2 size={18} />}
                  {selected.bookabilityChecked ? "Re-verify availability" : "Verify availability"}
                </button>
              </>
            ) : (
              <EmptyState icon={<Utensils size={24} />} text="Choose a restaurant after searching." />
            )}

            {booking ? (
              <div className="booking-result">
                <CheckCircle2 size={20} />
                <div>
                  <strong>{booking.status.toUpperCase()}</strong>
                  <p>{booking.userMessage}</p>
                  <code>{booking.confirmationCode}</code>
                  {booking.browserUseSession?.liveUrl ? (
                    <div className="browser-live">
                      <div className="browser-live-actions">
                        <a href={booking.browserUseSession.liveUrl} target="_blank" rel="noreferrer">
                          Open Browser Use live session
                        </a>
                        {booking.browserUseSession.status !== "stopped" ? (
                          <button className="secondary-button small-button" type="button" onClick={stopBrowserSession} disabled={loading !== null}>
                            {loading === "stop-browser" ? <Loader2 className="spin" size={14} /> : null}
                            Stop session
                          </button>
                        ) : (
                          <span>stopped</span>
                        )}
                      </div>
                      <iframe title="Browser Use live session" src={booking.browserUseSession.liveUrl} />
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </section>
        </section>

        <section className="panel trace-panel" aria-label="Agent trace">
          <div className="section-title">
            <h3>Tool log</h3>
            <span>{trace.length ? `${trace.length} steps` : "idle"}</span>
          </div>
          <TraceList steps={trace} />
        </section>
      </div>
    </main>
  );
}

function RestaurantOption({
  restaurant,
  selected,
  onSelect,
}: {
  restaurant: RankedRestaurant;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button className={`restaurant-row ${selected ? "selected" : ""}`} type="button" onClick={onSelect}>
      <ImageWithFallback src={restaurant.imageUrl} alt={`${restaurant.name} food`} />
      <div className="restaurant-copy">
        <div className="restaurant-title">
          <strong>{restaurant.name}</strong>
          <span>{restaurant.score}</span>
        </div>
        <p>{restaurant.cuisine.slice(0, 3).join(" / ")}</p>
        <div className="meta-line">
          <span>{restaurant.rating.toFixed(1)} stars</span>
          <span>{restaurant.price}</span>
          {restaurant.distanceMiles != null ? <span>{restaurant.distanceMiles.toFixed(1)} mi</span> : null}
          <span>{formatSlotLabel(restaurant.slots[0]?.label, restaurant)}</span>
        </div>
      </div>
    </button>
  );
}

function ImageWithFallback({ src, alt }: { src?: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="image-fallback" aria-label={alt} role="img">
        <Utensils size={28} />
      </div>
    );
  }
  return <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="empty-state">
      {icon}
      <p>{text}</p>
    </div>
  );
}

function TraceList({ steps }: { steps: SearchResponse["timeline"] }) {
  if (steps.length === 0) {
    return <EmptyState icon={<CheckCircle2 size={22} />} text="No actions yet." />;
  }

  return (
    <ol className="trace-list">
      {steps.map((trace) => (
        <li key={trace.id}>
          <span className={`trace-dot trace-${trace.status}`} />
          <div>
            <strong>{trace.label}</strong>
            <p>{trace.detail}</p>
            {trace.source ? <em>{trace.source}</em> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
