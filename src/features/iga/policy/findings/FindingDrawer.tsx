/**
 * The finding drawer (SPEC-iga-phase3-policy.md §9.3 S2): one role's finding
 * stated as a claim in the reader's words, why the window is as long as it is,
 * what is unused, used and kept, how old the grants are, who uses the role and
 * who owns it, whether a policy already controls it, and the evidence behind
 * the claim.
 *
 * An unused-service finding is one row per role and service, so the drawer
 * reads the role's other unused-service findings to state the claim for the
 * whole role. The finding's own status is its CURRENT workflow status; the
 * condition is as of the evaluated revision.
 *
 * An exception (author) is the only way to set a finding aside; there is no
 * "Retain with reason" route.
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";

import {
  govFindingDetail,
  govTargetKeyForObject,
  useGetGovFindingQuery,
  useListGovActivityEvidenceQuery,
  useListGovFindingsQuery,
  useResolveGovTargetsQuery,
  type GovActivityEvidence,
  type GovFindingDetail,
  type GovResolvedTarget,
} from "@/app/api/igaPolicyReadsApi";
import { useGetGovPolicyQuery } from "@/app/api/igaPolicyAuthoringApi";
import { RightDrawer } from "@/components/primitives/RightDrawer";
import { DrawerBody, DrawerFooter, DrawerHeader, DrawerSection } from "@/components/console/detail";
import { Button } from "@/components/ui/button";
import { Fact, Facts, Meta } from "@/features/iga/shared/components/Panel";
import { Timestamp } from "@/features/iga/shared/components/Timestamp";

import {
  PolicyLoadFailure,
  StateChip,
  classifyPolicyError,
  findingKind,
  findingStatus,
  humanize,
  plural,
  relTime,
  serviceList,
  severity,
  trust,
  usePolicyPermission,
} from "../shared";
import { useMemberNames } from "../policies/useMemberNames";
import { FindingException } from "./FindingException";
import { AssignOwnersDialog } from "./ObjectOwnersPanel";
import {
  ACTIONABLE_STATUSES,
  advisorLagWords,
  bucketActivity,
  coverageHref,
  coverageHrefFor,
  dateWords,
  discoveryHref,
  grantAgeWords,
  newPolicyHref,
  otherHeadline,
  summarizeUnused,
  trustReasonWords,
  unusedHeadline,
  windowReason,
} from "./findingModel";

export function FindingDrawer({
  ws,
  findingId,
  onClose,
  onOpenFinding,
}: {
  ws: string;
  findingId: string | null;
  onClose: () => void;
  /** Another finding on the same role: the page swaps `?finding=` and keeps its filters. */
  onOpenFinding: (id: string) => void;
}) {
  return (
    <RightDrawer
      open={!!findingId}
      onClose={onClose}
      width={600}
      ariaTitle="Finding"
      ariaDescription="What AuthSec found for this role, the evidence behind it, who uses and owns the role, and what to do next."
    >
      {findingId ? <DrawerContent ws={ws} id={findingId} onClose={onClose} onOpenFinding={onOpenFinding} /> : null}
    </RightDrawer>
  );
}

function DrawerContent({ ws, id, onClose, onOpenFinding }: { ws: string; id: string; onClose: () => void; onOpenFinding: (id: string) => void }) {
  const q = useGetGovFindingQuery({ ws, id });
  const failure = classifyPolicyError(q.error);

  if (q.isLoading) {
    return (
      <>
        <DrawerHeader title="Loading finding…" />
        <DrawerBody>
          <p role="status" className="text-[13px] text-muted-foreground">
            Loading the finding and its evidence…
          </p>
        </DrawerBody>
      </>
    );
  }
  if (failure && !q.data) {
    return (
      <>
        <DrawerHeader title="Finding" />
        <DrawerBody>
          {failure.kind === "not_found" ? (
            <p className="text-[13px]">This finding does not exist in this workspace, or it was removed when its scan was pruned.</p>
          ) : (
            <PolicyLoadFailure failure={failure} subject="this finding" onRetry={() => void q.refetch()} />
          )}
        </DrawerBody>
        <DrawerFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DrawerFooter>
      </>
    );
  }
  if (!q.data) return null;
  return <Loaded ws={ws} detail={q.data.data} evaluatedRev={q.data.meta.evaluated_rev} onOpenFinding={onOpenFinding} />;
}

function Loaded({ ws, detail: f, evaluatedRev, onOpenFinding }: { ws: string; detail: GovFindingDetail; evaluatedRev: number | null; onOpenFinding: (id: string) => void }) {
  const nameOf = useMemberNames(ws);
  const admin = usePolicyPermission("iga:admin");
  const [assigning, setAssigning] = useState(false);
  const identityId = f.identity_account_id;

  // The role's other findings: an unused service is one finding per service.
  const siblings = useListGovFindingsQuery({ ws, identity_id: identityId ?? undefined, limit: 200 }, { skip: !identityId });
  const evidenceQ = useListGovActivityEvidenceQuery({ ws, identityId: identityId ?? "" }, { skip: !identityId });
  const targetQ = useResolveGovTargetsQuery({ ws, keys: [govTargetKeyForObject(identityId ?? "")] }, { skip: !identityId });
  const policyQ = useGetGovPolicyQuery({ ws, policyId: f.linked_policy?.policy_id ?? "" }, { skip: !f.linked_policy });

  const roleFindings = useMemo(() => {
    const rows = siblings.data?.data ?? [];
    return rows.some((r) => r.id === f.id) ? rows : [f, ...rows];
  }, [siblings.data, f]);
  const unused = useMemo(() => summarizeUnused(roleFindings), [roleFindings]);
  const others = roleFindings.filter((r) => r.kind !== "unused_service" && r.id !== f.id);
  const target: GovResolvedTarget | undefined = targetQ.data?.[0];
  const evidence = evidenceQ.data?.data ?? [];

  const isUnused = f.kind === "unused_service";
  const detailUnused = govFindingDetail(f, "unused_service");
  const limiting = unused.limiting ?? detailUnused;
  const headline = isUnused ? unusedHeadline(unused) : otherHeadline(f).title;
  const sev = f.condition ? severity(f.condition.severity) : null;
  const status = findingStatus(f.current.status);
  const policyName = policyQ.data?.name;
  const discovery = discoveryHref(f);
  const roleLabel = f.role_name || f.role_arn || "This role";
  const consumers = f.consumers;

  const actionableIds = unused.findings.filter((u) => ACTIONABLE_STATUSES.includes(u.current.status)).map((u) => u.id);
  const canGenerate = isUnused && !f.linked_policy && actionableIds.length > 0;

  return (
    <>
      <DrawerHeader
        title={roleLabel}
        subtitle={
          <>
            IAM role{f.account_id ? ` · ${f.account_id}` : ""}
            {consumers.length > 0 ? ` · used by ${plural(consumers.length, "workload")}` : ""}
          </>
        }
        badge={sev ? <StateChip state={sev} /> : undefined}
      />
      <DrawerBody>
        <section aria-labelledby="finding-claim" className="space-y-1.5">
          <h3 id="finding-claim" className="text-[15px] font-semibold leading-snug text-foreground">
            {headline}
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">{findingKind(f.kind)}</span>
            <StateChip state={status} />
            {f.condition?.confidence === "age_unverified" ? (
              <StateChip state={{ label: "Grant age unverified", tone: "warning", hint: "The grant existed before AuthSec's first scan." }} />
            ) : null}
          </div>
          {isUnused ? (
            <>
              <Meta>{windowReason(limiting)}</Meta>
              <Meta>{advisorLagWords(limiting)}</Meta>
              <Meta>
                No reported attempt is not proof of no use: it covers access through this role's own policies and not access granted by a resource policy.
              </Meta>
            </>
          ) : (
            <Meta>{otherHeadline(f).evidence}</Meta>
          )}
          {!f.condition ? (
            <p role="status" className="rounded-md bg-(--color-surface-subtle) px-3 py-2 text-xs text-(--color-text-muted)">
              This condition does not hold in the evaluated revision{evaluatedRev !== null ? ` (rev ${evaluatedRev})` : ""}. It is shown with its current status ({status.label.toLowerCase()}).
            </p>
          ) : null}
        </section>

        {isUnused ? <UnusedFacts unused={unused} evidence={evidence} evidenceLoading={evidenceQ.isLoading} evidenceFailed={evidenceQ.isError} /> : <OtherFacts f={f} />}

        <DrawerSection label="Who uses it and who owns it">
          <Facts>
            <Fact label="Who uses it">
              {consumers.length === 0 ? (
                <span className="text-(--color-text-muted)">No workload is known to run as this role.</span>
              ) : (
                <ul className="space-y-0.5">
                  {consumers.map((c) => (
                    <li key={`${c.workload_id}:${c.relationship}`}>
                      <Link to={`/iga/estate/${encodeURIComponent(c.workload_id)}`} className="font-medium text-(--color-primary-text) hover:underline">
                        {c.name || "Unnamed workload"}
                      </Link>{" "}
                      <span className="text-xs text-(--color-text-muted)">
                        ({c.relationship === "task_execution_role" ? "task execution role" : "runs as"}
                        {c.runtime_kind ? ` · ${humanize(c.runtime_kind).toLowerCase()}` : ""})
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Fact>
            <Fact label="Owners">
              {f.owners.length === 0 ? (
                <span className="text-(--color-text-muted)">No owner. A change cannot go to owner review until someone is assigned.</span>
              ) : (
                <ul className="space-y-0.5">
                  {f.owners.map((o) => (
                    <li key={o.owner_id}>
                      {nameOf(o.user_id)}{" "}
                      <span className="text-xs text-(--color-text-muted)">
                        ({o.for === "role" ? "owner of the role" : `owner of ${o.for}`}
                        {o.role === "technical" ? ", technical" : ""})
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Fact>
            <Fact label="Controlled">
              {f.linked_policy ? (
                <>
                  <Link to={`/iga/policy/policies/${encodeURIComponent(f.linked_policy.policy_id)}`} className="font-medium text-(--color-primary-text) hover:underline">
                    {policyName ?? "An AuthSec policy"}
                  </Link>{" "}
                  <span className="text-xs text-(--color-text-muted)">controls this role ({f.linked_policy.state})</span>
                </>
              ) : (
                <span className="text-(--color-text-muted)">No AuthSec policy controls this role.</span>
              )}
            </Fact>
          </Facts>
        </DrawerSection>

        <FindingException finding={f} />

        <DrawerSection label="Evidence trust">
          <TrustBlock target={target} loading={targetQ.isLoading} failed={targetQ.isError} gap={f.collection_gap ? coverageHref(f) : null} />
        </DrawerSection>

        {isUnused && evidence.length > 0 ? <EvidenceTable evidence={evidence} unusedServices={unused.services} /> : null}

        {others.length > 0 ? (
          <DrawerSection label="Other findings on this role">
            <ul className="space-y-1 text-[13px]">
              {others.map((o) => (
                <li key={o.id}>
                  <button type="button" onClick={() => onOpenFinding(o.id)} className="text-left text-(--color-primary-text) hover:underline">
                    {otherHeadline(o).title}
                  </button>{" "}
                  <span className="text-xs text-(--color-text-muted)">{findingKind(o.kind)}</span>
                </li>
              ))}
            </ul>
          </DrawerSection>
        ) : null}

        <p className="text-xs text-muted-foreground">
          Status is as of now; the condition is as of {evaluatedRev !== null ? `rev ${evaluatedRev}` : "the evaluated scan"}
          {f.current.status_changed_at ? <>, status changed <Timestamp iso={f.current.status_changed_at} /></> : null}.
        </p>
      </DrawerBody>
      <DrawerFooter>
        {f.linked_policy ? (
          <Button asChild>
            <Link to={`/iga/policy/policies/${encodeURIComponent(f.linked_policy.policy_id)}`}>Edit {policyName ?? "policy"}</Link>
          </Button>
        ) : canGenerate ? (
          <Button asChild>
            <Link to={newPolicyHref(actionableIds)}>Generate tighter policy</Link>
          </Button>
        ) : null}
        {f.kind === "activity_not_read" ? (
          <Button asChild variant="outline">
            <Link to={coverageHref(f)}>View in Connections</Link>
          </Button>
        ) : null}
        {identityId && admin.offered ? (
          <Button variant="outline" onClick={() => setAssigning(true)}>
            Assign owner
          </Button>
        ) : null}
        {discovery ? (
          <Button asChild variant="outline">
            <Link to={discovery}>
              Open in Discovery <ExternalLink className="size-3.5" aria-hidden="true" />
            </Link>
          </Button>
        ) : null}
        {isUnused && !f.linked_policy && !canGenerate ? (
          <span className="basis-full text-xs text-muted-foreground">
            No unused service on this role is open for a change ({status.label.toLowerCase()}).
          </span>
        ) : null}
      </DrawerFooter>
      {assigning && identityId ? <AssignOwnersDialog ws={ws} objectKind="identity_account" objectId={identityId} onClose={() => setAssigning(false)} /> : null}
    </>
  );
}

/* -------------------------------------------------------------------------- */

function UnusedFacts({
  unused,
  evidence,
  evidenceLoading,
  evidenceFailed,
}: {
  unused: ReturnType<typeof summarizeUnused>;
  evidence: GovActivityEvidence[];
  evidenceLoading: boolean;
  evidenceFailed: boolean;
}) {
  const b = useMemo(() => bucketActivity(evidence, unused.services), [evidence, unused.services]);
  const age = grantAgeWords(unused);
  return (
    <DrawerSection label="What was reviewed">
      <Facts>
        <Fact label="Unused">{unused.services.length === 0 ? "none" : serviceList(unused.services, 8)}</Fact>
        {evidenceLoading ? (
          <Fact label="Used">
            <span className="text-(--color-text-muted)">Loading…</span>
          </Fact>
        ) : evidenceFailed ? (
          <Fact label="Used">
            <span className="text-(--color-text-muted)">The activity evidence could not be loaded.</span>
          </Fact>
        ) : (
          <>
            <Fact label="Used">
              {b.used.length === 0 ? (
                <span className="text-(--color-text-muted)">none reported</span>
              ) : (
                b.used.slice(0, 8).map((u, i) => (
                  <span key={u.service}>
                    {i > 0 ? " · " : ""}
                    {u.service} <span className="text-xs text-(--color-text-muted)">({relTime(u.at)})</span>
                  </span>
                ))
              )}
              {b.used.length > 8 ? ` · +${b.used.length - 8}` : null}
            </Fact>
            {b.tooRecent.length > 0 ? (
              <Fact label="Too early to say">
                {serviceList(b.tooRecent, 8)}
                <Meta>Granted, but there is not yet enough history to call them unused.</Meta>
              </Fact>
            ) : null}
            <Fact label="Kept anyway">
              {b.kept.length === 0 ? (
                <span className="text-(--color-text-muted)">nothing is kept for a reason AuthSec can see</span>
              ) : (
                <ul>
                  {b.kept.slice(0, 6).map((k) => (
                    <li key={k.service}>
                      {k.service} <span className="text-xs text-(--color-text-muted)">({k.why})</span>
                    </li>
                  ))}
                  {b.kept.length > 6 ? <li className="text-xs text-(--color-text-muted)">+{b.kept.length - 6} more</li> : null}
                </ul>
              )}
              <Meta>Dependencies the change keeps, such as a task's execution needs, are decided when the policy is generated.</Meta>
            </Fact>
            {b.notRead.length > 0 ? (
              <Fact label="Not read">
                {serviceList(b.notRead, 8)}
                <Meta>Activity was not collected for these, so nothing is concluded about them.</Meta>
              </Fact>
            ) : null}
          </>
        )}
        <Fact label="Grant age">
          {age ? (
            age
          ) : unused.services.length > 0 ? (
            <span className="text-(--color-text-muted)">Each grant was seen by AuthSec when it was added, so the window is not shortened by an unknown age.</span>
          ) : (
            <span className="text-(--color-text-muted)">Not applicable.</span>
          )}
        </Fact>
      </Facts>
    </DrawerSection>
  );
}

function OtherFacts({ f }: { f: GovFindingDetail }) {
  const broad = govFindingDetail(f, "broad_grant");
  if (broad) {
    const policy = broad.policy_arn ? broad.policy_arn.slice(broad.policy_arn.lastIndexOf("/") + 1) : "";
    return (
      <DrawerSection label="The grant">
        <Facts>
          <Fact label="Policy">
            {policy || "An inline policy"} <span className="text-xs text-(--color-text-muted)">({broad.assignment_kind})</span>
          </Fact>
          {broad.sid ? <Fact label="Statement">{broad.sid}</Fact> : null}
          <Fact label="Why it is broad">
            <ul className="list-disc pl-4">
              {broad.reasons.map((r) => (
                <li key={r}>
                  {r === "full_wildcard"
                    ? "Allows every action on every resource"
                    : r === "not_action_on_all_resources"
                      ? "Allows everything except a list of actions, on every resource"
                      : r === "service_wildcard"
                        ? `Allows every action of ${serviceList((broad.service_wildcards ?? []).map((s) => s.replace(/:\*$/, "")), 6)}`
                        : `Can escalate privileges: ${serviceList(broad.escalations ?? [], 6)}`}
                </li>
              ))}
            </ul>
          </Fact>
          <Fact label="Condition">{broad.has_condition ? "The statement has a condition that limits it." : "The statement has no condition."}</Fact>
        </Facts>
        <Meta className="mt-2">This release restricts whole AWS services. It does not narrow a statement, so a broad grant is something to review rather than to generate a policy for.</Meta>
      </DrawerSection>
    );
  }
  return null;
}

function TrustBlock({ target, loading, failed, gap }: { target: GovResolvedTarget | undefined; loading: boolean; failed: boolean; gap: string | null }) {
  if (loading) return <p className="text-[13px] text-muted-foreground">Checking the evidence…</p>;
  if (failed || !target) {
    return (
      <p className="text-[13px] text-muted-foreground">
        The evidence trust for this role could not be read. This is not the same as the evidence being fine.
      </p>
    );
  }
  const ev = target.evidence;
  if (!ev) {
    return (
      <p className="text-[13px] text-muted-foreground">
        AuthSec has no evidence bundle to build for this role{target.reason ? ` (${humanize(target.reason).toLowerCase()})` : ""}.
      </p>
    );
  }
  const t = trust(ev.trust);
  const link = gap ?? (ev.trust !== "trusted" ? coverageHrefFor(ev.connector_id) : null);
  return (
    <div className="space-y-1.5 text-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <StateChip state={t} />
        <span className="text-xs text-muted-foreground">
          {ev.published_rev !== null ? `Scan rev ${ev.published_rev}` : "No published scan"}
          {ev.activity_report_generated_at ? <>, activity report generated <Timestamp iso={ev.activity_report_generated_at} /></> : null}
        </span>
      </div>
      {ev.trust_reasons.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {ev.trust === "untrusted" ? "AuthSec cannot propose a change from this evidence" : "Some gaps an approver must accept"}: {ev.trust_reasons.map(trustReasonWords).join("; ")}.
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Resource policies:{" "}
        {ev.resource_policy_coverage === "complete" ? "fully collected" : ev.resource_policy_coverage === "partial" ? "partly collected" : "not collected"}.
      </p>
      {link ? (
        <Link to={link} className="inline-block text-xs font-medium text-(--color-primary-text) hover:underline">
          Open the connection
        </Link>
      ) : null}
    </div>
  );
}

function EvidenceTable({ evidence, unusedServices }: { evidence: GovActivityEvidence[]; unusedServices: string[] }) {
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  const unused = new Set(unusedServices);
  const rows = all ? evidence : evidence.slice(0, 20);
  return (
    <DrawerSection label="The evidence behind it">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="text-[13px] font-medium text-(--color-primary-text) hover:underline"
      >
        {open ? "Hide" : "Show"} the activity report for {plural(evidence.length, "service")}
      </button>
      {open ? (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">AWS Access Advisor activity for each service this role is granted</caption>
            <thead className="text-(--color-text-muted)">
              <tr>
                <th scope="col" className="py-1 pr-3 font-medium">Service</th>
                <th scope="col" className="py-1 pr-3 font-medium">Last attempt</th>
                <th scope="col" className="py-1 pr-3 font-medium">Grant age</th>
                <th scope="col" className="py-1 font-medium">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--color-border-subtle)">
              {rows.map((e) => (
                <tr key={e.service}>
                  <th scope="row" className="py-1 pr-3 font-medium">{e.service}</th>
                  <td className="py-1 pr-3">{e.state === "not_collected" ? "Not read" : e.last_authenticated_at ? <Timestamp iso={e.last_authenticated_at} /> : "None reported"}</td>
                  <td className="py-1 pr-3">
                    {e.grant_age_basis === "observed_since_change"
                      ? `Seen since ${dateWords(e.grant_observed_since) || "its start"}`
                      : e.grant_age_basis === "predates_observation"
                        ? "Predates AuthSec"
                        : "Unknown"}
                  </td>
                  <td className="py-1">
                    {unused.has(e.service) ? "Unused" : e.state === "not_collected" ? "Not concluded" : e.reason ? "Kept" : e.last_authenticated_at ? "Used" : "Too early to say"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!all && evidence.length > rows.length ? (
            <button type="button" className="mt-2 text-xs font-medium text-(--color-primary-text) hover:underline" onClick={() => setAll(true)}>
              Show all {evidence.length}
            </button>
          ) : null}
        </div>
      ) : null}
    </DrawerSection>
  );
}
