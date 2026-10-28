/**
 * PolicyAuditPanel — readable edit audit for policy changes on a workload (UG07).
 *
 * Shows:
 *  - Who changed the policy, when
 *  - Structured diff: e.g. "Denied file.write to /srv/output for invoice-worker"
 *  - Approval scope
 *  - Graph/action source reference
 *  - Before/after of policy changes
 */

import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ExternalLink,
  FileText,
  GitBranch,
  Shield,
  User,
} from "lucide-react";

import { Panel } from "../shared/components/Panel";
import {
  useGetPolicyQuery,
  type PolicyLifecycle,
  type PolicyV2Rule,
  type RuntimePolicyV2Document,
} from "../policy/policyApi";
import { PolicyStatusBadge } from "../policy/PolicyStatusBadge";

/* ─────────────────────────── Types ──────────────────────────────────────── */

export interface PolicyAuditEntry {
  /** Policy ID the change belongs to. */
  policy_id: string;
  /** Policy name. */
  policy_name: string;
  /** Revision number of this change. */
  revision: number;
  /** The author (user ID). */
  author_user_id: string;
  /** Author display name if available. */
  author_display_name?: string;
  /** Lifecycle state of this revision. */
  state: PolicyLifecycle;
  /** ISO timestamp of the change. */
  changed_at?: string | null;
  /** Structured diff produced from comparing consecutive revisions. */
  diff?: PolicyDiff | null;
  /** Approval info. */
  approval?: PolicyApproval | null;
  /** Source reference — where this change came from. */
  source_ref?: PolicySourceRef | null;
}

export interface PolicyDiff {
  added_rules: RuleSummary[];
  removed_rules: RuleSummary[];
  modified_rules: RuleModification[];
}

export interface RuleSummary {
  rule_id: string;
  effect: string;
  primitive: string;
  resource?: string;
  actions?: string[];
  /** Human-readable sentence describing the rule. */
  sentence: string;
}

export interface RuleModification {
  rule_id: string;
  before: RuleSummary;
  after: RuleSummary;
}

export interface PolicyApproval {
  approved_by: string;
  approved_at: string;
  scope: string;
  simulation_id?: string;
}

export interface PolicySourceRef {
  kind: "graph" | "action" | "manual";
  id?: string;
  label?: string;
}

/* ─────────────────────────── Diff sentence builder ──────────────────────── */

/**
 * Turn a rule into a human-readable structured diff sentence.
 * E.g. "Denied file.write to /srv/output"
 */
function ruleSentence(rule: PolicyV2Rule): string {
  const effectWord =
    rule.effect === "deny"
      ? "Denied"
      : rule.effect === "allow"
        ? "Allowed"
        : rule.effect === "require_approval"
          ? "Required approval for"
          : rule.effect;

  const parts = [effectWord, rule.primitive];
  if (rule.resource) {
    parts.push("to", rule.resource);
  }
  if (rule.actions?.length) {
    parts.push(`(${rule.actions.join(", ")})`);
  }
  return parts.join(" ");
}

/** Build a PolicyDiff from two consecutive revisions' documents. */
function buildDiff(
  before: PolicyV2Rule[] | undefined,
  after: PolicyV2Rule[] | undefined,
): PolicyDiff {
  const beforeMap = new Map((before ?? []).map((r) => [r.id, r]));
  const afterMap = new Map((after ?? []).map((r) => [r.id, r]));

  const added: RuleSummary[] = [];
  const removed: RuleSummary[] = [];
  const modified: RuleModification[] = [];

  for (const [id, rule] of afterMap) {
    const prev = beforeMap.get(id);
    if (!prev) {
      added.push({
        rule_id: id,
        effect: rule.effect,
        primitive: rule.primitive,
        resource: rule.resource,
        actions: rule.actions,
        sentence: ruleSentence(rule),
      });
    } else {
      const prevSentence = ruleSentence(prev);
      const afterSentence = ruleSentence(rule);
      if (prevSentence !== afterSentence) {
        modified.push({
          rule_id: id,
          before: {
            rule_id: id,
            effect: prev.effect,
            primitive: prev.primitive,
            resource: prev.resource,
            actions: prev.actions,
            sentence: prevSentence,
          },
          after: {
            rule_id: id,
            effect: rule.effect,
            primitive: rule.primitive,
            resource: rule.resource,
            actions: rule.actions,
            sentence: afterSentence,
          },
        });
      }
    }
  }

  for (const [id, rule] of beforeMap) {
    if (!afterMap.has(id)) {
      removed.push({
        rule_id: id,
        effect: rule.effect,
        primitive: rule.primitive,
        resource: rule.resource,
        actions: rule.actions,
        sentence: ruleSentence(rule),
      });
    }
  }

  return { added_rules: added, removed_rules: removed, modified_rules: modified };
}

/* ─────────────────────────── Audit entry row ─────────────────────────────── */

function AuditEntryRow({ entry }: { entry: PolicyAuditEntry }) {
  const hasChanges =
    entry.diff &&
    (entry.diff.added_rules.length > 0 ||
      entry.diff.removed_rules.length > 0 ||
      entry.diff.modified_rules.length > 0);

  return (
    <div className="space-y-2 border-b border-(--color-border-subtle) px-4 py-3 last:border-b-0">
      {/* Header: who, when, what state */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs">
          <User className="size-3.5 text-(--color-text-muted)" />
          <span className="font-medium">
            {entry.author_display_name ?? entry.author_user_id}
          </span>
          <span className="text-(--color-text-muted)">&middot;</span>
          <span className="text-(--color-text-muted)">
            Revision {entry.revision}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <PolicyStatusBadge lifecycle={entry.state} />
          {entry.changed_at ? (
            <time
              dateTime={entry.changed_at}
              className="text-xs tabular-nums text-(--color-text-muted)"
            >
              {new Date(entry.changed_at).toLocaleString()}
            </time>
          ) : null}
        </div>
      </div>

      {/* Diff */}
      {hasChanges && entry.diff ? (
        <div className="space-y-1.5 pl-5">
          {entry.diff.added_rules.map((rule) => (
            <div
              key={rule.rule_id}
              className="flex items-start gap-2 text-xs"
            >
              <span className="mt-0.5 shrink-0 rounded bg-(--color-success-soft) px-1 py-0.5 text-[10px] font-semibold text-(--color-success-text)">
                +
              </span>
              <span>{rule.sentence}</span>
            </div>
          ))}
          {entry.diff.removed_rules.map((rule) => (
            <div
              key={rule.rule_id}
              className="flex items-start gap-2 text-xs"
            >
              <span className="mt-0.5 shrink-0 rounded bg-(--color-danger-soft) px-1 py-0.5 text-[10px] font-semibold text-(--color-danger-text)">
                -
              </span>
              <span className="line-through text-(--color-text-muted)">
                {rule.sentence}
              </span>
            </div>
          ))}
          {entry.diff.modified_rules.map((mod) => (
            <div key={mod.rule_id} className="space-y-0.5 text-xs">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 rounded bg-(--color-warning-soft) px-1 py-0.5 text-[10px] font-semibold text-(--color-warning-text)">
                  ~
                </span>
                <span className="line-through text-(--color-text-muted)">
                  {mod.before.sentence}
                </span>
              </div>
              <div className="flex items-start gap-2 pl-5">
                <ArrowRight className="mt-0.5 size-3 shrink-0 text-(--color-text-muted)" />
                <span>{mod.after.sentence}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="pl-5 text-xs text-(--color-text-muted)">
          {entry.revision === 1
            ? "Initial policy creation."
            : "No rule changes in this revision."}
        </p>
      )}

      {/* Approval scope */}
      {entry.approval ? (
        <div className="flex items-center gap-2 pl-5 text-xs text-(--color-text-muted)">
          <Shield className="size-3" />
          <span>
            Approved by {entry.approval.approved_by}
            {entry.approval.scope ? ` (scope: ${entry.approval.scope})` : ""}
          </span>
        </div>
      ) : null}

      {/* Source reference */}
      {entry.source_ref ? (
        <div className="flex items-center gap-2 pl-5 text-xs">
          {entry.source_ref.kind === "graph" ? (
            <GitBranch className="size-3 text-(--color-text-muted)" />
          ) : (
            <FileText className="size-3 text-(--color-text-muted)" />
          )}
          <span className="text-(--color-text-muted)">
            Source: {entry.source_ref.label ?? entry.source_ref.kind}
          </span>
          {entry.source_ref.id ? (
            <span className="font-mono text-[10px] text-(--color-text-muted)">
              {entry.source_ref.id.slice(0, 12)}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ─────────────────────────── Props ──────────────────────────────────────── */

export interface PolicyAuditPanelProps {
  /** Policy ID to show the audit trail for. */
  policyId: string;
}

/* ─────────────────────────── Component ──────────────────────────────────── */

export function PolicyAuditPanel({ policyId }: PolicyAuditPanelProps) {
  const { data, isLoading, isError } = useGetPolicyQuery(policyId);

  /** Build audit entries from policy revisions. */
  const entries = useMemo<PolicyAuditEntry[]>(() => {
    if (!data) return [];

    const revisions = [...data.revisions].sort(
      (a, b) => a.revision - b.revision,
    );

    return revisions.map((rev, idx) => {
      // Parse the document to get rules for diffing
      let currentRules: PolicyV2Rule[] | undefined;
      let previousRules: PolicyV2Rule[] | undefined;

      try {
        const doc =
          typeof rev.document === "string"
            ? (JSON.parse(rev.document) as RuntimePolicyV2Document)
            : (rev.document as unknown as RuntimePolicyV2Document | null);
        currentRules = doc?.rules;
      } catch {
        // Malformed document
      }

      if (idx > 0) {
        try {
          const prevDoc =
            typeof revisions[idx - 1].document === "string"
              ? (JSON.parse(revisions[idx - 1].document) as RuntimePolicyV2Document)
              : (revisions[idx - 1].document as unknown as RuntimePolicyV2Document | null);
          previousRules = prevDoc?.rules;
        } catch {
          // Malformed previous document
        }
      }

      const diff = idx > 0 ? buildDiff(previousRules, currentRules) : null;

      return {
        policy_id: data.policy.id,
        policy_name: data.policy.name,
        revision: rev.revision,
        author_user_id: rev.author_user_id,
        state: rev.state,
        diff,
      };
    });
  }, [data]);

  if (isLoading) {
    return (
      <Panel title="Policy audit trail">
        <div
          className="h-32 animate-pulse rounded-md bg-(--color-surface-subtle)"
          aria-busy="true"
          aria-label="Loading policy audit trail"
        />
      </Panel>
    );
  }

  if (isError || !data) {
    return (
      <Panel title="Policy audit trail">
        <p className="text-xs text-(--color-text-muted)">
          Could not load the policy audit trail.
        </p>
      </Panel>
    );
  }

  if (entries.length === 0) {
    return (
      <Panel title="Policy audit trail">
        <p className="text-xs text-(--color-text-muted)">
          No revisions found for this policy.
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      title="Policy audit trail"
      count={`${entries.length} revision${entries.length !== 1 ? "s" : ""}`}
      actions={
        <Link
          to={`/iga/policies/${policyId}`}
          className="flex items-center gap-1 text-xs font-medium text-(--color-primary-text) hover:underline"
        >
          View policy
          <ExternalLink className="size-3" />
        </Link>
      }
      flush
    >
      <div className="divide-y divide-(--color-border-subtle)">
        {/* Show most recent first */}
        {[...entries].reverse().map((entry) => (
          <AuditEntryRow key={entry.revision} entry={entry} />
        ))}
      </div>
    </Panel>
  );
}
