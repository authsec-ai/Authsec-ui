/**
 * The Connections list's own pieces, laid out from the 2026-10-06 design
 * ("Connections — redesign" canvas): a row of status tiles that doubles as the
 * status filter, the table card's toolbar, and the "Connect more sources"
 * cards for providers with no connection yet.
 *
 * Structure and spacing follow the design; colours, type and controls are the
 * console's own tokens and components, so the page matches every other IGA
 * page and follows dark mode.
 */

import type { ReactNode } from "react";
import { Plus, Search } from "lucide-react";

import type { ConnectionProvider } from "@/app/api/connectionsApi";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { ProviderGlyph } from "./ProviderGlyph";

/* --------------------------------- status tiles --------------------------------- */

/** The four tiles of the design. "Needs attention" also counts partial coverage. */
export type StatusTileKey = "connected" | "attention" | "running" | "revoked";

const TILE_DOT: Record<StatusTileKey, string> = {
  connected: "bg-(--color-success)",
  attention: "bg-(--color-warning)",
  running: "bg-(--color-primary)",
  revoked: "bg-(--color-text-subtle)",
};

export function StatusTiles({
  tiles,
  active,
  onPick,
}: {
  tiles: { key: StatusTileKey; label: string; count: number }[];
  active: StatusTileKey | null;
  onPick: (key: StatusTileKey | null) => void;
}) {
  return (
    <div role="group" aria-label="Filter by status" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((t) => {
        const on = active === t.key;
        // A zero is not news: its number and dot go quiet so the tiles that
        // need attention are the ones the eye lands on.
        const zero = t.count === 0;
        return (
          <button
            key={t.key}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(on ? null : t.key)}
            className={cn(
              "flex min-h-11 flex-col items-start gap-2 rounded-lg border px-4 py-3 text-left transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-primary)",
              on
                ? "border-(--color-primary) bg-(--color-primary-soft)"
                : "border-(--color-border-subtle) bg-(--color-surface-raised) hover:border-(--color-border-strong) hover:bg-(--color-surface-subtle)/50",
            )}
          >
            <span className="flex items-center gap-2 text-[13px] text-(--color-text-secondary)">
              <span aria-hidden="true" className={cn("size-2 rounded-full", zero ? "bg-(--color-border-strong)" : TILE_DOT[t.key])} />
              {t.label}
            </span>
            <span
              className={cn(
                "text-2xl font-semibold leading-none tracking-tight tabular-nums",
                zero ? "font-normal text-(--color-text-muted)" : "text-(--color-text)",
              )}
            >
              {t.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* --------------------------------- table toolbar --------------------------------- */

export function TableToolbar({
  search,
  onSearch,
  typeControl,
  filtered,
  onClear,
  countLabel,
}: {
  search: string;
  onSearch: (v: string) => void;
  typeControl: ReactNode;
  filtered: boolean;
  onClear: () => void;
  countLabel: string;
}) {
  return (
    <div data-compact-toolbar className="flex flex-wrap items-center gap-3 border-b border-(--color-border-subtle) px-4 py-3">
      <label className="relative flex min-w-[220px] max-w-[360px] flex-1 basis-[260px] items-center">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
        <Input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search name or ID"
          aria-label="Search connections"
          className="h-9 pl-9"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      {typeControl}
      <span className="flex-1" />
      {filtered ? (
        <button type="button" onClick={onClear} className="h-8 rounded-md px-2.5 text-[13px] font-medium text-(--color-primary-text) hover:bg-(--color-surface-subtle)">
          Clear filters
        </button>
      ) : null}
      <span className="text-[13px] text-(--color-text-muted) tabular-nums">{countLabel}</span>
    </div>
  );
}

/* ------------------------------ connect more sources ------------------------------ */

const SOURCE_COPY: Record<ConnectionProvider, { title: string; note: string }> = {
  aws: { title: "AWS account", note: "IAM roles, users and workloads" },
  k8s: { title: "Kubernetes cluster", note: "Service accounts and RBAC" },
  gcp: { title: "Google Cloud project", note: "IAM bindings and keys" },
  github: { title: "GitHub organisation", note: "Apps, tokens and members" },
};

/** One card per provider with no connection yet; each opens that provider's own setup. */
export function ConnectMoreSources({ providers, onAdd }: { providers: ConnectionProvider[]; onAdd: (p: ConnectionProvider) => void }) {
  if (!providers.length) return null;
  return (
    <section aria-labelledby="connect-more" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="connect-more" className="text-sm font-semibold text-(--color-text)">
          Connect more sources
        </h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {providers.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onAdd(p)}
            className={cn(
              "flex min-h-14 items-center gap-3 rounded-lg border border-dashed border-(--color-border-strong) bg-(--color-surface-raised) px-4 py-3 text-left transition-colors",
              "hover:border-(--color-primary) hover:bg-(--color-surface-subtle)/50",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-primary)",
            )}
          >
            <ProviderGlyph provider={p} />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm font-medium text-(--color-text)">{SOURCE_COPY[p].title}</span>
              <span className="text-xs text-(--color-text-muted)">{SOURCE_COPY[p].note}</span>
            </span>
            <Plus aria-hidden="true" className="size-4 text-(--color-text-muted)" />
          </button>
        ))}
      </div>
    </section>
  );
}
