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

import { Copy } from "lucide-react";

import { copyToClipboard } from "@/lib/clipboard";

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

/**
 * A long identifier under a row's name: clipped to one line, whole on hover,
 * and copyable without opening the row.
 *
 * ARNs are the value people actually need out of these tables — to paste into
 * the AWS console, a ticket or a policy — and the only way to get one was to
 * open the drawer and find it there. The copy button appears on row hover so
 * it costs nothing visually until wanted, and it stays reachable by keyboard:
 * `focus-visible` shows it even when the pointer is elsewhere.
 *
 * `no-row-click` and stopPropagation both matter. The table treats a click
 * anywhere in the row as "open this"; without them, copying would also open
 * the drawer over the thing just copied.
 */
export function CopyableId({ value, label = "ARN" }: { value: string; label?: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1">
      <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-muted-foreground" title={value}>
        {value}
      </span>
      <button
        type="button"
        aria-label={`Copy ${label}`}
        title={`Copy ${label}`}
        onClick={(event) => {
          event.stopPropagation();
          void copyToClipboard(value, label);
        }}
        // Visible at rest, not only on hover (UX proposal §4, Cloud Inventory:
        // "ARN with copy button"). The button was already here and already
        // worked — at `opacity-0` nobody could tell, so the ARN read as
        // un-copyable text and people selected it by hand. Quiet enough at 60%
        // that a long list does not turn into a column of icons, and it still
        // comes fully forward on hover and focus.
        className="no-row-click grid size-5 flex-none place-items-center rounded text-muted-foreground opacity-60 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-focus-ring) group-hover:opacity-100"
      >
        <Copy className="size-3" />
      </button>
    </span>
  );
}
