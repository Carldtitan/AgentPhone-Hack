import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { getEnv } from "./env";
import type { ReservationIntent, ToolResult } from "./types";

const intentSchema = z.object({
  raw: z.string().optional(),
  cuisine: z.string().optional(),
  dish: z.string().optional(),
  location: z.string().optional(),
  date: z.string().optional(),
  time: z.string().optional(),
  partySize: z.number().int().min(1).max(20).optional(),
  budgetPerPerson: z.number().int().min(1).optional(),
  preferences: z.array(z.string()).default([]),
});

const cuisineTerms = [
  "italian",
  "sushi",
  "japanese",
  "mexican",
  "thai",
  "chinese",
  "french",
  "indian",
  "korean",
  "steak",
  "seafood",
  "vegan",
  "vegetarian",
  "pizza",
  "dim sum",
  "ramen",
  "mediterranean",
  "bbq",
  "barbecue",
  "tapas",
];

const preferenceTerms: Array<{ match: RegExp; label: string }> = [
  { match: /outdoor|patio|al\s?fresco/i, label: "outdoor seating" },
  { match: /\bquiet\b|low[-\s]?key/i, label: "quiet" },
  { match: /not too expensive|cheap|affordable|budget[- ]friendly/i, label: "not too expensive" },
  { match: /walk(ing|able)?\b/i, label: "walkable" },
  { match: /date[-\s]?night|romantic|anniversary/i, label: "date-night" },
  { match: /birthday/i, label: "birthday" },
  { match: /kid[-\s]?friendly|family/i, label: "kid-friendly" },
  { match: /spicy/i, label: "spicy" },
  { match: /vegan/i, label: "vegan" },
  { match: /vegetarian/i, label: "vegetarian" },
  { match: /lively|fun|party/i, label: "lively" },
  { match: /team\s?dinner|group/i, label: "group-friendly" },
  { match: /waterfront|view/i, label: "waterfront" },
];

function cleanLocation(input: string | undefined) {
  const fallback = getEnv().demoLocation;
  if (!input) return fallback;
  const cleaned = input
    .replace(/\b(for|party of)\s+\d{1,2}.*$/i, "")
    .replace(/\b(tonight|tomorrow|today|around|at|under|below|less than|max|maximum)\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[,.]$/, "");
  if (!cleaned) return fallback;
  if (/560\s+20th/i.test(cleaned) && !/san francisco|sf/i.test(cleaned)) {
    return `${cleaned}, San Francisco, CA`;
  }
  return cleaned;
}

function isoDateFromPhrase(input: string) {
  const now = new Date();
  if (/tomorrow/i.test(input)) {
    now.setDate(now.getDate() + 1);
  }
  return now.toISOString().slice(0, 10);
}

export function parseIntentDeterministic(raw: string): ReservationIntent {
  const lower = raw.toLowerCase();
  const partyMatch =
    lower.match(/(?:for|party of|table for|group of)\s+(\d{1,2})/) ||
    lower.match(/\b(\d{1,2})\s+(?:people|guests|of us|pax)\b/);
  const budgetMatch =
    lower.match(/(?:under|below|less than|max(?:imum)?|up to)\s+\$?(\d{2,4})/) ||
    lower.match(/(?:around|about|roughly|~)\s*\$?(\d{2,4})/) ||
    lower.match(/\$(\d{2,4})\s*(?:\/|per)\s*person/);
  const timeMatch = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/);
  const locationMatch =
    raw.match(/\b(?:near|around)\s+([^,.]+?(?:,\s*[A-Z]{2})?)(?=\s+(?:for|tonight|tomorrow|today|at|around|on)\b|[,.]|$)/i) ||
    raw.match(/\bin\s+(San\s+Francisco|SF|New\s+York|NYC|[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?(?:,\s*[A-Z]{2})?)\b/);
  const cuisine = cuisineTerms.find((term) => lower.includes(term));
  const preferences = Array.from(
    new Set(preferenceTerms.filter(({ match }) => match.test(raw)).map(({ label }) => label)),
  );

  const time = timeMatch
    ? `${timeMatch[1]}:${timeMatch[2] ?? "00"} ${timeMatch[3].toUpperCase()}`
    : /tonight/i.test(raw)
      ? "7:30 PM"
      : "7:00 PM";

  return {
    raw,
    cuisine,
    dish: cuisine ? undefined : raw.split(/[,.]/)[0]?.slice(0, 60),
    location: cleanLocation(locationMatch?.[1]),
    date: isoDateFromPhrase(raw),
    time,
    partySize: partyMatch ? Number(partyMatch[1]) : 2,
    budgetPerPerson: budgetMatch ? Number(budgetMatch[1]) : undefined,
    preferences,
  };
}

function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

export async function parseIntent(raw: string): Promise<ToolResult<ReservationIntent>> {
  const env = getEnv();
  const deterministic = parseIntentDeterministic(raw);
  if (env.demoMode || !env.geminiApiKey) {
    return {
      ok: true,
      mode: env.geminiApiKey ? "dry-run" : "fallback",
      data: deterministic,
      message: env.demoMode ? "Parsed locally to avoid free-tier LLM calls in demo mode." : "Gemini key missing; parsed locally.",
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey: env.geminiApiKey });
    const response = await ai.models.generateContent({
      model: env.geminiModel,
      contents: [
        `You extract a restaurant reservation request as compact JSON.`,
        `Today is ${new Date().toISOString().slice(0, 10)}. Default city is San Francisco.`,
        `Schema: { cuisine?: string, dish?: string, location: string, date: "YYYY-MM-DD", time: "h:mm AM/PM", partySize: number, budgetPerPerson?: number, preferences: string[] }.`,
        `Rules: location must be a clean place name only (no time, party, or budget words). preferences is a short list of tags like "outdoor seating", "quiet", "vegan", "date-night", "kid-friendly", "group-friendly".`,
        `Request: ${raw}`,
      ].join("\n"),
      config: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    });
    const cleaned = stripJsonFence(response.text ?? "{}");
    const parsed = intentSchema.parse(JSON.parse(cleaned));
    const merged: ReservationIntent = {
      raw,
      cuisine: parsed.cuisine ?? deterministic.cuisine,
      dish: parsed.dish ?? deterministic.dish,
      location: cleanLocation(parsed.location?.trim() || deterministic.location),
      date: parsed.date ?? deterministic.date,
      time: parsed.time ?? deterministic.time,
      partySize: parsed.partySize ?? deterministic.partySize,
      budgetPerPerson: parsed.budgetPerPerson ?? deterministic.budgetPerPerson,
      preferences: parsed.preferences.length ? parsed.preferences : deterministic.preferences,
    };
    return {
      ok: true,
      mode: "live",
      data: merged,
      message: `Parsed with ${env.geminiModel}.`,
    };
  } catch (error) {
    return {
      ok: false,
      mode: "fallback",
      data: deterministic,
      message: `Gemini parse failed; used local parser. ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
