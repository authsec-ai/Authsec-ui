/**
 * RevisionDiffView — unified diff viewer between two policy revisions.
 *
 * Renders two dropdown selectors to pick the "from" and "to" revisions,
 * then computes a line-by-line diff of their JSON-stringified documents.
 * Additions are highlighted green, deletions red, and unchanged lines
 * are shown with normal text.
 */

import { useMemo, useState } from "react";
import { GitCompareArrows } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Panel } from "@/features/iga/shared/components/Panel";

import { useGetPolicyQuery, type PolicyRevision } from "./policyApi";

// ── Types ────────────────────────────────────────────────────────────────────

interface RevisionDiffViewProps {
  policyId: string;
  /** Available revision numbers. */
  revisions: number[];
}

type DiffLineKind = "add" | "remove" | "equal";

interface DiffLine {
  kind: DiffLineKind;
  text: string;
}

// ── Diff algorithm (simple LCS-based line diff) ─────────────────────────────

/**
 * A straightforward O(nm) LCS-based diff that operates on lines.
 * Sufficient for policy documents which are typically under a few
 * hundred lines of JSON.
 */
function computeLineDiff(a: string[], b: string[]): DiffLine[] {
  const n = a.length;
  const m = b.length;

  // Build LCS table
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Back-trace to produce diff
  const result: DiffLine[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.push({ kind: "equal", text: a[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ kind: "add", text: b[j - 1] });
      j--;
    } else {
      result.push({ kind: "remove", text: a[i - 1] });
      i--;
    }
  }

  result.reverse();
  return result;
}

// ── Revision JSON stringifier ────────────────────────────────────────────────

function revisionToJson(revision: PolicyRevision | undefined): string {
  if (!revision) return "";
  try {
    const doc =
      typeof revision.document === "string"
        ? JSON.parse(revision.document)
        : revision.document;
    return JSON.stringify(doc, null, 2);
  } catch {
    return typeof revision.document === "string"
      ? revision.document
      : JSON.stringify(revision.document, null, 2);
  }
}

// ── Line rendering ───────────────────────────────────────────────────────────

const LINE_STYLES: Record<DiffLineKind, string> = {
  add: "bg-green-50 text-green-900 dark:bg-green-950/40 dark:text-green-300",
  remove: "bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-300",
  equal: "",
};

const PREFIX: Record<DiffLineKind, string> = {
  add: "+",
  remove: "-",
  equal: " ",
};

// ── Component ────────────────────────────────────────────────────────────────

export function RevisionDiffView({ policyId, revisions }: RevisionDiffViewProps) {
  const { data } = useGetPolicyQuery(policyId);

  const revisionMap = useMemo(() => {
    const m = new Map<number, PolicyRevision>();
    for (const r of data?.revisions ?? []) {
      m.set(r.revision, r);
    }
    return m;
  }, [data?.revisions]);

  // Default: compare the two most recent revisions if available.
  const sorted = [...revisions].sort((a, b) => a - b);
  const [fromRev, setFromRev] = useState<string>(
    sorted.length >= 2 ? String(sorted[sorted.length - 2]) : String(sorted[0] ?? ""),
  );
  const [toRev, setToRev] = useState<string>(
    String(sorted[sorted.length - 1] ?? ""),
  );

  const fromRevision = revisionMap.get(Number(fromRev));
  const toRevision = revisionMap.get(Number(toRev));

  const diffLines = useMemo(() => {
    const aJson = revisionToJson(fromRevision);
    const bJson = revisionToJson(toRevision);
    if (!aJson && !bJson) return [];
    return computeLineDiff(aJson.split("\n"), bJson.split("\n"));
  }, [fromRevision, toRevision]);

  const addCount = diffLines.filter((l) => l.kind === "add").length;
  const removeCount = diffLines.filter((l) => l.kind === "remove").length;

  if (revisions.length < 2) {
    return (
      <Panel title="Revision Diff">
        <p className="text-sm text-(--color-text-muted)">
          At least two revisions are needed to compute a diff.
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      title="Revision Diff"
      description="Compare two revisions of this policy document."
      actions={
        <span className="flex items-center gap-1.5 text-xs text-(--color-text-muted)">
          <GitCompareArrows className="size-3.5" />
          <span className="text-green-600 dark:text-green-400">+{addCount}</span>
          <span className="text-red-600 dark:text-red-400">-{removeCount}</span>
        </span>
      }
    >
      <div className="space-y-4">
        {/* Revision selectors */}
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">From revision</Label>
            <Select value={fromRev} onValueChange={setFromRev}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sorted.map((r) => (
                  <SelectItem key={r} value={String(r)}>
                    v{r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">To revision</Label>
            <Select value={toRev} onValueChange={setToRev}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sorted.map((r) => (
                  <SelectItem key={r} value={String(r)}>
                    v{r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Diff output */}
        {fromRev === toRev ? (
          <p className="text-xs text-(--color-text-muted)">
            Select different revisions to see a diff.
          </p>
        ) : diffLines.length === 0 ? (
          <p className="text-xs text-(--color-text-muted)">No differences found.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-(--color-border-subtle)">
            <pre className="text-xs leading-relaxed">
              {diffLines.map((line, i) => (
                <div
                  key={i}
                  className={`whitespace-pre px-3 py-px font-mono ${LINE_STYLES[line.kind]}`}
                >
                  <span className="mr-2 inline-block w-3 select-none text-center opacity-60">
                    {PREFIX[line.kind]}
                  </span>
                  {line.text}
                </div>
              ))}
            </pre>
          </div>
        )}
      </div>
    </Panel>
  );
}
