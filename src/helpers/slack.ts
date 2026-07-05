import logger from "./logger";

export type SubmissionNotification = {
  kind: "submitted" | "published" | "rejected";
  projectName: string;
  projectId: string;
  pageTitle: string;
  pageUrl?: string;
  frontendUrl?: string;
  locale?: string;
  blockCount: number;
  submittedBy?: string;
  reviewedBy?: string;
  reviewNote?: string;
  reviewUrl?: string;
  dashboardUrl?: string;
  submissionId?: string;
};

const KIND_META: Record<
  SubmissionNotification["kind"],
  { emoji: string; headline: string; color: string; hint: string }
> = {
  submitted: {
    emoji: "📝",
    headline: "Content update awaiting review",
    color: "#f59e0b", // amber — needs action
    hint: "Nothing is live yet — the changes are staged until you approve them.",
  },
  published: {
    emoji: "✅",
    headline: "Content update published",
    color: "#10b981", // emerald
    hint: "The approved changes are now live on the website.",
  },
  rejected: {
    emoji: "🚫",
    headline: "Content update rejected",
    color: "#ef4444", // red
    hint: "The changes were not published. The editor can revise and resubmit.",
  },
};

/**
 * Resolve the webhook for a project: per-project URL wins, env is the fallback.
 * Returns null when Slack is not configured (the caller treats notify as best-effort).
 */
export function resolveSlackWebhook(project: { slackWebhookUrl?: string | null }): string | null {
  const url = project?.slackWebhookUrl?.trim() || process.env.SLACK_WEBHOOK_URL?.trim() || "";
  if (!url) return null;
  if (!/^https:\/\/hooks\.slack\.com\//i.test(url)) {
    logger.warn(`[slack] Ignoring webhook that is not a hooks.slack.com URL for project`);
    return null;
  }
  return url;
}

/** Absolute URL of the live page, when we know the project's frontend. */
function livePageUrl(n: SubmissionNotification): string | null {
  if (!n.frontendUrl) return null;
  const base = n.frontendUrl.replace(/\/+$/, "");
  const slug = (n.pageUrl ?? "").replace(/^\/+/, "");
  if (!slug || slug === "homepage" || slug === "home") return `${base}/`;
  return `${base}/${slug}`;
}

/** Slack-native timestamp: renders in each reader's own timezone. */
function slackDate(): string {
  const ts = Math.floor(Date.now() / 1000);
  return `<!date^${ts}^{date_short_pretty} at {time}|just now>`;
}

export function buildSubmissionMessage(n: SubmissionNotification) {
  const meta = KIND_META[n.kind];
  const pageLink = livePageUrl(n);
  const pageLabel = n.pageTitle || n.pageUrl || "Untitled page";
  const pageText = pageLink ? `<${pageLink}|${pageLabel}>` : pageLabel;

  const fields: { type: "mrkdwn"; text: string }[] = [
    { type: "mrkdwn", text: `*📁 Project*\n${n.projectName}` },
    { type: "mrkdwn", text: `*📄 Page*\n${pageText}${n.locale ? `  ·  \`${n.locale.toUpperCase()}\`` : ""}` },
    { type: "mrkdwn", text: `*🧩 Blocks*\n${n.blockCount} block${n.blockCount === 1 ? "" : "s"} in update` },
    { type: "mrkdwn", text: `*🕒 When*\n${slackDate()}` },
  ];
  if (n.submittedBy) fields.push({ type: "mrkdwn", text: `*✍️ Submitted by*\n${n.submittedBy}` });
  if (n.reviewedBy) fields.push({ type: "mrkdwn", text: `*🛡️ Reviewed by*\n${n.reviewedBy}` });

  const blocks: any[] = [
    { type: "header", text: { type: "plain_text", text: `${meta.emoji} ${meta.headline}`, emoji: true } },
    { type: "section", fields },
  ];

  if (n.reviewNote) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `>💬 *Note:* ${n.reviewNote.slice(0, 500)}` },
    });
  }

  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: `${meta.hint}  ·  Project ID \`${n.projectId}\`${n.submissionId ? `  ·  Submission \`${n.submissionId.slice(0, 8)}…\`` : ""}` }],
  });

  const buttons: any[] = [];
  if (n.kind === "submitted" && n.reviewUrl) {
    buttons.push({
      type: "button",
      style: "primary",
      text: { type: "plain_text", text: "🔍 Review & publish", emoji: true },
      url: n.reviewUrl,
    });
  }
  if (n.dashboardUrl) {
    buttons.push({
      type: "button",
      text: { type: "plain_text", text: "📊 Open dashboard", emoji: true },
      url: n.dashboardUrl,
    });
  }
  if (pageLink && n.kind === "published") {
    buttons.push({
      type: "button",
      text: { type: "plain_text", text: "🌐 View live page", emoji: true },
      url: pageLink,
    });
  }
  if (buttons.length) {
    blocks.push({ type: "divider" });
    blocks.push({ type: "actions", elements: buttons });
  }

  return {
    // Fallback for push notifications / clients that don't render blocks.
    text: `${meta.emoji} ${meta.headline}: "${pageLabel}" — ${n.projectName}${n.submittedBy ? ` (by ${n.submittedBy})` : ""}`,
    // Attachment wrapper gives the colored status bar on the left edge.
    attachments: [{ color: meta.color, blocks }],
  };
}

/**
 * Fire a Slack incoming-webhook message. Never throws — notification failure
 * must not fail the save/publish itself.
 */
export async function sendSlackNotification(webhookUrl: string, message: object): Promise<boolean> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.warn(`[slack] Webhook responded ${res.status}: ${text.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (e: any) {
    logger.warn(`[slack] Webhook call failed: ${e?.message ?? "unknown error"}`);
    return false;
  }
}
