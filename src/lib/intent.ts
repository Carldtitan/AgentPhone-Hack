import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { getEnv } from "./env";
import type { ReservationIntent, ToolResult } from "./types";

const intentSchema = z.object({
  raw: z.string(),
  cuisine: z.string().optional(),
  dish: z.string().optional(),
  location: z.string(),
  date: z.string(),
  time: z.string(),
  partySize: z.number().int().min(1).max(20),
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
  const partyMatch = lower.match(/(?:for|party of)\s+(\d{1,2})/);
  const budgetMatch = lower.match(/(?:under|below|less than|max|maximum)\s+\$?(\d{2,4})/);
  const timeMatch = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/);
  const locationMatch = raw.match(/\b(?:near|around|in)\s+(.+?)(?:,|\.|$)/i);
  const cuisine = cuisineTerms.find((term) => lower.includes(term));
  const preferences = [
    lower.includes("outdoor") ? "outdoor seating" : "",
    lower.includes("quiet") ? "quiet" : "",
    lower.includes("not too expensive") ? "not too expensive" : "",
    lower.includes("walk") || lower.includes("walking") ? "walkable" : "",
    lower.includes("date") ? "date-night" : "",
  ].filter(Boolean);

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
      contents: `Extract a restaurant reservation request as compact JSON. Today is ${new Date()
        .toISOString()
        .slice(0, 10)}. Return only these keys: raw, cuisine, dish, location, date, time, partySize, budgetPerPerson, preferences. Request: ${raw}`,
      config: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    });
    const partial = JSON.parse(response.text ?? "{}") as Partial<ReservationIntent>;
    const parsedBudget = Number(partial.budgetPerPerson);
    const parsed = intentSchema.parse({
      ...deterministic,
      cuisine: typeof partial.cuisine === "string" ? partial.cuisine : deterministic.cuisine,
      dish: typeof partial.dish === "string" ? partial.dish : deterministic.dish,
      raw,
      location: cleanLocation(partial.location ?? deterministic.location),
      date: typeof partial.date === "string" ? partial.date : deterministic.date,
      time: typeof partial.time === "string" ? partial.time : deterministic.time,
      partySize: Number(partial.partySize ?? deterministic.partySize),
      budgetPerPerson:
        partial.budgetPerPerson === undefined || partial.budgetPerPerson === null
          ? deterministic.budgetPerPerson
          : Number.isFinite(parsedBudget)
            ? parsedBudget
            : deterministic.budgetPerPerson,
      preferences: Array.isArray(partial.preferences) ? partial.preferences : deterministic.preferences,
    });
    return {
      ok: true,
      mode: "live",
      data: parsed,
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
