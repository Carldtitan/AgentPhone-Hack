import type { OpeningHours, ReservationIntent, Restaurant } from "./types";

const DAY_ORDER = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function timeToMinutes(input: string): number | null {
  const m = input.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const meridiem = m[3]?.toLowerCase();
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  return hour * 60 + minute;
}

function dayOfWeek(dateIso: string): string {
  const d = new Date(`${dateIso}T12:00:00`);
  return DAY_ORDER[d.getDay()];
}

function rangesForDay(entry: OpeningHours): Array<{ start: number; end: number }> {
  const text = entry.hours;
  if (/closed/i.test(text)) return [];
  if (/24\s*hours/i.test(text)) return [{ start: 0, end: 24 * 60 }];

  const ranges: Array<{ start: number; end: number }> = [];
  const segments = text.split(/,/);
  for (const seg of segments) {
    const m = seg.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:to|–|-|—|until)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
    if (!m) continue;
    let start = timeToMinutes(m[1]);
    let end = timeToMinutes(m[2]);
    if (start === null || end === null) continue;
    if (end <= start) end += 24 * 60;
    ranges.push({ start, end });
  }
  return ranges;
}

export type OpenStatus =
  | { known: true; isOpen: boolean; reason: string }
  | { known: false; reason: string };

export function isOpenAt(restaurant: Restaurant, intent: ReservationIntent): OpenStatus {
  if (!restaurant.openingHours || restaurant.openingHours.length === 0) {
    return { known: false, reason: "Opening hours unknown" };
  }
  const day = dayOfWeek(intent.date);
  const entry = restaurant.openingHours.find((h) => h.day.toLowerCase().startsWith(day.toLowerCase().slice(0, 3)));
  if (!entry) return { known: false, reason: `No hours listed for ${day}` };
  const target = timeToMinutes(intent.time);
  if (target === null) return { known: false, reason: "Could not parse requested time" };
  const ranges = rangesForDay(entry);
  if (ranges.length === 0) return { known: true, isOpen: false, reason: `Closed on ${day}` };
  const hits = ranges.some((range) => target >= range.start && target <= range.end - 30);
  return {
    known: true,
    isOpen: hits,
    reason: hits ? `Open at ${intent.time} on ${day}` : `Not open at ${intent.time} on ${day}`,
  };
}

export function filterByOpeningHours(
  restaurants: Restaurant[],
  intent: ReservationIntent,
): { kept: Restaurant[]; dropped: Array<{ restaurant: Restaurant; reason: string }> } {
  const kept: Restaurant[] = [];
  const dropped: Array<{ restaurant: Restaurant; reason: string }> = [];
  for (const restaurant of restaurants) {
    const status = isOpenAt(restaurant, intent);
    if (status.known && !status.isOpen) {
      dropped.push({ restaurant, reason: status.reason });
    } else {
      kept.push(restaurant);
    }
  }
  return { kept, dropped };
}
