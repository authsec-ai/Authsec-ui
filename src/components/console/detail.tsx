import type { ReactNode } from "react";
import { Copy } from "lucide-react";
import { toast } from "react-hot-toast";

import { cn } from "@/lib/utils";

/**
 * Shared detail-panel + dialog building blocks.
 *
 * These give every side drawer (RightDrawer / Sheet) and modal a consistent,
 * polished structure: an icon-led header, uppercase section labels, key/value
 * rows, copy-able mono fields, dashed empty states, and a sticky footer.
 * Built on the app's shadcn semantic tokens (foreground / muted-foreground /
 * muted / border) so they adapt to theme without introducing new colors.
 */

// ── Drawer / panel ──────────────────────────────────────────────────────────

export function DrawerHeader({
  icon,
  title,
  subtitle,
  badge,
}: {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 border-b px-6 py-5 pr-12">
      {icon ? (
        <span className="flex size-9 flex-none items-center justify-center rounded-md border bg-muted text-muted-foreground [&_svg]:size-4">
          {icon}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-[15px] font-semibold leading-tight text-foreground">{title}</h2>
        {subtitle ? <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
      {badge ? <div className="flex-none">{badge}</div> : null}
    </div>
  );
}

export function DrawerBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex-1 space-y-6 overflow-y-auto px-6 py-5", className)}>{children}</div>;
}

export function DrawerSection({
  label,
  action,
  children,
}: {
  label: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        {action}
      </div>
      {children}
    </section>
  );
}

export function DetailGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-4 gap-y-3">{children}</div>;
}

export function DetailRow({
  label,
  value,
  mono = false,
  full = false,
}: {
  label: ReactNode;
  value: ReactNode;
  mono?: boolean;
  full?: boolean;
}) {
  return (
    <div className={cn(full && "col-span-2")}>
      <p className="mb-0.5 text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className={cn("text-[13px] text-foreground", mono && "break-all font-mono text-xs")}>{value}</p>
    </div>
  );
}

/** Mono value in a subtle box with a copy button. */
export function CopyField({ label, value }: { label?: ReactNode; value: string }) {
  return (
    <div className="col-span-2">
      {label ? <p className="mb-1 text-[11px] font-medium text-muted-foreground">{label}</p> : null}
      <div className="flex items-center gap-2 rounded-md bg-muted px-2.5 py-1.5">
        <span className="flex-1 break-all font-mono text-[11.5px] text-muted-foreground">{value}</span>
        <button
          type="button"
          aria-label="Copy"
          onClick={() => {
            void navigator.clipboard.writeText(value);
            toast.success("Copied");
          }}
          className="flex size-6 flex-none items-center justify-center rounded-md border bg-background text-muted-foreground transition-colors hover:text-foreground"
        >
          <Copy className="size-3" />
        </button>
      </div>
    </div>
  );
}

export function DrawerEmpty({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-md border border-dashed px-4 py-6 text-center">
      {icon ? (
        <span className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-4">
          {icon}
        </span>
      ) : null}
      <p className="text-[13px] font-medium text-foreground">{title}</p>
      {description ? (
        <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

export function DrawerFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-t bg-muted/40 px-6 py-3.5">{children}</div>
  );
}

// ── Dialog header ─────────────────────────────────────────────────────────────

/**
 * Icon-led dialog heading. Pass the real <DialogTitle> / <DialogDescription>
 * nodes as `title` / `description` so Radix a11y is preserved; this just adds
 * the tinted icon chip and aligns them. Render inside <DialogHeader>.
 *
 *   <DialogHeader>
 *     <DialogHeading
 *       icon={<ShieldCheck />}
 *       title={<DialogTitle>Grant workload access</DialogTitle>}
 *       description={<DialogDescription>…</DialogDescription>}
 *     />
 *   </DialogHeader>
 */
export function DialogHeading({
  icon,
  title,
  description,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 text-left">
      {icon ? (
        <span className="flex size-9 flex-none items-center justify-center rounded-md border bg-muted text-muted-foreground [&_svg]:size-4">
          {icon}
        </span>
      ) : null}
      <div className="min-w-0 space-y-1">
        {title}
        {description}
      </div>
    </div>
  );
}
