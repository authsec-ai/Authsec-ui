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
import { copyToClipboard } from "@/lib/clipboard";

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
      {/* Muted, not warning. This is an ACCOUNT-level condition rendered once
          per ROW, so a revoked account painted every row of the table orange —
          and `GraphAccount` carries only `connected`, so this cannot tell a
          deliberate revocation from a broken connection and was warning-toned
          for both. PipelineNotice already reports each at the top of the page
          with the right severity: neutral "Revoked", warning "Connection
          error". The fact still belongs on the row; the alarm does not. */}
      {!account.connected ? <p className="text-[11px] text-(--color-text-muted)">Not connected</p> : null}
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
          void copyToClipboard(value);
        }}
        className="no-row-click grid size-6 shrink-0 place-items-center rounded border border-(--color-border-subtle) text-(--color-text-muted) hover:text-(--color-text)"
      >
        <Copy className="size-3" />
      </button>
    </span>
  );
}

/** The same identifier in details: wrapped in full, not clipped.
 *
 * A step larger than the `text-xs` used in the table cell, and deliberately so.
 * In a cell the ARN is a glance-past identifier next to a copy button; in the
 * expanded panel it is the thing the reader opened the row to read, and a
 * mono 12px string of 60-odd characters is genuinely hard to parse. */
export function CopyValueWrapped({ value }: { value: string }) {
  return (
    <span className="flex items-start gap-1.5">
      <span className="min-w-0 flex-1 break-all font-mono text-[13px] leading-5 text-(--color-text)">{value}</span>
      <button
        type="button"
        aria-label={`Copy ${value}`}
        onClick={(e) => {
          e.stopPropagation();
          void copyToClipboard(value);
        }}
        className="no-row-click grid size-6 shrink-0 place-items-center rounded border border-(--color-border-subtle) text-(--color-text-muted) hover:text-(--color-text)"
      >
        <Copy className="size-3" />
      </button>
    </span>
  );
}
