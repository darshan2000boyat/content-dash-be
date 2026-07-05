/**
 * Super-admin review API backing the "Content Review" admin plugin.
 * Mounted on the admin router (see routes/review-admin.ts) — callers are
 * authenticated admin-panel users; every handler additionally requires the
 * Super Admin role.
 */

import type { Context } from "koa";
import { buildSubmissionMessage, resolveSlackWebhook, sendSlackNotification } from "../../../helpers/slack";
import { pushSubmissionToTarget, targetFetch } from "../../../helpers/target-cms";

const PROJECT_UID = "api::dashboard-project.dashboard-project";
const SUBMISSION_UID = "api::content-submission.content-submission";

function adminName(user: any): string {
  if (!user) return "Super admin";
  const full = [user.firstname, user.lastname].filter(Boolean).join(" ").trim();
  return full || user.email || "Super admin";
}

/**
 * Resolve the caller as an admin-panel Super Admin. The routes are mounted
 * on the admin router by the content-review plugin, so the admin auth
 * strategy has normally populated ctx.state.user (roles included) already;
 * the manual session validation below is a fallback for any other mounting.
 */
async function resolveSuperAdmin(ctx: Context): Promise<any | null> {
  let user = (ctx.state as any)?.user;

  if (!user) {
    const auth = ctx.request.headers.authorization;
    if (!auth?.startsWith("Bearer ")) return null;
    try {
      const manager = (strapi as any).sessionManager("admin");
      const result = manager.validateAccessToken(auth.slice(7));
      if (!result?.isValid) return null;
      const active = await manager.isSessionActive(result.payload.sessionId);
      if (!active) return null;
      user = await strapi.db.query("admin::user").findOne({
        where: { id: Number(result.payload.userId) },
        populate: ["roles"],
      });
    } catch {
      return null;
    }
  }

  if (!user || user.isActive !== true) return null;
  if (!user.roles?.some((r: any) => r?.code === "strapi-super-admin")) return null;
  return user;
}

function submissionSummary(s: any) {
  return {
    documentId: s.documentId,
    projectId: s.projectId,
    pageDocumentId: s.pageDocumentId,
    pageTitle: s.pageTitle,
    pageUrl: s.pageUrl,
    locale: s.locale,
    submissionStatus: s.submissionStatus,
    submittedBy: s.submittedBy ?? null,
    reviewedBy: s.reviewedBy ?? null,
    reviewedAt: s.reviewedAt ?? null,
    reviewNote: s.reviewNote ?? null,
    publishedToTargetAt: s.publishedToTargetAt ?? null,
    publishError: s.publishError ?? null,
    blockCount: Array.isArray(s.blocks) ? s.blocks.length : 0,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
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
      dashboardUrl: (process.env.DASHBOARD_URL || "").replace(/\/+$/, "") || undefined,
      submissionId: submission.documentId,
    }),
  );
}

/** Probe a project's stored token: can it read, can it write?
 * The write probe PUTs a nonexistent documentId — the target's permission
 * check runs before the lookup, so 401/403 means "no write access" while
 * 404/400 means the token would have been allowed to write. */
async function probeToken(host: string, token: string) {
  let read = false;
  let write = false;
  let reachable = true;
  try {
    const r = await targetFetch(host, token, "/api/sitemaps?pagination[limit]=1");
    read = r.ok;
    const w = await targetFetch(host, token, "/api/sitemaps/zzz-content-review-probe-zzz", {
      method: "PUT",
      body: JSON.stringify({ data: {} }),
    });
    write = w.status !== 401 && w.status !== 403;
  } catch {
    reachable = false;
  }
  return { reachable, read, write };
}

export default {
  async listProjects(ctx: Context) {
    const admin = await resolveSuperAdmin(ctx);
    if (!admin) return ctx.forbidden("Content Review is available to Super Admins only");

    const projects = await strapi.db.query(PROJECT_UID).findMany({
      where: { publishedAt: { $notNull: true } },
      orderBy: { name: "asc" },
    });
    const subs = await strapi.db.query(SUBMISSION_UID).findMany({
      select: ["projectId", "submissionStatus", "createdAt"],
    });

    const byProject: Record<string, { pending: number; published: number; rejected: number; lastActivity: string | null }> = {};
    for (const s of subs) {
      const bucket = (byProject[s.projectId] ??= { pending: 0, published: 0, rejected: 0, lastActivity: null });
      if (s.submissionStatus in bucket) (bucket as any)[s.submissionStatus] += 1;
      if (!bucket.lastActivity || s.createdAt > bucket.lastActivity) bucket.lastActivity = s.createdAt;
    }

    return ctx.send({
      ok: true,
      projects: projects.map((p: any) => ({
        projectId: p.projectId,
        name: p.name,
        strapiHost: p.strapiHost,
        frontendUrl: p.frontendUrl,
        hasLeadPassword: Boolean(p.leadPasswordHash),
        hasSlackWebhook: Boolean(p.slackWebhookUrl || process.env.SLACK_WEBHOOK_URL),
        counts: byProject[p.projectId] ?? { pending: 0, published: 0, rejected: 0, lastActivity: null },
      })),
    });
  },

  async listSubmissions(ctx: Context) {
    const admin = await resolveSuperAdmin(ctx);
    if (!admin) return ctx.forbidden("Content Review is available to Super Admins only");
    const projectId = String(ctx.params?.projectId ?? "").trim();
    if (!projectId) return ctx.badRequest("projectId required");
    const status = String(ctx.query?.status ?? "").trim();

    const where: Record<string, unknown> = { projectId };
    if (["pending", "published", "rejected"].includes(status)) where.submissionStatus = status;

    const rows = await strapi.db.query(SUBMISSION_UID).findMany({
      where,
      orderBy: { createdAt: "desc" },
      limit: 200,
    });
    return ctx.send({ ok: true, count: rows.length, submissions: rows.map(submissionSummary) });
  },

  async getSubmission(ctx: Context) {
    const admin = await resolveSuperAdmin(ctx);
    if (!admin) return ctx.forbidden("Content Review is available to Super Admins only");
    const documentId = String(ctx.params?.documentId ?? "").trim();
    const row = await strapi.db.query(SUBMISSION_UID).findOne({ where: { documentId } });
    if (!row) return ctx.notFound("Submission not found");
    const project = await strapi.db.query(PROJECT_UID).findOne({ where: { projectId: row.projectId } });

    return ctx.send({
      ok: true,
      project: project
        ? { projectId: project.projectId, name: project.name, frontendUrl: project.frontendUrl, strapiHost: project.strapiHost }
        : null,
      submission: {
        ...submissionSummary(row),
        blocks: row.blocks ?? [],
        seo: row.seo ?? null,
        previousBlocks: row.previousBlocks ?? null,
        previousSeo: row.previousSeo ?? null,
      },
    });
  },

  async publishSubmission(ctx: Context) {
    const admin = await resolveSuperAdmin(ctx);
    if (!admin) return ctx.forbidden("Content Review is available to Super Admins only");
    const documentId = String(ctx.params?.documentId ?? "").trim();
    const row = await strapi.db.query(SUBMISSION_UID).findOne({ where: { documentId } });
    if (!row) return ctx.notFound("Submission not found");
    if (row.submissionStatus !== "pending") return ctx.badRequest(`Submission is already ${row.submissionStatus}`);

    const project = await strapi.db.query(PROJECT_UID).findOne({ where: { projectId: row.projectId } });
    if (!project) return ctx.badRequest(`Project "${row.projectId}" no longer exists`);

    const body = (ctx.request.body ?? {}) as { note?: string };
    const reviewedBy = adminName(admin);
    const note = body.note?.trim().slice(0, 1000) || null;

    const result = await pushSubmissionToTarget(project as any, {
      pageDocumentId: row.pageDocumentId,
      locale: row.locale,
      blocks: row.blocks ?? [],
      seo: row.seo,
    });
    if (!result.ok) {
      await strapi.documents(SUBMISSION_UID).update({ documentId, data: { publishError: result.error } } as any);
      return ctx.badRequest(`Publish failed: ${result.error}`);
    }

    const now = new Date().toISOString();
    // Stamping publishedToTargetAt/reviewedAt here also tells the
    // content-submission lifecycle to skip its own (admin-panel) push.
    await strapi.documents(SUBMISSION_UID).update({
      documentId,
      data: {
        submissionStatus: "published",
        reviewedBy,
        reviewedAt: now,
        reviewNote: note,
        publishedToTargetAt: now,
        publishError: null,
      },
    } as any);

    await notify(project, row, "published", reviewedBy, note);
    return ctx.send({ ok: true, submissionStatus: "published", blockCount: result.blockCount, updatedAt: result.updatedAt });
  },

  async rejectSubmission(ctx: Context) {
    const admin = await resolveSuperAdmin(ctx);
    if (!admin) return ctx.forbidden("Content Review is available to Super Admins only");
    const documentId = String(ctx.params?.documentId ?? "").trim();
    const row = await strapi.db.query(SUBMISSION_UID).findOne({ where: { documentId } });
    if (!row) return ctx.notFound("Submission not found");
    if (row.submissionStatus !== "pending") return ctx.badRequest(`Submission is already ${row.submissionStatus}`);

    const project = await strapi.db.query(PROJECT_UID).findOne({ where: { projectId: row.projectId } });
    const body = (ctx.request.body ?? {}) as { note?: string };
    const reviewedBy = adminName(admin);
    const note = body.note?.trim().slice(0, 1000) || null;

    await strapi.documents(SUBMISSION_UID).update({
      documentId,
      data: { submissionStatus: "rejected", reviewedBy, reviewedAt: new Date().toISOString(), reviewNote: note },
    } as any);

    if (project) await notify(project, row, "rejected", reviewedBy, note);
    return ctx.send({ ok: true, submissionStatus: "rejected" });
  },

  async checkToken(ctx: Context) {
    const admin = await resolveSuperAdmin(ctx);
    if (!admin) return ctx.forbidden("Content Review is available to Super Admins only");
    const projectId = String(ctx.params?.projectId ?? "").trim();
    const project = await strapi.db.query(PROJECT_UID).findOne({ where: { projectId } });
    if (!project) return ctx.notFound("Project not found");
    const probe = await probeToken(project.strapiHost, project.accessToken);
    return ctx.send({ ok: true, ...probe });
  },

  async updateToken(ctx: Context) {
    const admin = await resolveSuperAdmin(ctx);
    if (!admin) return ctx.forbidden("Content Review is available to Super Admins only");
    const projectId = String(ctx.params?.projectId ?? "").trim();
    const project = await strapi.db.query(PROJECT_UID).findOne({ where: { projectId } });
    if (!project) return ctx.notFound("Project not found");

    const body = (ctx.request.body ?? {}) as { accessToken?: string };
    const accessToken = body.accessToken?.trim();
    if (!accessToken || accessToken.length < 20) return ctx.badRequest("A valid Strapi API token is required");

    const probe = await probeToken(project.strapiHost, accessToken);
    if (!probe.reachable) return ctx.badRequest(`Cannot reach ${project.strapiHost} with this token`);
    if (!probe.read) return ctx.badRequest("This token cannot read the target CMS (sitemaps) — check it was copied fully");

    // Update every version row (draft + published) so all lookups see the new token.
    await strapi.db.query(PROJECT_UID).updateMany({ where: { projectId }, data: { accessToken } });
    return ctx.send({ ok: true, ...probe });
  },
};
