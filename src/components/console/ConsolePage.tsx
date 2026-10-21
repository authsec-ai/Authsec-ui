import { Fragment, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useConsoleHub } from "./hub-context";

/**
 * `ConsolePage` — the single canonical shell for every workspace console page.
 *
 * Every sidebar destination (Users, Applications, Service Accounts, Roles,
 * Scopes, Assignments, Identity Providers, …) renders through this wrapper so
 * the container width, header treatment, and vertical rhythm are identical
 * across the product. Do not hand-roll `<div data-cr><div className="console-page">`
 * headers in feature pages anymore — use this.
 *
 * Layout contract (see [data-cr] rules in src/theme/console-screens.css):
 *   <div data-cr>                       ← scopes the console CSS
 *     <div className="console-page">    ← max-width + page padding
 *       <header className="section-header">  ← title / description / actions
 *       <div className="space-y-4">      ← filter bar, table card, etc.
 *
 * Body content is whatever the page needs — typically a <ConsoleFilterBar />
 * followed by a <TableCard> wrapping an <AdaptiveTable />.
 */
export interface Crumb {
  label: string;
  /** Omit on the last crumb: the page you are on. */
  to?: string;
}

/**
 * "MCP / Add" above the heading. One breadcrumb or none (UX proposal): a
 * top-level page has none, since its heading already names it; only a page
 * one level deep shows one.
 */
export function PageCrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="sh-crumbs">
      {crumbs.map((c, i) => (
        <Fragment key={`${c.label}-${i}`}>
          {i > 0 ? <span aria-hidden>/</span> : null}
          {c.to ? (
            <Link to={c.to}>{c.label}</Link>
          ) : (
            <span aria-current="page">{c.label}</span>
          )}
        </Fragment>
      ))}
    </nav>
  );
}

export function ConsolePage({
  title,
  crumbs,
  description,
  actions,
  variant = "default",
  skin,
  children,
}: {
  title: ReactNode;
  /** Breadcrumb above the heading, for a page one level deep only. */
  crumbs?: Crumb[];
  /** One-line page description. Kept short — the CSS caps the line length. */
  description?: ReactNode;
  /** Right-aligned header actions (e.g. Docs + a primary Create button). */
  actions?: ReactNode;
  /**
   * `object`: one object's page — a compact header over tabs, so a
   * full-height workspace tab (the identity graph) keeps its room.
   */
  variant?: "default" | "object";
  /**
   * Opt-in page-scoped visual skin, emitted as `data-skin` on the `[data-cr]`
   * root so a feature can restyle the shared console chrome (header, filter
   * bar, table card) for ONE page by re-declaring design tokens under its own
   * selector, instead of editing components that ~38 pages render.
   *
   * Purely additive: left undefined, no attribute is emitted and the markup is
   * byte-identical to before. Only pass it alongside a stylesheet that scopes
   * itself to the same name.
   */
  skin?: string;
  children: ReactNode;
}) {
  const hub = useConsoleHub();
  // Hosted as a tab of a ConsoleHub: the hub already renders the shell and
  // the page title, so emit only the body and hand the actions to the hub.
  if (hub) {
    return (
      <div data-skin={skin}>
        {actions && hub.actionsSlot
          ? createPortal(<div className="flex shrink-0 items-center gap-2">{actions}</div>, hub.actionsSlot)
          : null}
        <div className="space-y-4">{children}</div>
      </div>
    );
  }
  return (
    <div data-cr data-skin={skin}>
      <div className={variant === "object" ? "console-page console-page--object" : "console-page"}>
        <header className="section-header">
          <div className={variant === "object" ? "sh-main min-w-0" : "min-w-0"}>
            {crumbs?.length ? <PageCrumbs crumbs={crumbs} /> : null}
            <h1 className="sh-title">{title}</h1>
            {description ? <p className="sh-desc">{description}</p> : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          ) : null}
        </header>
        <div className={variant === "object" ? "space-y-3" : "space-y-4"}>{children}</div>
      </div>
    </div>
  );
}
