import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({}));
  console.log("AgentMail webhook received", JSON.stringify(payload).slice(0, 1000));
  return NextResponse.json({ ok: true });
}
