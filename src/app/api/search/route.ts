import { NextResponse } from "next/server";
import { z } from "zod";
import { runRestaurantSearch } from "@/lib/orchestrator";

export const runtime = "nodejs";

const bodySchema = z.object({
  message: z.string().min(3).max(2000),
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const result = await runRestaurantSearch(body.message);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown search error",
      },
      { status: 400 },
    );
  }
}
