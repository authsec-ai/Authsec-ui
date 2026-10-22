import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, CircleHelp, Search, X } from "lucide-react";

import { RightDrawer } from "@/components/primitives/RightDrawer";
import { cn } from "@/lib/utils";
import {
  GLOSSARY,
  OPEN_GLOSSARY_EVENT,
  openGlossary,
  type GlossaryGroup,
  type GlossaryProduct,
} from "./glossary";

const PRODUCTS: { id: GlossaryProduct; label: string }[] = [
  { id: "authsec", label: "AuthSec" },
  { id: "iga", label: "Agentic IGA" },
];

function filterGroups(groups: GlossaryGroup[], query: string): GlossaryGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return groups;
  return groups
    .map((g) => ({
      ...g,
      terms: g.terms.filter((t) =>
        [t.term, t.meaning, t.example ?? ""].some((s) => s.toLowerCase().includes(q)),
      ),
    }))
    .filter((g) => g.terms.length > 0);
}

/**
 * The glossary panel: the console's words in plain language. Mounted once
 * (by the user menu, which both consoles render) and opened from anywhere
 * with `openGlossary()`.
 *
 * Layout: heading · a sticky bar with the product switch and a search box ·
 * the words grouped by topic, each with its meaning, an example in code
 * style where one helps, and a link to the page it is used on.
 */
export function GlossaryDrawer() {
  const [open, setOpen] = useState(false);
  const isIga = useLocation().pathname.startsWith("/iga");
  const [product, setProduct] = useState<GlossaryProduct>(isIga ? "iga" : "authsec");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onOpen = () => {
      // Opens on the product you are in, with a fresh search.
      setProduct(window.location.pathname.startsWith("/iga") ? "iga" : "authsec");
      setQuery("");
      setOpen(true);
    };
    window.addEventListener(OPEN_GLOSSARY_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_GLOSSARY_EVENT, onOpen);
  }, []);

  const groups = useMemo(() => filterGroups(GLOSSARY[product], query), [product, query]);
  const total = GLOSSARY[product].reduce((n, g) => n + g.terms.length, 0);
  const shown = groups.reduce((n, g) => n + g.terms.length, 0);
  const productName = product === "iga" ? "Agentic IGA" : "AuthSec";

  return (
    <RightDrawer
      open={open}
      onClose={() => setOpen(false)}
      width={460}
      ariaTitle="Glossary"
      ariaDescription="The words the console uses, in plain language."
    >
      <div className="flex h-full min-h-0 flex-col bg-(--color-surface-raised)">
        {/* Heading */}
        <header className="border-b border-(--color-border-subtle) px-6 pb-4 pt-5 pr-12">
          <h2 className="m-0 text-[20px] font-bold leading-tight tracking-tight text-(--color-text)">
            Glossary
          </h2>
          <p className="m-0 mt-1 text-[13.5px] text-(--color-text-muted)">
            The words {productName} uses, in plain language.
          </p>

          <div className="mt-4 flex flex-col gap-3">
            <div
              role="radiogroup"
              aria-label="Product"
              className="flex w-fit gap-0.5 rounded-lg bg-(--color-surface-subtle) p-1"
            >
              {PRODUCTS.map((p) => {
                const active = p.id === product;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setProduct(p.id)}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-[13.5px] transition-colors",
                      active
                        ? "bg-(--color-surface-raised) font-semibold text-(--color-text) shadow-(--shadow-pill)"
                        : "font-medium text-(--color-text-muted) hover:text-(--color-text)",
                    )}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            <label className="relative block">
              <span className="sr-only">Search the glossary</span>
              <Search
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-(--color-text-muted)"
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${total} words`}
                className="h-9 w-full rounded-md border border-(--color-border-subtle) bg-(--color-surface-raised) pl-9 pr-9 text-[14px] text-(--color-text) placeholder:text-(--color-text-muted) focus:border-(--color-primary) focus:outline-none focus:ring-2 focus:ring-(--color-focus-ring) [&::-webkit-search-cancel-button]:hidden"
              />
              {query ? (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded text-(--color-text-muted) hover:bg-(--color-hover) hover:text-(--color-text)"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </label>
          </div>
        </header>

        {/* Words */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {query ? (
            <p className="m-0 mb-4 text-[12.5px] text-(--color-text-muted)" aria-live="polite">
              {shown === 0 ? "No words match" : `${shown} of ${total} words`}
            </p>
          ) : null}

          {groups.length === 0 ? (
            <div className="py-10 text-center">
              <p className="m-0 text-[14px] font-medium text-(--color-text)">Nothing matches “{query}”</p>
              <p className="m-0 mt-1 text-[13px] text-(--color-text-muted)">
                Try a shorter word, or switch to {product === "iga" ? "AuthSec" : "Agentic IGA"}.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {groups.map((group) => (
                <section key={group.title} aria-labelledby={`glossary-${product}-${group.title}`}>
                  <h3
                    id={`glossary-${product}-${group.title}`}
                    className="m-0 mb-2.5 text-[12.5px] font-semibold uppercase tracking-[0.06em] text-(--color-text-muted)"
                  >
                    {group.title}
                  </h3>
                  <dl className="m-0 overflow-hidden rounded-lg border border-(--color-border-subtle)">
                    {group.terms.map((t, i) => (
                      <div
                        key={t.term}
                        className={cn("px-4 py-3", i > 0 && "border-t border-(--color-border-subtle)")}
                      >
                        <dt className="text-[14px] font-semibold text-(--color-text)">{t.term}</dt>
                        <dd className="m-0 mt-1 text-[13.5px] leading-relaxed text-(--color-text-muted)">
                          {t.meaning}
                        </dd>
                        {t.example || t.where ? (
                          <dd className="m-0 mt-2 flex flex-wrap items-center justify-between gap-2">
                            {t.example ? (
                              <code className="rounded bg-(--color-surface-subtle) px-1.5 py-0.5 font-mono text-[12.5px] text-(--color-text)">
                                {t.example}
                              </code>
                            ) : (
                              <span />
                            )}
                            {t.where ? (
                              <Link
                                to={t.where.to}
                                onClick={() => setOpen(false)}
                                className="inline-flex items-center gap-1 text-[12.5px] font-medium text-(--color-primary-text) hover:underline"
                              >
                                {t.where.label}
                                <ArrowRight aria-hidden className="size-3.5" />
                              </Link>
                            ) : null}
                          </dd>
                        ) : null}
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </RightDrawer>
  );
}

/**
 * "Glossary" as a header button. No layout renders a top bar any more, so
 * nothing uses this; kept for now. It opens the panel `GlossaryDrawer`
 * mounts, so it must not mount a second one.
 */
export function GlossaryButton() {
  return (
    <button
      type="button"
      onClick={openGlossary}
      className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-[13.5px] font-medium text-(--color-text-muted) transition-colors hover:bg-(--color-hover) hover:text-(--color-text)"
    >
      <CircleHelp className="size-4" aria-hidden />
      <span className="hidden sm:inline">Glossary</span>
      <span className="sr-only sm:hidden">Glossary</span>
    </button>
  );
}
