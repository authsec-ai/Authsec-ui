/**
 * The list preview — composition 1 of SPEC-console-revamp.md *Summaries*:
 * name, kind and provider glyph; where it lives; the facts relevant to the
 * type, each labelled; one lifecycle or coverage exception, if any; Open
 * details and Open Access Graph.
 *
 * "Declared access — not evaluated" is said once in the page header, never here.
 *
 * `PreviewLayout` floats it as a card over the right edge of the list, with a
 * caret pointing at the selected row: the list keeps its full width, so its
 * columns never jump. It is not modal — no backdrop, no focus trap — so the
 * list stays usable and choosing another row switches the preview.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { format } from "date-fns";
import { Copy, ExternalLink, Network, X } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { copyToClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

import { ProviderGlyph, type GlyphProvider } from "./ProviderGlyph";
import { Timestamp } from "./Timestamp";
import { WRAP_ID_CLASS, wrapId } from "./wrapText";

export interface PreviewFact {
  label: string;
  value: ReactNode;
  /** A value worth copying (an ARN, a role name): a copy button sits beside it. */
  copy?: string;
  /** Shown as an identifier: mono, wrapping anywhere. */
  mono?: boolean;
}

export interface PreviewModel {
  /** The selected row's key: what `[data-row-link]` carries, so focus can return to it. */
  key: string;
  name: string;
  /** What it is, in words: "Lambda function", "IAM role", "Kubernetes ServiceAccount". */
  kindLabel: string;
  provider: GlyphProvider;
  /** Lines without a label of their own (cluster, namespace, a sighting's source). */
  context: string[];
  /** Labelled facts, one under another: Account, Region, ARN, Runs as, Last confirmed. */
  facts: PreviewFact[];
  /** The single most relevant lifecycle or coverage qualification. */
  exception?: ReactNode;
  detailsHref?: string;
  graphHref?: string;
  /** An action the panel offers before its links: classifying a workload. */
  actions?: ReactNode;
}

/** "1 day ago (7 Oct 2026, 08:42)": a preview has the room for both. */
export function ConfirmedValue({ iso }: { iso: string | null | undefined }) {
  if (!iso) return <span className="text-(--color-text-muted)">Not confirmed yet</span>;
  return (
    <span>
      <Timestamp iso={iso} />{" "}
      <span className="text-xs text-(--color-text-muted)" aria-hidden="true">
        ({format(new Date(iso), "d MMM yyyy, HH:mm")})
      </span>
    </span>
  );
}

function CopyIcon({ value, what }: { value: string; what: string }) {
  return (
    <button
      type="button"
      onClick={() => void copyToClipboard(value, what)}
      aria-label={`Copy the ${what.toLowerCase()}`}
      title={`Copy ${what}`}
      className="-mt-1 grid size-7 shrink-0 place-items-center rounded-md text-(--color-text-muted) hover:bg-(--color-surface-subtle) hover:text-(--color-text) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--color-primary)"
    >
      <Copy className="size-3.5" aria-hidden="true" />
    </button>
  );
}

export function PreviewBody({ model, onClose }: { model: PreviewModel; onClose: () => void }) {
  return (
    <div className="flex min-h-full flex-col" data-preview>
      <div className="flex items-start gap-2 px-5 pb-4 pt-5">
        <div className="min-w-0 flex-1">
          <h2 className="break-words text-[15px] font-semibold leading-snug text-(--color-text)">{model.name}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-(--color-text-muted)">
            <ProviderGlyph provider={model.provider} withName />
            <span aria-hidden="true">·</span>
            <span>{model.kindLabel}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close preview"
          className="-mr-1.5 -mt-1 grid size-8 shrink-0 place-items-center rounded-md text-(--color-text-muted) hover:bg-(--color-surface-subtle) hover:text-(--color-text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-primary)"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex-1 space-y-4 px-5 pb-5">
        {model.context.length ? (
          <ul className="space-y-0.5 text-[13px] text-(--color-text)">
            {model.context.map((c) => (
              <li key={c} className="break-words">
                {c}
              </li>
            ))}
          </ul>
        ) : null}

        {model.facts.length ? (
          <dl className="space-y-3.5">
            {model.facts.map((f) => (
              <div key={f.label}>
                <dt className="text-xs text-(--color-text-muted)">{f.label}</dt>
                <dd className="mt-1 flex items-start gap-2">
                  <span
                    className={cn(
                      "min-w-0 flex-1 break-words text-[13px] leading-5 text-(--color-text)",
                      f.mono && `${WRAP_ID_CLASS} font-mono text-xs`,
                    )}
                  >
                    {f.mono && typeof f.value === "string" ? wrapId(f.value) : f.value}
                  </span>
                  {f.copy ? <CopyIcon value={f.copy} what={f.label} /> : null}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        {model.exception ? (
          <p className="rounded-md bg-(--color-warning-soft) px-3 py-2 text-xs text-(--color-warning-text)">{model.exception}</p>
        ) : null}

        {model.actions}
      </div>

      {model.detailsHref || model.graphHref ? (
        <div className="sticky bottom-0 space-y-2 border-t border-(--color-border-subtle) bg-(--color-surface-raised) px-5 py-4">
          {model.detailsHref ? (
            <Button asChild className="h-10 w-full text-[length:var(--font-size-sm)] text-white">
              <Link to={model.detailsHref}>
                Open details <ExternalLink className="size-3.5" aria-hidden="true" />
              </Link>
            </Button>
          ) : null}
          {model.graphHref ? (
            <Button asChild variant="outline" className="h-10 w-full">
              <Link to={model.graphHref}>
                <Network className="size-3.5" aria-hidden="true" /> Open Access Graph
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const PANEL_WIDTH = 320;
/** Room kept between the panel and the window's edges. */
const EDGE = 16;
/** Half the caret's side: how far it pokes out of the panel. */
const CARET = 7;

interface Geometry {
  top: number;
  right: number;
  height: number;
  /** The caret's centre, from the panel's top; null when the row is out of view. */
  caretY: number | null;
}

/**
 * Over the right edge of the list, from the list's top — below the toolbar,
 * so Filters and Columns stay reachable — to the window's bottom. Never above
 * the scrolling area's top, so it does not cover the app header.
 */
function measure(anchor: HTMLElement, key: string): Geometry {
  const r = anchor.getBoundingClientRect();
  const card = (anchor.closest("[data-discovery-card]") as HTMLElement | null) ?? anchor;
  const scroller = document.querySelector<HTMLElement>("[data-main-content-area='true']");
  const floor = (scroller?.getBoundingClientRect().top ?? 0) + EDGE;
  const top = Math.max(floor, r.top);
  const right = Math.max(EDGE, window.innerWidth - card.getBoundingClientRect().right - 8);
  const height = Math.max(240, window.innerHeight - top - EDGE);
  const link = document.querySelector<HTMLElement>(`[data-row-link="${CSS.escape(key)}"]`);
  const row = (link?.closest('[data-slot="table-row"], li') as HTMLElement | null) ?? link;
  let caretY: number | null = null;
  if (row) {
    const rr = row.getBoundingClientRect();
    const y = rr.top + rr.height / 2 - top;
    if (y >= 20 && y <= height - 20) caretY = y;
  }
  return { top, right, height, caretY };
}

/**
 * The list and its preview. `model` null: no selection. The preview is a
 * card floating over the right edge of the list, never a column beside it;
 * its caret points at the selected row. Esc closes it, returning focus to
 * the row.
 */
export function PreviewLayout({
  list,
  model,
  onClose,
  width,
}: {
  list: ReactNode;
  model: PreviewModel | null;
  onClose: () => void;
  /** The screen's measured content width (0 until measured), not the viewport's. */
  width: number;
}) {
  // Until the screen has measured itself it is not on the page yet.
  const open = model && width > 0 ? model : null;
  const openKey = open?.key;
  const anchorRef = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState<Geometry | null>(null);

  const focusRow = (key: string) =>
    window.setTimeout(() => {
      document.querySelector<HTMLElement>(`[data-row-link="${CSS.escape(key)}"]`)?.focus();
    }, 0);

  const close = () => {
    onClose();
    if (openKey) focusRow(openKey);
  };

  // Follow the list: on open, on another row, on scroll and on resize.
  const update = useCallback(() => {
    if (!openKey || !anchorRef.current) return;
    setGeo(measure(anchorRef.current, openKey));
  }, [openKey]);
  useLayoutEffect(() => {
    if (!openKey) {
      setGeo(null);
      return;
    }
    update();
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
    };
  }, [openKey, update, width]);

  // Esc closes the panel wherever focus is — it is not modal, so focus may be
  // on the page itself. An open menu, listbox or dialog keeps its own Escape.
  useEffect(() => {
    if (!openKey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("[role=menu],[role=listbox],[role=dialog]")) return;
      // Esc while typing (the search box) belongs to the field, not the preview.
      if (t?.closest?.("input, textarea, select, [contenteditable='true']")) return;
      e.preventDefault();
      onClose();
      focusRow(openKey);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openKey, onClose]);

  return (
    <div ref={anchorRef} className="min-w-0">
      {list}
      {open && geo ? (
        <aside
          aria-label={`Preview of ${open.name}`}
          style={{ top: geo.top, right: geo.right, height: geo.height, width: PANEL_WIDTH }}
          className={cn(
            "fixed z-40 max-w-[calc(100vw-2rem)] rounded-xl border border-(--color-border-subtle) bg-(--color-surface-raised)",
            "shadow-[0_12px_40px_rgb(15_23_42/0.14)] animate-in fade-in-0 slide-in-from-right-4 duration-200 motion-reduce:animate-none",
          )}
        >
          {/* The caret points at the row this preview is of. */}
          {geo.caretY != null ? (
            <span
              aria-hidden="true"
              style={{ top: geo.caretY - CARET, left: -CARET }}
              className="absolute size-3.5 rotate-45 border-b border-l border-(--color-border-subtle) bg-(--color-surface-raised) transition-[top] duration-150 motion-reduce:transition-none"
            />
          ) : null}
          <div className="relative h-full overflow-y-auto rounded-xl">
            <PreviewBody model={open} onClose={close} />
          </div>
        </aside>
      ) : null}
    </div>
  );
}
