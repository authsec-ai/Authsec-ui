/**
 * Parts shared by the Machines screens: the right-click menu, a copyable
 * command, and the confirmation for a console "block".
 */

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "react-hot-toast";

import {
  useBlockAgentKitResourceMutation,
  type BlockRequest,
} from "@/app/api/agentkitApi";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { copyToClipboard } from "@/lib/clipboard";

import { blockSentence } from "./machinesModel";
import type { MenuState } from "./menu";

export const MUTED = "text-(--color-text-muted)";

/* ------------------------------ context menu ------------------------------ */

/**
 * A menu at the pointer, opened by a row's onContextMenu (and by its "⋯"
 * button, so the same actions are reachable from the keyboard). Closes on
 * Escape, a click elsewhere, scroll or resize.
 */
export function ContextMenu({
  menu,
  onClose,
}: {
  menu: MenuState | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (e instanceof MouseEvent && ref.current?.contains(e.target as Node))
        return;
      onClose();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", key);
    ref.current
      ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
      ?.focus();
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", key);
    };
  }, [menu, onClose]);
  if (!menu) return null;
  // Kept on screen: a menu opened near the right or bottom edge opens inward.
  const left = Math.min(menu.x, window.innerWidth - 260);
  const top = Math.min(
    menu.y,
    window.innerHeight - 40 - menu.items.length * 36,
  );
  return (
    <div
      ref={ref}
      role="menu"
      style={{ left, top }}
      className="fixed z-50 min-w-56 rounded-md border border-(--color-border-subtle) bg-(--color-surface-raised) p-1 shadow-lg"
    >
      {menu.items.map((it) => (
        <button
          key={it.label}
          type="button"
          role="menuitem"
          disabled={it.disabled}
          title={it.hint}
          onClick={() => {
            onClose();
            it.onSelect();
          }}
          className={`flex w-full items-center rounded px-2.5 py-1.5 text-left text-sm hover:bg-(--color-surface-subtle) focus:bg-(--color-surface-subtle) focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
            it.danger ? "text-(--color-danger-text)" : "text-(--color-text)"
          }`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function RowMenuButton({
  onOpen,
  label,
}: {
  onOpen: (e: React.MouseEvent) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-haspopup="menu"
      onClick={onOpen}
      className="rounded px-2 py-0.5 text-(--color-text-muted) hover:bg-(--color-surface-subtle) hover:text-(--color-text)"
    >
      ⋯
    </button>
  );
}

/* --------------------------------- command -------------------------------- */

export function CommandBlock({
  lines,
  label,
}: {
  lines: string[];
  label: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const text = lines.join("\n");
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">{label}</span>
        <button
          type="button"
          onClick={() =>
            void copyToClipboard(text, "Commands", {
              toastSuccess: false,
            }).then((ok) => {
              if (ok) setCopied(true);
            })
          }
          className="inline-flex items-center gap-1 text-xs text-(--color-primary-text) hover:underline"
        >
          {copied ? (
            <Check className="size-3" aria-hidden="true" />
          ) : (
            <Copy className="size-3" aria-hidden="true" />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto rounded-md border border-(--color-border-subtle) bg-(--color-surface-subtle) px-3 py-2 font-mono text-xs leading-5">
        {text}
      </pre>
    </div>
  );
}

/* ---------------------------------- block --------------------------------- */

export interface PendingBlock {
  agent: string;
  block: BlockRequest;
}

/**
 * Confirms a block, then adds it to the agent's policy as a new version. The
 * answer says whether the rule is enforced or only logged (monitor mode).
 */
export function BlockDialog({
  pending,
  onClose,
}: {
  pending: PendingBlock | null;
  onClose: () => void;
}) {
  const [block, state] = useBlockAgentKitResourceMutation();
  const [error, setError] = useState<string | null>(null);
  const confirm = async () => {
    if (!pending) return;
    setError(null);
    try {
      const r = await block({
        agent: pending.agent,
        ...pending.block,
      }).unwrap();
      if (!r.created) toast.success("Already blocked in the policy.");
      else if (r.enforced)
        toast.success(
          `Blocked. Policy ${pending.agent} is now version ${r.policy.version}; machines apply it within a minute.`,
        );
      else
        toast.success(
          `Added to policy ${pending.agent} version ${r.policy.version}. It is in monitor mode: the rule is logged, not enforced, until the mode is enforce.`,
          { duration: 7000 },
        );
      onClose();
    } catch (e) {
      const err = e as { status?: number; data?: { error?: string } };
      setError(
        err.status === 403
          ? "Your role cannot change policies: it needs discovery:admin."
          : (err.data?.error ?? "The block could not be saved."),
      );
    }
  };
  return (
    <Dialog open={!!pending} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Block for {pending?.agent === "*" ? "every agent" : pending?.agent}
          </DialogTitle>
          <DialogDescription>
            {pending ? blockSentence(pending.agent, pending.block) : null}
          </DialogDescription>
        </DialogHeader>
        <p className={`text-xs ${MUTED}`}>
          The rule is added to the agent&apos;s policy as a new version (an
          agent without its own policy starts from a copy of the default one).
          Every connected machine applies it within a minute.
        </p>
        {error ? (
          <p className="text-xs text-(--color-danger-text)">{error}</p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => void confirm()}
            disabled={state.isLoading}
          >
            {state.isLoading ? "Blocking…" : "Block"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
