/**
 * One AI workload: the evidence behind its label, what runs as it, and the
 * actions (classify or dismiss a suggestion, contain). Environment variable
 * names are "supporting" evidence and role session names are "unverified weak
 * evidence": neither decides anything.
 */

import { Link } from "react-router-dom";

import type { AIWorkload, AgentSuggestion } from "@/app/api/igaAgentRuntimeApi";
import { DetailGrid, DetailRow, DrawerBody, DrawerFooter, DrawerHeader, DrawerSection } from "@/components/console/detail";
import { Button } from "@/components/ui/button";
import { RightDrawer } from "@/components/primitives/RightDrawer";

import { coverageText, shortTime, topEntries } from "./model";
import { ActivityTimelineSection } from "./activity/ActivityTimelineSection";
import { ConfigHintEvidence, LiveEvidence, NetworkTrafficEvidence } from "./EvidenceSections";
import { LabelChip, Mono } from "./parts";

function Counts({ entries, empty }: { entries: [string, number][]; empty: string }) {
  if (!entries.length) return <p className="text-xs text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-0.5 text-[13px]">
      {entries.map(([k, n]) => (
        <li key={k} className="flex justify-between gap-3">
          <Mono>{k}</Mono>
          <span className="tabular-nums text-muted-foreground">{n}</span>
        </li>
      ))}
    </ul>
  );
}

export function AiWorkloadDrawer({
  ai,
  suggestion,
  canDecide,
  canContain,
  onClose,
  onConfirm,
  onDismiss,
  onContain,
}: {
  ai: AIWorkload | null;
  suggestion: AgentSuggestion | null;
  canDecide: boolean;
  canContain: boolean;
  onClose: () => void;
  onConfirm: (s: AgentSuggestion) => void;
  onDismiss: (s: AgentSuggestion) => void;
  onContain: (ai: AIWorkload) => void;
}) {
  const supporting = suggestion?.evidence.supporting;
  return (
    <RightDrawer open={!!ai} onClose={onClose} width={560} ariaTitle="AI workload detail" ariaDescription="Evidence, workloads and actions for one AI workload.">
      {ai ? (
        <>
          <DrawerHeader title={ai.identity.name || ai.identity.arn} subtitle={ai.identity.kind.replace(/_/g, " ")} badge={<LabelChip label={ai.label} />} />
          <DrawerBody>
            {ai.label === "ai_workload" ? (
              <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">This is evidence of model use. It is not classified as an agent.</p>
            ) : null}
            {ai.label === "possible_ai_workload" ? (
              <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                Possible AI workload: names or a scan-time network match hint at a model, but no model call is tied to it. It raises no alerts and is never suggested as an agent.
              </p>
            ) : null}
            {ai.shared_role ? (
              <p className="rounded-md border border-(--color-warning) bg-(--color-warning-soft) px-3 py-2 text-xs text-(--color-warning-text)">
                Shared role: {ai.workloads.length + ai.k8s_service_accounts.length} workloads run as this identity. Calls are attributed to the role, not to one of them, so it is never suggested as an agent.
              </p>
            ) : null}

            <DrawerSection label="Identity">
              <DetailGrid>
                <DetailRow label="ARN" value={ai.identity.arn} mono full />
                <DetailRow label="Open findings" value={ai.open_findings} />
              </DetailGrid>
            </DrawerSection>

            <DrawerSection label="Runs as this identity">
              {ai.workloads.length || ai.k8s_service_accounts.length ? (
                <ul className="space-y-1.5 text-[13px]">
                  {ai.workloads.map((w) => (
                    <li key={w.cloud_workload_id}>
                      {w.workload_id ? (
                        <Link to={`/iga/estate/${w.workload_id}`} className="font-medium text-(--color-primary-text) hover:underline">
                          {w.name}
                        </Link>
                      ) : (
                        <span className="font-medium">{w.name}</span>
                      )}{" "}
                      <span className="text-xs text-muted-foreground">
                        {w.runtime_kind} {w.region}
                        {w.classification ? `, ${w.classification.replace(/_/g, " ")}` : ""}
                      </span>
                    </li>
                  ))}
                  {ai.k8s_service_accounts.map((s) => (
                    <li key={s} className="text-xs text-muted-foreground">
                      Kubernetes service account {s}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">No collected workload runs as this identity.</p>
              )}
            </DrawerSection>

            <DrawerSection label="Model calls">
              <DetailGrid>
                <DetailRow label="Calls" value={ai.calls} />
                <DetailRow label="Refused" value={ai.denied} />
                <DetailRow label="Errors" value={ai.errors} />
                <DetailRow label="Tokens" value={ai.tokens || "not reported"} />
                <DetailRow label="First call" value={shortTime(ai.first_call_at)} />
                <DetailRow label="Last call" value={shortTime(ai.last_call_at)} />
                <DetailRow
                  label="Window covered"
                  value={
                    <>
                      {coverageText(ai.coverage)}
                      {ai.coverage.partial ? <span className="block text-xs text-(--color-warning-text)">Part of the interval was not read. Calls outside the window are unknown, not absent.</span> : null}
                    </>
                  }
                  full
                />
              </DetailGrid>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Models</p>
                  <Counts entries={topEntries(ai.models)} empty="None named in the window read." />
                </div>
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Endpoints</p>
                  <Counts entries={topEntries(ai.endpoints)} empty="None recorded." />
                </div>
              </div>
            </DrawerSection>

            <LiveEvidence ai={ai} />
            <NetworkTrafficEvidence ai={ai} />
            <ConfigHintEvidence ai={ai} />
            <ActivityTimelineSection identityId={ai.identity.id} inDrawer />

            <DrawerSection label="Other services it called">
              <Counts entries={topEntries(ai.other_services)} empty="None seen in the window read." />
            </DrawerSection>

            <DrawerSection label="Supporting evidence">
              <p className="mb-2 text-xs text-muted-foreground">Names never decide a label; they only support it.</p>
              {supporting ? (
                <div className="space-y-2 text-[13px]">
                  <p>
                    <span className="text-xs text-muted-foreground">Environment variable names: </span>
                    {supporting.env_var_names?.length ? supporting.env_var_names.join(", ") : supporting.env_vars_unread ? "not readable" : "none of interest"}
                  </p>
                  {supporting.layer_names?.length ? <p><span className="text-xs text-muted-foreground">Layers: </span>{supporting.layer_names.join(", ")}</p> : null}
                  {supporting.readable_model_keys?.length ? (
                    <p>
                      <span className="text-xs text-muted-foreground">Model-key secrets it may read ({supporting.readable_basis ?? "declared grants"}): </span>
                      {supporting.readable_model_keys.map((k) => k.name).join(", ")}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Shown for a suggested agent.</p>
              )}
              <div className="mt-3">
                <p className="mb-1 text-xs font-medium">Role session names (unverified, weak evidence)</p>
                {ai.session_names.values.length ? (
                  <>
                    <p className="text-[13px]">{ai.session_names.values.join(", ")}</p>
                    {ai.session_names.matches.length ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {ai.session_names.matches.length} equal a workload name here. This does not attribute the calls to it.
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">None recorded.</p>
                )}
              </div>
            </DrawerSection>
          </DrawerBody>
          <DrawerFooter>
            {suggestion && suggestion.state === "pending" && canDecide ? (
              <>
                <Button className="text-white" onClick={() => onConfirm(suggestion)}>
                  Classify as agent
                </Button>
                <Button variant="outline" onClick={() => onDismiss(suggestion)}>
                  Dismiss
                </Button>
              </>
            ) : null}
            {canContain ? (
              <Button variant="outline" onClick={() => onContain(ai)}>
                Contain…
              </Button>
            ) : null}
          </DrawerFooter>
        </>
      ) : null}
    </RightDrawer>
  );
}
