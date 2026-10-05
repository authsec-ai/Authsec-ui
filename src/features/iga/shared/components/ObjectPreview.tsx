/**
 * The list preview — composition 1 of SPEC-console-revamp.md *Summaries*:
 * name, kind and provider glyph; account or cluster and region or namespace;
 * one or two facts relevant to the type, each with its exactness; one
 * lifecycle or coverage exception, if any; Open details and Open graph.
 *
 * No portrait and no repeated identifiers. "Declared access — not evaluated"
 * is said once in the page header, never here.
 *
 * `PreviewLayout` places it beside the list while the content is wide enough
 * and as a drawer below 1100 px. Opening it never moves the list's scroll:
 * beside, it is a sticky column; as a drawer it is a modal over the page.
 */

import type { ReactNode } from "react";
import { ArrowRight, Network, X } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import { Fact, Facts } from "./Panel";
import { ProviderGlyph, type GlyphProvider } from "./ProviderGlyph";

export interface PreviewFact {
  label: string;
  value: ReactNode;
}

export interface PreviewModel {
  /** The selected row's key: what `[data-row-link]` carries, so focus can return to it. */
  key: string;
  name: string;
  /** What it is, in words: "Lambda function", "IAM role", "Kubernetes ServiceAccount". */
  kindLabel: string;
  provider: GlyphProvider;
  /** Account or cluster, then region or namespace: at most two lines. */
  context: string[];
  /** One or two facts with their exactness. */
  facts: PreviewFact[];
  /** The single most relevant lifecycle or coverage qualification. */
  exception?: ReactNode;
  detailsHref?: string;
  graphHref?: string;
}

/** The list preview below this content width is a drawer (spec: *Responsive contract*). */
export const PREVIEW_ASIDE_MIN = 1100;
const ASIDE_WIDTH = 340;

export function PreviewBody({ model, onClose }: { model: PreviewModel; onClose: () => void }) {
  return (
    <div className="flex min-h-0 flex-col gap-4 p-4" data-preview>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="break-words text-[15px] font-semibold leading-tight text-(--color-text)">{model.name}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-(--color-text-muted)">
            <ProviderGlyph provider={model.provider} withName />
            <span aria-hidden="true">·</span>
            <span>{model.kindLabel}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close preview"
          className="grid size-7 shrink-0 place-items-center rounded-md text-(--color-text-muted) hover:bg-(--color-surface-subtle) hover:text-(--color-text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-primary)"
        >
          <X className="size-4" />
        </button>
      </div>

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
        <Facts>
          {model.facts.map((f) => (
            <Fact key={f.label} label={f.label}>
              {f.value}
            </Fact>
          ))}
        </Facts>
      ) : null}

      {model.exception ? (
        <p className="rounded-md bg-(--color-warning-soft) px-3 py-2 text-xs text-(--color-warning-text)">{model.exception}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-(--color-border-subtle) pt-3">
        {model.detailsHref ? (
          <Button asChild size="sm" className="text-[length:var(--font-size-sm)] text-white">
            <Link to={model.detailsHref}>
              Open details <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        ) : null}
        {model.graphHref ? (
          <Button asChild size="sm" variant="outline">
            <Link to={model.graphHref}>
              <Network className="size-3.5" /> Open graph
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The list and its preview. `model` null: no selection, the list has the whole
 * width. Beside the list while the available width is at least 1100 px; a
 * drawer otherwise, and Esc closes either, returning focus to the row.
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
  const aside = width >= PREVIEW_ASIDE_MIN;
  // Until the width is known neither placement is right; the list alone is.
  const open = model && width > 0 ? model : null;

  const close = () => {
    const key = open?.key;
    onClose();
    if (!key) return;
    // After the panel is gone: the row the reader came from.
    window.setTimeout(() => {
      document.querySelector<HTMLElement>(`[data-row-link="${CSS.escape(key)}"]`)?.focus();
    }, 0);
  };

  return (
    <div
      className={cn("min-w-0", open && aside && "grid items-start gap-4")}
      style={open && aside ? { gridTemplateColumns: `minmax(0,1fr) ${ASIDE_WIDTH}px` } : undefined}
      onKeyDown={(e) => {
        if (e.key !== "Escape" || !open) return;
        const t = e.target as HTMLElement;
        // An open menu or dialog owns its own Escape.
        if (t.closest("[role=menu],[role=listbox],[role=dialog]")) return;
        e.preventDefault();
        close();
      }}
    >
      <div className="min-w-0">{list}</div>
      {open && aside ? (
        <aside
          aria-label={`Preview of ${open.name}`}
          className="sticky top-2 max-h-[calc(100vh-1rem)] overflow-y-auto rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised)"
        >
          <PreviewBody model={open} onClose={close} />
        </aside>
      ) : null}
      {open && !aside ? (
        <Sheet open onOpenChange={(open) => !open && close()}>
          <SheetContent
            side="right"
            hideClose
            style={{ width: 400, maxWidth: "100vw" }}
            className="gap-0 overflow-y-auto p-0"
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <SheetTitle className="sr-only">{open.name}</SheetTitle>
            <SheetDescription className="sr-only">
              A preview of this {open.kindLabel.toLowerCase()}: where it lives, one or two facts about it, and links to its details.
            </SheetDescription>
            <PreviewBody model={open} onClose={close} />
          </SheetContent>
        </Sheet>
      ) : null}
    </div>
  );
}
