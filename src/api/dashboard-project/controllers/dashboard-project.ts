import type { Context } from "koa";
import * as crypto from "node:crypto";
import { promisify } from "node:util";
import jwt from "jsonwebtoken";
import { buildSubmissionMessage, resolveSlackWebhook, sendSlackNotification } from "../../../helpers/slack";
import { normalizeHost, targetFetch, pushSubmissionToTarget } from "../../../helpers/target-cms";

const scryptAsync = promisify(crypto.scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

const SCRYPT_KEYLEN = 64;
const PROJECT_UID = "api::dashboard-project.dashboard-project";
const SUBMISSION_UID = "api::content-submission.content-submission";

type ProjectRole = "editor" | "lead";

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = await scryptAsync(password, salt, SCRYPT_KEYLEN);
  return `s1:${salt}:${derived.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!stored?.startsWith("s1:")) return false;
  const [, salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = await scryptAsync(password, salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(hash, "hex");
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}

function slugifyForId(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 5) || "proj";
}

function randomSuffix(len = 3): string {
  // base32-ish alphabet, lowercase, no ambiguous chars (no 0, 1, l, o)
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < len; i++) {
    out += alphabet[crypto.randomInt(alphabet.length)];
  }
  return out;
}

function generateProjectIdFromName(name: string): string {
  return (slugifyForId(name) + randomSuffix(3)).slice(0, 8);
}

function getJwtSecret(): string {
  const fromEnv = process.env.JWT_SECRET || process.env.PROJECT_JWT_SECRET;
  if (fromEnv) return fromEnv;
  const appKeys = process.env.APP_KEYS?.split(",").map((s) => s.trim()).filter(Boolean);
  if (appKeys?.length) return appKeys[0];
  return "dev-only-insecure-secret";
}

/* ─────────── Target page deep fetch (shared by targetPage + savePage snapshot) ─────────── */

async function fetchTargetPageDeep(host: string, token: string, documentId: string, locale?: string) {
  // Pass 1 — shallow fetch by documentId to discover which block UIDs are present
  const qs1 = new URLSearchParams();
  qs1.set("populate[Blocks]", "true");
  qs1.set("populate[SEO]", "true");
  if (locale) qs1.set("locale", locale);
  const res1 = await targetFetch(host, token, `/api/sitemaps/${documentId}?${qs1.toString()}`);
  if (res1.status === 404) return { status: 404 as const, row: null };
  if (!res1.ok) {
    const text = await res1.text();
    return { status: res1.status, row: null, error: text.slice(0, 200) };
  }
  const data1 = (await res1.json()) as any;
  const shallow = data1?.data;
  if (!shallow) return { status: 404 as const, row: null };

  // Pass 2 — deep-populate each block via the "on" syntax (Strapi v5 DZ rule)
  const blockUids: string[] = Array.from(
    new Set((shallow.Blocks ?? []).map((b: any) => b.__component).filter(Boolean)),
  );
  let row = shallow;
  if (blockUids.length) {
    const qs2 = new URLSearchParams();
    qs2.set("populate[SEO]", "true");
    if (locale) qs2.set("locale", locale);
    for (const uid of blockUids) {
      qs2.set(`populate[Blocks][on][${uid}][populate]`, "*");
    }
    const res2 = await targetFetch(host, token, `/api/sitemaps/${documentId}?${qs2.toString()}`);
    if (res2.ok) {
      const data2 = (await res2.json()) as any;
      row = data2?.data ?? shallow;
    }

    // Pass 3 — populate SectionDetails (commonly carries the HTML BlockID).
    // Strapi v5 won't auto-deep-populate components nested inside a DZ entry,
    // so we do a targeted second fetch and merge SectionDetails back into the
    // matching blocks by their stable Strapi id.
    const qs3 = new URLSearchParams();
    if (locale) qs3.set("locale", locale);
    for (const uid of blockUids) {
      qs3.set(`populate[Blocks][on][${uid}][populate][SectionDetails][populate]`, "*");
    }
    try {
      const res3 = await targetFetch(host, token, `/api/sitemaps/${documentId}?${qs3.toString()}`);
      if (res3.ok) {
        const data3 = (await res3.json()) as any;
        const blocksWithSD: any[] = data3?.data?.Blocks ?? [];
        // Build a map by id → SectionDetails so order changes don't break us.
        const sdById = new Map<number, any>();
        for (const b of blocksWithSD) {
          if (b?.id && b.SectionDetails) sdById.set(b.id, b.SectionDetails);
        }
        if (Array.isArray(row.Blocks)) {
          row.Blocks = row.Blocks.map((b: any) => {
            if (b?.id && sdById.has(b.id) && (b.SectionDetails == null)) {
              return { ...b, SectionDetails: sdById.get(b.id) };
            }
            return b;
          });
        }
      }
    } catch {
      /* Best effort — SectionDetails is optional. */
    }
  }
  return { status: 200 as const, row };
}

/* ─────────── Submission helpers ─────────── */

function getDashboardUrl(): string {
  return normalizeHost(process.env.DASHBOARD_URL || "http://localhost:3000");
}

function signReviewToken(submissionDocumentId: string, projectId: string): string {
  return jwt.sign(
    { type: "review", submissionId: submissionDocumentId, projectId },
    getJwtSecret(),
    { expiresIn: "7d" },
  );
}

function submissionSummary(s: any) {
  return {
    documentId: s.documentId,
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

/**
 * Resolve auth for submission review actions. Two paths:
 *  1. Project session JWT (Authorization header) — role comes from the token.
 *  2. Signed review token (?t= / body.t) scoped to ONE submission — grants lead
 *     capability for that submission only (this is what the Slack link carries).
 */
async function resolveReviewAuth(
  ctx: Context,
  submissionDocumentId: string,
): Promise<{ project: any; role: ProjectRole; via: "session" | "review-token" } | null> {
  const session = await resolveProjectFromAuth(ctx);
  if (session) return { ...session, via: "session" };

  const t = String((ctx.query?.t ?? (ctx.request.body as any)?.t ?? "")).trim();
  if (!t) return null;
  try {
    const decoded = jwt.verify(t, getJwtSecret()) as {
      type?: string;
      submissionId?: string;
      projectId?: string;
    };
    if (decoded?.type !== "review") return null;
    if (decoded.submissionId !== submissionDocumentId) return null;
    if (!decoded.projectId) return null;
    const project = await strapi.db.query(PROJECT_UID).findOne({ where: { projectId: decoded.projectId } });
    if (!project) return null;
    return { project, role: "lead", via: "review-token" };
  } catch {
    return null;
  }
}

async function notifySlack(project: any, notification: Parameters<typeof buildSubmissionMessage>[0]) {
  const webhook = resolveSlackWebhook(project);
  if (!webhook) return false;
  return sendSlackNotification(webhook, buildSubmissionMessage(notification));
}

export default {
  async register(ctx: Context) {
    const body = (ctx.request.body ?? {}) as {
      name?: string;
      password?: string;
      leadPassword?: string;
      slackWebhookUrl?: string;
      strapiHost?: string;
      accessToken?: string;
      frontendUrl?: string;
    };
    const name = body.name?.trim();
    const password = body.password;
    const leadPassword = body.leadPassword;
    const slackWebhookUrl = body.slackWebhookUrl?.trim();
    const strapiHost = body.strapiHost?.trim();
    const accessToken = body.accessToken?.trim();
    const frontendUrl = body.frontendUrl?.trim();

    if (!name || name.length < 2) return ctx.badRequest("Project name is required (min 2 chars)");
    if (!password || password.length < 6) return ctx.badRequest("Password must be at least 6 characters");
    if (!strapiHost) return ctx.badRequest("Strapi host URL is required");
    if (!/^https?:\/\//i.test(strapiHost)) return ctx.badRequest("Strapi host must start with http:// or https://");
    if (!accessToken || accessToken.length < 20) return ctx.badRequest("A valid full-access Strapi API token is required");
    if (!frontendUrl) return ctx.badRequest("Frontend URL is required");
    if (!/^https?:\/\//i.test(frontendUrl)) return ctx.badRequest("Frontend URL must start with http:// or https://");
    if (leadPassword && leadPassword.length < 6) return ctx.badRequest("Team lead password must be at least 6 characters");
    if (leadPassword && leadPassword === password) return ctx.badRequest("Team lead password must differ from the editor password");
    if (slackWebhookUrl && !/^https:\/\/hooks\.slack\.com\//i.test(slackWebhookUrl)) {
      return ctx.badRequest("Slack webhook must be a https://hooks.slack.com/... URL");
    }

    // Allocate a slug-based, unique projectId
    let projectId = "";
    for (let i = 0; i < 8; i++) {
      const candidate = generateProjectIdFromName(name);
      const existing = await strapi.db.query(PROJECT_UID).findOne({ where: { projectId: candidate } });
      if (!existing) { projectId = candidate; break; }
    }
    if (!projectId) return ctx.internalServerError("Could not allocate a project ID, try again");

    // Probe the target Strapi connection before persisting (fail fast on bad host/token)
    let probeOk = false;
    let probeMessage = "";
    try {
      const res = await targetFetch(strapiHost, accessToken, "/api/users-permissions/roles");
      if (res.ok) probeOk = true;
      else {
        // Some Strapis lock down users-permissions. Try a softer probe.
        const res2 = await targetFetch(strapiHost, accessToken, "/admin/init");
        if (res2.ok) probeOk = true;
        else probeMessage = `Probe got ${res.status} / ${res2.status}`;
      }
    } catch (e: any) {
      probeMessage = e?.message ?? "unreachable";
    }
    if (!probeOk) {
      return ctx.badRequest(`Could not reach your Strapi at ${strapiHost}. ${probeMessage}`);
    }

    const passwordHash = await hashPassword(password);
    const leadPasswordHash = leadPassword ? await hashPassword(leadPassword) : null;
    const created = await strapi.documents(PROJECT_UID).create({
      data: {
        name,
        projectId,
        passwordHash,
        leadPasswordHash,
        slackWebhookUrl: slackWebhookUrl || null,
        strapiHost: normalizeHost(strapiHost),
        accessToken,
        frontendUrl: normalizeHost(frontendUrl),
      },
      status: "published",
    } as any);

    return ctx.send({
      ok: true,
      project: {
        projectId: created.projectId,
        name: created.name,
        strapiHost: created.strapiHost,
        frontendUrl: created.frontendUrl,
        hasLeadPassword: Boolean(leadPasswordHash),
      },
    });
  },

  async login(ctx: Context) {
    const body = (ctx.request.body ?? {}) as { projectId?: string; password?: string };
    const projectId = body.projectId?.trim().toLowerCase();
    const password = body.password;
    if (!projectId || !password) return ctx.badRequest("projectId and password required");

    const project = await strapi.db.query(PROJECT_UID).findOne({ where: { projectId } });
    if (!project) return ctx.unauthorized("Invalid project ID or password");

    // One login form, two credentials: the editor password grants "editor",
    // the team-lead password grants "lead" (publish/reject rights).
    let role: ProjectRole | null = null;
    if (await verifyPassword(password, (project as any).passwordHash)) role = "editor";
    else if ((project as any).leadPasswordHash && (await verifyPassword(password, (project as any).leadPasswordHash))) role = "lead";
    if (!role) return ctx.unauthorized("Invalid project ID or password");

    const token = jwt.sign(
      { projectId: project.projectId, documentId: project.documentId, type: "project", role },
      getJwtSecret(),
      { expiresIn: "7d" },
    );
    return ctx.send({
      ok: true,
      token,
      project: {
        projectId: project.projectId,
        name: project.name,
        strapiHost: project.strapiHost,
        frontendUrl: project.frontendUrl,
        role,
        hasLeadPassword: Boolean((project as any).leadPasswordHash),
      },
    });
  },

  async me(ctx: Context) {
    const auth = await resolveProjectFromAuth(ctx);
    if (!auth) return ctx.unauthorized();
    const { project, role } = auth;
    return ctx.send({
      ok: true,
      project: {
        projectId: project.projectId,
        name: project.name,
        strapiHost: project.strapiHost,
        frontendUrl: project.frontendUrl,
        role,
        hasLeadPassword: Boolean((project as any).leadPasswordHash),
      },
    });
  },

  // Bootstrap / rotate the team-lead credential. First set is open to the
  // project session (whoever registered the project); after that, lead only.
  async setLeadPassword(ctx: Context) {
    const auth = await resolveProjectFromAuth(ctx);
    if (!auth) return ctx.unauthorized();
    const { project, role } = auth;

    const body = (ctx.request.body ?? {}) as { leadPassword?: string; slackWebhookUrl?: string };
    const leadPassword = body.leadPassword;
    const slackWebhookUrl = body.slackWebhookUrl?.trim();

    if ((project as any).leadPasswordHash && role !== "lead") {
      return ctx.forbidden("Only the team lead can change the lead password or Slack webhook");
    }
    if (!leadPassword || leadPassword.length < 6) return ctx.badRequest("Team lead password must be at least 6 characters");
    if (slackWebhookUrl && !/^https:\/\/hooks\.slack\.com\//i.test(slackWebhookUrl)) {
      return ctx.badRequest("Slack webhook must be a https://hooks.slack.com/... URL");
    }

    await strapi.documents(PROJECT_UID).update({
      documentId: project.documentId,
      data: {
        leadPasswordHash: await hashPassword(leadPassword),
        ...(slackWebhookUrl !== undefined ? { slackWebhookUrl: slackWebhookUrl || null } : {}),
      },
      status: "published",
    } as any);

    return ctx.send({ ok: true, hasLeadPassword: true });
  },

  /* ─────────── Target Strapi introspection ─────────── */

  // List all standalone pages from the user's Strapi sitemap collection
  // (and optionally other "detail" content-types).
  async targetPages(ctx: Context) {
    const auth = await resolveProjectFromAuth(ctx);
    if (!auth) return ctx.unauthorized();
    const host = (auth.project as any).strapiHost as string;
    const token = (auth.project as any).accessToken as string;

    try {
      const res = await targetFetch(host, token, "/api/sitemaps?pagination[limit]=200&populate[Blocks]=true");
      if (!res.ok) {
        const text = await res.text();
        return ctx.badRequest(`Target CMS error (${res.status}): ${text.slice(0, 200)}`);
      }
      const data = (await res.json()) as any;
      const pages = (data?.data ?? []).map((row: any) => ({
        id: row.id,
        documentId: row.documentId,
        title: row.PageTitle,
        url: row.PageURL,
        pageType: row.PageType,
        locale: row.locale,
        blockCount: Array.isArray(row.Blocks) ? row.Blocks.length : 0,
        blocks: Array.isArray(row.Blocks)
          ? row.Blocks.map((b: any) => ({
              __component: b.__component,
              id: b.id,
            }))
          : [],
      }));
      return ctx.send({ ok: true, count: pages.length, pages });
    } catch (e: any) {
      return ctx.badRequest(`Cannot reach target CMS: ${e?.message ?? "unknown"}`);
    }
  },

  // Full blocks (with attributes filled) for a single sitemap entry.
  // Lookup is by documentId (locale-stable, unique) + optional locale.
  async targetPage(ctx: Context) {
    const auth = await resolveProjectFromAuth(ctx);
    if (!auth) return ctx.unauthorized();
    const host = (auth.project as any).strapiHost as string;
    const token = (auth.project as any).accessToken as string;
    const documentId = String(ctx.query?.documentId ?? "").trim();
    const locale = String(ctx.query?.locale ?? "").trim();
    if (!documentId) return ctx.badRequest("documentId query is required");

    try {
      const result = await fetchTargetPageDeep(host, token, documentId, locale || undefined);
      if (result.status === 404 || !result.row) {
        if (result.status !== 404 && (result as any).error) {
          return ctx.badRequest(`Target CMS error (${result.status}): ${(result as any).error}`);
        }
        return ctx.notFound(`No sitemap entry with documentId="${documentId}"`);
      }
      const row = result.row;
      return ctx.send({
        ok: true,
        page: {
          id: row.id,
          documentId: row.documentId,
          title: row.PageTitle,
          url: row.PageURL,
          pageType: row.PageType,
          locale: row.locale,
          seo: row.SEO ?? null,
          blocks: row.Blocks ?? [],
        },
      });
    } catch (e: any) {
      return ctx.badRequest(`Cannot reach target CMS: ${e?.message ?? "unknown"}`);
    }
  },

  /* ─────────── Staged save + approval workflow ───────────
   * Saving from the dashboard NEVER writes to the project's target CMS.
   * It stages the edit as a pending content-submission here, snapshots the
   * currently-live content for diffing, and pings the team lead on Slack.
   * Only a "lead" session (or the signed review link from Slack) can publish. */

  async savePage(ctx: Context) {
    const auth = await resolveProjectFromAuth(ctx);
    if (!auth) return ctx.unauthorized();
    const { project, role } = auth;
    const host = (project as any).strapiHost as string;
    const token = (project as any).accessToken as string;

    const body = (ctx.request.body ?? {}) as {
      documentId?: string;
      locale?: string;
      blocks?: any[];
      seo?: Record<string, unknown> | null;
      submittedBy?: string;
    };
    const documentId = body.documentId?.trim();
    const locale = body.locale?.trim();
    if (!documentId) return ctx.badRequest("documentId required");
    if (!Array.isArray(body.blocks)) return ctx.badRequest("blocks (array) required");

    // Snapshot what's live right now so reviewers get a before/after diff.
    let previousBlocks: any[] | null = null;
    let previousSeo: any = null;
    let pageTitle = "";
    let pageUrl = "";
    try {
      const snap = await fetchTargetPageDeep(host, token, documentId, locale || undefined);
      if (snap.row) {
        previousBlocks = snap.row.Blocks ?? [];
        previousSeo = snap.row.SEO ?? null;
        pageTitle = snap.row.PageTitle ?? "";
        pageUrl = snap.row.PageURL ?? "";
      }
    } catch {
      /* Best effort — a missing snapshot must not block the submission. */
    }

    const submission = await strapi.documents(SUBMISSION_UID).create({
      data: {
        project: project.id,
        projectId: project.projectId,
        pageDocumentId: documentId,
        pageTitle,
        pageUrl,
        locale: locale || null,
        blocks: body.blocks,
        seo: body.seo ?? null,
        previousBlocks,
        previousSeo,
        submissionStatus: "pending",
        submittedBy: body.submittedBy?.trim().slice(0, 120) || role,
      },
    } as any);

    // The review button opens DASHBOARD_URL (the content-dash-be admin panel),
    // where a super admin verifies the submission and flips its review status.
    const slackNotified = await notifySlack(project, {
      kind: "submitted",
      projectName: project.name,
      projectId: project.projectId,
      pageTitle,
      pageUrl,
      frontendUrl: (project as any).frontendUrl ?? undefined,
      locale: locale || undefined,
      blockCount: body.blocks.length,
      submittedBy: body.submittedBy?.trim() || role,
      reviewUrl: getDashboardUrl(),
      submissionId: submission.documentId,
    });

    return ctx.send({
      ok: true,
      submitted: true,
      submissionId: submission.documentId,
      submissionStatus: "pending",
      slackNotified,
    });
  },

  async listSubmissions(ctx: Context) {
    const auth = await resolveProjectFromAuth(ctx);
    if (!auth) return ctx.unauthorized();
    const { project } = auth;

    const status = String(ctx.query?.status ?? "").trim();
    const where: Record<string, unknown> = { projectId: project.projectId };
    if (status && ["pending", "published", "rejected"].includes(status)) where.submissionStatus = status;

    const rows = await strapi.db.query(SUBMISSION_UID).findMany({
      where,
      orderBy: { createdAt: "desc" },
      limit: 100,
    });
    return ctx.send({
      ok: true,
      count: rows.length,
      role: auth.role,
      submissions: rows.map(submissionSummary),
    });
  },

  async getSubmission(ctx: Context) {
    const submissionId = String(ctx.params?.documentId ?? "").trim();
    if (!submissionId) return ctx.badRequest("submission documentId required");

    const auth = await resolveReviewAuth(ctx, submissionId);
    if (!auth) return ctx.unauthorized();

    const row = await strapi.db.query(SUBMISSION_UID).findOne({
      where: { documentId: submissionId, projectId: auth.project.projectId },
    });
    if (!row) return ctx.notFound("Submission not found");

    return ctx.send({
      ok: true,
      role: auth.role,
      via: auth.via,
      project: { projectId: auth.project.projectId, name: auth.project.name, frontendUrl: auth.project.frontendUrl },
      submission: {
        ...submissionSummary(row),
        blocks: row.blocks ?? [],
        seo: row.seo ?? null,
        previousBlocks: row.previousBlocks ?? null,
        previousSeo: row.previousSeo ?? null,
      },
    });
  },

  // Lead-only: verify + push the staged content to the project's target CMS.
  async publishSubmission(ctx: Context) {
    const submissionId = String(ctx.params?.documentId ?? "").trim();
    if (!submissionId) return ctx.badRequest("submission documentId required");

    const auth = await resolveReviewAuth(ctx, submissionId);
    if (!auth) return ctx.unauthorized();
    if (auth.role !== "lead") return ctx.forbidden("Only the team lead can publish content to the live CMS");
    const { project } = auth;

    const row = await strapi.db.query(SUBMISSION_UID).findOne({
      where: { documentId: submissionId, projectId: project.projectId },
    });
    if (!row) return ctx.notFound("Submission not found");
    if (row.submissionStatus !== "pending") {
      return ctx.badRequest(`Submission is already ${row.submissionStatus}`);
    }

    const body = (ctx.request.body ?? {}) as { reviewedBy?: string; note?: string };
    const reviewedBy = body.reviewedBy?.trim().slice(0, 120) || "lead";

    const result = await pushSubmissionToTarget(project as any, {
      pageDocumentId: row.pageDocumentId,
      locale: row.locale,
      blocks: row.blocks ?? [],
      seo: row.seo,
    });
    if (!result.ok) {
      await strapi.documents(SUBMISSION_UID).update({
        documentId: submissionId,
        data: { publishError: result.error },
      } as any);
      return ctx.badRequest(`Publish failed: ${result.error}`);
    }

    await strapi.documents(SUBMISSION_UID).update({
      documentId: submissionId,
      data: {
        submissionStatus: "published",
        reviewedBy,
        reviewedAt: new Date().toISOString(),
        reviewNote: body.note?.trim().slice(0, 1000) || null,
        publishedToTargetAt: new Date().toISOString(),
        publishError: null,
      },
    } as any);

    await notifySlack(project, {
      kind: "published",
      projectName: project.name,
      projectId: project.projectId,
      pageTitle: row.pageTitle,
      pageUrl: row.pageUrl,
      frontendUrl: (project as any).frontendUrl ?? undefined,
      locale: row.locale ?? undefined,
      blockCount: result.blockCount,
      submittedBy: row.submittedBy ?? undefined,
      reviewedBy,
      reviewNote: body.note?.trim() || undefined,
      dashboardUrl: getDashboardUrl(),
      submissionId,
    });

    return ctx.send({
      ok: true,
      submissionId,
      submissionStatus: "published",
      blockCount: result.blockCount,
      updatedAt: result.updatedAt,
    });
  },

  // Lead-only: reject the staged content with an optional note back to the editor.
  async rejectSubmission(ctx: Context) {
    const submissionId = String(ctx.params?.documentId ?? "").trim();
    if (!submissionId) return ctx.badRequest("submission documentId required");

    const auth = await resolveReviewAuth(ctx, submissionId);
    if (!auth) return ctx.unauthorized();
    if (auth.role !== "lead") return ctx.forbidden("Only the team lead can reject submissions");
    const { project } = auth;

    const row = await strapi.db.query(SUBMISSION_UID).findOne({
      where: { documentId: submissionId, projectId: project.projectId },
    });
    if (!row) return ctx.notFound("Submission not found");
    if (row.submissionStatus !== "pending") {
      return ctx.badRequest(`Submission is already ${row.submissionStatus}`);
    }

    const body = (ctx.request.body ?? {}) as { reviewedBy?: string; note?: string };
    const reviewedBy = body.reviewedBy?.trim().slice(0, 120) || "lead";
    const note = body.note?.trim().slice(0, 1000) || null;

    await strapi.documents(SUBMISSION_UID).update({
      documentId: submissionId,
      data: {
        submissionStatus: "rejected",
        reviewedBy,
        reviewedAt: new Date().toISOString(),
        reviewNote: note,
      },
    } as any);

    await notifySlack(project, {
      kind: "rejected",
      projectName: project.name,
      projectId: project.projectId,
      pageTitle: row.pageTitle,
      pageUrl: row.pageUrl,
      frontendUrl: (project as any).frontendUrl ?? undefined,
      locale: row.locale ?? undefined,
      blockCount: Array.isArray(row.blocks) ? row.blocks.length : 0,
      submittedBy: row.submittedBy ?? undefined,
      reviewedBy,
      reviewNote: note ?? undefined,
      dashboardUrl: getDashboardUrl(),
      submissionId,
    });

    return ctx.send({ ok: true, submissionId, submissionStatus: "rejected" });
  },

  // All component schemas in the user's CMS — grouped into blocks / elements / globals / etc.
  async targetComponents(ctx: Context) {
    const auth = await resolveProjectFromAuth(ctx);
    if (!auth) return ctx.unauthorized();
    const host = (auth.project as any).strapiHost as string;
    const token = (auth.project as any).accessToken as string;

    // Strapi exposes the content-type-builder at /content-type-builder/components.
    // This requires an admin JWT in many setups; full-access API tokens may not work.
    // We try a couple of endpoints and fall back gracefully.
    const tries = [
      "/content-type-builder/components",
      "/api/content-type-builder/components",
    ];
    for (const path of tries) {
      try {
        const res = await targetFetch(host, token, path);
        if (res.ok) {
          const data = (await res.json()) as any;
          const raw = data?.data ?? data ?? [];
          const blocks = (Array.isArray(raw) ? raw : []).map((c: any) => {
            const uid = c.uid ?? c.modelName ?? "";
            return {
              uid,
              category: c.category ?? uid.split(".")[0],
              modelName: c.modelName ?? uid.split(".")[1],
              displayName: c.info?.displayName ?? c.schema?.info?.displayName ?? uid,
              icon: c.info?.icon ?? c.schema?.info?.icon ?? null,
              attributes: c.attributes ?? c.schema?.attributes ?? {},
            };
          });
          return ctx.send({ ok: true, count: blocks.length, blocks, source: path });
        }
      } catch {
        // try next
      }
    }
    return ctx.send({ ok: true, count: 0, blocks: [], source: "none",
      hint: "Your token may not have content-type-builder access. Components will be inferred from page block usage instead." });
  },
};

async function resolveProjectFromAuth(
  ctx: Context,
): Promise<{ project: any; role: ProjectRole } | null> {
  const auth = ctx.request.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const decoded = jwt.verify(auth.slice(7), getJwtSecret()) as { projectId?: string; role?: string; type?: string };
    if (!decoded?.projectId || decoded.type !== "project") return null;
    const project = await strapi.db.query(PROJECT_UID).findOne({
      where: { projectId: decoded.projectId },
    });
    if (!project) return null;
    // Tokens minted before roles existed default to the lower privilege.
    const role: ProjectRole = decoded.role === "lead" ? "lead" : "editor";
    return { project, role };
  } catch {
    return null;
  }
}
