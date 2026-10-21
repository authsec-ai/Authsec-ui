/**
 * "Needs attention": one row per item — bold name · reason — with exactly
 * one visible action button. No overflow menus.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import type { AttentionItem } from "../hooks/useHomeData";
import { HomeCard } from "./parts";

const SHOWN = 6;

function Row({ item }: { item: AttentionItem }) {
  const navigate = useNavigate();
  return (
    <li className="flex items-center gap-4 px-5 py-4">
      <p className="m-0 min-w-0 flex-1 text-[length:var(--font-size-sm)] leading-relaxed text-(--color-text) [overflow-wrap:anywhere]">
        <span className="font-semibold">{item.name}</span>
        <span className="text-(--color-text-muted)"> · </span>
        <span className={cn(item.tone === "danger" && "text-(--color-danger-text)")}>{item.reason}</span>
      </p>
      <Button
        size="sm"
        variant={item.primary ? "default" : "outline"}
        className={cn("shrink-0", item.primary && "text-white")}
        onClick={() => navigate(item.to)}
        aria-label={`${item.action}: ${item.name}`}
      >
        {item.action}
      </Button>
    </li>
  );
}

export function AttentionList({
  items,
  isLoading,
  failed,
}: {
  items: AttentionItem[];
  isLoading: boolean;
  failed: string[];
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? items : items.slice(0, SHOWN);

  return (
    <HomeCard
      id="needs-attention"
      title="Needs attention"
      aside={isLoading ? null : `Items: ${items.length.toLocaleString()}`}
      bodyClassName="px-0 pb-0"
    >
      <div className="border-y border-(--color-border-subtle) bg-(--color-surface-subtle) px-5 py-2.5 text-[length:var(--font-size-sm)] font-semibold text-(--color-text)">
        Item
      </div>
      {isLoading ? (
        <div className="space-y-3 px-5 py-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex items-center gap-3 px-5 py-6">
          <CheckCircle2 className="size-5 shrink-0 text-(--color-success)" aria-hidden />
          <p className="m-0 text-[length:var(--font-size-sm)] text-(--color-text-muted)">
            {failed.length
              ? "Nothing to show from what loaded."
              : "Nothing needs attention. Every MCP is enforcing and no agent is waiting."}
          </p>
        </div>
      ) : (
        <ul className="m-0 list-none divide-y divide-(--color-border-subtle) p-0">
          {visible.map((item) => (
            <Row key={item.id} item={item} />
          ))}
        </ul>
      )}
      {items.length > SHOWN ? (
        <div className="border-t border-(--color-border-subtle) px-5 py-3">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="text-[length:var(--font-size-sm)] font-medium text-(--color-primary-text) underline underline-offset-2"
          >
            {showAll ? "Show fewer" : `Show ${items.length - SHOWN} more`}
          </button>
        </div>
      ) : null}
      {failed.length ? (
        <p className="m-0 border-t border-(--color-border-subtle) px-5 py-3 text-[length:13px] text-(--color-text-muted)">
          Couldn't check {failed.join(", ")}, so this list may be incomplete.
        </p>
      ) : null}
    </HomeCard>
  );
}
