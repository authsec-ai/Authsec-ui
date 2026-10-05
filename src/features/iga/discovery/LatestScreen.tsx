/**
 * Latest collected: the normalised inventory from the most recent scan (the
 * `cloud_*` rows behind `/authsec/discovery/aws/*`), including rows not yet in a
 * publication. It is rendered by the pages that already read it, with their own
 * toolbars — search, Kind, Attribution and Unused access all narrow the rows
 * LOADED, and say so; only Source is the server's.
 *
 * Google Cloud has no published reading: its identities are this view, with the
 * page forced to service accounts.
 */

import type { ReactNode } from "react";

import AWSComputePage from "@/features/discovery/cloud/aws/AWSComputePage";
import AWSIdentitiesPage from "@/features/discovery/cloud/aws/AWSIdentitiesPage";
import AWSResourcesPage from "@/features/discovery/cloud/aws/AWSResourcesPage";

import { FacetBar } from "./FacetBar";
import { SourceHasNoRows, UnknownSource } from "./ListStates";
import { sourceFacet } from "./facets";
import type { ScreenProps } from "./screenTypes";

export const LATEST_NOTE =
  "Normalised rows from the latest scan, including rows not yet in a publication. Published is what AuthSec concluded from them.";

export default function LatestScreen(p: ScreenProps) {
  let body: ReactNode;
  if (p.scope.kind === "unknown") body = <UnknownSource id={p.scope.id} provider={p.provider} onClear={() => p.url.patch({ source: null })} />;
  else if (p.provider === "gcp") body = <AWSIdentitiesPage forcedKind="gcp_service_account" />;
  else if (p.type === "workloads") body = <AWSComputePage />;
  else if (p.type === "identities") body = <AWSIdentitiesPage excludeKinds={["gcp_service_account"]} />;
  else body = <AWSResourcesPage />;

  const fo = sourceFacet(p.sources, undefined);
  return (
    <div className="space-y-3">
      {p.switcher}
      <FacetBar
        facets={[
          {
            key: "source",
            label: "Source",
            kind: "choice",
            value: p.scope.kind === "one" || p.scope.kind === "no_rows" ? p.scope.source.id : p.url.source,
            anyLabel: p.provider === "gcp" ? "Every Google Cloud project" : "Every AWS account",
            options: fo.options.map((o) => ({ value: o.value, label: o.label })),
            onChange: (v) => p.url.patch({ source: v }),
          },
        ]}
        width={0}
        removed={p.url.removed}
        onDismissRemoved={p.url.dismissRemoved}
        onClearAll={() => p.url.patch({ source: null })}
      />
      <p className="text-xs text-(--color-text-muted)">{LATEST_NOTE}</p>
      {p.scope.kind === "no_rows" ? <SourceHasNoRows label={p.scope.source.label} onClear={() => p.url.patch({ source: null })} /> : body}
    </div>
  );
}
