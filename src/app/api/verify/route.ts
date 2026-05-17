import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyRestaurantBookability } from "@/lib/orchestrator";

export const runtime = "nodejs";

const bodySchema = z.object({
  conversationId: z.string().min(1),
  restaurantId: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const result = await verifyRestaurantBookability(body.conversationId, body.restaurantId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown verification error",
      },
      { status: 400 },
    );
  }
}
