/**
 * Field-level diff between the live snapshot and the staged blocks.
 * Mirrors content-dash-fe/src/lib/dashboard/submission-diff.ts, with one
 * addition: added/removed blocks list their field values so the reviewer
 * sees the full content, not just a label.
 */

const STRAPI_MANAGED = new Set(["id", "documentId", "createdAt", "updatedAt", "publishedAt", "__component"]);

function display(v) {
    if (v === undefined || v === null) return null;
    if (typeof v === "string") return v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    try {
        const s = JSON.stringify(v);
        return s.length > 400 ? `${s.slice(0, 400)}…` : s;
    } catch {
        return String(v);
    }
}

function stripManaged(v) {
    if (Array.isArray(v)) return v.map(stripManaged);
    if (v && typeof v === "object") {
        const out = {};
        for (const [k, val] of Object.entries(v)) {
            if (STRAPI_MANAGED.has(k)) continue;
            out[k] = stripManaged(val);
        }
        return out;
    }
    return v;
}

function collectChanges(before, after, path, out) {
    const b = stripManaged(before);
    const a = stripManaged(after);
    if (JSON.stringify(b) === JSON.stringify(a)) return;

    const bothObjects = b && a && typeof b === "object" && typeof a === "object" && !Array.isArray(b) && !Array.isArray(a);
    if (bothObjects) {
        const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
        for (const k of keys) {
            collectChanges(b[k], a[k], path ? `${path}.${k}` : k, out);
        }
        return;
    }
    out.push({ path: path || "(value)", before: display(b), after: display(a) });
}

export function diffBlocks(previous, next) {
    const prev = previous ?? [];
    const usedPrev = new Set();

    const matchPrev = (block, index) => {
        if (block?.id != null) {
            const byId = prev.findIndex((p, i) => !usedPrev.has(i) && p?.id === block.id && p?.__component === block.__component);
            if (byId !== -1) return byId;
        }
        if (index < prev.length && !usedPrev.has(index) && prev[index]?.__component === block?.__component) return index;
        return -1;
    };

    const diffs = next.map((block, i) => {
        const pi = matchPrev(block, i);
        if (pi === -1) {
            const changes = [];
            collectChanges({}, block, "", changes);
            return { kind: "added", component: block?.__component ?? "unknown", index: i, changes };
        }
        usedPrev.add(pi);
        const changes = [];
        collectChanges(prev[pi], block, "", changes);
        return { kind: changes.length ? "changed" : "unchanged", component: block?.__component ?? "unknown", index: i, changes };
    });

    prev.forEach((p, i) => {
        if (!usedPrev.has(i)) {
            const changes = [];
            collectChanges(p, {}, "", changes);
            diffs.push({ kind: "removed", component: p?.__component ?? "unknown", index: i, changes });
        }
    });

    return diffs;
}

export function diffSeo(previous, next) {
    const changes = [];
    collectChanges(previous ?? {}, next ?? {}, "", changes);
    return changes;
}

export function componentLabel(uid) {
    const name = (uid ?? "").split(".").pop() ?? uid;
    return name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatDate(iso) {
    if (!iso) return "—";
    try {
        return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
    } catch {
        return iso;
    }
}

export function livePageUrl(frontendUrl, pageUrl) {
    if (!frontendUrl) return null;
    const base = frontendUrl.replace(/\/+$/, "");
    const slug = (pageUrl ?? "").replace(/^\/+/, "");
    if (!slug || slug === "homepage" || slug === "home") return `${base}/`;
    return `${base}/${slug}`;
}
