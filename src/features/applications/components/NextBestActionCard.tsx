/**
 * `NextBestActionCard` — the contextual decision card the user always
 * sees on Overview. The card's *content* (headline, body, CTAs) is
 * computed from `(application, readiness)` by `computeNextBestAction`.
 *
 * Design intent: never a generic "Continue" button. Always a sentence
 * that names the next decision and a CTA that performs it.
 */

import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { NextBestAction } from "../types";

export interface NextBestActionCardProps {
  nba: NextBestAction;
  primaryHref: string;
  secondaryHref?: string;
  className?: string;
}

export function NextBestActionCard({
  nba,
  primaryHref,
  secondaryHref,
  className,
}: NextBestActionCardProps) {
  return (
    <Card
      data-slot="nba-card"
      className={cn(
        "border-[color:color-mix(in_oklch,var(--color-primary)_30%,transparent)] bg-[color:color-mix(in_oklch,var(--color-primary)_6%,transparent)] p-6",
        className,
      )}
    >
      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-primary)]">
        Next best action
      </p>
      <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
        {nba.headline}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">{nba.body}</p>

      <div className="mt-5 space-y-2">
        <Button asChild className="w-full justify-center">
          <Link to={primaryHref}>
            {nba.primary} <span aria-hidden>→</span>
          </Link>
        </Button>
        {nba.secondary && secondaryHref ? (
          <Button asChild variant="outline" className="w-full justify-center">
            <Link to={secondaryHref}>{nba.secondary}</Link>
          </Button>
        ) : nba.secondary ? (
          <Button variant="outline" className="w-full justify-center" type="button">
            {nba.secondary}
          </Button>
        ) : null}
      </div>

      {nba.noopConsequence && (
        <p className="mt-4 text-xs italic text-muted-foreground">
          {nba.noopConsequence}
        </p>
      )}
    </Card>
  );
}
