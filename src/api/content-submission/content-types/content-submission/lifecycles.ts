/**
 * Admin-panel review flow: a super admin opens this CMS, inspects a pending
 * content submission and flips `submissionStatus` to published/rejected in the
 * Content Manager. This hook performs the real side effects of that decision:
 *  - published → push the staged blocks + SEO to the project's live target CMS
 *  - rejected  → stamp the review and notify the team on Slack
 *
 * API-driven publishes (dashboard Approvals tab / review link) set
 * `publishedToTargetAt`/`reviewedAt` in the same update, which this hook uses
 * as a guard so the push never runs twice.
 */

import { errors } from "@strapi/utils";
import { buildSubmissionMessage, resolveSlackWebhook, sendSlackNotification } from "../../../../helpers/slack";
import { pushSubmissionToTarget } from "../../../../helpers/target-cms";

const SUBMISSION_UID = "api::content-submission.content-submission";
const PROJECT_UID = "api::dashboard-project.dashboard-project";

function getDashboardUrl(): string {
  return (process.env.DASHBOARD_URL || "http://localhost:3000").replace(/\/+$/, "");
}

async function notify(project: any, submission: any, kind: "published" | "rejected", reviewedBy: string, note?: string | null) {
  const webhook = resolveSlackWebhook(project);
  if (!webhook) return;
  await sendSlackNotification(
    webhook,
    buildSubmissionMessage({
      kind,
      projectName: project.name,
      projectId: project.projectId,
      pageTitle: submission.pageTitle,
      pageUrl: submission.pageUrl,
      frontendUrl: project.frontendUrl ?? undefined,
      locale: submission.locale ?? undefined,
      blockCount: Array.isArray(submission.blocks) ? submission.blocks.length : 0,
      submittedBy: submission.submittedBy ?? undefined,
      reviewedBy,
      reviewNote: note ?? undefined,
      dashboardUrl: getDashboardUrl(),
      submissionId: submission.documentId,
    }),
  );
}

export default {
  async beforeUpdate(event: any) {
    const data = event.params?.data ?? {};
    const nextStatus = data.submissionStatus;
    if (nextStatus !== "published" && nextStatus !== "rejected") return;
    // Updates coming from the API endpoints stamp these fields themselves —
    // only a bare status flip (the admin panel) should trigger side effects.
    if (data.publishedToTargetAt || data.reviewedAt) return;

    const existing = await strapi.db.query(SUBMISSION_UID).findOne({ where: event.params.where });
    if (!existing || existing.submissionStatus !== "pending") return;

    const project = await strapi.db.query(PROJECT_UID).findOne({ where: { projectId: existing.projectId } });
    if (!project) {
      throw new errors.ApplicationError(`Cannot review submission: project "${existing.projectId}" no longer exists`);
    }

    const now = new Date().toISOString();
    const reviewedBy = data.reviewedBy?.trim() || "CMS super admin";

    if (nextStatus === "published") {
      const result = await pushSubmissionToTarget(project, {
        pageDocumentId: existing.pageDocumentId,
        locale: existing.locale,
        blocks: data.blocks ?? existing.blocks,
        seo: data.seo ?? existing.seo,
      });
      if (!result.ok) {
        // Abort the save so the status stays "pending" and the admin sees why.
        throw new errors.ApplicationError(`Publish to target CMS failed: ${result.error}`);
      }
      data.publishedToTargetAt = now;
      data.publishError = null;
    }

    data.reviewedAt = now;
    data.reviewedBy = reviewedBy;
    // Stash for afterUpdate (Slack should fire only once the row is saved).
    event.state = { ...(event.state ?? {}), reviewAction: { kind: nextStatus, project, existing, reviewedBy, note: data.reviewNote ?? existing.reviewNote ?? null } };
  },

  async afterUpdate(event: any) {
    const action = event.state?.reviewAction;
    if (!action) return;
    await notify(action.project, action.existing, action.kind, action.reviewedBy, action.note);
  },
};
