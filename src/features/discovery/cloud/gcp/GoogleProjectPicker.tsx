/**
 * Google Authentication's project picker — shown once a Google sign-in
 * session exists, listing the projects that Google account can see
 * (GET /gcp/google-oauth/projects, scoped to the session). Purely
 * presentational: selection is reported to the parent wizard, which owns
 * what happens next (preflight, then provisioning).
 */
import { useMemo, useState } from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import type { GoogleProjectSummary } from "@/app/api/cloudDiscoveryApi";

export function GoogleProjectPicker({
  projects,
  isLoading,
  selectedProjectId,
  onSelect,
}: {
  projects: GoogleProjectSummary[];
  isLoading: boolean;
  selectedProjectId: string | null;
  onSelect: (projectId: string) => void;
}) {
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        p.project_id.toLowerCase().includes(q) ||
        (p.display_name ?? "").toLowerCase().includes(q),
    );
  }, [projects, filter]);

  if (isLoading) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Loading your Google Cloud projects…
      </p>
    );
  }

  if (projects.length === 0) {
    return (
      <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
        No Google Cloud projects were found for this account. Confirm you signed in with the right
        Google account, or use Workload Identity Federation instead.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <Input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Search projects…"
        className="text-xs"
      />
      <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-1">
        {filtered.map((p) => {
          const selected = p.project_id === selectedProjectId;
          return (
            <button
              key={p.project_id}
              type="button"
              onClick={() => onSelect(p.project_id)}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors",
                selected ? "bg-blue-50/60" : "hover:bg-muted",
              )}
            >
              <span className="flex flex-col">
                <span className="font-mono">{p.project_id}</span>
                {p.display_name && p.display_name !== p.project_id ? (
                  <span className="text-[11px] text-muted-foreground">{p.display_name}</span>
                ) : null}
              </span>
              {selected ? <Check className="size-4 shrink-0 text-(--color-primary)" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default GoogleProjectPicker;
