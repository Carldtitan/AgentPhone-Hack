import { NextResponse } from "next/server";
import { getEnv, getIntegrationStatuses } from "@/lib/env";
import { getAgentPhoneUsage } from "@/lib/integrations/agentphone";
import { probeApifyAuth } from "@/lib/integrations/apify";
import { probeBrowserUseAuth } from "@/lib/integrations/browser-use";
import { probeAgentMailAuth } from "@/lib/integrations/agentmail";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const live = url.searchParams.get("live") === "1";
  const env = getEnv();
  const probes: Record<string, unknown> = {};

  if (live) {
    const [apify, browserUse, agentPhone, agentMail] = await Promise.all([
      probeApifyAuth(),
      probeBrowserUseAuth(),
      getAgentPhoneUsage(),
      probeAgentMailAuth(),
    ]);
    probes.apify = apify;
    probes.browserUse = browserUse;
    probes.agentPhone = agentPhone;
    probes.agentMail = agentMail;
  }

  return NextResponse.json({
    ok: true,
    demoMode: env.demoMode,
    generatedAt: new Date().toISOString(),
    integrations: getIntegrationStatuses(),
    safety: {
      allowApifyLiveRun: env.allowApifyLiveRun,
      allowBrowserUseLiveTask: env.allowBrowserUseLiveTask,
      allowRealRestaurantCalls: env.allowRealRestaurantCalls,
      allowRealSmsSend: env.allowRealSmsSend,
      allowRealEmailSend: env.allowRealEmailSend,
      allowRealBookingSubmit: env.allowRealBookingSubmit,
    },
    probes,
  });
}
