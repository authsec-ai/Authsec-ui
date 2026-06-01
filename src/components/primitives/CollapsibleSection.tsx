import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export interface CollapsibleSectionProps {
  id: string;
  title: string;
  defaultOpen?: boolean;
  badge?: string | number;
  action?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * CollapsibleSection — collapsible drawer section with sticky header and anchor ID.
 *
 * Usage:
 *   <CollapsibleSection id="overview" title="Overview" badge={3}>
 *     ...content...
 *   </CollapsibleSection>
 */
export function CollapsibleSection({
  id,
  title,
  defaultOpen = true,
  badge,
  action,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div id={id}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <div
            className="sticky top-[40px] z-[9] bg-white flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-slate-50 transition-colors border-b"
            role="button"
            aria-expanded={open}
          >
            <div className="flex items-center gap-2">
              <span className={cn("transition-transform duration-200", open ? "rotate-0" : "-rotate-90")}>
                <ChevronDown className="h-4 w-4 text-slate-400" />
              </span>
              <span className="text-sm font-medium text-slate-800">{title}</span>
              {badge !== undefined && (
                <Badge
                  variant="secondary"
                  className="text-xs px-1.5 py-0 h-4 rounded-full"
                >
                  {badge}
                </Badge>
              )}
            </div>
            {action && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="flex items-center"
              >
                {action}
              </div>
            )}
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 py-3">
            {children}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
