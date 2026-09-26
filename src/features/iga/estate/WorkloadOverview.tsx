/**
 * Overview — "what is this, and how much do we know?" (§2.14.6). Plain words
 * first; the ARN and the raw evidence are one click away, not the headline.
 */

import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Copy } from "lucide-react";

import { igaGraphApi, objectPath, refId, useGetGraphWorkloadIdentitiesQuery, type WorkloadDetail } from "@/app/api/igaGraphApi";
import { useAppDispatch } from "@/app/hooks";
import { DecisionBanner, StatusBadge } from "@/components/console/status";
import { Button } from "@/components/ui/button";
import { copyToClipboard } from "@/lib/clipboard";

import { CLASSIFICATION_LABEL, CLASSIFICATION_TONE, runtimeLabel, accountLabel, agoText, dayText } from "../shared/labels";
import { useGraphV2 } from "../shared/capabilities";
import { classifyGraphError } from "../shared/graphErrors";
import { viaLink } from "../shared/links";
import { useGraphRevision, useTrackRevision } from "../shared/revision";
import { ClassificationHistory } from "../classification/ClassificationHistory";
import { ClassifyDialog } from "../classification/ClassifyDialog";
import { Fact, Facts, Meta, Panel } from "../shared/components/Panel";


function ClassificationText({ w }: { w: WorkloadDetail }) {
  const d = w.decision;
  if (w.classification === "provider_native_agent") {
    return <>AWS runs this as an agent service, so it is an agent by what it is.</>;
  }
  if (d) {
    return (
      <>
        {d.purpose ? <span className="block">{d.purpose}</span> : null}
        <span className="block text-(--color-text-muted)">
          {d.decision === "classified_agent" ? "Classified as agent" : "Recorded as unclassified"} by{" "}
          {d.decided_by.display} · {dayText(d.decided_at)} · "{d.reason}"
        </span>
      </>
    );
  }
  return <>Nobody has recorded what this is for.</>;
}

function RunsAs({ w }: { w: WorkloadDetail }) {
  const r = w.execution_role;
  switch (r.state) {
    case "resolved":
      if (!r.identity) return <>{r.name ?? "an identity not live at this revision"}</>;
      return (
        <Link
          {...viaLink(objectPath(r.identity) ?? "", { ref: w.ref, name: w.name })}
          className="font-medium text-(--color-primary-text) hover:underline"
        >
          {r.name ?? "an identity not live at this revision"}
        </Link>
      );
    case "not_in_scan":
      return (
        <>
          <span className="break-all font-mono text-xs">{r.execution_role_arn}</span>
          <span className="block text-(--color-text-muted)">Not read in the latest scan.</span>
        </>
      );
    case "not_in_inventory":
      return (
        <>
          <span className="break-all font-mono text-xs">{r.execution_role_arn}</span>
          <span className="block text-(--color-text-muted)">Matches no identity in any connected account.</span>
        </>
      );
    case "none":
      return <>No execution role configured</>;
  }
}

/**
 * Which identities the workload uses, and for what. ECS has two and they are
 * not equivalent: the TASK role is what the application runs as; the task
 * EXECUTION role is used by the ECS agent to pull images and write logs, and
 * its credentials are not available to the containers.
 */
function IdentitiesSummary({ ws, w }: { ws: string; w: WorkloadDetail }) {
  const dispatch = useAppDispatch();
  const { rev, epoch } = useGraphRevision(ws);
  const v2 = useGraphV2(ws);
  const args = { ws, rev, key: String(epoch), id: refId(w.ref), ...(v2.available ? { graph: "v2" as const } : {}) };
  const q = useGetGraphWorkloadIdentitiesQuery(args, { skip: rev == null || v2.loading });
  const failure = classifyGraphError(q.error);
  useTrackRevision(ws, q.currentData, failure, (r, d) =>
    dispatch(igaGraphApi.util.upsertQueryData("getGraphWorkloadIdentities", { ...args, rev: r }, d)),
  );
  const ecs = w.runtime_kind === "ecs_task_definition";
  const other = q.currentData?.data.other;
  const infra = (other?.items ?? []).filter((r) => r.type === "task_execution_role");
  // Not asked yet (no graph revision), or asked and not answered: loading,
  // never "none configured".
  const pending = !failure && !q.currentData;
  const from = { ref: w.ref, name: w.name };
  const row = (label: string, value: ReactNode, meaning?: string) => (
    <li className="space-y-0.5 px-4 py-3">
      <p className="text-xs text-(--color-text-muted)">{label}</p>
      <div className="text-[13px] leading-5 text-(--color-text)">{value}</div>
      {meaning ? <Meta>{meaning}</Meta> : null}
    </li>
  );
  return (
    <ul className="divide-y divide-(--color-border-subtle)">
      {row(ecs ? "Application identity · task role" : "Runs as", <RunsAs w={w} />, ecs ? "What the application code in the task runs as." : undefined)}
      {ecs
        ? row(
            "Supporting infrastructure · task execution role",
            pending ? (
              <span className="text-(--color-text-muted)">Loading…</span>
            ) : failure ? (
              <span className="text-(--color-text-muted)">
                Could not load it.{" "}
                <button type="button" onClick={() => void q.refetch()} className="font-medium text-(--color-primary-text) hover:underline">
                  Retry
                </button>
              </span>
            ) : infra.length ? (
              <span className="flex flex-col gap-0.5">
                {infra.map((r) => {
                  const path = objectPath(r.identity.ref);
                  return path ? (
                    <Link key={r.claim} {...viaLink(path, from)} className="w-fit font-medium text-(--color-primary-text) hover:underline">
                      {r.identity.name}
                    </Link>
                  ) : (
                    <span key={r.claim} className="font-medium">{r.identity.name}</span>
                  );
                })}
                {other?.next_cursor ? (
                  <span className="text-xs text-(--color-text-muted)">More roles are linked than this page shows — open the graph to see them all.</span>
                ) : null}
              </span>
            ) : (
              <span className="text-(--color-text-muted)">None configured, or not resolved to a role in a connected account.</span>
            ),
            infra.length ? "Used by the ECS agent to pull images and write logs. The application does not run as it." : undefined,
          )
        : null}
    </ul>
  );
}

export function WorkloadOverview({
  ws,
  workload: w,
  canClassify,
}: {
  ws: string;
  workload: WorkloadDetail;
  /** From the detail response's capabilities; never inferred from role names. */
  canClassify: boolean;
}) {
  const [dialog, setDialog] = useState<"classify" | "undo" | null>(null);
  const [history, setHistory] = useState(false);
  const runtime = runtimeLabel(w.runtime_kind);
  const attrs = w.provider_attrs;
  const editable = canClassify && w.classification !== "provider_native_agent" && w.lifecycle === "active";

  return (
    <div className="space-y-4">
      {w.lifecycle === "retired" ? (
        <DecisionBanner
          tone="neutral"
          title={`${w.name} is no longer in the latest scan`}
          body={`It was last confirmed ${dayText(w.last_confirmed_at)}.${w.retired_reason ? ` Reason: ${w.retired_reason.replace(/_/g, " ")}.` : ""}`}
        />
      ) : w.state === "stale" ? (
        <DecisionBanner
          tone="warning"
          title={`Last confirmed ${agoText(w.last_confirmed_at)}`}
          body="The latest scan did not reconfirm this workload. What is shown is what was last collected."
        />
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Panel
            title="What it is"
            actions={
              editable ? (
                w.classification === "classified_agent" ? (
                  <Button variant="outline" size="sm" onClick={() => setDialog("undo")}>
                    Undo classification
                  </Button>
                ) : (
                  <Button size="sm" className="text-[length:var(--text-sm)] text-white" onClick={() => setDialog("classify")}>
                    Classify as agent
                  </Button>
                )
              ) : undefined
            }
          >
            <Facts>
              <Fact label="Classification">
                <span className="flex flex-col items-start gap-1.5">
                  <StatusBadge tone={CLASSIFICATION_TONE[w.classification]}>{CLASSIFICATION_LABEL[w.classification]}</StatusBadge>
                  <span>
                    <ClassificationText w={w} />
                  </span>
                  {w.classification !== "provider_native_agent" ? (
                    <button
                      type="button"
                      onClick={() => setHistory((h) => !h)}
                      aria-expanded={history}
                      className="text-xs font-medium text-(--color-primary-text) hover:underline"
                    >
                      {history ? "Hide decision history" : "Decision history"}
                    </button>
                  ) : null}
                </span>
              </Fact>
              {w.instances?.state === "not_collected" ? (
                <Fact label="Instances">
                  <span className="text-(--color-text-muted)">
                    {w.runtime_kind === "bedrock_agent"
                      ? "Not collected. Aliases, which separate a live agent from a canary, are not read yet."
                      : "Not collected."}
                  </span>
                </Fact>
              ) : null}
            </Facts>
            {history ? (
              <div className="mt-3">
                <ClassificationHistory ws={ws} id={refId(w.ref)} />
              </div>
            ) : null}
          </Panel>

          <Panel
            title="Identities"
            flush
            actions={
              <>
                <Link to={`/iga/estate/${encodeURIComponent(refId(w.ref))}/graph`} className="font-medium text-(--color-primary-text) hover:underline">
                  Open graph
                </Link>
                <Link to={`/iga/estate/${encodeURIComponent(refId(w.ref))}/identities`} className="font-medium text-(--color-primary-text) hover:underline">
                  All identities
                </Link>
              </>
            }
          >
            <IdentitiesSummary ws={ws} w={w} />
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel
            title="How we know"
            actions={
              <Link to="/iga/cloud/compute" className="font-medium text-(--color-primary-text) hover:underline">
                Raw inventory
              </Link>
            }
          >
            <Facts>
              <Fact label="ARN">
                <span className="flex items-start gap-2">
                  <span className="min-w-0 break-all font-mono text-xs leading-5">{w.arn}</span>
                  <button
                    type="button"
                    aria-label="Copy the ARN"
                    title="Copy"
                    onClick={() => void copyToClipboard(w.arn, "ARN")}
                    className="grid size-5 shrink-0 place-items-center rounded text-(--color-text-muted) hover:bg-(--color-surface-subtle) hover:text-(--color-text)"
                  >
                    <Copy className="size-3" />
                  </button>
                </span>
              </Fact>
              <Fact label="First seen">{dayText(w.first_seen_at)}</Fact>
              <Fact label="Last confirmed">{agoText(w.last_confirmed_at)}</Fact>
              <Fact label="Found by">
                {w.sources.length ? (
                  <span className="flex flex-col gap-1">
                    {w.sources.map((s) => (
                      <span key={s.presence} className="flex flex-wrap items-center gap-2">
                        <span>
                          {accountLabel(s.account)}
                          {s.account ? <span className="ml-1.5 font-mono text-xs text-(--color-text-muted)">{s.account.id}</span> : null}
                        </span>
                        {s.state !== "current" ? <StatusBadge tone="warning">{s.state}</StatusBadge> : null}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="text-(--color-text-muted)">No current source</span>
                )}
              </Fact>
              <Fact label="Continuity">
                <span className="text-(--color-text-muted)">
                  {w.continuity === "immutable"
                    ? `Tracked by the id AWS assigns at creation, so a ${runtime} deleted and recreated under the same name is a new workload.`
                    : `Same name only. AWS gives this ${runtime} no creation id we can read, so one deleted and recreated under this name looks the same to us.`}
                </span>
              </Fact>
            </Facts>
          </Panel>

          {attrs.status || attrs.foundation_model || attrs.env_var_names?.length || attrs.gateway_targets?.length ? (
            <Panel title="As AWS describes it">
              <Facts>
                {attrs.status ? <Fact label="Status">{attrs.status}</Fact> : null}
                {attrs.foundation_model ? (
                  <Fact label="Foundation model" mono>
                    {attrs.foundation_model}
                  </Fact>
                ) : null}
                {attrs.env_var_names?.length ? (
                  <Fact label="Environment">
                    <span className="flex flex-wrap gap-1">
                      {attrs.env_var_names.map((n) => (
                        <code key={n} className="rounded bg-(--color-surface-subtle) px-1.5 py-px font-mono text-xs">
                          {n}
                        </code>
                      ))}
                    </span>
                    <span className="mt-1 block text-xs text-(--color-text-muted)">Variable names only. Values are never collected.</span>
                  </Fact>
                ) : null}
                {attrs.gateway_targets?.length ? (
                  <Fact label="Gateway targets">
                    <span className="flex flex-col divide-y divide-(--color-border-subtle) rounded-md border border-(--color-border-subtle)">
                      {attrs.gateway_targets.map((t) => (
                        <span key={t.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                          <span className="font-medium">{t.name}</span>
                          <span className="text-xs text-(--color-text-muted)">{t.type}</span>
                          <span className="ml-auto text-xs text-(--color-text-muted)">{t.status}</span>
                        </span>
                      ))}
                    </span>
                  </Fact>
                ) : null}
              </Facts>
            </Panel>
          ) : null}
        </div>
      </div>

      {dialog ? (
        <ClassifyDialog workload={w} mode={dialog} open onOpenChange={(o) => !o && setDialog(null)} />
      ) : null}
    </div>
  );
}
