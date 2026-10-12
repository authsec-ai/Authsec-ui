/**
 * The reads behind a policy page's progress and header that no single endpoint
 * serves: the owner review of a version, who approved it, and its rollout.
 *
 * - Review: `GET /reviews` has no policy filter, so the newest 200 are read and
 *   the one for this version picked out. If it is not among them and more
 *   exist, the answer is "unknown", never "no review".
 * - Approval: the approval row has no read route; the `version_approved` event
 *   names who and the channel (iga_gov_approval_service.go:296).
 * - Rollout: 404 `rollout_not_started` is "not started", not a failure.
 */

import { useMemo } from "react";

import {
  useGetGovReviewQuery,
  useListGovReviewsQuery,
  type GovReviewSummary,
  type GovReviewView,
} from "@/app/api/igaPolicyAuthoringApi";
import { useGetGovRolloutQuery, type GovRolloutView } from "@/app/api/igaPolicyDeploymentsApi";
import { useListGovEventsQuery } from "@/app/api/igaPolicyReadsApi";

import { classifyPolicyError, type PolicyFailure } from "../shared";
import type { ProgressInput, ReviewFacts } from "./policyModel";

const REVIEW_LOOK = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface VersionReview {
  loading: boolean;
  /** The facts, `null` when no review exists, `"unknown"` when it could not be read. */
  facts: ReviewFacts | null | "unknown";
  summary: GovReviewSummary | null;
  view: GovReviewView | null;
  failure: PolicyFailure | null;
  refetch: () => void;
}

export function useVersionReview(ws: string, policyId: string, versionNo: number | undefined, enabled: boolean): VersionReview {
  const skip = !enabled || !policyId || versionNo === undefined;
  const list = useListGovReviewsQuery({ ws, limit: REVIEW_LOOK }, { skip });
  const summary = useMemo(() => {
    const rows = (list.data?.data ?? []).filter((r) => r.policy_id === policyId && r.version_no === versionNo);
    return rows.sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
  }, [list.data, policyId, versionNo]);
  const more = !!list.data?.meta.next_cursor;
  const detail = useGetGovReviewQuery({ ws, id: summary?.id ?? "" }, { skip: !summary });

  const failure = classifyPolicyError(list.error) ?? classifyPolicyError(detail.error);
  let facts: VersionReview["facts"];
  if (skip) facts = null;
  else if (list.isLoading) facts = null;
  else if (list.error) facts = "unknown";
  else if (!summary) facts = more ? "unknown" : null;
  else {
    const requested = detail.data?.requested.age_confirmations.length ?? 0;
    const open = detail.data?.unconfirmed.age.length ?? 0;
    facts = {
      status: summary.status,
      asked: summary.owners_asked,
      responded: summary.owners_responded,
      overdue: summary.overdue,
      ageRequested: requested,
      ageConfirmed: Math.max(0, requested - open),
    };
  }
  return {
    loading: !skip && (list.isLoading || (!!summary && detail.isLoading)),
    facts,
    summary,
    view: detail.data ?? null,
    failure,
    refetch: () => {
      void list.refetch();
      if (summary) void detail.refetch();
    },
  };
}

/** Who approved a version and through which channel, from the event trail. */
export function useVersionApproval(
  ws: string,
  versionId: string | undefined,
  enabled: boolean,
  nameOf: (id: string) => string,
): ProgressInput["approval"] {
  const q = useListGovEventsQuery(
    { ws, object_kind: "version", object_id: versionId, kind: ["version_approved"], limit: 1 },
    { skip: !enabled || !versionId },
  );
  if (!enabled || q.isLoading || q.isError || !q.data) return undefined;
  const e = q.data.data[0];
  if (!e) return null;
  const channel = typeof e.payload.channel === "string" ? e.payload.channel : "";
  const by = UUID.test(e.actor_id) ? nameOf(e.actor_id) : e.actor_kind === "slack_user" ? "a Slack user" : e.actor_id;
  return { by, channel };
}

export interface PolicyRollout {
  loading: boolean;
  /** `null`: not started. `"unknown"`: the read failed. */
  rollout: GovRolloutView | null | "unknown";
  failure: PolicyFailure | null;
  refetch: () => void;
}

export function usePolicyRollout(ws: string, policyId: string): PolicyRollout {
  const q = useGetGovRolloutQuery({ ws, policyId }, { skip: !policyId });
  const failure = classifyPolicyError(q.error);
  let rollout: PolicyRollout["rollout"] = q.data ?? null;
  if (failure && !q.data) rollout = failure.code === "rollout_not_started" ? null : "unknown";
  return {
    loading: q.isLoading,
    rollout: q.isLoading ? null : rollout,
    failure: failure && failure.code !== "rollout_not_started" ? failure : null,
    refetch: () => void q.refetch(),
  };
}
