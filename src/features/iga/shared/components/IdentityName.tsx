import { Link } from "react-router-dom";

import { objectPath, type GraphRef, type IdentitySummary } from "@/app/api/igaGraphApi";

import { IDENTITY_KIND_LABEL, accountLabel } from "../labels";
import { viaLink } from "../links";

type From = { ref: GraphRef; name: string };

/** An identity named on another object's page: a link that keeps the way back. */
export function IdentityName({ identity, from }: { identity: IdentitySummary; from: From }) {
  const path = objectPath(identity.ref);
  return (
    <div className="min-w-0">
      {path ? (
        <Link {...viaLink(path, from)} className="font-medium text-(--color-primary-text) hover:underline">
          {identity.name}
        </Link>
      ) : (
        <span className="font-medium">{identity.name}</span>
      )}
      <span className="ml-2 text-xs text-(--color-text-muted)">
        {IDENTITY_KIND_LABEL[identity.kind]} · {accountLabel(identity.account)}
        {identity.account && !identity.account.connected ? " · account not connected" : ""}
      </span>
      <p className="mt-0.5 break-all font-mono text-xs text-(--color-text-muted)">{identity.arn}</p>
    </div>
  );
}
