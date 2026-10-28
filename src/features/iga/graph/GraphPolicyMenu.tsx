/**
 * Context menu for graph node policy actions (TRD v1.0 UG03).
 *
 * Triggered by right-click, Shift+F10 (keyboard menu key), or long-press
 * on touch devices. Shows actions: view evidence, view actions, view
 * applicable policies, and "Block / Deny access" which prepares a policy
 * context on the backend and navigates to the policy editor bridge.
 *
 * The menu is positioned at the pointer/keyboard origin and dismissed by
 * click-away, Escape, or selecting an item.
 */

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { useNavigate } from "react-router-dom";
import { Ban, Eye, FileSearch, Loader2 } from "lucide-react";

import type { GraphRef } from "@/app/api/igaGraphApi";
import { cn } from "@/lib/utils";

import { announce } from "../shared/announce";
import { usePrepareContextMutation, type PolicyContextRef } from "../policy/policyApi";

import type { VisualNode } from "./types";

export interface GraphPolicyMenuTarget {
  /** The visual node this menu was opened on. */
  visual: VisualNode;
  /** Screen position where the menu should appear. */
  x: number;
  y: number;
}

export interface GraphPolicyMenuProps {
  target: GraphPolicyMenuTarget | null;
  /** Graph root reference, sent as context to the backend. */
  graphRoot?: string;
  /** Evidence graph revision at the time of the investigation. */
  graphRevision?: number;
  onClose: () => void;
  onEvidence: (claims: GraphRef[]) => void;
}

/** One menu item row. */
function Item({
  icon: Icon,
  label,
  disabled,
  destructive,
  loading,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  disabled?: boolean;
  destructive?: boolean;
  loading?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled || loading}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none",
        "hover:bg-(--color-surface-subtle) focus-visible:bg-(--color-surface-subtle)",
        "disabled:pointer-events-none disabled:opacity-50",
        destructive && "text-(--color-destructive-text)",
      )}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4 shrink-0" />}
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}

export function GraphPolicyMenu({ target, graphRoot, graphRevision, onClose, onEvidence }: GraphPolicyMenuProps) {
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [prepareContext, { isLoading }] = usePrepareContextMutation();

  // Close on click-away
  useEffect(() => {
    if (!target) return;
    const handler = (ev: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(ev.target as Node)) onClose();
    };
    // Use capture so click-away fires before anything else.
    document.addEventListener("mousedown", handler, true);
    return () => document.removeEventListener("mousedown", handler, true);
  }, [target, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!target) return;
    const handler = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        ev.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [target, onClose]);

  // Focus the menu when it opens
  useEffect(() => {
    if (target) {
      requestAnimationFrame(() => menuRef.current?.focus({ preventScroll: true }));
      setError(null);
    }
  }, [target]);

  const handleBlockDeny = useCallback(async () => {
    if (!target) return;
    const refs: PolicyContextRef[] = target.visual.members.map((m) => ({
      ref: m.ref,
      kind: m.kind,
      label: m.label,
    }));
    try {
      const ctx = await prepareContext({
        selected_refs: refs,
        graph_root: graphRoot,
        graph_revision: graphRevision,
      }).unwrap();
      onClose();
      if (!ctx.publishable) {
        announce(ctx.reason ?? "This selection cannot produce a publishable policy draft.");
        setError(ctx.reason ?? "This selection cannot produce a publishable policy draft.");
        return;
      }
      navigate(`/iga/policies/from-graph/${ctx.context_id}`);
    } catch (err: unknown) {
      const msg = (err as { data?: { error?: string } })?.data?.error ?? "Failed to prepare policy context";
      setError(typeof msg === "string" ? msg : "Failed to prepare policy context");
      announce("Could not prepare policy context. Try again.");
    }
  }, [target, prepareContext, graphRoot, graphRevision, navigate, onClose]);

  const handleEvidence = useCallback(() => {
    if (!target) return;
    const claims = target.visual.members.map((m) => m.ref);
    onClose();
    onEvidence(claims);
  }, [target, onClose, onEvidence]);

  if (!target) return null;

  // Keep the menu on screen
  const menuWidth = 220;
  const menuHeight = 200;
  const left = Math.min(target.x, window.innerWidth - menuWidth - 8);
  const top = Math.min(target.y, window.innerHeight - menuHeight - 8);

  return (
    <div
      ref={menuRef}
      role="menu"
      tabIndex={-1}
      style={{ left, top }}
      className="fixed z-50 min-w-[200px] rounded-md border border-(--color-border-subtle) bg-(--color-surface-raised) p-1 shadow-(--shadow-md) outline-none"
    >
      <Item icon={Eye} label="View evidence" onClick={handleEvidence} />
      <Item icon={FileSearch} label="View applicable policies" onClick={() => { onClose(); /* future: navigate to policy list filtered by target */ }} />
      <div className="my-1 h-px bg-(--color-border-subtle)" role="separator" />
      <Item
        icon={Ban}
        label={isLoading ? "Preparing..." : "Block / Deny access"}
        destructive
        loading={isLoading}
        onClick={() => void handleBlockDeny()}
      />
      {error ? (
        <p className="px-2 py-1.5 text-xs text-(--color-destructive-text)">{error}</p>
      ) : null}
    </div>
  );
}
