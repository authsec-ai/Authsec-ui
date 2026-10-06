import type { ReactNode } from "react";

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
export function ConsolePage({
  title,
  description,
  actions,
  variant = "default",
  skin,
  children,
}: {
  title: ReactNode;
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
  return (
    <div data-cr data-skin={skin}>
      <div className={variant === "object" ? "console-page console-page--object" : "console-page"}>
        <header className="section-header">
          <div className={variant === "object" ? "sh-main min-w-0" : "min-w-0"}>
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
