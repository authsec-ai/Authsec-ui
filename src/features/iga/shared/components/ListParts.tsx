/**
 * Pieces the three graph lists (Agents & workloads, Identities, Resources)
 * share, so each answers scope and completeness the same way
 * (SPEC-iga-phase2-graph.md §2.14.7, §2.14.10, §2.14.13).
 */

import type { ReactNode } from "react";
import { format } from "date-fns";

import type { GraphListMeta, Pipeline } from "@/app/api/igaGraphApi";
import { CardContent } from "@/components/ui/card";
import { TableCard } from "@/theme/components/cards";

import { PipelineNotice } from "../../pipeline/PipelineNotice";
import { GraphStatePanel } from "./GraphStatePanel";

/** "as of 22 Sep, 14:02" — the publication a list shows. */
export function AsOf({ meta }: { meta: GraphListMeta | undefined }) {
  return meta?.published_at ? (
    <span className="text-xs text-(--color-text-muted)">as of {format(new Date(meta.published_at), "d MMM, HH:mm")}</span>
  ) : null;
}

/**
 * Choosing one account excludes objects with no stated account, and says so
 * (§2.14.10): a production filter must not look like the complete answer for
 * production when a bucket its roles are granted on states no account.
 */
export function UnknownAccountNote({
  account,
  accountName,
  unknownCount,
  onShow,
}: {
  account: string | undefined;
  accountName: string;
  unknownCount: number | undefined;
  onShow: () => void;
}) {
  if (!account || account === "unknown" || !unknownCount) return null;
  return (
    <p className="text-xs text-(--color-text-muted)">
      {accountName} · {unknownCount.toLocaleString()} with unknown account not shown{" "}
      <button type="button" onClick={onShow} className="font-semibold text-(--color-primary-text) hover:underline">
        Show
      </button>
    </p>
  );
}

/**
 * The page-level answers that replace a list entirely: the backend does not
 * serve it, the customer may not read it, or no AWS account is connected.
 */
export function ListGate({
  off,
  unauthorized,
  pipeline,
  subject,
  children,
}: {
  off: boolean;
  unauthorized: boolean;
  pipeline: Pipeline | undefined;
  subject: string;
  children: ReactNode;
}) {
  if (off || unauthorized) {
    return (
      <TableCard>
        <CardContent variant="flush">
          <GraphStatePanel failure={{ kind: off ? "unavailable" : "unauthorized" }} subject={subject} />
        </CardContent>
      </TableCard>
    );
  }
  if (pipeline && pipeline.accounts.length === 0) return <PipelineNotice pipeline={pipeline} />;
  return <>{children}</>;
}

/** Connected but nothing published yet: the pipeline notice says what is happening. */
export function NotPublished() {
  return (
    <div className="px-6 py-14 text-center">
      <p className="text-sm font-semibold text-(--color-text)">The graph has not been built yet</p>
      <p className="mx-auto mt-1 max-w-md text-xs text-(--color-text-muted)">
        It appears here once the first scan of a connected account finishes and its results are added.
      </p>
    </div>
  );
}
