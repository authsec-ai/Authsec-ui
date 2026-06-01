import React from "react";
import { cn } from "@/lib/utils";

export type ResourceTagKind = "role" | "scope" | "application" | "tool" | "user";

export interface ResourceTagProps {
  label: string;
  kind: ResourceTagKind;
  onClick?: () => void;
  className?: string;
}

const KIND_STYLES: Record<ResourceTagKind, string> = {
  role: "bg-blue-50 text-blue-700 border-blue-200",
  scope: "bg-purple-50 text-purple-700 border-purple-200",
  application: "bg-green-50 text-green-700 border-green-200",
  tool: "bg-amber-50 text-amber-700 border-amber-200",
  user: "bg-slate-100 text-slate-700 border-slate-200",
};

/**
 * ResourceTag — clickable entity chip with kind-based color coding.
 *
 * Usage:
 *   <ResourceTag label="admin" kind="role" onClick={() => openRoleDrawer()} />
 *   <ResourceTag label="read:files" kind="scope" />
 */
export function ResourceTag({ label, kind, onClick, className }: ResourceTagProps) {
  return (
    <span
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") onClick(); } : undefined}
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium",
        KIND_STYLES[kind],
        onClick && "cursor-pointer hover:opacity-80 transition-opacity",
        className
      )}
    >
      {label}
    </span>
  );
}
