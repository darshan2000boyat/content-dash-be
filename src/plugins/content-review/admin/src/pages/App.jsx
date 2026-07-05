import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useFetchClient } from "@strapi/strapi/admin";
import { Box, Flex, Typography, Button, Textarea, Loader } from "@strapi/design-system";
import { ArrowLeft, ExternalLink } from "@strapi/icons";
import styled, { keyframes } from "styled-components";
import { diffBlocks, diffSeo, componentLabel, formatDate, livePageUrl } from "../utils/diff";

/* ────────────────────────── styled primitives ────────────────────────── */

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: none; }
`;

const Page = styled(Box)`
  min-height: 100vh;
  animation: ${fadeIn} 0.25s ease;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
`;

const ProjectCard = styled(Box)`
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
  border: 1px solid ${({ theme }) => theme.colors.neutral150};
  &:hover {
    transform: translateY(-2px);
    box-shadow: ${({ theme }) => theme.shadows.popupShadow};
    border-color: ${({ theme }) => theme.colors.primary200};
  }
`;

const RowCard = styled(Box)`
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease;
  border: 1px solid ${({ theme }) => theme.colors.neutral150};
  &:hover {
    background: ${({ theme }) => theme.colors.neutral100};
    border-color: ${({ theme }) => theme.colors.primary200};
  }
`;

const Monogram = styled.div`
  width: 44px;
  height: 44px;
  border-radius: 12px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 15px;
  color: white;
  background: linear-gradient(135deg, ${({ theme }) => theme.colors.primary600}, ${({ theme }) => theme.colors.alternative600});
`;

const Mono = styled.span`
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 12px;
`;

const SegBtn = styled.button`
  border: none;
  height: 30px;
  padding: 0 14px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.12s ease;
  color: ${({ theme, $active }) => ($active ? theme.colors.neutral0 : theme.colors.neutral600)};
  background: ${({ theme, $active }) => ($active ? theme.colors.primary600 : "transparent")};
  &:hover {
    color: ${({ theme, $active }) => ($active ? theme.colors.neutral0 : theme.colors.neutral800)};
  }
`;

const DiffCell = styled.div`
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 13px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
  border: 1px solid ${({ theme, $tone }) => ($tone === "before" ? theme.colors.danger200 : theme.colors.success200)};
  background: ${({ theme, $tone }) => ($tone === "before" ? theme.colors.danger100 : theme.colors.success100)};
  color: ${({ theme }) => theme.colors.neutral800};
`;

/* ────────────────────────── tiny building blocks ────────────────────────── */

const STATUS_META = {
  pending: { label: "Pending review", bg: "warning100", border: "warning200", text: "warning700", dot: "warning600" },
  published: { label: "Published", bg: "success100", border: "success200", text: "success700", dot: "success600" },
  rejected: { label: "Rejected", bg: "danger100", border: "danger200", text: "danger700", dot: "danger600" },
};

function StatusChip({ status }) {
  const m = STATUS_META[status] ?? STATUS_META.pending;
  return (
    <Box background={m.bg} borderColor={m.border} hasRadius paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1} borderStyle="solid" borderWidth="1px">
      <Flex gap={1} alignItems="center">
        <Box background={m.dot} width="6px" height="6px" hasRadius style={{ borderRadius: "50%" }} />
        <Typography variant="pi" fontWeight="bold" textColor={m.text}>{m.label}</Typography>
      </Flex>
    </Box>
  );
}

function CountPill({ tone, value, label }) {
  const m = STATUS_META[tone];
  return (
    <Box background={m.bg} hasRadius paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1}>
      <Typography variant="pi" fontWeight="bold" textColor={m.text}>{value} {label}</Typography>
    </Box>
  );
}

function TokenChip({ health }) {
  if (!health) return <Typography variant="pi" textColor="neutral500">Checking token…</Typography>;
  if (!health.reachable) return <Typography variant="pi" textColor="danger600">⚠ CMS unreachable</Typography>;
  if (!health.write) return <Typography variant="pi" textColor="danger600">✗ Read-only token — publish will fail</Typography>;
  return <Typography variant="pi" textColor="success600">✓ Full write access</Typography>;
}

function Alert({ tone = "danger", children }) {
  const map = {
    danger: { bg: "danger100", border: "danger200", text: "danger700" },
    success: { bg: "success100", border: "success200", text: "success700" },
    info: { bg: "primary100", border: "primary200", text: "primary700" },
  }[tone];
  return (
    <Box background={map.bg} borderColor={map.border} borderStyle="solid" borderWidth="1px" hasRadius padding={3}>
      <Typography variant="omega" textColor={map.text}>{children}</Typography>
    </Box>
  );
}

function MetaItem({ label, children }) {
  return (
    <Box>
      <Typography variant="sigma" textColor="neutral500">{label}</Typography>
      <Box paddingTop={1}>
        <Typography variant="omega" textColor="neutral800">{children}</Typography>
      </Box>
    </Box>
  );
}

function Centered({ children }) {
  return (
    <Flex justifyContent="center" alignItems="center" padding={11} direction="column" gap={3}>
      {children}
    </Flex>
  );
}

/* ────────────────────────── diff rendering ────────────────────────── */

const KIND_META = {
  added: { label: "New block", bg: "success100", text: "success700", border: "success200" },
  removed: { label: "Removed", bg: "danger100", text: "danger700", border: "danger200" },
  changed: { label: "Changed", bg: "primary100", text: "primary700", border: "primary200" },
  unchanged: { label: "Unchanged", bg: "neutral100", text: "neutral600", border: "neutral200" },
};

function DiffSection({ title, changes }) {
  return (
    <Box>
      <Flex gap={4} paddingBottom={1}>
        <Box style={{ flex: 1 }}><Typography variant="sigma" textColor="danger600">Live now</Typography></Box>
        <Box style={{ flex: 1 }}><Typography variant="sigma" textColor="success600">Proposed{title ? ` — ${title}` : ""}</Typography></Box>
      </Flex>
      {changes.map((c, i) => (
        <Box key={`${c.path}-${i}`} paddingTop={2}>
          <Mono style={{ opacity: 0.65 }}>{c.path}</Mono>
          <Flex gap={4} paddingTop={1} alignItems="stretch">
            <Box style={{ flex: 1 }}><DiffCell $tone="before">{c.before ?? <em style={{ opacity: 0.5 }}>empty</em>}</DiffCell></Box>
            <Box style={{ flex: 1 }}><DiffCell $tone="after">{c.after ?? <em style={{ opacity: 0.5 }}>empty</em>}</DiffCell></Box>
          </Flex>
        </Box>
      ))}
    </Box>
  );
}

function BlockDiffCard({ diff }) {
  const meta = KIND_META[diff.kind];
  const countLabel = diff.kind === "changed" ? `${diff.changes.length} change${diff.changes.length === 1 ? "" : "s"}` : meta.label;
  return (
    <Box background="neutral0" hasRadius shadow="tableShadow" overflow="hidden">
      <Box background="neutral100" padding={3} borderColor="neutral150" borderStyle="solid" borderWidth="0 0 1px 0">
        <Flex justifyContent="space-between" alignItems="center">
          <Flex gap={2} alignItems="baseline">
            <Typography variant="delta" textColor="neutral800">{componentLabel(diff.component)}</Typography>
            <Mono style={{ opacity: 0.55 }}>{diff.component}</Mono>
          </Flex>
          <Box background={meta.bg} borderColor={meta.border} borderStyle="solid" borderWidth="1px" hasRadius paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1}>
            <Typography variant="pi" fontWeight="bold" textColor={meta.text}>{countLabel}</Typography>
          </Box>
        </Flex>
      </Box>
      {diff.changes.length > 0 && diff.kind !== "unchanged" && (
        <Box padding={4}>
          <DiffSection changes={diff.changes} />
        </Box>
      )}
    </Box>
  );
}

/* ────────────────────────── main app ────────────────────────── */

export default function App() {
  const { get, post, put } = useFetchClient();

  const [view, setView] = useState({ name: "projects" });
  const [projects, setProjects] = useState(null);
  const [health, setHealth] = useState({});
  const [error, setError] = useState(null);
  const [forbidden, setForbidden] = useState(false);

  const loadProjects = useCallback(async () => {
    setError(null);
    try {
      const { data } = await get("/content-review/projects");
      setProjects(data.projects ?? []);
      // Token health, in parallel, without blocking the page.
      (data.projects ?? []).forEach(async (p) => {
        try {
          const res = await get(`/content-review/projects/${p.projectId}/check-token`);
          setHealth((h) => ({ ...h, [p.projectId]: res.data }));
        } catch {
          setHealth((h) => ({ ...h, [p.projectId]: { reachable: false } }));
        }
      });
    } catch (e) {
      if (e?.response?.status === 403) setForbidden(true);
      else setError(e?.message ?? "Could not load projects");
      setProjects([]);
    }
  }, [get]);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  const totals = useMemo(() => {
    const t = { pending: 0, published: 0, rejected: 0 };
    for (const p of projects ?? []) {
      t.pending += p.counts.pending; t.published += p.counts.published; t.rejected += p.counts.rejected;
    }
    return t;
  }, [projects]);

  if (forbidden) {
    return (
      <Page background="neutral100" padding={10}>
        <Centered>
          <Typography variant="alpha">🔒</Typography>
          <Typography variant="beta" textColor="neutral800">Super Admin only</Typography>
          <Typography variant="omega" textColor="neutral600">Content Review is restricted to users with the Super Admin role.</Typography>
        </Centered>
      </Page>
    );
  }

  return (
    <Page background="neutral100" padding={8}>
      <Flex justifyContent="space-between" alignItems="flex-start" paddingBottom={6}>
        <Box>
          <Typography variant="alpha" textColor="neutral800">Content Review</Typography>
          <Box paddingTop={1}>
            <Typography variant="epsilon" textColor="neutral600">
              Staged content updates from the dashboard — verify and publish them to each project's live CMS.
            </Typography>
          </Box>
        </Box>
        <Button variant="tertiary" onClick={() => { setProjects(null); setHealth({}); loadProjects(); }}>Refresh</Button>
      </Flex>

      {error && <Box paddingBottom={4}><Alert>{error}</Alert></Box>}

      {view.name === "projects" && (
        <ProjectsView projects={projects} totals={totals} health={health}
          onOpen={(p) => setView({ name: "submissions", project: p })} />
      )}
      {view.name === "submissions" && (
        <SubmissionsView project={view.project} health={health[view.project.projectId]}
          onBack={() => { setView({ name: "projects" }); loadProjects(); }}
          onHealthChange={(h) => setHealth((m) => ({ ...m, [view.project.projectId]: h }))}
          onOpen={(s) => setView({ name: "detail", project: view.project, submissionId: s.documentId })}
          get={get} put={put} />
      )}
      {view.name === "detail" && (
        <DetailView project={view.project} submissionId={view.submissionId}
          onBack={() => setView({ name: "submissions", project: view.project })}
          get={get} post={post} />
      )}
    </Page>
  );
}

/* ────────────────────────── view: projects ────────────────────────── */

function ProjectsView({ projects, totals, health, onOpen }) {
  if (projects === null) return <Centered><Loader>Loading projects…</Loader></Centered>;
  if (projects.length === 0) {
    return <Centered>
      <Typography variant="beta" textColor="neutral800">No projects yet</Typography>
      <Typography variant="omega" textColor="neutral600">Projects registered in the content dashboard will appear here with their submissions.</Typography>
    </Centered>;
  }

  return (
    <>
      <Flex gap={4} paddingBottom={6} wrap="wrap">
        {["pending", "published", "rejected"].map((k) => {
          const m = STATUS_META[k];
          return (
            <Box key={k} background="neutral0" hasRadius shadow="tableShadow" padding={4} style={{ minWidth: 170, flex: "0 1 auto" }}>
              <Flex gap={2} alignItems="center">
                <Box background={m.dot} width="8px" height="8px" style={{ borderRadius: "50%" }} />
                <Typography variant="sigma" textColor="neutral500">{m.label}</Typography>
              </Flex>
              <Box paddingTop={1}>
                <Typography variant="alpha" textColor="neutral800">{totals[k]}</Typography>
              </Box>
            </Box>
          );
        })}
      </Flex>

      <Grid>
        {projects.map((p) => (
          <ProjectCard key={p.projectId} background="neutral0" hasRadius shadow="tableShadow" padding={5} onClick={() => onOpen(p)}>
            <Flex gap={3} alignItems="flex-start">
              <Monogram>{p.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</Monogram>
              <Box style={{ minWidth: 0, flex: 1 }}>
                <Typography variant="delta" textColor="neutral800" ellipsis>{p.name}</Typography>
                <Box paddingTop={1}><Mono style={{ opacity: 0.6 }}>{p.projectId} · {p.strapiHost.replace(/^https?:\/\//, "")}</Mono></Box>
              </Box>
            </Flex>
            <Flex gap={2} paddingTop={4} wrap="wrap">
              <CountPill tone="pending" value={p.counts.pending} label="pending" />
              <CountPill tone="published" value={p.counts.published} label="published" />
              <CountPill tone="rejected" value={p.counts.rejected} label="rejected" />
            </Flex>
            <Box paddingTop={3}>
              <TokenChip health={health[p.projectId]} />
            </Box>
          </ProjectCard>
        ))}
      </Grid>
    </>
  );
}

/* ────────────────────────── view: submissions list ────────────────────────── */

const FILTERS = [
  { key: "pending", label: "Pending" },
  { key: "published", label: "Published" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

function SubmissionsView({ project, health, onBack, onOpen, onHealthChange, get, put }) {
  const [filter, setFilter] = useState("pending");
  const [rows, setRows] = useState(null);
  const [tokenOpen, setTokenOpen] = useState(false);
  const [tokenValue, setTokenValue] = useState("");
  const [tokenBusy, setTokenBusy] = useState(false);
  const [tokenMsg, setTokenMsg] = useState(null);

  const load = useCallback(async () => {
    setRows(null);
    const qs = filter === "all" ? "" : `?status=${filter}`;
    try {
      const { data } = await get(`/content-review/projects/${project.projectId}/submissions${qs}`);
      setRows(data.submissions ?? []);
    } catch {
      setRows([]);
    }
  }, [get, project.projectId, filter]);

  useEffect(() => { load(); }, [load]);

  async function saveToken() {
    if (tokenBusy) return;
    setTokenBusy(true); setTokenMsg(null);
    try {
      const { data } = await put(`/content-review/projects/${project.projectId}/token`, { accessToken: tokenValue.trim() });
      onHealthChange(data);
      setTokenMsg({ tone: "success", text: data.write ? "Token updated — full write access confirmed." : "Token updated, but it still has no write access. Publish will keep failing until a Full access token is used." });
      setTokenValue("");
    } catch (e) {
      setTokenMsg({ tone: "danger", text: e?.response?.data?.error?.message ?? "Could not update the token" });
    }
    setTokenBusy(false);
  }

  return (
    <Box>
      <Box paddingBottom={4}>
        <Button variant="tertiary" startIcon={<ArrowLeft />} onClick={onBack}>All projects</Button>
      </Box>

      <Box background="neutral0" hasRadius shadow="tableShadow" padding={5} marginBottom={4}>
        <Flex justifyContent="space-between" alignItems="flex-start" wrap="wrap" gap={3}>
          <Flex gap={3}>
            <Monogram>{project.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</Monogram>
            <Box>
              <Typography variant="beta" textColor="neutral800">{project.name}</Typography>
              <Box paddingTop={1}><Mono style={{ opacity: 0.6 }}>{project.projectId} · {project.strapiHost}</Mono></Box>
              <Box paddingTop={2}><TokenChip health={health} /></Box>
            </Box>
          </Flex>
          <Button variant={health && !health.write ? "danger-light" : "tertiary"} onClick={() => setTokenOpen((v) => !v)}>
            Update access token
          </Button>
        </Flex>

        {tokenOpen && (
          <Box paddingTop={4}>
            <Typography variant="pi" textColor="neutral600">
              Paste a <strong>Full access</strong> API token from {project.strapiHost} (Settings → API Tokens). It is verified against the CMS before being saved.
            </Typography>
            <Box paddingTop={2}>
              <Textarea value={tokenValue} onChange={(e) => setTokenValue(e.target.value)} placeholder="Paste the new API token…" />
            </Box>
            <Flex gap={2} paddingTop={2} alignItems="center">
              <Button onClick={saveToken} loading={tokenBusy || undefined} disabled={tokenValue.trim().length < 20}>Verify & save</Button>
              {tokenMsg && <Typography variant="pi" textColor={tokenMsg.tone === "success" ? "success600" : "danger600"}>{tokenMsg.text}</Typography>}
            </Flex>
          </Box>
        )}
      </Box>

      <Flex gap={1} paddingBottom={4} background="neutral0" hasRadius padding={1} style={{ display: "inline-flex" }} shadow="tableShadow">
        {FILTERS.map((f) => (
          <SegBtn key={f.key} $active={filter === f.key} onClick={() => setFilter(f.key)}>{f.label}</SegBtn>
        ))}
      </Flex>

      {rows === null ? (
        <Centered><Loader>Loading submissions…</Loader></Centered>
      ) : rows.length === 0 ? (
        <Centered>
          <Typography variant="delta" textColor="neutral700">Nothing {filter === "all" ? "here" : filter} for this project</Typography>
          <Typography variant="omega" textColor="neutral600">Content saved from the dashboard lands here for review.</Typography>
        </Centered>
      ) : (
        <Flex direction="column" gap={2} alignItems="stretch">
          {rows.map((s) => (
            <RowCard key={s.documentId} background="neutral0" hasRadius padding={4} onClick={() => onOpen(s)}>
              <Flex justifyContent="space-between" alignItems="center" gap={4} wrap="wrap">
                <Box style={{ minWidth: 0, flex: 2 }}>
                  <Typography variant="delta" textColor="neutral800" ellipsis>{s.pageTitle || "Untitled page"}</Typography>
                  <Box paddingTop={1}><Mono style={{ opacity: 0.6 }}>/{s.pageUrl || ""}{s.locale ? ` · ${s.locale.toUpperCase()}` : ""}</Mono></Box>
                </Box>
                <Box style={{ flex: 1 }}>
                  <Typography variant="pi" textColor="neutral600">{s.blockCount} block{s.blockCount === 1 ? "" : "s"} · by {s.submittedBy || "editor"}</Typography>
                  <Box paddingTop={1}><Typography variant="pi" textColor="neutral500">{formatDate(s.createdAt)}</Typography></Box>
                </Box>
                <StatusChip status={s.submissionStatus} />
              </Flex>
            </RowCard>
          ))}
        </Flex>
      )}
    </Box>
  );
}

/* ────────────────────────── view: submission detail ────────────────────────── */

function DetailView({ project, submissionId, onBack, get, post }) {
  const [data, setData] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(null);
  const [confirm, setConfirm] = useState(null); // "publish" | "reject"
  const [actionError, setActionError] = useState(null);
  const [showUnchanged, setShowUnchanged] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await get(`/content-review/submissions/${submissionId}`);
      setData(res.data);
    } catch {
      setData({ error: true });
    }
  }, [get, submissionId]);

  useEffect(() => { load(); }, [load]);

  const s = data?.submission;
  const blockDiffs = useMemo(() => (s ? diffBlocks(s.previousBlocks, s.blocks) : []), [s]);
  const seoChanges = useMemo(() => (s ? diffSeo(s.previousSeo, s.seo) : []), [s]);

  if (!data) return <Centered><Loader>Loading submission…</Loader></Centered>;
  if (data.error || !s) return <Centered><Alert>Could not load this submission.</Alert></Centered>;

  const visible = showUnchanged ? blockDiffs : blockDiffs.filter((d) => d.kind !== "unchanged");
  const changedCount = blockDiffs.filter((d) => d.kind !== "unchanged").length;
  const liveUrl = livePageUrl(data.project?.frontendUrl ?? project.frontendUrl, s.pageUrl);
  const noSnapshot = s.previousBlocks === null;

  async function act(action) {
    if (busy) return;
    setBusy(action); setActionError(null); setConfirm(null);
    try {
      await post(`/content-review/submissions/${submissionId}/${action}`, { note: note.trim() || undefined });
      await load();
      setNote("");
    } catch (e) {
      setActionError(e?.response?.data?.error?.message ?? `${action === "publish" ? "Publish" : "Reject"} failed`);
    }
    setBusy(null);
  }

  return (
    <Box>
      <Box paddingBottom={4}>
        <Button variant="tertiary" startIcon={<ArrowLeft />} onClick={onBack}>{project.name} — submissions</Button>
      </Box>

      {/* header card — everything prefilled, nothing to dig for */}
      <Box background="neutral0" hasRadius shadow="tableShadow" padding={5} marginBottom={4}>
        <Flex justifyContent="space-between" alignItems="flex-start" gap={4} wrap="wrap">
          <Box style={{ minWidth: 0 }}>
            <Typography variant="beta" textColor="neutral800">{s.pageTitle || "Untitled page"}</Typography>
            <Flex gap={2} paddingTop={1} alignItems="center">
              <Mono style={{ opacity: 0.6 }}>/{s.pageUrl || ""}</Mono>
              {liveUrl && (
                <a href={liveUrl} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, textDecoration: "none" }}>
                  <Typography variant="pi" textColor="primary600">View live page</Typography>
                  <ExternalLink width="10px" height="10px" fill="currentColor" />
                </a>
              )}
            </Flex>
          </Box>
          <StatusChip status={s.submissionStatus} />
        </Flex>

        <Box paddingTop={4} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
          <MetaItem label="Project">{data.project?.name ?? project.name}</MetaItem>
          <MetaItem label="Submitted by">{s.submittedBy || "editor"}</MetaItem>
          <MetaItem label="Submitted at">{formatDate(s.createdAt)}</MetaItem>
          <MetaItem label="Locale">{s.locale ? s.locale.toUpperCase() : "—"}</MetaItem>
          <MetaItem label="Blocks in update">{s.blockCount}</MetaItem>
          {s.reviewedBy && <MetaItem label="Reviewed by">{s.reviewedBy}</MetaItem>}
          {s.reviewedAt && <MetaItem label="Reviewed at">{formatDate(s.reviewedAt)}</MetaItem>}
          {s.publishedToTargetAt && <MetaItem label="Went live">{formatDate(s.publishedToTargetAt)}</MetaItem>}
        </Box>

        {s.reviewNote && (
          <Box paddingTop={3}>
            <Alert tone="info">💬 {s.reviewNote}</Alert>
          </Box>
        )}
        {s.publishError && (
          <Box paddingTop={3}>
            <Alert>Last publish attempt failed: {s.publishError}</Alert>
          </Box>
        )}
      </Box>

      {noSnapshot && (
        <Box paddingBottom={4}>
          <Alert tone="info">No live-content snapshot was captured for this submission, so the full proposed content is shown instead of a before/after diff.</Alert>
        </Box>
      )}

      <Flex justifyContent="space-between" alignItems="center" paddingBottom={3}>
        <Typography variant="delta" textColor="neutral800">
          What changed · {changedCount || "nothing"}
        </Typography>
        {blockDiffs.some((d) => d.kind === "unchanged") && (
          <Button variant="ghost" onClick={() => setShowUnchanged((v) => !v)}>
            {showUnchanged ? "Hide" : "Show"} unchanged blocks
          </Button>
        )}
      </Flex>

      <Flex direction="column" gap={3} alignItems="stretch" paddingBottom={4}>
        {visible.map((d, i) => <BlockDiffCard key={`${d.component}-${d.index}-${i}`} diff={d} />)}
        {visible.length === 0 && (
          <Box background="neutral0" hasRadius padding={5} style={{ textAlign: "center" }}>
            <Typography variant="omega" textColor="neutral600">No block content changed in this submission.</Typography>
          </Box>
        )}
        {seoChanges.length > 0 && (
          <Box background="neutral0" hasRadius shadow="tableShadow" overflow="hidden">
            <Box background="neutral100" padding={3} borderColor="neutral150" borderStyle="solid" borderWidth="0 0 1px 0">
              <Typography variant="delta" textColor="neutral800">SEO · {seoChanges.length} change{seoChanges.length === 1 ? "" : "s"}</Typography>
            </Box>
            <Box padding={4}><DiffSection changes={seoChanges} /></Box>
          </Box>
        )}
      </Flex>

      {/* decision panel */}
      {s.submissionStatus === "pending" && (
        <Box background="neutral0" hasRadius shadow="tableShadow" padding={5}>
          <Typography variant="delta" textColor="neutral800">🛡️ Reviewer decision</Typography>
          <Box paddingTop={1} paddingBottom={3}>
            <Typography variant="pi" textColor="neutral600">
              Publishing pushes these blocks {seoChanges.length ? "and SEO " : ""}to the live CMS at <Mono>{data.project?.strapiHost}</Mono>. The team is notified on Slack either way.
            </Typography>
          </Box>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note for the team — strongly recommended when rejecting" />
          {actionError && <Box paddingTop={3}><Alert>{actionError}</Alert></Box>}
          <Flex gap={2} paddingTop={4} alignItems="center" wrap="wrap">
            {confirm === "publish" ? (
              <>
                <Typography variant="omega" fontWeight="bold" textColor="neutral800">Publish to the live website now?</Typography>
                <Button variant="success" loading={busy === "publish" || undefined} onClick={() => act("publish")}>Yes, publish</Button>
                <Button variant="tertiary" onClick={() => setConfirm(null)}>Cancel</Button>
              </>
            ) : confirm === "reject" ? (
              <>
                <Typography variant="omega" fontWeight="bold" textColor="neutral800">Reject this submission?</Typography>
                <Button variant="danger" loading={busy === "reject" || undefined} onClick={() => act("reject")}>Yes, reject</Button>
                <Button variant="tertiary" onClick={() => setConfirm(null)}>Cancel</Button>
              </>
            ) : (
              <>
                <Button variant="success" disabled={busy !== null} onClick={() => setConfirm("publish")}>Publish to live CMS</Button>
                <Button variant="danger-light" disabled={busy !== null} onClick={() => setConfirm("reject")}>Reject</Button>
              </>
            )}
          </Flex>
        </Box>
      )}
    </Box>
  );
}
