/**
 * One access policy (`/iga/policy/:id`): what it does, where it stands in AWS
 * for each role, the IAM documents AWS holds, and its history.
 *
 * Overview · In AWS · History. The page is read again while AuthSec is still
 * applying or repairing it, so the state moves without a reload.
 */

import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import {
  useGetAccessPolicyQuery,
  useListAccessPolicyEventsQuery,
  type AccessPolicyDetail,
} from "@/app/api/igaAccessPoliciesApi";
import { StatusBadge } from "@/components/console/status";
import { Button } from "@/components/ui/button";
import { Fact, Facts, Meta, Panel } from "@/features/iga/shared/components/Panel";
import { Timestamp } from "@/features/iga/shared/components/Timestamp";
import { cn } from "@/lib/utils";
import { getWorkspaceId } from "@/utils/workspace";

import { PolicyLoadFailure, PolicyShell, classifyPolicyError, relTime, shortHash, usePolicyPermission } from "../shared";
import { LifecycleDialog, type LifecycleAction } from "./LifecycleDialog";
import {
  END_REASON,
  STATUS,
  accessText,
  deploymentView,
  policySentence,
  resourceText,
  whenText,
  windowLength,
  windowProgress,
  windowText,
} from "./model";
import { AwsDocument, EffectChip, PolicyStatusChip } from "./parts";

type Tab = "overview" | "aws" | "history";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "aws", label: "In AWS" },
  { key: "history", label: "History" },
];

const MOVING = new Set(["applying", "drift"]);

export default function PolicyDetailPage() {
  const ws = getWorkspaceId() ?? "";
  const { id = "" } = useParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>("overview");
  const [lifecycle, setLifecycle] = useState<LifecycleAction | null>(null);
  const enforce = usePolicyPermission("governance:enforce");

  const [poll, setPoll] = useState(60_000);
  const q = useGetAccessPolicyQuery({ ws, id }, { pollingInterval: poll, skipPollingIfUnfocused: true });
  const p = q.data?.data;
  const nextPoll = p && MOVING.has(p.status) ? 10_000 : 60_000;
  if (nextPoll !== poll) setPoll(nextPoll);
  const failure = classifyPolicyError(q.error);

  if (!p) {
    return (
      <PolicyShell title="Policy" requires="access_policies">
        {failure ? (
          <PolicyLoadFailure failure={failure} subject="this policy" onRetry={() => void q.refetch()} />
        ) : (
          <p role="status" className="text-sm text-(--color-text-muted)">
            Loading the policy…
          </p>
        )}
      </PolicyShell>
    );
  }

  const live = p.status !== "ended";
  const actions =
    enforce.offered && live ? (
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" asChild>
          <Link to={`/iga/policy/${p.id}/edit`}>Edit</Link>
        </Button>
        <Button variant="outline" onClick={() => setLifecycle(p.status === "paused" ? "resume" : "pause")}>
          {p.status === "paused" ? "Resume" : "Pause"}
        </Button>
        <Button variant="destructive" className="text-white" onClick={() => setLifecycle("end")}>
          End now
        </Button>
      </div>
    ) : undefined;

  return (
    <PolicyShell title={p.name} description={policySentence(p)} actions={actions} requires="access_policies">
      <div className="flex flex-wrap items-center gap-2">
        <EffectChip effect={p.effect} />
        <PolicyStatusChip status={p.status} />
        <span className="text-xs text-(--color-text-muted)">{whenText(p)}</span>
        <Link to="/iga/policy" className="ml-auto text-xs font-medium text-(--color-primary-text) hover:underline">
          All policies
        </Link>
      </div>

      {p.status === "failed" || p.status === "drift" || p.status_reason ? (
        <p
          role={p.status === "failed" ? "alert" : undefined}
          className={cn(
            "rounded-md border px-3 py-2 text-[13px]",
            p.status === "failed" ? "border-(--color-danger) bg-(--color-danger-soft) text-(--color-danger-text)" : "border-(--color-warning) bg-(--color-warning-soft) text-(--color-warning-text)",
          )}
        >
          <strong className="font-semibold">{STATUS[p.status]?.label ?? p.status}.</strong> {p.status_reason || STATUS[p.status]?.hint}
        </p>
      ) : null}

      <div role="tablist" aria-label="Policy" className="flex gap-1 border-b border-(--color-border-subtle)">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === t.key ? "border-(--color-primary) text-(--color-text)" : "border-transparent text-(--color-text-muted) hover:text-(--color-text)",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? <Overview p={p} /> : tab === "aws" ? <InAws p={p} /> : <History ws={ws} p={p} />}

      <LifecycleDialog policy={lifecycle ? p : null} action={lifecycle} onClose={() => setLifecycle(null)} />
    </PolicyShell>
  );
}

/* --------------------------------- overview -------------------------------- */

function Overview({ p }: { p: AccessPolicyDetail }) {
  const progress = windowProgress(p);
  const length = windowLength(p);
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Panel title="Rule">
        <Facts>
          <Fact label="Effect">{p.effect === "block" ? "Block: deny these roles, whatever else allows them" : "Allow for a time: grant access the roles do not have"}</Fact>
          <Fact label="Resource">
            <span className="font-mono text-xs">{resourceText(p.resource)}</span>
            <Meta>
              {p.resource.arn} · account {p.resource.account_id}
            </Meta>
          </Fact>
          <Fact label="Access">{accessText(p.access)}</Fact>
          <Fact label="Window">
            {windowText(p)}
            {length ? <Meta>{length}</Meta> : null}
            {progress != null && p.status !== "ended" ? (
              <div className="mt-1.5 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-(--color-surface-subtle)" aria-label={`${Math.round(progress * 100)}% of the window has passed`}>
                <div className="h-full rounded-full bg-(--color-primary)" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            ) : null}
          </Fact>
          <Fact label="Why">{p.reason || "—"}</Fact>
          <Fact label="Applied by">
            {p.created_by.name || "Unknown"} · <Timestamp iso={p.created_at} />
          </Fact>
          <Fact label="Version">
            {p.version_no}
            {p.version_no > 1 ? <Meta>Last changed {relTime(p.updated_at)}</Meta> : null}
          </Fact>
          {p.status === "ended" ? <Fact label="Ended">{[relTime(p.ended_at), END_REASON[p.end_reason] ?? ""].filter(Boolean).join(" · ") || "Ended"}</Fact> : null}
        </Facts>
      </Panel>

      <Panel title="Roles" count={p.roles.length} description="The agents and jobs below reach AWS through these roles, so the policy applies to them.">
        <ul className="divide-y divide-(--color-border-subtle)">
          {p.roles.map((r) => (
            <li key={r.identity_account_id} className="py-2 first:pt-0 last:pb-0">
              <Link to={`/iga/identities/${r.identity_account_id}`} className="text-[13px] font-medium text-(--color-primary-text) hover:underline">
                {r.name}
              </Link>
              <Meta>{r.used_by.length ? `Used by ${r.used_by.map((w) => w.name).join(", ")}` : "No workload found running as it"}</Meta>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

/* ---------------------------------- in AWS --------------------------------- */

function InAws({ p }: { p: AccessPolicyDetail }) {
  const docOf = (identity: string) => p.documents.find((d) => d.identity_account_id === identity)?.document;
  return (
    <div className="space-y-4">
      <Meta>
        One AuthSec-owned IAM policy per role, under the <span className="font-mono">/authsec/</span> path, attached to the role. AuthSec reads it back after
        applying and every few minutes after that; if someone changes or removes it in AWS, AuthSec puts it back and records it in History.
      </Meta>
      {p.deployments.length === 0 ? (
        <p className="text-sm text-(--color-text-muted)">Nothing has been sent to AWS for this policy yet.</p>
      ) : (
        p.deployments.map((d) => {
          const v = deploymentView(d.state);
          const doc = docOf(d.identity_account_id);
          return (
            <Panel key={`${d.identity_account_id}:${d.aws_policy_arn}`} title={d.role_name} actions={<StatusBadge tone={v.tone}>{v.label}</StatusBadge>}>
              <div className="space-y-3">
                <Facts>
                  <Fact label="AWS policy" mono>
                    {d.aws_policy_arn || "Not created yet"}
                  </Fact>
                  <Fact label="Applied">{d.deployed_at ? <Timestamp iso={d.deployed_at} /> : "Not yet"}</Fact>
                  <Fact label="Confirmed by AWS">{d.verified_at ? <Timestamp iso={d.verified_at} /> : "Not yet"}</Fact>
                  <Fact label="Last checked">{d.last_readback_at ? relTime(d.last_readback_at) : "Not yet"}</Fact>
                  <Fact label="Matches AuthSec's copy">{d.drift ? <span className="text-(--color-warning-text)">No: {d.drift}</span> : d.last_readback_at ? "Yes" : "Not checked yet"}</Fact>
                  {d.document_hash ? (
                    <Fact label="Fingerprint" mono>
                      {shortHash(d.document_hash)}
                    </Fact>
                  ) : null}
                  {d.error ? (
                    <Fact label="Problem">
                      <span className="text-(--color-danger-text)">{d.error}</span>
                    </Fact>
                  ) : null}
                </Facts>
                {doc ? <AwsDocument title={d.aws_policy_arn || d.role_name} document={doc} /> : null}
              </div>
            </Panel>
          );
        })
      )}
    </div>
  );
}

/* --------------------------------- history --------------------------------- */

function History({ ws, p }: { ws: string; p: AccessPolicyDetail }) {
  const events = useListAccessPolicyEventsQuery({ ws, id: p.id, limit: 100 });
  const failure = classifyPolicyError(events.error);
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <Panel title="What happened" count={events.data ? events.data.data.length : undefined} flush>
        {failure && !events.data ? (
          <div className="p-3">
            <PolicyLoadFailure failure={failure} subject="the history" onRetry={() => void events.refetch()} />
          </div>
        ) : events.isLoading ? (
          <p role="status" className="px-4 py-3 text-sm text-(--color-text-muted)">
            Loading the history…
          </p>
        ) : (events.data?.data ?? []).length === 0 ? (
          <p className="px-4 py-3 text-sm text-(--color-text-muted)">Nothing recorded yet.</p>
        ) : (
          <ol className="divide-y divide-(--color-border-subtle)">
            {(events.data?.data ?? []).map((e) => (
              <li key={e.id} className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-3 px-4 py-2.5">
                <span className="text-xs text-(--color-text-muted)" title={e.at}>
                  {relTime(e.at)}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] text-(--color-text)">{e.message || e.kind}</span>
                  <span className="block text-xs text-(--color-text-muted)">{e.actor_kind === "system" ? "AuthSec" : e.actor_name || "A member"}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      <Panel title="Versions" count={p.versions.length} description="A version never changes once applied. Applying a new one replaces it in AWS.">
        <ul className="divide-y divide-(--color-border-subtle)">
          {p.versions.map((v) => (
            <li key={v.version_no} className="flex items-baseline gap-3 py-2 first:pt-0 last:pb-0">
              <span className="text-[13px] font-semibold text-(--color-text)">v{v.version_no}</span>
              <span className="min-w-0 flex-1 text-xs text-(--color-text-muted)">
                {v.created_by.name || "Unknown"} · {relTime(v.created_at)} · <span className="font-mono">{shortHash(v.intent_hash)}</span>
              </span>
              <StatusBadge tone={v.status === "applied" ? "success" : "neutral"}>{v.status === "applied" ? "Current" : "Replaced"}</StatusBadge>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
