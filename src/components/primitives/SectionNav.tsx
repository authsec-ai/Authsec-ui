import React from "react";
import { cn } from "@/lib/utils";

export interface SectionNavProps {
  sections: Array<{ id: string; label: string }>;
  activeId?: string;
  scrollContainerRef?: React.RefObject<HTMLElement>;
}

/**
 * SectionNav — sticky horizontal anchor-jump nav for scrollable drawers.
 *
 * Usage:
 *   <SectionNav
 *     sections={[{ id: 'overview', label: 'Overview' }, { id: 'access', label: 'Access' }]}
 *     activeId={activeSectionId}
 *   />
 */
export function SectionNav({
  sections,
  activeId,
}: SectionNavProps) {
  const handleClick = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="sticky top-0 z-10 bg-white border-b py-1.5 px-4 flex items-center gap-0">
      {sections.map((section, index) => (
        <React.Fragment key={section.id}>
          {index > 0 && (
            <span className="text-xs text-slate-300 select-none px-1.5" aria-hidden>
              ·
            </span>
          )}
          <button
            type="button"
            onClick={() => handleClick(section.id)}
            className={cn(
              "text-xs transition-colors focus:outline-none focus-visible:underline",
              activeId === section.id
                ? "font-semibold text-slate-900"
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            {section.label}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}
