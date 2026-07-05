/**
 * Shared helpers for talking to a project's target Strapi CMS.
 * Used by the dashboard-project controller and the content-submission
 * lifecycle (admin-panel review flow).
 */

export function normalizeHost(host: string): string {
  return host.replace(/\/+$/, "");
}

export async function targetFetch(host: string, token: string, path: string, init: RequestInit = {}) {
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

// Strip Strapi-managed fields (id of the DZ instance row, documentId, timestamps).
// Strapi v5 PUT on a DZ rebuilds the component rows from the payload — keeping the
// old `id` causes "components not related to the entity" because the DZ instance
// ids are managed internally.
export function cleanBlocksForPut(blocks: any[]) {
  return (blocks ?? []).map((b: any) => {
    const { id, documentId, createdAt, updatedAt, publishedAt, __component, ...rest } = b ?? {};
    return { __component, ...rest };
  });
}

export function cleanSeoForPut(seo: Record<string, unknown> | null | undefined) {
  if (!seo || typeof seo !== "object") return null;
  const { id, ...rest } = seo as any;
  return rest;
}

export type PushResult = {
  ok: boolean;
  blockCount?: number;
  updatedAt?: string | null;
  error?: string;
};

/**
 * Push a staged submission's blocks + SEO to the project's live target CMS.
 */
export async function pushSubmissionToTarget(
  project: { strapiHost: string; accessToken: string },
  submission: { pageDocumentId: string; locale?: string | null; blocks: any[]; seo?: Record<string, unknown> | null },
): Promise<PushResult> {
  const cleanedBlocks = cleanBlocksForPut(submission.blocks ?? []);
  const cleanedSeo = cleanSeoForPut(submission.seo);
  const qs = new URLSearchParams();
  if (submission.locale) qs.set("locale", submission.locale);
  qs.set("status", "published");

  try {
    const res = await targetFetch(
      project.strapiHost,
      project.accessToken,
      `/api/sitemaps/${submission.pageDocumentId}?${qs.toString()}`,
      {
        method: "PUT",
        body: JSON.stringify({
          data: { Blocks: cleanedBlocks, ...(cleanedSeo ? { SEO: cleanedSeo } : {}) },
        }),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const hint =
        res.status === 403
          ? " — the project's stored API token has no write access. Update it with a Full access token from the target Strapi (Settings → API Tokens)."
          : "";
      return { ok: false, error: `(${res.status}) ${text.slice(0, 400)}${hint}` };
    }
    const data = (await res.json()) as any;
    return { ok: true, blockCount: cleanedBlocks.length, updatedAt: data?.data?.updatedAt ?? null };
  } catch (e: any) {
    return { ok: false, error: `Cannot reach target CMS: ${e?.message ?? "unknown"}` };
  }
}
