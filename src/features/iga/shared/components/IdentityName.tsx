import { Link } from "react-router-dom";

import { objectPath, type GraphRef, type IdentitySummary } from "@/app/api/igaGraphApi";

import { IDENTITY_KIND_HINT, IDENTITY_KIND_LABEL, accountPhrase } from "../labels";
import { viaLink } from "../links";
import { WRAP_ID_CLASS, wrapId } from "./wrapText";

type From = { ref: GraphRef; name: string };

/** An identity named on another object's page: a link that keeps the way back. */
export function IdentityName({ identity, from }: { identity: IdentitySummary; from: From }) {
  const path = objectPath(identity.ref);
  return (
    <div className="min-w-0">
      {path ? (
        <Link {...viaLink(path, from)} className="text-[13px] font-medium text-(--color-primary-text) hover:underline">
          {identity.name}
        </Link>
      ) : (
        <span className="text-[13px] font-medium">{identity.name}</span>
      )}
      <span className="ml-2 text-xs text-(--color-text-muted)">
        <span title={IDENTITY_KIND_HINT[identity.kind]} className="cursor-help underline decoration-dotted decoration-(--color-border-strong) underline-offset-2">
          {IDENTITY_KIND_LABEL[identity.kind] ?? identity.kind.replace(/_/g, " ")}
        </span>
        {identity.account || identity.kind.startsWith("iam_") ? ` · in ${accountPhrase(identity.account)}` : ""}
        {identity.account && !identity.account.connected ? " · this account is not connected to AuthSec" : ""}
      </span>
      {identity.arn ? (
        <p className={`mt-0.5 ${WRAP_ID_CLASS} text-xs leading-5 text-(--color-text-muted)`}>
          Unique AWS ID: <span className="font-mono">{wrapId(identity.arn)}</span>
        </p>
      ) : null}
    </div>
  );
}
