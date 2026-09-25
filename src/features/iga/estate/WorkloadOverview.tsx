/**
 * Overview — "what is this, and how much do we know?" (§2.14.6). Plain words
 * first; the ARN and the raw evidence are one click away, not the headline.
 */

import { useState } from "react";
import { Link } from "react-router-dom";

import { objectPath, refId, type WorkloadDetail } from "@/app/api/igaGraphApi";
import { CopyField, DetailGrid, DetailRow, DrawerSection } from "@/components/console/detail";
import { DecisionBanner, StatusBadge } from "@/components/console/status";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { TableCard } from "@/theme/components/cards";

import { CLASSIFICATION_LABEL, CLASSIFICATION_TONE, RUNTIME_LABEL, accountLabel, agoText, dayText } from "../shared/labels";
import { viaLink } from "../shared/links";
import { ClassificationHistory } from "../classification/ClassificationHistory";
import { ClassifyDialog } from "../classification/ClassifyDialog";


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
  const runtime = RUNTIME_LABEL[w.runtime_kind];
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

      <TableCard>
        <CardContent className="space-y-6">
          <DrawerSection
            label="What it is"
            action={
              editable ? (
                w.classification === "classified_agent" ? (
                  <Button variant="outline" size="sm" onClick={() => setDialog("undo")}>
                    Undo classification
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => setDialog("classify")}>
                    Classify as agent
                  </Button>
                )
              ) : undefined
            }
          >
            <DetailGrid>
              <DetailRow
                full
                label="Classification"
                value={
                  <span className="flex flex-col gap-1.5">
                    <span>
                      <StatusBadge tone={CLASSIFICATION_TONE[w.classification]}>
                        {CLASSIFICATION_LABEL[w.classification]}
                      </StatusBadge>
                    </span>
                    <span>
                      <ClassificationText w={w} />
                    </span>
                    {w.classification !== "provider_native_agent" ? (
                      <button
                        type="button"
                        onClick={() => setHistory((h) => !h)}
                        aria-expanded={history}
                        className="w-fit text-xs font-semibold text-(--color-primary-text) hover:underline"
                      >
                        {history ? "Hide decision history" : "Decision history"}
                      </button>
                    ) : null}
                  </span>
                }
              />
              {history ? (
                <div className="col-span-2">
                  <ClassificationHistory ws={ws} id={refId(w.ref)} />
                </div>
              ) : null}
              <DetailRow full label="Runs as" value={<RunsAs w={w} />} />
              {w.instances?.state === "not_collected" ? (
                <DetailRow
                  full
                  label="Instances"
                  value={
                    w.runtime_kind === "bedrock_agent"
                      ? "Not collected. Aliases, which separate a live agent from a canary, are not read yet."
                      : "Not collected."
                  }
                />
              ) : null}
              <CopyField label="ARN" value={w.arn} />
            </DetailGrid>
          </DrawerSection>

          <DrawerSection
            label="How we know"
            action={
              <Link to="/iga/cloud/compute" className="text-xs font-semibold text-(--color-primary-text) hover:underline">
                Raw inventory
              </Link>
            }
          >
            <DetailGrid>
              <DetailRow label="First seen" value={dayText(w.first_seen_at)} />
              <DetailRow
                label="Last confirmed"
                value={agoText(w.last_confirmed_at)}
              />
              <DetailRow
                full
                label="Identity continuity"
                value={
                  w.continuity === "immutable"
                    ? `Tracked by the id AWS assigns at creation, so a ${runtime} deleted and recreated under the same name is a new workload.`
                    : `Same name only. AWS gives this ${runtime} no creation id we can read, so one deleted and recreated under this name looks the same to us.`
                }
              />
              <DetailRow
                full
                label="Found by"
                value={
                  w.sources.length ? (
                    <span className="flex flex-col gap-1">
                      {w.sources.map((s) => (
                        <span key={s.presence} className="flex items-center gap-2">
                          <span>
                            {accountLabel(s.account)}
                            {s.account ? <span className="ml-1 font-mono text-xs text-(--color-text-muted)">{s.account.id}</span> : null}
                          </span>
                          {s.state !== "current" ? <StatusBadge tone="warning">{s.state}</StatusBadge> : null}
                        </span>
                      ))}
                    </span>
                  ) : (
                    "No current source"
                  )
                }
              />
            </DetailGrid>
          </DrawerSection>

          {attrs.status || attrs.foundation_model || attrs.env_var_names?.length || attrs.gateway_targets?.length ? (
            <DrawerSection label="As AWS describes it">
              <DetailGrid>
                {attrs.status ? <DetailRow label="Status" value={attrs.status} /> : null}
                {attrs.foundation_model ? (
                  <DetailRow label="Foundation model" value={attrs.foundation_model} mono />
                ) : null}
                {attrs.env_var_names?.length ? (
                  <DetailRow
                    full
                    label="Environment variable names"
                    value={
                      <span className="flex flex-col gap-1">
                        <span className="font-mono text-xs">{attrs.env_var_names.join(", ")}</span>
                        <span className="text-xs text-(--color-text-muted)">Names only. Values are never collected.</span>
                      </span>
                    }
                  />
                ) : null}
                {attrs.gateway_targets?.length ? (
                  <DetailRow
                    full
                    label="Gateway targets"
                    value={
                      <span className="flex flex-col divide-y divide-(--color-border-subtle) rounded-md border border-(--color-border-subtle)">
                        {attrs.gateway_targets.map((t) => (
                          <span key={t.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                            <span className="font-medium">{t.name}</span>
                            <span className="text-xs text-(--color-text-muted)">{t.type}</span>
                            <span className="ml-auto text-xs text-(--color-text-muted)">{t.status}</span>
                          </span>
                        ))}
                      </span>
                    }
                  />
                ) : null}
              </DetailGrid>
            </DrawerSection>
          ) : null}
        </CardContent>
      </TableCard>

      {dialog ? (
        <ClassifyDialog workload={w} mode={dialog} open onOpenChange={(o) => !o && setDialog(null)} />
      ) : null}
    </div>
  );
}
