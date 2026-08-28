/**
 * Discovery → Detection rules
 *
 * What a scan searches for: which paths are opened, which parser reads each,
 * and the token vocabularies those parsers match against. Workspace-level,
 * because a scan of any organisation uses the same catalogue.
 *
 * Three things this screen has to keep straight, or it misleads:
 *
 * 1. THE OVERLAY IS DELTAS, NOT A COPY. Adding one marker does not freeze this
 *    workspace on today's vocabulary — later releases still arrive. Saying so
 *    matters, because the natural fear is exactly the opposite.
 * 2. CHANGING RULES DOES NOT RE-DERIVE EXISTING FINDINGS. Raw file bodies are
 *    discarded after parse, so nothing stored can be re-read under a new rule.
 *    The inventory is a mix of rulesets until a rescan, and the server counts
 *    that for us — it is shown, not buried.
 * 3. PARSERS ARE NOT CONFIGURABLE. A custom rule points new globs at an
 *    EXISTING extractor, chosen from a fixed list. The field is a picker for
 *    that reason, never free text.
 *
 * Widening a glob widens what every future scan downloads, which is why writing
 * here is discovery:admin — it is a spending decision as much as a detection
 * one, and the server's validation messages say so in those terms. They are
 * surfaced verbatim rather than flattened to "invalid input".
 */

import { useEffect, useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import {
  AlertTriangle,
  Check,
  FlaskConical,
  Info,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";

import { ConsolePage } from "@/components/console/ConsolePage";
import { TableCard } from "@/theme/components/cards";
import { CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  useGetRuleCatalogQuery,
  useResetRuleCatalogMutation,
  useSetRuleCatalogMutation,
  useTestRuleCatalogMutation,
  type RuleCatalogOverlay,
  type StringDelta,
} from "@/app/api/discoveryApi";

type VocabKey = "framework_tokens" | "action_markers" | "secret_suffixes";

const VOCAB_META: Record<VocabKey, { label: string; help: string }> = {
  framework_tokens: {
    label: "Framework tokens",
    help: "Names that identify an agent framework in a file — an import, a dependency, a client class.",
  },
  action_markers: {
    label: "Action markers",
    help: "Signals that the code does something rather than only describes it — a tool call, an execute, a shell out.",
  },
  secret_suffixes: {
    label: "Secret suffixes",
    help: "Key-name endings that indicate a credential. Matched on the NAME; values are never stored.",
  },
};

/** Adds a value to a delta's add-list, or cancels a pending removal. */
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

export default function RuleCatalogPage() {
  const { data, isLoading, isError, refetch } = useGetRuleCatalogQuery();
  const [save, { isLoading: saving }] = useSetRuleCatalogMutation();
  const [reset, { isLoading: resetting }] = useResetRuleCatalogMutation();
  const [testPaths, { data: testResult, isLoading: testing }] = useTestRuleCatalogMutation();

  // Draft overlay. Edits are local until saved, so a half-finished change never
  // becomes what the next scan searches for.
  const [draft, setDraft] = useState<RuleCatalogOverlay>({});
  const [seeded, setSeeded] = useState(false);
  const [error, setError] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [pathsInput, setPathsInput] = useState("");
  const [newToken, setNewToken] = useState<Record<string, string>>({});

  useEffect(() => {
    if (seeded || !data) return;
    setDraft(data.overlay ?? {});
    setSeeded(true);
  }, [data, seeded]);

  const dirty = useMemo(
    () => seeded && data != null && JSON.stringify(draft) !== JSON.stringify(data.overlay ?? {}),
    [draft, data, seeded],
  );

  const vocabDelta = (k: VocabKey) => draft.vocabularies?.[k];
  const setVocab = (k: VocabKey, d: StringDelta) =>
    setDraft((p) => ({ ...p, vocabularies: { ...(p.vocabularies ?? {}), [k]: d } }));

  const onSave = async () => {
    setError("");
    try {
      const res = await save(draft).unwrap();
      toast.success(`Detection patterns updated — ruleset ${res.version}`);
      void refetch();
    } catch (err) {
      // Verbatim: these explain a cost or a correctness reason ("this glob is
      // too broad", "this token is too short"), which is the actionable part.
      setError(
        (err as { data?: { error?: string } })?.data?.error ??
          "Could not save the detection patterns.",
      );
    }
  };

  const onReset = async () => {
    try {
      await reset().unwrap();
      setConfirmReset(false);
      setSeeded(false);
      toast.success("Detection patterns reset to the shipped defaults.");
      void refetch();
    } catch (err) {
      setConfirmReset(false);
      setError(
        (err as { data?: { error?: string } })?.data?.error ?? "Could not reset.",
      );
    }
  };

  const runTest = async () => {
    const paths = pathsInput
      .split("\n")
      .map((p) => p.trim())
      .filter(Boolean)
      .slice(0, 200);
    if (paths.length === 0) return;
    try {
      // Tested against the DRAFT, so a glob can be checked before it costs a
      // scan to discover it was subtly wrong.
      await testPaths({ paths, overlay: draft }).unwrap();
    } catch (err) {
      toast.error(
        (err as { data?: { error?: string } })?.data?.error ?? "Could not test those paths.",
      );
    }
  };

  const stale = data?.staleness?.findings_from_older_rulesets ?? 0;

  return (
    <ConsolePage
      title="Detection rules"
      description="What a scan looks for: which files are opened, which parser reads each one, and the vocabulary they match against. Applies to every GitHub organisation in this workspace."
      actions={
        <div className="flex items-center gap-2">
          {data?.customised && (
            <Button variant="outline" size="sm" onClick={() => setConfirmReset(true)}>
              <RotateCcw className="mr-1.5 size-3.5" />
              Reset to defaults
            </Button>
          )}
          <Button
            size="sm"
            className="text-[length:var(--text-sm)] text-white"
            onClick={onSave}
            disabled={!dirty || saving}
          >
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      }
    >
      {isError ? (
        <div className="rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-4 py-3 text-xs">
          <strong className="font-medium">Could not load the detection rules.</strong>{" "}
          Your role may be missing the discovery:read permission.
        </div>
      ) : isLoading || !data ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-4">
          {/* Which ruleset is in force, and whether it is ours or yours. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border px-3 py-2 text-xs">
            <span>
              <span className="text-muted-foreground">Ruleset</span>{" "}
              <span className="font-mono font-medium">{data.version}</span>
            </span>
            <span className="text-muted-foreground">
              built-in <span className="font-mono">{data.builtin_version}</span>
            </span>
            {data.customised ? (
              <Badge variant="secondary">Customised</Badge>
            ) : (
              <span className="text-muted-foreground">Shipped defaults, unchanged</span>
            )}
          </div>

          {/* The honesty rule for this screen. Changing what a scan looks for
              cannot retroactively change what earlier scans found: the file
              bodies are gone, so the only way to re-derive is to read the
              repositories again. Left unsaid, a mixed inventory reads as one
              consistent picture. */}
          {stale > 0 && (
            <div className="flex items-start gap-2 rounded-md bg-(--color-warning-soft) px-3 py-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-(--color-warning-text)" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-(--color-warning-text)">
                  {stale} finding{stale === 1 ? "" : "s"} came from an older ruleset
                </p>
                <p className="text-xs text-(--color-warning-text)">
                  They were produced by different rules and are not comparable with the{" "}
                  {data.staleness.findings_from_this_ruleset ?? 0} found under this one.
                  AuthSec does not keep file contents after parsing them, so these cannot
                  be re-derived — run a scan again to bring them up to date.
                </p>
              </div>
            </div>
          )}

          {error && (
            <p className="rounded-md bg-(--color-danger-soft) px-3 py-2 text-xs text-(--color-danger-text)">
              {error}
            </p>
          )}

          {/* Deltas, not a snapshot. The thing people assume wrongly. */}
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-px size-3.5 shrink-0" />
            <span>
              Your changes are stored as additions and removals on top of the shipped
              rules — not as a copy of them. Customising here does not stop you receiving
              patterns added in later releases.
            </span>
          </p>

          {/* ── Vocabularies ─────────────────────────────────────────── */}
          {(Object.keys(VOCAB_META) as VocabKey[]).map((key) => {
            const effective = data.vocabularies[key] ?? [];
            const delta = vocabDelta(key) ?? {};
            const added = new Set(delta.add ?? []);
            const removed = new Set(delta.remove ?? []);
            const shown = [...effective, ...(delta.add ?? []).filter((v) => !effective.includes(v))];
            return (
              <TableCard key={key}>
                <CardContent className="space-y-2 px-4 py-3">
                  <div>
                    <h3 className="text-sm font-semibold">{VOCAB_META[key].label}</h3>
                    <p className="text-xs text-muted-foreground">{VOCAB_META[key].help}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {shown.map((v) => {
                      const isRemoved = removed.has(v);
                      const isAdded = added.has(v);
                      return (
                        <span
                          key={v}
                          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[11px] ${
                            isRemoved
                              ? "bg-muted text-muted-foreground line-through"
                              : isAdded
                                ? "bg-(--color-success-soft) text-(--color-success-text)"
                                : "bg-muted"
                          }`}
                        >
                          {v}
                          <button
                            type="button"
                            aria-label={isRemoved ? `Restore ${v}` : `Remove ${v}`}
                            onClick={() =>
                              setVocab(
                                key,
                                isRemoved
                                  ? addTo(delta, v)
                                  : removeFrom(delta, v, !isAdded),
                              )
                            }
                            className="opacity-50 hover:opacity-100"
                          >
                            {isRemoved ? <Plus className="size-3" /> : <X className="size-3" />}
                          </button>
                        </span>
                      );
                    })}
                    {shown.length === 0 && (
                      <span className="text-xs text-muted-foreground">None.</span>
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
                        setVocab(key, addTo(delta, v));
                        setNewToken((p) => ({ ...p, [key]: "" }));
                      }}
                      placeholder={`Add a ${VOCAB_META[key].label.toLowerCase().replace(/s$/, "")}…`}
                      className="h-8 max-w-xs text-xs"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const v = (newToken[key] ?? "").trim();
                        if (!v) return;
                        setVocab(key, addTo(delta, v));
                        setNewToken((p) => ({ ...p, [key]: "" }));
                      }}
                    >
                      Add
                    </Button>
                  </div>
                </CardContent>
              </TableCard>
            );
          })}

          {/* ── Rules ────────────────────────────────────────────────── */}
          <TableCard>
            <CardContent className="space-y-2 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold">Rules</h3>
                <p className="text-xs text-muted-foreground">
                  Each rule opens the files matching its path patterns and reads them with
                  one parser. Parsers are fixed in code — a rule chooses which one runs,
                  never what it does.
                </p>
              </div>
              <div className="divide-y rounded-md border">
                {data.rules.map((r) => {
                  const entry = draft.rules?.[r.id] ?? {};
                  const disabled = entry.enabled === false;
                  return (
                    <div
                      key={r.id}
                      className={`flex flex-wrap items-start justify-between gap-2 px-3 py-2 ${
                        disabled ? "opacity-55" : ""
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-xs font-medium">{r.id}</span>
                          {!r.built_in && <Badge variant="secondary">Custom</Badge>}
                          <span className="text-[11px] text-muted-foreground">
                            {r.extractor} · {r.evidence_mode}
                          </span>
                        </div>
                        <p className="mt-0.5 break-words font-mono text-[11px] text-muted-foreground">
                          {r.path_globs.join("  ")}
                        </p>
                      </div>
                      <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[11px]">
                        <input
                          type="checkbox"
                          checked={!disabled}
                          onChange={(e) =>
                            setDraft((p) => ({
                              ...p,
                              rules: {
                                ...(p.rules ?? {}),
                                [r.id]: { ...entry, enabled: e.target.checked },
                              },
                            }))
                          }
                          className="size-3.5 accent-(--color-primary)"
                        />
                        {disabled ? "Off" : "On"}
                      </label>
                    </div>
                  );
                })}
              </div>
              {/* Turning a rule off is not free of consequence, and the
                  consequence is invisible: fewer findings looks identical to
                  fewer agents. */}
              <p className="text-[11px] text-muted-foreground">
                A rule that is off means those files are never opened. Nothing will be
                reported from them, and that absence is not evidence they hold no agents.
              </p>
            </CardContent>
          </TableCard>

          {/* ── Test ─────────────────────────────────────────────────── */}
          <TableCard>
            <CardContent className="space-y-2 px-4 py-3">
              <div>
                <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                  <FlaskConical className="size-4" />
                  Try paths against these rules
                </h3>
                <p className="text-xs text-muted-foreground">
                  Uses your unsaved changes, so you can check a pattern before committing
                  to it — otherwise a subtly wrong glob costs a whole scan to discover.
                </p>
              </div>
              <textarea
                value={pathsInput}
                onChange={(e) => setPathsInput(e.target.value)}
                rows={4}
                spellCheck={false}
                placeholder={".github/workflows/deploy.yml\nsrc/agents/router.py\npackage.json"}
                className="w-full rounded-md border bg-background px-2.5 py-1.5 font-mono text-[11px]"
              />
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={runTest}
                  disabled={testing || pathsInput.trim() === ""}
                >
                  {testing ? "Checking…" : "Check paths"}
                </Button>
                <span className="text-[11px] text-muted-foreground">
                  One path per line, up to 200.
                </span>
              </div>

              {testResult && (
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">
                    {testResult.matched} matched · {testResult.not_matched} not matched
                    {/* The server reports draft:true whenever an overlay was
                        sent, and we always send one — so key this off whether
                        there are actually unsaved edits, not off the flag. */}
                    {dirty && " · using your unsaved changes"}
                  </p>
                  <div className="divide-y rounded-md border">
                    {testResult.results.map((m) => (
                      <div key={m.path} className="flex flex-wrap items-start gap-2 px-3 py-1.5">
                        {m.matched ? (
                          <Check className="mt-0.5 size-3.5 shrink-0 text-(--color-success-text)" />
                        ) : (
                          <X className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                        )}
                        <span className="min-w-0 flex-1 break-all font-mono text-[11px]">
                          {m.path}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {m.matched ? `${m.rule_id} · ${m.extractor}` : (m.reason ?? "no rule matches")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </TableCard>

          {data.note && (
            <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <Info className="mt-px size-3 shrink-0" />
              <span>{data.note}</span>
            </p>
          )}
        </div>
      )}

      <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset detection rules?</DialogTitle>
            <DialogDescription>
              Drops every change you have made and goes back to the patterns AuthSec
              ships. Findings already in the inventory stay, but they were produced by
              your customised rules — run a scan again to re-derive them under the
              defaults.
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
