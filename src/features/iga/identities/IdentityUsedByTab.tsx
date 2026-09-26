/**
 * Identity › Used by (§5.3): which workloads are configured to run as this
 * identity, and which principals its trust policy lets assume it; for a
 * group, its members.
 *
 * One request returns the first page of every section the identity's kind
 * has — roles: workloads and principals; groups: members; users: none — and
 * each section then continues on its own cursor.
 */

import { Link } from "react-router-dom";

import {
  igaGraphApi,
  objectPath,
  refId,
  useGetGraphIdentityUsedByQuery,
  useLazyGetGraphIdentityUsedByQuery,
  type GroupMember,
  type IdentityDetail,
  type IdentityUsedBy,
  type PagedSection,
  type UsedByPrincipal,
  type UsedBySection,
  type UsedByWorkload,
} from "@/app/api/igaGraphApi";
import { useAppDispatch } from "@/app/hooks";

import { classifyGraphError } from "../shared/graphErrors";
import { RELATIONSHIP_LABEL, runtimeLabel, accountLabel, limitationText } from "../shared/labels";
import { emptyGiven } from "../shared/listSummary";
import { useGraphV2 } from "../shared/capabilities";
import { useGraphRevision, useTrackRevision } from "../shared/revision";
import { ClaimFacts } from "../shared/components/ClaimFacts";
import { CoverageSummary } from "../coverage/CoverageSummary";
import { IdentityName } from "../shared/components/IdentityName";
import { ClaimRow } from "../shared/components/Panel";
import { TabBody } from "../shared/components/ObjectShell";
import { SectionList } from "../shared/components/SectionList";
import { viaLink } from "../shared/links";

type From = { ref: IdentityDetail["ref"]; name: string };

function WorkloadBody({ r, from }: { r: UsedByWorkload; from: From }) {
  const path = objectPath(r.workload.ref);
  return (
    <ClaimRow
      eyebrow={RELATIONSHIP_LABEL[r.type] ?? r.type}
      title={
        <div className="min-w-0">
          {path ? (
            <Link {...viaLink(path, from)} className="text-[13px] font-medium text-(--color-primary-text) hover:underline">
              {r.workload.name}
            </Link>
          ) : (
            <span className="text-[13px] font-medium">{r.workload.name}</span>
          )}
          <span className="ml-2 text-xs text-(--color-text-muted)">
            {runtimeLabel(r.workload.runtime_kind)} · {accountLabel(r.workload.account)} · {r.workload.region ?? "Region not stated"}
          </span>
        </div>
      }
      facts={<ClaimFacts claim={r.claim} basis={r.basis} state={r.state} confirmedAt={r.last_confirmed_at} />}
    />
  );
}

function PrincipalBody({ r, from }: { r: UsedByPrincipal; from: From }) {
  return (
    <ClaimRow
      title={<IdentityName identity={r.principal} from={from} />}
      facts={<ClaimFacts claim={r.claim} basis={r.basis} state={r.state} confirmedAt={r.last_confirmed_at} />}
    >
      <p className="text-xs leading-relaxed text-(--color-text-muted)">
        Named by this role's trust policy{r.statement.sid ? ` (statement ${r.statement.sid})` : ""}. The caller's own
        sts:AssumeRole permission was not checked.
        {r.conditions ? " The trust policy sets conditions on it, which were not evaluated." : ""}
      </p>
    </ClaimRow>
  );
}

function MemberBody({ r, from }: { r: GroupMember; from: From }) {
  return (
    <ClaimRow
      title={<IdentityName identity={r.member} from={from} />}
      facts={<ClaimFacts claim={r.claim} basis={r.basis} state={r.state} confirmedAt={r.last_confirmed_at} />}
    />
  );
}

export function IdentityUsedByTab({ ws, identity }: { ws: string; identity: IdentityDetail }) {
  const dispatch = useAppDispatch();
  const { rev, epoch, refresh, markStale } = useGraphRevision(ws);
  const v2 = useGraphV2(ws);
  const args = { ws, rev, key: String(epoch), id: refId(identity.ref), ...(v2.available ? { graph: "v2" as const } : {}) };
  const q = useGetGraphIdentityUsedByQuery(args, { skip: v2.loading });
  const [fetchSection] = useLazyGetGraphIdentityUsedByQuery();
  const failure = classifyGraphError(q.error);
  useTrackRevision(ws, q.currentData, failure, (r, d) =>
    dispatch(igaGraphApi.util.upsertQueryData("getGraphIdentityUsedBy", { ...args, rev: r }, d)),
  );
  const data = q.currentData?.data;
  const coverage = q.currentData?.meta.coverage ?? [];
  const from: From = { ref: identity.ref, name: identity.name };

  /** The page after `cursor` of one section, at the pinned revision. */
  const more =
    <K extends UsedBySection>(section: K) =>
    async (cursor: string) =>
      (await fetchSection({ ...args, section, cursor }).unwrap()).data[section] as NonNullable<IdentityUsedBy[K]>;
  const onStale = (f: { currentRev?: number; currentPublishedAt?: string }) => markStale(f);
  const none = <T,>(): PagedSection<T> => ({ items: [], next_cursor: null, total_known: true, total: 0 });
  const empty = (text: string) => <>{emptyGiven(text, coverage)}</>;

  return (
    <TabBody ready={!!data} failure={failure} subject="what uses this identity" onRetry={() => void q.refetch()} onRefresh={refresh}>
      {data ? (
        <div className="space-y-4">
          {coverage.length ? <CoverageSummary subject="workloads or principals" ws={ws} gaps={coverage} accountName={(id) => id} /> : null}
          {identity.kind === "iam_group" ? (
            <SectionList
              label="Members"
              first={data.members ?? none<GroupMember>()}
              loadMore={more("members")}
              onStale={onStale}
              itemKey={(r) => r.claim}
              render={(r) => <MemberBody r={r} from={from} />}
              empty={empty("No user is a member of this group.")}
            />
          ) : identity.kind === "iam_role" ? (
            <>
              <SectionList
                label="Workloads configured to run as it"
                first={data.workloads ?? none<UsedByWorkload>()}
                loadMore={more("workloads")}
                onStale={onStale}
                itemKey={(r) => r.claim}
                render={(r) => <WorkloadBody r={r} from={from} />}
                empty={empty("No workload is configured to run as this identity.")}
              />
              <SectionList
                label="Principals that may assume it"
                first={data.principals ?? none<UsedByPrincipal>()}
                loadMore={more("principals")}
                onStale={onStale}
                itemKey={(r) => r.claim}
                render={(r) => <PrincipalBody r={r} from={from} />}
                empty={empty("Its trust policy names no principal we could resolve.")}
              />
              {data.principals?.limitations?.map((code) => (
                <p key={code} className="text-xs text-(--color-text-muted)">
                  {limitationText({ code: code as Parameters<typeof limitationText>[0]["code"] })}
                </p>
              ))}
            </>
          ) : (
            <p className="text-sm text-(--color-text-muted)">
              An IAM user is not run as by a workload or assumed through a trust policy. What it may do is on its
              Permissions tab.
            </p>
          )}
        </div>
      ) : null}
    </TabBody>
  );
}
