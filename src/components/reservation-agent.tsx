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
  ShieldCheck,
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
  return "safe";
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
  const [loading, setLoading] = useState<"search" | "book" | "ingest" | "health" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => searchResult?.options.find((option) => option.id === selectedId) ?? searchResult?.options[0],
    [searchResult, selectedId],
  );

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
      setHealth((current) => current ?? { demoMode: true, generatedAt: result.generatedAt, integrations: result.integrations, safety: {} });
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

  useEffect(() => {
    refreshHealth();
  }, []);

  return (
    <main className="app-shell">
      <section className="workspace">
        <aside className="left-rail" aria-label="Integration status">
          <div className="brand">
            <div className="brand-mark">
              <Utensils size={22} />
            </div>
            <div>
              <p className="eyebrow">Call My Agent</p>
              <h1>Table Agent</h1>
            </div>
          </div>

          <div className="status-panel">
            <div className="panel-heading">
              <ShieldCheck size={18} />
              <span>Free-tier guardrails</span>
            </div>
            <p className="muted">
              Real calls, email, SMS, browser submission, and Apify actor runs stay off unless the env toggles say otherwise.
            </p>
            <button className="icon-button wide" type="button" onClick={() => refreshHealth(true)} disabled={loading === "health"}>
              {loading === "health" ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
              Check live auth
            </button>
          </div>

          <div className="integration-list">
            {(health?.integrations ?? []).map((integration) => (
              <div className="integration-row" key={integration.id}>
                <div className="integration-icon">
                  {integration.id === "apify" ? <Database size={16} /> : null}
                  {integration.id === "browser-use" ? <Globe2 size={16} /> : null}
                  {integration.id === "agentphone" ? <Phone size={16} /> : null}
                  {integration.id === "agentmail" ? <Mail size={16} /> : null}
                  {integration.id === "supermemory" ? <BrainCircuit size={16} /> : null}
                  {integration.id === "gemini" ? <Sparkles size={16} /> : null}
                </div>
                <div>
                  <strong>{integration.label}</strong>
                  <span>{integration.message}</span>
                </div>
                <b className={`mode mode-${modeLabel(integration)}`}>{modeLabel(integration)}</b>
              </div>
            ))}
          </div>
        </aside>

        <section className="main-panel">
          <div className="command-band">
            <div>
              <p className="eyebrow">Dinner request</p>
              <h2>Ask for a table. The agent plans the rest.</h2>
            </div>
            <div className="quick-facts" aria-label="Parsed request preview">
              <span>
                <MapPin size={15} /> San Francisco
              </span>
              <span>
                <Users size={15} /> Team dinner
              </span>
              <span>
                <Calendar size={15} /> Tonight
              </span>
            </div>
          </div>

          <div className="composer">
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} aria-label="Restaurant request" />
            <div className="button-row">
              <button className="primary-button" type="button" onClick={runSearch} disabled={loading !== null}>
                {loading === "search" ? <Loader2 className="spin" size={18} /> : <Search size={18} />}
                Find tables
              </button>
              <button className="secondary-button" type="button" onClick={runIngest} disabled={loading !== null}>
                {loading === "ingest" ? <Loader2 className="spin" size={18} /> : <Database size={18} />}
                Refresh cache
              </button>
            </div>
          </div>

          {error ? (
            <div className="error-bar">
              <AlertTriangle size={18} />
              {error}
            </div>
          ) : null}

          <div className="results-grid">
            <section className="options-list" aria-label="Restaurant options">
              <div className="section-title">
                <h3>Ranked options</h3>
                {searchResult ? <span>{searchResult.options.length} candidates</span> : <span>Run a search</span>}
              </div>
              {(searchResult?.options ?? []).map((restaurant) => (
                <RestaurantOption
                  key={restaurant.id}
                  restaurant={restaurant}
                  selected={selected?.id === restaurant.id}
                  onSelect={() => setSelectedId(restaurant.id)}
                />
              ))}
              {!searchResult ? (
                <div className="empty-state">
                  <Search size={24} />
                  <p>Search results, live tool traces, and booking actions will appear here.</p>
                </div>
              ) : null}
            </section>

            <section className="action-panel" aria-label="Booking panel">
              <div className="section-title">
                <h3>Action path</h3>
                <span>{selected?.bookingPlan ?? "waiting"}</span>
              </div>
              {selected ? (
                <>
                  <div className="selected-summary">
                    {selected.imageUrl ? <img src={selected.imageUrl} alt={`${selected.name} dining room or dish`} /> : null}
                    <div>
                      <h4>{selected.name}</h4>
                      <p>{selected.address}</p>
                      <strong>{selected.score}/100 match</strong>
                    </div>
                  </div>
                  <div className="form-grid">
                    <label>
                      Name
                      <input value={dinerName} onChange={(event) => setDinerName(event.target.value)} />
                    </label>
                    <label>
                      Email
                      <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="optional for dry run" />
                    </label>
                    <label>
                      Phone
                      <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="optional for dry run" />
                    </label>
                  </div>
                  <button className="primary-button wide" type="button" onClick={runBooking} disabled={loading !== null}>
                    {loading === "book" ? <Loader2 className="spin" size={18} /> : <CheckCircle2 size={18} />}
                    Execute booking plan
                  </button>
                </>
              ) : (
                <div className="empty-state">
                  <Utensils size={24} />
                  <p>Select a restaurant after searching.</p>
                </div>
              )}

              {booking ? (
                <div className="booking-result">
                  <CheckCircle2 size={20} />
                  <div>
                    <strong>{booking.status.toUpperCase()}</strong>
                    <p>{booking.userMessage}</p>
                    <code>{booking.confirmationCode}</code>
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        </section>

        <aside className="right-rail" aria-label="Agent trace">
          <div className="section-title">
            <h3>Agent trace</h3>
            <span>{searchResult ? "latest run" : "idle"}</span>
          </div>
          <TraceList steps={[...(searchResult?.timeline ?? []), ...(booking?.timeline ?? [])]} />
          <div className="memory-panel">
            <div className="panel-heading">
              <BrainCircuit size={18} />
              <span>Memory context</span>
            </div>
            {(searchResult?.memoryContext ?? []).slice(0, 3).map((memory) => (
              <p key={memory}>{memory}</p>
            ))}
            {!searchResult?.memoryContext.length ? <p className="muted">Supermemory context will show here when available.</p> : null}
          </div>
        </aside>
      </section>
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
      {restaurant.imageUrl ? <img src={restaurant.imageUrl} alt={`${restaurant.name} food`} /> : <div className="image-fallback" />}
      <div className="restaurant-copy">
        <div className="restaurant-title">
          <strong>{restaurant.name}</strong>
          <span>{restaurant.score}</span>
        </div>
        <p>{restaurant.cuisine.slice(0, 3).join(" / ")}</p>
        <div className="meta-line">
          <span>{restaurant.rating.toFixed(1)} stars</span>
          <span>{restaurant.price}</span>
          <span>{restaurant.slots[0]?.label ?? "call fallback"}</span>
        </div>
      </div>
    </button>
  );
}

function TraceList({ steps }: { steps: SearchResponse["timeline"] }) {
  if (steps.length === 0) {
    return (
      <div className="empty-state compact">
        <ShieldCheck size={22} />
        <p>No run yet.</p>
      </div>
    );
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
