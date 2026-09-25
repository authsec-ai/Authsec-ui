/**
 * Cells shared by the three inventories (SPEC-iga-phase2-graph.md §2.14.6).
 *
 * A row names the object, with one line of compact context — runtime or
 * type, region, and the account when the Account column has no room — so
 * two objects with one name stay distinguishable at any width. Full
 * identifiers are not printed under every name; they are in the row's
 * details and on the object's page, with Copy.
 */

import type { ReactNode } from "react";
import { Copy } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "react-hot-toast";

import type { GraphAccount } from "@/app/api/igaGraphApi";
import { useAdaptiveColumnShown } from "@/components/ui/adaptive-table-context";

import { accountLabel } from "../labels";

export function NameCell({
  to,
  name,
  context,
  account,
}: {
  to: string;
  name: string;
  /** Runtime or type, region — never an identifier. */
  context: (string | null | undefined)[];
  account: GraphAccount | null;
}) {
  const accountShown = useAdaptiveColumnShown("account");
  const line = [...context, accountShown ? null : account ? accountLabel(account) : null].filter(Boolean).join(" · ");
  return (
    <div className="min-w-0">
      <Link to={to} className="block truncate font-medium text-(--color-text) hover:underline" title={name}>
        {name}
      </Link>
      {line ? (
        <p className="truncate text-xs text-(--color-text-muted)" title={line}>
          {line}
        </p>
      ) : null}
    </div>
  );
}

/** An account once: its name with the id beneath only when the two differ. */
export function AccountCell({ account }: { account: GraphAccount | null }) {
  if (!account) return <span className="text-sm text-(--color-text-muted)">Not known</span>;
  const named = account.label && account.label !== account.id;
  return (
    <div className="min-w-0">
      <p className="truncate text-sm" title={named ? `${account.label} (${account.id})` : account.id}>
        {named ? account.label : <span className="font-mono text-xs">{account.id}</span>}
      </p>
      {named ? <p className="truncate font-mono text-[11px] text-(--color-text-muted)">{account.id}</p> : null}
      {!account.connected ? <p className="text-[11px] text-(--color-warning-text)">Not connected</p> : null}
    </div>
  );
}

/** A long identifier: clipped in a column, whole in details, always copyable. */
export function CopyValue({ value, label = "Copy" }: { value: string; label?: ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-(--color-text-muted)" title={value}>
        {value}
      </span>
      <button
        type="button"
        aria-label={typeof label === "string" ? `${label} ${value}` : "Copy"}
        onClick={(e) => {
          e.stopPropagation();
          void navigator.clipboard.writeText(value);
          toast.success("Copied");
        }}
        className="no-row-click grid size-6 shrink-0 place-items-center rounded border border-(--color-border-subtle) text-(--color-text-muted) hover:text-(--color-text)"
      >
        <Copy className="size-3" />
      </button>
    </span>
  );
}

/** The same identifier in details: wrapped in full, not clipped. */
export function CopyValueWrapped({ value }: { value: string }) {
  return (
    <span className="flex items-start gap-1.5">
      <span className="min-w-0 flex-1 break-all font-mono text-xs">{value}</span>
      <button
        type="button"
        aria-label={`Copy ${value}`}
        onClick={(e) => {
          e.stopPropagation();
          void navigator.clipboard.writeText(value);
          toast.success("Copied");
        }}
        className="no-row-click grid size-6 shrink-0 place-items-center rounded border border-(--color-border-subtle) text-(--color-text-muted) hover:text-(--color-text)"
      >
        <Copy className="size-3" />
      </button>
    </span>
  );
}
