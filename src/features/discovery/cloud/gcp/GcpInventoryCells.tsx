/**
 * Google Cloud cells for tables: project display, copyable IDs.
 */

import { Copy } from "lucide-react";

import { copyToClipboard } from "@/lib/clipboard";
import { CloudPill } from "../CloudPill";

/** A Google Cloud project ID or display name in a table cell. */
export function GcpProjectCell({
  projectId,
  name,
  external = false,
}: {
  projectId: string | null | undefined;
  name?: string;
  external?: boolean;
}) {
  if (!projectId) return <span className="text-xs text-muted-foreground">—</span>;

  const named = Boolean(name && name !== projectId);
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-1.5">
        <span
          className={
            named
              ? "truncate text-xs text-foreground"
              : "truncate font-mono text-xs text-foreground"
          }
        >
          {named ? name : projectId}
        </span>
        {external ? (
          <CloudPill tone="warning" dot={false}>
            External
          </CloudPill>
        ) : null}
      </div>
      {named ? (
        <p className="truncate font-mono text-[11px] text-muted-foreground">{projectId}</p>
      ) : null}
    </div>
  );
}

/**
 * A long identifier (resource name) under a row's name: clipped to one line,
 * whole on hover, and copyable without opening the row. Can display a short
 * version while copying the full value.
 */
export function CopyableId({
  value,
  display,
  label = "ID",
}: {
  value: string;
  display?: string;
  label?: string;
}) {
  const shown = display ?? value;
  return (
    <span className="flex min-w-0 items-center gap-1">
      <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-muted-foreground" title={value}>
        {shown}
      </span>
      <button
        type="button"
        aria-label={`Copy ${label}`}
        title={`Copy ${label}`}
        onClick={(event) => {
          event.stopPropagation();
          void copyToClipboard(value, label);
        }}
        className="no-row-click grid size-5 flex-none place-items-center rounded text-muted-foreground opacity-60 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-focus-ring) group-hover:opacity-100"
      >
        <Copy className="size-3" />
      </button>
    </span>
  );
}
