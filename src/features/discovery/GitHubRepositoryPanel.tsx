/**
 * Repository selection for a GitHub discovery source.
 *
 * Two rules this screen exists to enforce:
 *
 * 1. The list shows what the *installation* exposes, which is not the same as
 *    what the organisation contains. If 40 of 300 repositories are granted and
 *    we render those 40 as "your organisation", the admin forms a false belief
 *    about their own coverage — worse than having no tool at all. The server
 *    returns that disclaimer in `meta.note`; it is rendered, never paraphrased
 *    away.
 *
 * 2. A broken connection is not an empty list. The endpoint returns 503 when the
 *    installation is unreachable, the permission was revoked, or we are rate
 *    limited. Those render as an error with a cause, never as "no repositories".
 */

import { useEffect, useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import { AlertTriangle, Info, RefreshCw, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  useListSourceRepositoriesQuery,
  useSetSourceRepositoriesMutation,
} from "@/app/api/discoveryApi";

type Mode = "all" | "selected";

export function GitHubRepositoryPanel({ sourceId }: { sourceId: string }) {
  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useListSourceRepositoriesQuery(sourceId);
  const [saveSelection, { isLoading: saving }] = useSetSourceRepositoriesMutation();

  const [mode, setMode] = useState<Mode>("selected");
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  // Only seed local state from the server once per load, so a re-fetch mid-edit
  // does not silently discard the admin's uncommitted choices.
  const [seeded, setSeeded] = useState(false);

  // Memoised: `?? []` would allocate a fresh array on every render and churn
  // the effect below, re-seeding selection state mid-edit.
  const repos = useMemo(() => data?.repos ?? [], [data]);

  useEffect(() => {
    if (seeded || !data) return;
    const preselected = repos.filter((r) => r.selected).map((r) => r.full_name);
    setChosen(new Set(preselected));
    // Everything selected and at least one repository present reads as "all".
    setMode(preselected.length > 0 && preselected.length === repos.length ? "all" : "selected");
    setSeeded(true);
  }, [data, repos, seeded]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? repos.filter((r) => r.full_name.toLowerCase().includes(q)) : repos;
  }, [repos, query]);

  // Select/clear act on what is CURRENTLY VISIBLE, not on the whole list.
  //
  // That is the useful behaviour and the safe one: with a filter typed, "all"
  // plainly means the matches in front of you, and clearing cannot silently
  // discard ticks you cannot see. Selecting stays additive for the same reason —
  // filtering to one team's repositories, selecting them, then filtering to
  // another must add rather than replace.
  const selectVisible = () => {
    setChosen((prev) => {
      const next = new Set(prev);
      filtered.forEach((r) => next.add(r.full_name));
      return next;
    });
  };

  const clearVisible = () => {
    setChosen((prev) => {
      const next = new Set(prev);
      filtered.forEach((r) => next.delete(r.full_name));
      return next;
    });
  };

  const toggle = (fullName: string) => {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(fullName)) next.delete(fullName);
      else next.add(fullName);
      return next;
    });
  };

  const save = async () => {
    try {
      await saveSelection({
        id: sourceId,
        mode,
        include: mode === "selected" ? [...chosen] : undefined,
      }).unwrap();
      toast.success("Repository selection saved");
    } catch (err) {
      const msg =
        (err as { data?: { error?: string } })?.data?.error ??
        "Could not save the selection.";
      toast.error(msg);
    }
  };

  // ── Connection failure — explicitly not an empty state ────────────────────
  if (error) {
    const status = (error as { status?: number }).status;
    const detail =
      (error as { data?: { error?: string } }).data?.error ??
      "The installation could not be reached.";
    return (
      <Card>
        <CardContent className="space-y-3 px-4 py-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-(--color-warning-text)" />
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-semibold">Cannot list repositories</p>
              <p className="text-xs text-muted-foreground">{detail}</p>
              <p className="text-xs text-muted-foreground">
                This is a connection problem, not a result. It does not mean
                there are no agents — we were unable to look.
                {status === 503 &&
                  " Check that the GitHub App is still installed and that its permissions have not been revoked."}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="mr-1.5 size-3.5" />
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="px-4 py-6">
          <p className="text-sm text-muted-foreground">Loading repositories…</p>
        </CardContent>
      </Card>
    );
  }

  const selectedCount = mode === "all" ? repos.length : chosen.size;
  const allVisibleSelected =
    filtered.length > 0 && filtered.every((r) => chosen.has(r.full_name));
  const noVisibleSelected = filtered.every((r) => !chosen.has(r.full_name));
  const allSelected = repos.length > 0 && chosen.size === repos.length;

  return (
    <Card>
      <CardContent className="space-y-4 px-4 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">Repositories</h3>
            <p className="text-xs text-muted-foreground">
              {selectedCount} of {repos.length} selected for scanning
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-md border p-0.5">
            {(["selected", "all"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  mode === m ? "bg-muted" : "text-muted-foreground hover:bg-muted/50"
                }`}
              >
                {m === "all" ? "Everything granted" : "Choose repositories"}
              </button>
            ))}
          </div>
        </div>

        {/* The disclosure. Rendered from the server's own wording so it cannot
            be dropped by a well-meaning copy edit. */}
        {data?.note && (
          <div className="flex items-start gap-2 rounded-md bg-(--color-info-soft) px-3 py-2">
            <Info className="mt-0.5 size-3.5 shrink-0 text-(--color-info-text)" />
            <p className="text-xs text-(--color-info-text)">{data.note}</p>
          </div>
        )}

        {repos.length === 0 ? (
          <div className="rounded-md border border-dashed px-3 py-6 text-center">
            <p className="text-sm font-medium">No repositories granted</p>
            <p className="mt-1 text-xs text-muted-foreground">
              The installation exists but exposes no repositories. Grant access on
              GitHub, then refresh — this is a permission scope, not a result.
            </p>
          </div>
        ) : (
          <>
            {repos.length > 8 && (
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter repositories"
                  className="h-8 pl-8 text-xs"
                />
              </div>
            )}

            {/* Ticking 72 boxes by hand is the reason this is here. Hidden in
                "Everything granted" mode, where the ticks are not editable at
                all and a select-all control would do nothing. */}
            {mode === "selected" && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <button
                  type="button"
                  onClick={selectVisible}
                  disabled={allVisibleSelected}
                  className="font-medium text-(--color-primary) underline underline-offset-2 disabled:opacity-40 disabled:no-underline"
                >
                  {query.trim()
                    ? `Select all ${filtered.length} matching`
                    : `Select all ${repos.length}`}
                </button>
                <button
                  type="button"
                  onClick={clearVisible}
                  disabled={noVisibleSelected}
                  className="text-muted-foreground underline underline-offset-2 disabled:opacity-40 disabled:no-underline"
                >
                  {query.trim() ? "Clear matching" : "Clear all"}
                </button>
                {/* Selecting every repository the installation grants TODAY is
                    not the same promise as "everything granted", which also
                    covers repositories added later. Worth pointing at, since the
                    two look identical the moment after you click. */}
                {allSelected && (
                  <span className="text-muted-foreground">
                    All {repos.length} ticked — to keep including repositories added
                    later, use{" "}
                    <button
                      type="button"
                      onClick={() => setMode("all")}
                      className="underline underline-offset-2"
                    >
                      Everything granted
                    </button>{" "}
                    instead.
                  </span>
                )}
              </div>
            )}

            <div className="max-h-80 divide-y overflow-y-auto rounded-md border">
              {filtered.map((r) => {
                const on = mode === "all" || chosen.has(r.full_name);
                return (
                  <label
                    key={r.native_id}
                    className={`flex items-center gap-3 px-3 py-2 text-sm ${
                      mode === "all" ? "opacity-60" : "cursor-pointer hover:bg-muted/50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={mode === "all"}
                      onChange={() => toggle(r.full_name)}
                      className="size-3.5 accent-(--color-primary)"
                    />
                    <span className="min-w-0 flex-1 truncate">{r.full_name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {r.default_branch}
                    </span>
                  </label>
                );
              })}
              {filtered.length === 0 && (
                <p className="px-3 py-4 text-xs text-muted-foreground">
                  No repository matches “{query}”.
                </p>
              )}
            </div>
          </>
        )}

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {mode === "all"
              ? "Scans every repository the installation exposes."
              : "Scans only what you tick. Unticked repositories are reported as excluded, not failed."}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`mr-1.5 size-3.5 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={save}
              disabled={saving || (mode === "selected" && chosen.size === 0)}
            >
              {saving ? "Saving…" : "Save selection"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
