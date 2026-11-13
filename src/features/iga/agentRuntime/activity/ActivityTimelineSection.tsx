/**
 * Compact recent activity for one identity and/or workload, with a link to the full page.
 * Embed: <ActivityTimelineSection identityId={id} />  or  <ActivityTimelineSection workloadId={wid} limit={5} />
 * Needs discovery:read. Reads /api/iga/v1/agent-runtime/activity; renders nothing agent-sensitive beyond metadata.
 */

import { Link } from "react-router-dom";

import { DrawerSection } from "@/components/console/detail";
import { Panel } from "@/features/iga/shared/components/Panel";
import { getWorkspaceId } from "@/utils/workspace";

import { ReadFailure } from "../parts";
import { ActivityRow } from "./ActivityRow";
import { ACTIVITY_HREF, useActivityFeed } from "./activityModel";

export interface ActivityTimelineSectionProps {
  identityId?: string;
  workloadId?: string;
  /** Rows shown, 1..200. Default 5. */
  limit?: number;
  /** Inside a drawer: a DrawerSection instead of a page Panel. */
  inDrawer?: boolean;
}

export function ActivityTimelineSection({
  identityId,
  workloadId,
  limit = 5,
  inDrawer = false,
}: ActivityTimelineSectionProps) {
  const ws = getWorkspaceId() ?? "";
  const feed = useActivityFeed(
    { ws, identity_id: identityId, workload_id: workloadId, limit },
    !identityId && !workloadId,
  );
  const qs = new URLSearchParams();
  if (identityId) qs.set("identity_id", identityId);
  if (workloadId) qs.set("workload_id", workloadId);
  const content = (
    <>
      {feed.loading ? (
        <p role="status" className="text-[13px] text-(--color-text-muted)">
          Loading activity…
        </p>
      ) : null}
      {feed.failure && !feed.hasData ? (
        <ReadFailure
          failure={feed.failure}
          subject="activity"
          onRetry={feed.refetch}
        />
      ) : null}
      {feed.hasData && feed.rows.length === 0 ? (
        <p className="text-[13px] text-(--color-text-muted)">
          No activity recorded yet.
        </p>
      ) : null}
      {feed.rows.length ? (
        <ul className="divide-y divide-(--color-border-subtle)">
          {feed.rows.slice(0, limit).map((a) => (
            <ActivityRow key={a.id} a={a} compact />
          ))}
        </ul>
      ) : null}
    </>
  );
  const fullLink = (
    <Link
      to={`${ACTIVITY_HREF}?${qs.toString()}`}
      className="font-medium text-(--color-primary-text) hover:underline"
    >
      Open full activity
    </Link>
  );
  if (inDrawer) {
    return (
      <DrawerSection label="Recent activity">
        {content}
        <p className="mt-2 text-xs">{fullLink}</p>
      </DrawerSection>
    );
  }
  return (
    <Panel
      title="Recent activity"
      description="What AuthSec has recorded for this subject. An empty list is not proof of no activity: see the sources on the activity page."
      actions={fullLink}
    >
      {content}
    </Panel>
  );
}
