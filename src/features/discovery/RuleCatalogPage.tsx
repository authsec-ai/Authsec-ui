/**
 * Discovery → Detection rules
 *
 * What a scan looks for: which files get opened, how each is read, and the words
 * those readers match against. Workspace-level — one catalogue serves every
 * connected organisation, because they all scan the same way.
 *
 * SHAPE OF THE SCREEN. Configuration screens fail by presenting every knob at
 * once and leaving the operator to work out which one maps to their problem.
 * People arrive here with a goal ("our manifests aren't picked up", "too many
 * results that aren't agents"), so the page opens with those goals and takes
 * them to the control. Rules come first because they are what almost everyone
 * needs; the word lists are a level down, because tuning them is rarer and
 * blunter.
 *
 * Four things it must keep straight or it misleads:
 *
 * 1. CHANGES ARE DELTAS, NOT A COPY. Customising does not freeze this workspace
 *    on today's patterns; later releases still arrive. Said plainly, because the
 *    natural assumption is the opposite and would stop people customising.
 * 2. SAVING DOES NOT RE-DERIVE EXISTING FINDINGS. File contents are discarded
 *    after parsing, so a changed rule cannot be replayed over stored evidence.
 *    Until a scan runs again the inventory is the OLD rules' output — surfaced
 *    at the top, on save, and in the save bar.
 * 3. HOW A FILE IS READ IS FIXED IN CODE. A rule chooses which reader runs,
 *    never what it does. The field is a picker for that reason.
 * 4. TURNING A RULE OFF IS INVISIBLE IN THE RESULTS. Fewer findings looks
 *    exactly like fewer agents, so it is labelled as a scope decision.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ChevronRight,
  FlaskConical,
  Info,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";

import { ConsolePage } from "@/components/console/ConsolePage";
import { TableCard } from "@/theme/components/cards";
import { CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  EVIDENCE_MODE_LABELS,
  useGetRuleCatalogQuery,
  useResetRuleCatalogMutation,
  useSetRuleCatalogMutation,
  useTestRuleCatalogMutation,
  type DescribedRule,
  type RuleCatalogOverlay,
  type StringDelta,
} from "@/app/api/discoveryApi";

type VocabKey = "framework_tokens" | "action_markers" | "secret_suffixes";

/** Server-side ceilings, mirrored so a save is not refused after the work. */
const LIMITS = { customRules: 50, globs: 200, tokens: 500 };

/**
 * Evidence modes a CUSTOM rule may claim.
 *
 * Six of eight: identity_grant and audit_event describe things seen at runtime,
 * and a rule that reads a file cannot honestly claim either. The server rejects
 * them, so offering them would only turn a design fact into a failed save.
 */
const CUSTOM_EVIDENCE_MODES = [
  "invocation_declared",
  "deployment_declared",
  "tool_configuration",
  "framework_dependency",
  "secret_reference",
  "platform_declared",
] as const;

/** Plain names for the readers. The registry key stays visible as the id. */
const READER: Record<string, { label: string; help: string }> = {
  workflow: { label: "CI/CD workflows", help: "Reads jobs, steps and what triggers them." },
  manifest: {
    label: "Agent manifests",
    help: "Structured YAML or JSON that declares an agent directly.",
  },
  mcp: {
    label: "MCP configuration",
    help: "MCP servers, their transports, and the env keys they use.",
  },
  dockerfile: { label: "Dockerfiles", help: "Base image, entrypoint and command." },
  compose: { label: "Compose files", help: "Services, images and commands." },
  dependency: {
    label: "Dependencies & lockfiles",
    help: "Looks for known agent frameworks among the packages.",
  },
  text: {
    label: "Any text file",
    help: "Fallback. Reads the file as text and matches the word lists below.",
  },
};

const VOCAB_META: Record<VocabKey, { label: string; help: string }> = {
  framework_tokens: {
    label: "Framework names",
    help: "Names that identify an agent framework in a file — an import, a package, a client class.",
  },
  action_markers: {
    label: "Action words",
    help: "Signals that code does something rather than only describes it — a tool call, an execute, a shell out.",
  },
  secret_suffixes: {
    label: "Credential name endings",
    help: "Key-name endings that suggest a credential. Matched on the NAME; values are never read or stored.",
  },
};

function readerOf(x: string) {
  return READER[x] ?? { label: x, help: "Reads the matched files and reports what it finds." };
}

/** Adds a value, or cancels a pending removal. */
function addTo(d: StringDelta | undefined, v: string): StringDelta {
  const cur = d ?? {};
  if ((cur.remove ?? []).includes(v)) {
    return { ...cur, remove: (cur.remove ?? []).filter((x) => x !== v) };
  }
  if ((cur.add ?? []).includes(v)) return cur;
  return { ...cur, add: [...(cur.add ?? []), v] };
}

/** Removing a built-in records a removal; removing one you added just drops it. */
function removeFrom(d: StringDelta | undefined, v: string, isBuiltIn: boolean): StringDelta {
  const cur = d ?? {};
  if ((cur.add ?? []).includes(v)) {
    return { ...cur, add: (cur.add ?? []).filter((x) => x !== v) };
  }
  if (!isBuiltIn) return cur;
  return { ...cur, remove: [...(cur.remove ?? []), v] };
}

/** A token or glob chip, showing added / removed / untouched. */
function Chip({
  value,
  state,
  onToggle,
}: {
  value: string;
  state: "added" | "removed" | "base";
  onToggle: () => void;
}) {
  const cls =
    state === "removed"
      ? "bg-muted text-muted-foreground line-through"
      : state === "added"
        ? "bg-(--color-success-soft) text-(--color-success-text)"
        : "bg-muted";
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[11px] ${cls}`}>
      {value}
      <button
        type="button"
        aria-label={state === "removed" ? `Restore ${value}` : `Remove ${value}`}
        onClick={onToggle}
        className="opacity-50 hover:opacity-100"
      >
        {state === "removed" ? <Plus className="size-3" /> : <X className="size-3" />}
      </button>
    </span>
  );
}

export default function RuleCatalogPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useGetRuleCatalogQuery();
  const [save, { isLoading: saving }] = useSetRuleCatalogMutation();
  const [reset, { isLoading: resetting }] = useResetRuleCatalogMutation();
  const [testPaths] = useTestRuleCatalogMutation();

  const [draft, setDraft] = useState<RuleCatalogOverlay>({});
  const [seeded, setSeeded] = useState(false);
  const [error, setError] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [savedVersion, setSavedVersion] = useState<string | null>(null);
  const [addingRule, setAddingRule] = useState(false);
  const [showWords, setShowWords] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [newGlob, setNewGlob] = useState<Record<string, string>>({});
  const [newToken, setNewToken] = useState<Record<string, string>>({});
  const [newRule, setNewRule] = useState({
    id: "",
    extractor: "manifest",
    globs: "",
    evidence_mode: "invocation_declared",
  });

  useEffect(() => {
    if (seeded || !data) return;
    setDraft(data.overlay ?? {});
    setSeeded(true);
  }, [data, seeded]);

  const dirty = useMemo(
    () => seeded && data != null && JSON.stringify(draft) !== JSON.stringify(data.overlay ?? {}),
    [draft, data, seeded],
  );

  // A draft lives only in this component, so closing the tab loses it. The
  // browser prompt is the only guard available for that path.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const counts = useMemo(() => {
    const globAdds =
      Object.values(draft.rules ?? {}).reduce((n, r) => n + (r.path_globs?.add?.length ?? 0), 0) +
      (draft.custom_rules ?? []).reduce((n, c) => n + c.path_globs.length, 0);
    const v = draft.vocabularies ?? {};
    const tokenAdds =
      (v.framework_tokens?.add?.length ?? 0) +
      (v.action_markers?.add?.length ?? 0) +
      (v.secret_suffixes?.add?.length ?? 0);
    return { globAdds, tokenAdds, customRules: (draft.custom_rules ?? []).length };
  }, [draft]);

  const overLimit =
    counts.globAdds > LIMITS.globs ||
    counts.tokenAdds > LIMITS.tokens ||
    counts.customRules > LIMITS.customRules;

  const onSave = async () => {
    setError("");
    try {
      const res = await save(draft).unwrap();
      setSavedVersion(res.version);
      void refetch();
    } catch (err) {
      // Verbatim: these name the cost or correctness reason ("this pattern is
      // too broad", "this word is too short"), which is the actionable part.
      setError(
        (err as { data?: { error?: string } })?.data?.error ??
          "Could not save the detection rules.",
      );
    }
  };

  const onReset = async () => {
    try {
      await reset().unwrap();
      setConfirmReset(false);
      setSeeded(false);
      void refetch();
    } catch (err) {
      setConfirmReset(false);
      setError((err as { data?: { error?: string } })?.data?.error ?? "Could not reset.");
    }
  };

  const stale = data?.staleness?.findings_from_older_rulesets ?? 0;

  const openRule = (id: string) => {
    setExpanded((p) => ({ ...p, [id]: true }));
    // Let the row render before scrolling to it.
    requestAnimationFrame(() =>
      document.getElementById(`rule-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }),
    );
  };

  return (
    <ConsolePage
      title="Detection rules"
      description="What a scan looks for inside your repositories: which files it opens, how each is read, and the words it matches. Used by every GitHub organisation you have connected."
      actions={
        data?.customised ? (
          <Button variant="outline" size="sm" onClick={() => setConfirmReset(true)}>
            <RotateCcw className="mr-1.5 size-3.5" />
            Reset to defaults
          </Button>
        ) : undefined
      }
    >
      {isError ? (
        <div className="rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-4 py-3 text-xs">
          <strong className="font-medium">Could not load the detection rules.</strong> Your
          role may be missing the discovery:read permission.
        </div>
      ) : isLoading || !data ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : (
        <div className={`space-y-4 ${dirty ? "pb-20" : ""}`}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border px-3 py-2 text-xs">
            <span>
              <span className="text-muted-foreground">In force</span>{" "}
              <span className="font-mono font-medium">{data.version}</span>
            </span>
            <span className="text-muted-foreground">
              based on <span className="font-mono">{data.builtin_version}</span>
            </span>
            {data.customised ? (
              <Badge variant="secondary">You have changes</Badge>
            ) : (
              <span className="text-muted-foreground">Defaults, unchanged</span>
            )}
          </div>

          {/* Existing findings came from whatever rules were in force then, and
              cannot be brought forward in place. */}
          {stale > 0 && (
            <div className="flex flex-wrap items-start justify-between gap-2 rounded-md bg-(--color-warning-soft) px-3 py-2">
              <div className="flex min-w-0 items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-(--color-warning-text)" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-(--color-warning-text)">
                    {stale} finding{stale === 1 ? "" : "s"} came from older rules
                  </p>
                  <p className="text-xs text-(--color-warning-text)">
                    They are not comparable with the{" "}
                    {data.staleness.findings_from_this_ruleset ?? 0} found under the current
                    rules. File contents are not kept after a scan, so these can only be
                    brought up to date by scanning again.
                  </p>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => navigate("/iga/integrations")}>
                Run a scan
              </Button>
            </div>
          )}

          {/* Start from the goal, not the control. Someone arrives here because
              something is missing or something is noisy — not because they want
              to browse a rule list. */}
          {!dirty && (
            <TableCard>
              <CardContent className="space-y-2 px-4 py-3">
                <p className="text-sm font-semibold">What do you want to change?</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => setAddingRule(true)}
                    className="rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted/50"
                  >
                    <span className="flex items-center gap-1.5 text-xs font-medium">
                      A file of ours isn&rsquo;t scanned
                      <ChevronRight className="size-3" />
                    </span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      Add a rule pointing at your own paths.
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const noisy =
                        data.rules.find((r) => r.evidence_mode === "framework_dependency") ??
                        data.rules[0];
                      if (noisy) openRule(noisy.id);
                    }}
                    className="rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted/50"
                  >
                    <span className="flex items-center gap-1.5 text-xs font-medium">
                      Too many results that aren&rsquo;t agents
                      <ChevronRight className="size-3" />
                    </span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      Narrow a rule&rsquo;s paths, or switch it off.
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowWords(true);
                      requestAnimationFrame(() =>
                        document
                          .getElementById("word-lists")
                          ?.scrollIntoView({ behavior: "smooth", block: "start" }),
                      );
                    }}
                    className="rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted/50"
                  >
                    <span className="flex items-center gap-1.5 text-xs font-medium">
                      Our framework isn&rsquo;t recognised
                      <ChevronRight className="size-3" />
                    </span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      Add its name to the word lists.
                    </span>
                  </button>
                </div>
              </CardContent>
            </TableCard>
          )}

          {overLimit && (
            <p className="rounded-md bg-(--color-warning-soft) px-3 py-2 text-xs text-(--color-warning-text)">
              Over a limit, so this will be refused on save:{" "}
              {counts.globAdds > LIMITS.globs &&
                `${counts.globAdds} added path patterns (max ${LIMITS.globs}). `}
              {counts.tokenAdds > LIMITS.tokens &&
                `${counts.tokenAdds} added words (max ${LIMITS.tokens}). `}
              {counts.customRules > LIMITS.customRules &&
                `${counts.customRules} added rules (max ${LIMITS.customRules}). `}
            </p>
          )}

          {error && (
            <p className="rounded-md bg-(--color-danger-soft) px-3 py-2 text-xs text-(--color-danger-text)">
              {error}
            </p>
          )}

          {/* ── Rules ─────────────────────────────────────────────────── */}
          <TableCard>
            <CardContent className="space-y-2 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold">Rules</h3>
                  <p className="text-xs text-muted-foreground">
                    Each rule opens the files matching its patterns and reads them one way.
                    How a file is read is fixed in code — a rule chooses which reader runs,
                    never what it does.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAddingRule(true)}
                  disabled={counts.customRules >= LIMITS.customRules}
                >
                  <Plus className="mr-1.5 size-3.5" />
                  Add a rule
                </Button>
              </div>

              <div className="divide-y rounded-md border">
                {data.rules.map((r) => (
                  <RuleRow
                    key={r.id}
                    rule={r}
                    draft={draft}
                    setDraft={setDraft}
                    open={expanded[r.id] === true}
                    onToggleOpen={() => setExpanded((p) => ({ ...p, [r.id]: !p[r.id] }))}
                    newGlob={newGlob[r.id] ?? ""}
                    setNewGlob={(v) => setNewGlob((p) => ({ ...p, [r.id]: v }))}
                    testPaths={testPaths}
                  />
                ))}
              </div>

              <p className="text-[11px] text-muted-foreground">
                A rule that is off means those files are never opened. Nothing is reported
                from them, and that silence is not evidence they hold no agents.
              </p>
            </CardContent>
          </TableCard>

          {/* ── Word lists (advanced) ─────────────────────────────────── */}
          <TableCard>
            <CardContent className="space-y-2 px-4 py-3" id="word-lists">
              <button
                type="button"
                onClick={() => setShowWords((v) => !v)}
                className="flex w-full items-center justify-between gap-2 text-left"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    <SlidersHorizontal className="size-3.5" />
                    Words the readers match
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Shared by every rule. Broader than editing one rule, so reach for this
                    only when a whole framework or credential convention is missing.
                  </span>
                </span>
                <ChevronRight
                  className={`size-4 shrink-0 transition-transform ${showWords ? "rotate-90" : ""}`}
                />
              </button>

              {showWords && (
                <div className="space-y-3 pt-1">
                  {(Object.keys(VOCAB_META) as VocabKey[]).map((key) => {
                    const effective = data.vocabularies[key] ?? [];
                    const delta = draft.vocabularies?.[key] ?? {};
                    const added = new Set(delta.add ?? []);
                    const removed = new Set(delta.remove ?? []);
                    const shown = [
                      ...effective,
                      ...(delta.add ?? []).filter((v) => !effective.includes(v)),
                    ];
                    const setVocab = (d: StringDelta) =>
                      setDraft((p) => ({
                        ...p,
                        vocabularies: { ...(p.vocabularies ?? {}), [key]: d },
                      }));
                    return (
                      <div key={key} className="space-y-1.5 rounded-md border px-3 py-2.5">
                        <div>
                          <p className="text-xs font-medium">{VOCAB_META[key].label}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {VOCAB_META[key].help}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {shown.map((v) => (
                            <Chip
                              key={v}
                              value={v}
                              state={removed.has(v) ? "removed" : added.has(v) ? "added" : "base"}
                              onToggle={() =>
                                setVocab(
                                  removed.has(v)
                                    ? addTo(delta, v)
                                    : removeFrom(delta, v, !added.has(v)),
                                )
                              }
                            />
                          ))}
                          {shown.length === 0 && (
                            <span className="text-[11px] text-muted-foreground">None.</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            value={newToken[key] ?? ""}
                            onChange={(e) => setNewToken((p) => ({ ...p, [key]: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key !== "Enter") return;
                              e.preventDefault();
                              const v = (newToken[key] ?? "").trim();
                              if (!v) return;
                              setVocab(addTo(delta, v));
                              setNewToken((p) => ({ ...p, [key]: "" }));
                            }}
                            placeholder="Type a word and press Enter…"
                            className="h-7 max-w-xs text-[11px]"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </TableCard>

          <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <Info className="mt-px size-3 shrink-0" />
            <span>
              Your changes are stored as additions and removals on top of the rules AuthSec
              ships — not as a copy of them. Customising here does not stop you receiving
              patterns added in later releases.
            </span>
          </p>
        </div>
      )}

      {/* Always-visible state while editing. The draft is not what scans use, and
          that is easy to forget once you have scrolled away from the button. */}
      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-(--color-warning-text)">
              Unsaved changes — scans still use the saved rules.
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDraft(data?.overlay ?? {})}
                disabled={saving}
              >
                Discard
              </Button>
              <Button
                size="sm"
                className="text-[length:var(--text-sm)] text-white"
                onClick={onSave}
                disabled={saving || overLimit}
              >
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <AddRuleDialog
        open={addingRule}
        onOpenChange={setAddingRule}
        extractors={data?.available_extractors ?? []}
        value={newRule}
        onChange={setNewRule}
        onAdd={(rule) => {
          setDraft((prev) => ({ ...prev, custom_rules: [...(prev.custom_rules ?? []), rule] }));
          setAddingRule(false);
          setNewRule({
            id: "",
            extractor: "manifest",
            globs: "",
            evidence_mode: "invocation_declared",
          });
          openRule(rule.id);
        }}
      />

      {/* Saving is half the change. Until a scan runs the inventory is still the
          old rules' output, and a screen that just said "saved" implies not. */}
      <Dialog open={savedVersion !== null} onOpenChange={() => setSavedVersion(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Saved — now run a scan</DialogTitle>
            <DialogDescription>
              Rules <span className="font-mono">{savedVersion}</span> are what future scans
              will use. Findings already in the inventory came from the previous rules and
              are unchanged — AuthSec does not keep file contents, so they cannot be
              re-derived without reading the repositories again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSavedVersion(null)}>
              Later
            </Button>
            <Button
              className="text-[length:var(--text-sm)] text-white"
              onClick={() => {
                setSavedVersion(null);
                navigate("/iga/integrations");
              }}
            >
              Go to integrations
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset detection rules?</DialogTitle>
            <DialogDescription>
              Drops every change you have made and goes back to the rules AuthSec ships.
              Findings already in the inventory stay, but they were produced by your
              customised rules — scan again to re-derive them under the defaults.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmReset(false)}>
              Keep my changes
            </Button>
            <Button variant="destructive" onClick={onReset} disabled={resetting}>
              {resetting ? "Resetting…" : "Reset to defaults"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConsolePage>
  );
}

/* ── One rule ──────────────────────────────────────────────────────────────── */

/**
 * A rule row, with its path patterns editable in place.
 *
 * The path check lives HERE rather than in a panel further down the page,
 * because the question it answers ("does the pattern I just typed match the file
 * I have in mind?") is asked at the moment of typing. A separate panel means
 * scrolling away and retyping the path, which is enough friction that people
 * skip it and find out a scan later instead.
 */
function RuleRow({
  rule,
  draft,
  setDraft,
  open,
  onToggleOpen,
  newGlob,
  setNewGlob,
  testPaths,
}: {
  rule: DescribedRule;
  draft: RuleCatalogOverlay;
  setDraft: React.Dispatch<React.SetStateAction<RuleCatalogOverlay>>;
  open: boolean;
  onToggleOpen: () => void;
  newGlob: string;
  setNewGlob: (v: string) => void;
  testPaths: ReturnType<typeof useTestRuleCatalogMutation>[0];
}) {
  const [probe, setProbe] = useState("");
  const [probeResult, setProbeResult] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);

  const entry = draft.rules?.[rule.id] ?? {};
  const disabled = entry.enabled === false;
  const globDelta = entry.path_globs ?? {};
  const added = new Set(globDelta.add ?? []);
  const removed = new Set(globDelta.remove ?? []);
  const shown = [...rule.path_globs, ...(globDelta.add ?? []).filter((g) => !rule.path_globs.includes(g))];
  const isCustom = (draft.custom_rules ?? []).some((c) => c.id === rule.id);
  const reader = readerOf(rule.extractor);

  const setGlobs = (d: StringDelta) =>
    setDraft((prev) => ({
      ...prev,
      rules: { ...(prev.rules ?? {}), [rule.id]: { ...entry, path_globs: d } },
    }));

  const addGlob = () => {
    const g = newGlob.trim();
    if (!g) return;
    setGlobs(addTo(globDelta, g));
    setNewGlob("");
  };

  const runProbe = async () => {
    const path = probe.trim();
    if (!path) return;
    setProbing(true);
    setProbeResult(null);
    try {
      // Against the DRAFT, so a pattern typed a second ago is included.
      const res = await testPaths({ paths: [path], overlay: draft }).unwrap();
      const m = res.results[0];
      setProbeResult(
        !m
          ? "No answer for that path."
          : m.matched
            ? m.rule_id === rule.id
              ? `Matched by this rule (${rule.id}).`
              : `Matched, but by ${m.rule_id} — another rule claims it first.`
            : (m.reason ?? "No rule matches this path."),
      );
    } catch {
      setProbeResult("Could not check that path.");
    } finally {
      setProbing(false);
    }
  };

  return (
    <div id={`rule-${rule.id}`} className={`px-3 py-2 ${disabled ? "opacity-55" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium">{reader.label}</span>
            {!rule.built_in && <Badge variant="secondary">Yours</Badge>}
            <span className="font-mono text-[11px] text-muted-foreground">{rule.id}</span>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {shown.length} path pattern{shown.length === 1 ? "" : "s"} · proves{" "}
            {EVIDENCE_MODE_LABELS[rule.evidence_mode]?.label.toLowerCase() ?? rule.evidence_mode}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={onToggleOpen}
            className="text-[11px] text-muted-foreground underline underline-offset-2"
          >
            {open ? "Done" : "Edit paths"}
          </button>
          {isCustom ? (
            <button
              type="button"
              onClick={() =>
                setDraft((prev) => ({
                  ...prev,
                  custom_rules: (prev.custom_rules ?? []).filter((c) => c.id !== rule.id),
                  rules: Object.fromEntries(
                    Object.entries(prev.rules ?? {}).filter(([k]) => k !== rule.id),
                  ),
                }))
              }
              className="text-[11px] text-(--color-danger-text) underline underline-offset-2"
            >
              Delete
            </button>
          ) : (
            <label className="flex cursor-pointer items-center gap-1.5 text-[11px]">
              <input
                type="checkbox"
                checked={!disabled}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    rules: { ...(prev.rules ?? {}), [rule.id]: { ...entry, enabled: e.target.checked } },
                  }))
                }
                className="size-3.5 accent-(--color-primary)"
              />
              {disabled ? "Off" : "On"}
            </label>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-2 space-y-2 rounded-md bg-muted/40 px-2.5 py-2">
          <p className="text-[11px] text-muted-foreground">{reader.help}</p>

          <div className="flex flex-wrap gap-1.5">
            {shown.map((g) => (
              <Chip
                key={g}
                value={g}
                state={removed.has(g) ? "removed" : added.has(g) ? "added" : "base"}
                onToggle={() =>
                  setGlobs(removed.has(g) ? addTo(globDelta, g) : removeFrom(globDelta, g, !added.has(g)))
                }
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={newGlob}
              onChange={(e) => setNewGlob(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                addGlob();
              }}
              placeholder="agents/**/*.yaml"
              className="h-7 max-w-md font-mono text-[11px]"
            />
            <Button size="sm" variant="outline" onClick={addGlob}>
              Add pattern
            </Button>
          </div>

          {/* Cost, stated where the decision is made rather than in a doc. */}
          <p className="text-[11px] text-muted-foreground">
            Every pattern is matched in every selected repository on every scan. A broad one
            (<code className="font-mono">**/*.yml</code>) costs a read per matching file,
            each time.
          </p>

          <div className="flex flex-wrap items-center gap-2 border-t pt-2">
            <span className="flex items-center gap-1.5 text-[11px] font-medium">
              <FlaskConical className="size-3" />
              Check a path
            </span>
            <Input
              value={probe}
              onChange={(e) => setProbe(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                void runProbe();
              }}
              placeholder="agents/router.yaml"
              className="h-7 max-w-xs font-mono text-[11px]"
            />
            <Button size="sm" variant="ghost" onClick={() => void runProbe()} disabled={probing}>
              <Search className="mr-1 size-3" />
              {probing ? "Checking…" : "Check"}
            </Button>
          </div>
          {probeResult && (
            <p
              className={`text-[11px] ${
                probeResult.startsWith("Matched by this rule")
                  ? "text-(--color-success-text)"
                  : "text-muted-foreground"
              }`}
            >
              {probeResult}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Add a rule ────────────────────────────────────────────────────────────── */

/**
 * The only thing configuration can introduce is a new set of PATHS pointed at a
 * reader that already exists. There is deliberately no field for behaviour.
 */
function AddRuleDialog({
  open,
  onOpenChange,
  extractors,
  value,
  onChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  extractors: string[];
  value: { id: string; extractor: string; globs: string; evidence_mode: string };
  onChange: (v: { id: string; extractor: string; globs: string; evidence_mode: string }) => void;
  onAdd: (rule: {
    id: string;
    extractor: string;
    path_globs: string[];
    evidence_mode: string;
  }) => void;
}) {
  const idOk = /^[A-Za-z0-9._-]+$/.test(value.id.trim());
  const globs = value.globs.split("\n").map((g) => g.trim()).filter(Boolean);
  const reader = readerOf(value.extractor);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Add a rule</DialogTitle>
          <DialogDescription>
            Points your own file patterns at one of the readers AuthSec already has. You
            cannot add a reader here — a rule chooses which one runs, never what it does.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Which files?</Label>
            <textarea
              value={value.globs}
              onChange={(e) => onChange({ ...value, globs: e.target.value })}
              rows={3}
              spellCheck={false}
              placeholder={"agents/**/*.yaml\n.acme/agent.json"}
              className="w-full rounded-md border bg-background px-2.5 py-1.5 font-mono text-[11px]"
            />
            <p className="text-[11px] text-muted-foreground">
              One pattern per line. Each is opened in every selected repository on every
              scan, so keep them as narrow as your convention allows.
            </p>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">How should they be read?</Label>
            <select
              value={value.extractor}
              onChange={(e) => onChange({ ...value, extractor: e.target.value })}
              className="h-8 w-full rounded-md border bg-background px-2 text-xs"
            >
              {extractors.map((x) => (
                <option key={x} value={x}>
                  {readerOf(x).label}
                </option>
              ))}
            </select>
            {/* Picking the wrong reader gives silent non-matches, not an error,
                so what each understands has to be visible at the moment of
                choosing. */}
            <p className="text-[11px] text-muted-foreground">{reader.help}</p>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">What does a match prove?</Label>
            <select
              value={value.evidence_mode}
              onChange={(e) => onChange({ ...value, evidence_mode: e.target.value })}
              className="h-8 w-full rounded-md border bg-background px-2 text-xs"
            >
              {CUSTOM_EVIDENCE_MODES.map((m) => (
                <option key={m} value={m}>
                  {EVIDENCE_MODE_LABELS[m]?.label ?? m}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">
              {EVIDENCE_MODE_LABELS[value.evidence_mode]?.help}
            </p>
            {/* A ceiling on what the finding may conclude, not a label.
                Overstating it is how a lockfile entry becomes a confirmed agent
                nobody reviewed. */}
            {value.evidence_mode === "platform_declared" && (
              <p className="rounded-md bg-(--color-warning-soft) px-2.5 py-1.5 text-[11px] text-(--color-warning-text)">
                This is the only answer that confirms an agent with nobody reviewing it.
                Choose it only if a match genuinely means the platform itself declared one.
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Name it</Label>
            <Input
              value={value.id}
              onChange={(e) => onChange({ ...value, id: e.target.value })}
              placeholder="acme-agent-manifest"
              className="h-8 font-mono text-xs"
              autoComplete="off"
            />
            <p className="text-[11px] text-muted-foreground">
              Letters, digits, dot, dash and underscore. Stamped on every finding this rule
              produces, so make it recognisable months from now.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="text-[length:var(--text-sm)] text-white"
            disabled={!idOk || globs.length === 0}
            onClick={() =>
              onAdd({
                id: value.id.trim(),
                extractor: value.extractor,
                path_globs: globs,
                evidence_mode: value.evidence_mode,
              })
            }
          >
            Add rule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
