import { Link, useLocation, useNavigate } from "react-router-dom";

import { cn } from "@/lib/utils";

import type { ViaState } from "../links";

export interface ObjectTab {
  key: string;
  label: string;
  /** Route of the tab; Overview is the object's bare URL. */
  to: string;
}

/** Query parameters that belong to the view that set them (§2.14.5). */
const VIEW_OWNED = ["evidence", "node", "target", "as"];

/**
 * An object's views (SPEC-iga-phase2-graph.md §2.14.5). Tabs are routes:
 * switching pushes one history entry and keeps every query parameter except
 * the ones owned by the view being left. Below 768 px they are a select
 * (§2.14.14 *Responsive layouts*).
 */
export function ObjectTabs({ tabs, active }: { tabs: ObjectTab[]; active: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const search = new URLSearchParams(location.search);
  for (const k of VIEW_OWNED) search.delete(k);
  const qs = search.toString();
  const href = (t: ObjectTab) => `${t.to}${qs ? `?${qs}` : ""}`;
  // The originating object's name travels with `via` (§2.14.5). Only that:
  // paging and the evidence panel's history mark belong to the tab being left.
  const viaName = (location.state as ViaState | null)?.viaName;
  const state = viaName ? ({ viaName } satisfies ViaState) : undefined;

  return (
    <>
      <nav aria-label="Views" className="hidden gap-1 border-b border-(--color-border-subtle) md:flex"
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          const links = [...event.currentTarget.querySelectorAll<HTMLAnchorElement>("a")];
          const index = links.indexOf(document.activeElement as HTMLAnchorElement);
          if (index < 0) return;
          event.preventDefault();
          const next = event.key === "Home" ? 0 : event.key === "End" ? links.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + links.length) % links.length;
          links[next]?.focus();
        }}>
        {tabs.map((t) => {
          const current = t.key === active;
          return (
            <Link
              key={t.key}
              to={href(t)}
              state={state}
              aria-current={current ? "page" : undefined}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                current
                  ? "border-(--color-primary) text-(--color-text)"
                  : "border-transparent text-(--color-text-muted) hover:text-(--color-text)",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      <label className="block md:hidden">
        <span className="sr-only">View</span>
        <select
          value={active}
          onChange={(e) => {
            const t = tabs.find((x) => x.key === e.target.value);
            if (t) navigate(href(t), { state });
          }}
          className="h-9 w-full rounded-md border border-(--color-border-strong) bg-(--color-surface-raised) px-3 text-sm"
        >
          {tabs.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
