import { NextResponse } from "next/server";
import { z } from "zod";
import { stopBrowserUseSession } from "@/lib/integrations/browser-use";

export const runtime = "nodejs";

const bodySchema = z.object({
  sessionId: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const result = await stopBrowserUseSession(body.sessionId);
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown Browser Use stop error",
      },
      { status: 400 },
    );
  }
}
