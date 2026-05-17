import { NextResponse } from "next/server";
import { z } from "zod";
import { runBooking } from "@/lib/orchestrator";

export const runtime = "nodejs";

const bodySchema = z.object({
  conversationId: z.string().min(1),
  restaurantId: z.string().min(1),
  dinerName: z.string().optional(),
  userEmail: z.string().email().optional().or(z.literal("")),
  userPhone: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const result = await runBooking({
      ...body,
      userEmail: body.userEmail || undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown booking error",
      },
      { status: 400 },
    );
  }
}
