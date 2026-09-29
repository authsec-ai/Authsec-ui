/**
 * An AWS account in a table cell: the name the operator gave it, with the
 * account id beneath.
 *
 * A raw twelve-digit id is not something anyone recognises, and these tables
 * routinely list the same resource or role name once per account — so the
 * account is the ONLY thing distinguishing two otherwise identical rows, and
 * it was the least legible value in the row. The name leads; the id stays,
 * because it is what an operator pastes into the AWS console and what support
 * asks for.
 *
 * With no name known (a cross-account resource whose account is not connected)
 * the id leads on its own rather than inventing a label for it.
 */

import { CloudPill } from "../CloudPill";

export function AWSAccountCell({
  accountId,
  name,
  external = false,
  title,
}: {
  accountId: string | null | undefined;
  /** The operator's display name for the account, when one is known. */
  name?: string;
  /** The resource's account differs from the one that scanned it. */
  external?: boolean;
  title?: string;
}) {
  if (!accountId) return <span className="text-xs text-muted-foreground">—</span>;

  const named = Boolean(name && name !== accountId);
  return (
    <div className="min-w-0" title={title}>
      <div className="flex min-w-0 items-center gap-1.5">
        <span
          className={
            named
              ? "truncate text-xs text-foreground"
              : "truncate font-mono text-xs text-foreground"
          }
        >
          {named ? name : accountId}
        </span>
        {external ? (
          <CloudPill tone="warning" dot={false}>
            External
          </CloudPill>
        ) : null}
      </div>
      {named ? (
        <p className="truncate font-mono text-[11px] text-muted-foreground">{accountId}</p>
      ) : null}
    </div>
  );
}
