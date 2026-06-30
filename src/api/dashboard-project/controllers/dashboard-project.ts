import type { Context } from "koa";
import * as crypto from "node:crypto";
import { promisify } from "node:util";
import jwt from "jsonwebtoken";

const scryptAsync = promisify(crypto.scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

const SCRYPT_KEYLEN = 64;
const PROJECT_UID = "api::dashboard-project.dashboard-project";

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

function normalizeHost(host: string): string {
  return host.replace(/\/+$/, "");
}

async function targetFetch(host: string, token: string, path: string, init: RequestInit = {}) {
  const url = `${normalizeHost(host)}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  return res;
}

export default {
  async register(ctx: Context) {
    const body = (ctx.request.body ?? {}) as {
      name?: string;
      password?: string;
      strapiHost?: string;
      accessToken?: string;
      frontendUrl?: string;
    };
    const name = body.name?.trim();
    const password = body.password;
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
    const created = await strapi.documents(PROJECT_UID).create({
      data: {
        name,
        projectId,
        passwordHash,
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
    const ok = await verifyPassword(password, (project as any).passwordHash);
    if (!ok) return ctx.unauthorized("Invalid project ID or password");

    const token = jwt.sign(
      { projectId: project.projectId, documentId: project.documentId, type: "project" },
      getJwtSecret(),
      { expiresIn: "7d" },
    );
    return ctx.send({
      ok: true,
      token,
      project: { projectId: project.projectId, name: project.name, strapiHost: project.strapiHost, frontendUrl: project.frontendUrl },
    });
  },

  async me(ctx: Context) {
    const project = await resolveProjectFromAuth(ctx);
    if (!project) return ctx.unauthorized();
    return ctx.send({
      ok: true,
      project: {
        projectId: project.projectId,
        name: project.name,
        strapiHost: project.strapiHost,
        frontendUrl: project.frontendUrl,
      },
    });
  },

  /* ─────────── Target Strapi introspection ─────────── */

  // List all standalone pages from the user's Strapi sitemap collection
  // (and optionally other "detail" content-types).
  async targetPages(ctx: Context) {
    const project = await resolveProjectFromAuth(ctx);
    if (!project) return ctx.unauthorized();
    const host = (project as any).strapiHost as string;
    const token = (project as any).accessToken as string;

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
    const project = await resolveProjectFromAuth(ctx);
    if (!project) return ctx.unauthorized();
    const host = (project as any).strapiHost as string;
    const token = (project as any).accessToken as string;
    const documentId = String(ctx.query?.documentId ?? "").trim();
    const locale = String(ctx.query?.locale ?? "").trim();
    if (!documentId) return ctx.badRequest("documentId query is required");

    try {
      // Pass 1 — shallow fetch by documentId to discover which block UIDs are present
      const qs1 = new URLSearchParams();
      qs1.set("populate[Blocks]", "true");
      qs1.set("populate[SEO]", "true");
      if (locale) qs1.set("locale", locale);
      const res1 = await targetFetch(host, token, `/api/sitemaps/${documentId}?${qs1.toString()}`);
      if (res1.status === 404) return ctx.notFound(`No sitemap entry with documentId="${documentId}"`);
      if (!res1.ok) {
        const text = await res1.text();
        return ctx.badRequest(`Target CMS error (${res1.status}): ${text.slice(0, 200)}`);
      }
      const data1 = (await res1.json()) as any;
      const shallow = data1?.data;
      if (!shallow) return ctx.notFound(`No sitemap entry with documentId="${documentId}"`);

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

  // Save updated blocks for a sitemap entry. PUTs to the user's Strapi.
  async savePage(ctx: Context) {
    const project = await resolveProjectFromAuth(ctx);
    if (!project) return ctx.unauthorized();
    const host = (project as any).strapiHost as string;
    const token = (project as any).accessToken as string;

    const body = (ctx.request.body ?? {}) as {
      documentId?: string;
      locale?: string;
      blocks?: any[];
    };
    const documentId = body.documentId?.trim();
    const locale = body.locale?.trim();
    if (!documentId) return ctx.badRequest("documentId required");
    if (!Array.isArray(body.blocks)) return ctx.badRequest("blocks (array) required");

    // Strip Strapi-managed fields (id of the DZ instance row, documentId, timestamps).
    // Strapi v5 PUT on a DZ rebuilds the component rows from the payload — keeping the
    // old `id` causes "components not related to the entity" because the DZ instance
    // ids are managed internally.
    const cleanedBlocks = body.blocks.map((b: any) => {
      const { id, documentId, createdAt, updatedAt, publishedAt, __component, ...rest } = b ?? {};
      return { __component, ...rest };
    });

    const qs = new URLSearchParams();
    if (locale) qs.set("locale", locale);
    qs.set("status", "published");
    try {
      const res = await targetFetch(host, token, `/api/sitemaps/${documentId}?${qs.toString()}`, {
        method: "PUT",
        body: JSON.stringify({ data: { Blocks: cleanedBlocks } }),
      });
      if (!res.ok) {
        const text = await res.text();
        return ctx.badRequest(`Save failed (${res.status}): ${text.slice(0, 400)}`);
      }
      const data = (await res.json()) as any;
      return ctx.send({ ok: true, documentId, blockCount: cleanedBlocks.length, updatedAt: data?.data?.updatedAt ?? null });
    } catch (e: any) {
      return ctx.badRequest(`Cannot reach target CMS: ${e?.message ?? "unknown"}`);
    }
  },

  // All component schemas in the user's CMS — grouped into blocks / elements / globals / etc.
  async targetComponents(ctx: Context) {
    const project = await resolveProjectFromAuth(ctx);
    if (!project) return ctx.unauthorized();
    const host = (project as any).strapiHost as string;
    const token = (project as any).accessToken as string;

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

async function resolveProjectFromAuth(ctx: Context) {
  const auth = ctx.request.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const decoded = jwt.verify(auth.slice(7), getJwtSecret()) as { projectId?: string };
    if (!decoded?.projectId) return null;
    return await strapi.db.query(PROJECT_UID).findOne({
      where: { projectId: decoded.projectId },
    });
  } catch {
    return null;
  }
}
