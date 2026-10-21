/**
 * "Add agent or service" — pick what kind of caller you are connecting, then
 * go to that kind's flow. The Agents list itself links straight to
 * /agents/new; this chooser stays for places that need to ask first.
 *
 *   AI agent        → /agents/new?type=ai
 *   Voice agent     → /agents/new?type=voice
 *   Service account → /agents/new?type=service
 *   Other client    → no create flow: these register themselves through
 *                     OAuth; you approve or revoke them on /clients.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AudioLines, Bot, Plug, Plus, Server } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type CallerKind = "agent" | "voice" | "service" | "client";

const KINDS: {
  kind: CallerKind;
  title: string;
  body: string;
  icon: typeof Bot;
  badge?: string;
  to: string;
  cta: string;
}[] = [
  {
    kind: "agent",
    title: "AI agent",
    body: "Software that signs a person in and calls MCP servers for them. Example: Claude Desktop, Cursor or your own agent.",
    icon: Bot,
    badge: "Most common",
    to: "/agents/new?type=ai",
    cta: "Continue",
  },
  {
    kind: "voice",
    title: "Voice agent",
    body: "Answers phone or voice calls and uses tools for the caller. Example: a support line that looks up tickets.",
    icon: AudioLines,
    to: "/agents/new?type=voice",
    cta: "Continue",
  },
  {
    kind: "service",
    title: "Service account",
    body: "A pipeline or backend job that calls MCP servers on its own, with no person signed in. Example: a CI deploy.",
    icon: Server,
    to: "/agents/new?type=service",
    cta: "Continue",
  },
  {
    kind: "client",
    title: "Other client",
    body: "An app that registered itself through OAuth. You approve it instead of creating it. Example: an IDE plugin.",
    icon: Plug,
    to: "/clients",
    cta: "Open Clients",
  },
];

export function AddCallerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const navigate = useNavigate();
  const [kind, setKind] = useState<CallerKind>("agent");
  const chosen = KINDS.find((k) => k.kind === kind) ?? KINDS[0];

  const go = () => {
    onOpenChange(false);
    navigate(chosen.to);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setKind("agent");
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add agent or service</DialogTitle>
          <DialogDescription>
            Pick what you're connecting. Each choice says when to use it.
          </DialogDescription>
        </DialogHeader>

        <div role="radiogroup" aria-label="Kind of caller" className="grid gap-3 py-1 sm:grid-cols-2">
          {KINDS.map((k) => {
            const Icon = k.icon;
            const selected = k.kind === kind;
            return (
              <button
                key={k.kind}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setKind(k.kind)}
                onDoubleClick={() => {
                  setKind(k.kind);
                  onOpenChange(false);
                  navigate(k.to);
                }}
                className={cn(
                  "rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected
                    ? "border-(--color-primary) bg-(--color-primary-soft)"
                    : "border-(--color-border-subtle) hover:border-(--color-border-strong)",
                )}
              >
                <span className="flex items-center gap-2">
                  <Icon
                    className={cn("size-4 shrink-0", selected ? "text-(--color-primary-text)" : "text-(--color-text-muted)")}
                    aria-hidden
                  />
                  <span className="text-[length:var(--font-size-sm)] font-semibold text-(--color-text)">{k.title}</span>
                  {k.badge ? (
                    <span className="ml-auto rounded-md border border-(--color-border-subtle) bg-(--color-surface-raised) px-1.5 py-0.5 text-[length:var(--font-size-body-xs)] font-semibold text-(--color-text-muted)">
                      {k.badge}
                    </span>
                  ) : null}
                </span>
                <span className="mt-1.5 block text-[length:var(--font-size-sm)] leading-relaxed text-(--color-text-muted)">
                  {k.body}
                </span>
              </button>
            );
          })}
        </div>

        {kind === "client" ? (
          <div
            role="note"
            className="rounded-lg border border-[color-mix(in_srgb,var(--color-primary)_24%,transparent)] bg-(--color-primary-soft) px-4 py-2.5 text-[length:var(--font-size-sm)] leading-relaxed text-(--color-primary-text)"
          >
            There's nothing to create here: these apps register themselves through OAuth the first time
            they connect to one of your MCP servers. They then show up on the Agents list, where you approve
            them, and on <span className="font-semibold">Clients</span>, where you can also register one by
            hand with <span className="font-semibold">Add client</span>.
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={go} className="text-white">
            {chosen.cta}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The page-header primary action that opens the chooser. */
export function AddCallerButton({ size }: { size?: "sm" | "default" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size={size} onClick={() => setOpen(true)} className="text-white">
        <Plus className="mr-1.5 size-3.5" />
        Add agent or service
      </Button>
      <AddCallerDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
