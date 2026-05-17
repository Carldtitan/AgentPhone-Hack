import { getEnv } from "../env";
import { fetchJson } from "../http";
import type { ToolResult } from "../types";

type SendMailArgs = {
  to?: string;
  subject: string;
  text: string;
  html: string;
};

export async function sendConfirmationEmail(args: SendMailArgs): Promise<ToolResult<string>> {
  const env = getEnv();
  const target = args.to || env.demoEmail;
  const preview = `AgentMail would send "${args.subject}" to ${target || "demo recipient"}.`;
  if (!env.agentMailApiKey || !env.agentMailInboxId || !env.allowRealEmailSend || !target) {
    return {
      ok: true,
      mode: env.agentMailApiKey ? "dry-run" : "missing-key",
      data: preview,
      message: "Real email sending is disabled or missing recipient; generated email preview only.",
    };
  }

  try {
    const data = await fetchJson<{ message_id: string; thread_id: string }>(
      `${env.agentMailBaseUrl.replace(/\/$/, "")}/v0/inboxes/${encodeURIComponent(env.agentMailInboxId)}/messages/send`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${env.agentMailApiKey}` },
        body: JSON.stringify({
          to: target,
          subject: args.subject,
          text: args.text,
          html: args.html,
          labels: ["reservation-agent", "hackathon-demo"],
        }),
        timeoutMs: 15000,
      },
    );
    return { ok: true, mode: "live", data: `Email sent: ${data.message_id}`, message: "AgentMail sent the confirmation email." };
  } catch (error) {
    return {
      ok: false,
      mode: "fallback",
      data: preview,
      message: `AgentMail send failed; preview kept. ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function probeAgentMailAuth(): Promise<ToolResult<string>> {
  const env = getEnv();
  if (!env.agentMailApiKey || !env.agentMailInboxId) {
    return { ok: false, mode: "missing-key", message: "AgentMail key or inbox ID missing." };
  }

  try {
    const data = await fetchJson<{ count?: number }>(
      `${env.agentMailBaseUrl.replace(/\/$/, "")}/v0/inboxes/${encodeURIComponent(env.agentMailInboxId)}/messages?limit=1`,
      {
        headers: { Authorization: `Bearer ${env.agentMailApiKey}` },
        timeoutMs: 10000,
      },
    );
    return {
      ok: true,
      mode: "live",
      data: `${data.count ?? 0} messages visible`,
      message: "AgentMail auth probe succeeded without sending email.",
    };
  } catch (error) {
    return {
      ok: false,
      mode: "fallback",
      message: `AgentMail auth probe failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
