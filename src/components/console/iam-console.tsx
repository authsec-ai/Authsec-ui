import type { ReactNode } from "react";
import { MoreHorizontal, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { FilterCard } from "@/theme/components/cards";

export interface ConsoleFilterOption {
  key: string;
  label: string;
  count?: number | string;
}

export function ConsoleFilterBar({
  search,
  onSearchChange,
  searchPlaceholder,
  filters,
  activeFilter,
  onFilterChange,
  trailing,
  className,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  filters?: ConsoleFilterOption[];
  activeFilter?: string;
  onFilterChange?: (value: string) => void;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <FilterCard className={className}>
      <CardContent variant="compact">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={searchPlaceholder}
              className="h-9 pl-9"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          {filters?.length ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {filters.map((filter) => {
                const active = activeFilter === filter.key;
                return (
                  <button
                    key={filter.key}
                    type="button"
                    onClick={() => onFilterChange?.(filter.key)}
                    className={cn(
                      "inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-xs font-semibold transition-colors",
                      active
                        ? "border-blue-200 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                    )}
                  >
                    {filter.label}
                    {filter.count !== undefined ? (
                      <span className="tabular-nums text-muted-foreground">
                        {filter.count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}
          {trailing ? <div className="flex shrink-0 items-center gap-2">{trailing}</div> : null}
        </div>
      </CardContent>
    </FilterCard>
  );
}

export interface ConsoleActionItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
}

export function ConsoleRowActions({
  items,
  label = "Open row actions",
}: {
  items: ConsoleActionItem[];
  label?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" visualVariant="row-actions">
        {items.map((item) => (
          <DropdownMenuItem
            key={item.label}
            disabled={item.disabled}
            variant={item.destructive ? "destructive" : "default"}
            onSelect={item.onSelect}
          >
            {item.icon}
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function EntityCell({
  label,
  detail,
  monoDetail = false,
  badge,
}: {
  label: ReactNode;
  detail?: ReactNode;
  monoDetail?: boolean;
  badge?: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-2">
        <div className="truncate font-medium text-foreground">{label}</div>
        {badge}
      </div>
      {detail ? (
        <div
          className={cn(
            "mt-0.5 truncate text-xs text-muted-foreground",
            monoDetail && "font-mono",
          )}
        >
          {detail}
        </div>
      ) : null}
    </div>
  );
}

export function InspectorPanel({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <aside className={cn("rounded-lg border border-slate-200 bg-white", className)}>
      <header className="border-b border-slate-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
        {description ? (
          <p className="mt-1 text-xs leading-5 text-slate-600">{description}</p>
        ) : null}
      </header>
      <div className="space-y-4 p-4">{children}</div>
    </aside>
  );
}

export interface AccessPathStep {
  label: string;
  detail?: string;
  state?: "ok" | "warn" | "blocked" | "muted";
}

export function AccessPath({ steps }: { steps: AccessPathStep[] }) {
  const tone: Record<NonNullable<AccessPathStep["state"]>, string> = {
    ok: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warn: "border-amber-200 bg-amber-50 text-amber-700",
    blocked: "border-red-200 bg-red-50 text-red-700",
    muted: "border-slate-200 bg-slate-50 text-slate-600",
  };
  return (
    <ol className="space-y-2">
      {steps.map((step, index) => (
        <li key={`${step.label}:${index}`} className="flex gap-3">
          <span
            className={cn(
              "mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold",
              tone[step.state ?? "muted"],
            )}
          >
            {index + 1}
          </span>
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-950">{step.label}</div>
            {step.detail ? (
              <div className="mt-0.5 text-xs leading-5 text-slate-600">{step.detail}</div>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function VerdictCard({
  verdict,
  title,
  body,
  action,
}: {
  verdict: "allow" | "deny" | "review";
  title: string;
  body: string;
  action?: ReactNode;
}) {
  const tone = {
    allow: "border-emerald-200 bg-emerald-50 text-emerald-800",
    deny: "border-red-200 bg-red-50 text-red-800",
    review: "border-amber-200 bg-amber-50 text-amber-800",
  }[verdict];
  return (
    <div className={cn("rounded-lg border p-4", tone)}>
      <div className="text-sm font-semibold">{title}</div>
      <p className="mt-1 text-xs leading-5">{body}</p>
      {action ? (
        <>
          <Separator className="my-3 bg-current/15" />
          {action}
        </>
      ) : null}
    </div>
  );
}

export function ImpactPreviewDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel,
  onConfirm,
  confirmDisabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  confirmDisabled?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">{children}</div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={confirmDisabled}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
