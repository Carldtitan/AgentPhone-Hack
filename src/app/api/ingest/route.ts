import { NextResponse } from "next/server";
import { z } from "zod";
import { parseIntentDeterministic } from "@/lib/intent";
import { discoverRestaurants } from "@/lib/integrations/apify";
import { saveRestaurantCache } from "@/lib/store";

export const runtime = "nodejs";

const bodySchema = z.object({
  query: z.string().default("Italian restaurants near REDACTED, San Francisco for 3 tonight at 7:30pm"),
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const intent = parseIntentDeterministic(body.query);
    const result = await discoverRestaurants(intent);
    await saveRestaurantCache([intent.location, intent.cuisine, intent.dish, intent.date, intent.partySize].filter(Boolean).join("|").toLowerCase(), result.data ?? []);
    return NextResponse.json({
      ok: result.ok,
      mode: result.mode,
      message: result.message,
      count: result.data?.length ?? 0,
      restaurants: result.data ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown ingestion error",
      },
      { status: 400 },
    );
  }
}
