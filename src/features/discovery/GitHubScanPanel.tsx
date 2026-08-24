/**
 * Run a scan, and report the outcome honestly.
 *
 * The API returns four per-repository outcomes and this screen keeps them
 * separate, because they demand different things from the admin:
 *
 *   scanned    we read it
 *   excluded   you chose not to        → neutral. Your decision, not a problem.
 *   failed     we could not            → warning, with the cause.
 *   truncated  we read only part of it → its own state. Neither pass nor fail.
 *
 * And the rule that matters most: when `complete_for_selected_scope` is false,
 * nothing on this card may read as a clean result. A green tick over a partial
 * scan is how a security product teaches its user to trust a number that is
 * wrong.
 */

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "react-hot-toast";
import {
  AlertTriangle,
  CheckCircle2,
  MinusCircle,
  Play,
  Scissors,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  useListSourceRepositoriesQuery,
  useScanGitHubSourceMutation,
  type GitHubScanResult,
} from "@/app/api/discoveryApi";

function Counter({
  icon: Icon,
  label,
  value,
  tone,
  hint,
}: {
  icon: typeof CheckCircle2;
  label: string;
  value: number;
  tone: "neutral" | "muted" | "warning" | "danger";
  hint?: string;
}) {
  const toneCls = {
    neutral: "text-foreground",
    muted: "text-muted-foreground",
    warning: "text-(--color-warning-text)",
    danger: "text-(--color-danger-text)",
  }[tone];

  return (
    <div className="min-w-0 space-y-0.5">
      <div className={`flex items-center gap-1.5 ${toneCls}`}>
        <Icon className="size-3.5 shrink-0" />
        <span className="text-lg font-semibold tabular-nums leading-none">{value}</span>
      </div>
      <p className="text-xs font-medium">{label}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function GitHubScanPanel({ sourceId }: { sourceId: string }) {
  const [scan, { isLoading }] = useScanGitHubSourceMutation();
  const [result, setResult] = useState<GitHubScanResult | null>(null);
  // Shares the repository query with the selection panel (RTK dedupes it), so
  // this panel can tell whether anything is actually in scope. A source created
  // from a connector starts with an EMPTY selection, which makes this the state
  // of the very first visit rather than an edge case.
  const { data: repoData } = useListSourceRepositoriesQuery(sourceId);
  const nothingSelected =
    repoData != null && !repoData.repos.some((r) => r.selected);

  const run = async () => {
    try {
      const res = await scan(sourceId).unwrap();
      setResult(res);
      if (res.complete_for_selected_scope) {
        toast.success(
          res.sightings_new > 0
            ? `${res.sightings_new} new agent${res.sightings_new === 1 ? "" : "s"} found`
            : "Scan complete — nothing new",
        );
      } else {
        // Deliberately not a success toast: the scan did not cover the scope.
        toast(`Scan finished with partial coverage`, { icon: "⚠️" });
      }
    } catch (err) {
      const msg =
        (err as { data?: { error?: string } })?.data?.error ?? "The scan could not run.";
      toast.error(msg);
    }
  };

  const partial = result != null && !result.complete_for_selected_scope;

  return (
    <Card>
      <CardContent className="space-y-4 px-4 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">Scan</h3>
            <p className="text-xs text-muted-foreground">
              Reads the configuration files in your selected repositories. Never
              clones a repository, and never stores source code or secret values.
            </p>
          </div>
          <Button size="sm" onClick={run} disabled={isLoading || nothingSelected}>
            <Play className="mr-1.5 size-3.5" />
            {isLoading ? "Scanning…" : "Run scan"}
          </Button>
        </div>

        {nothingSelected && (
          <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            No repositories are selected yet, so there is nothing to scan. Choose
            repositories above and save the selection first — a scan with an empty
            scope would report success having looked at nothing.
          </p>
        )}

        {result && (
          <div className="space-y-4 border-t pt-4">
            {/* Coverage verdict first, so it frames every number below it. */}
            {partial ? (
              <div className="flex items-start gap-2 rounded-md bg-(--color-warning-soft) px-3 py-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-(--color-warning-text)" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-(--color-warning-text)">
                    Partial coverage
                  </p>
                  <p className="text-xs text-(--color-warning-text)">
                    This scan did not cover everything you selected. The counts
                    below are a floor, not a total — there may be agents we did
                    not see.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-md bg-(--color-success-soft) px-3 py-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-(--color-success-text)" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-(--color-success-text)">
                    Complete for the repositories you selected
                  </p>
                  <p className="text-xs text-(--color-success-text)">
                    Every selected repository was read. Repositories not granted
                    to the installation are still outside this result.
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Counter
                icon={CheckCircle2}
                label="Scanned"
                value={result.repos_scanned}
                tone="neutral"
              />
              <Counter
                icon={MinusCircle}
                label="Excluded"
                value={result.repos_excluded}
                tone="muted"
                hint="Your choice"
              />
              <Counter
                icon={XCircle}
                label="Failed"
                value={result.repos_failed}
                tone={result.repos_failed > 0 ? "danger" : "muted"}
                hint={result.repos_failed > 0 ? "Needs attention" : undefined}
              />
              <Counter
                icon={Scissors}
                label="Truncated"
                value={result.repos_truncated}
                tone={result.repos_truncated > 0 ? "warning" : "muted"}
                hint={result.repos_truncated > 0 ? "Read in part" : undefined}
              />
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-1 border-t pt-3 text-xs">
              <span>
                <span className="font-semibold tabular-nums">{result.sightings_new}</span>{" "}
                <span className="text-muted-foreground">new agents</span>
              </span>
              <span>
                <span className="font-semibold tabular-nums">{result.sightings_bumped}</span>{" "}
                <span className="text-muted-foreground">still present</span>
              </span>
              <span>
                <span className="font-semibold tabular-nums">{result.files_fetched}</span>{" "}
                <span className="text-muted-foreground">files read</span>
              </span>
              <span className="text-muted-foreground">
                as of{" "}
                {formatDistanceToNow(new Date(result.scanned_at), { addSuffix: true })}
              </span>
            </div>

            {result.excluded_repositories && result.excluded_repositories.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">
                  Excluded by your selection
                </p>
                <p className="text-xs text-muted-foreground">
                  {result.excluded_repositories.join(", ")}
                </p>
              </div>
            )}

            {result.warnings && result.warnings.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-(--color-warning-text)">
                  Warnings
                </p>
                <ul className="space-y-0.5">
                  {result.warnings.map((w) => (
                    <li key={w} className="text-xs text-muted-foreground">
                      • {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Findings appear in{" "}
              <span className="font-medium text-foreground">Discovered agents</span> as
              unregistered, marked <em>declared in code</em> — a declaration is not
              proof that an agent ran.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
