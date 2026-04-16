import { AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { OAuthScopeResponse, RiskLevel } from "@/app/api/types/scopeMatrix";

interface UnmappedScopesPanelProps {
  unmappedScopes: OAuthScopeResponse[];
  onScopeClick: (scopeId: string) => void;
}

const riskLevelColors: Record<RiskLevel, string> = {
  low: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  critical: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export function UnmappedScopesPanel({ unmappedScopes, onScopeClick }: UnmappedScopesPanelProps) {
  if (unmappedScopes.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-900/10">
      <div className="mb-3 flex items-center gap-2">
        <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-500" />
        <h3 className="font-semibold text-amber-900 dark:text-amber-300">
          Unmapped Scopes ({unmappedScopes.length})
        </h3>
      </div>
      <p className="mb-4 text-sm text-amber-800 dark:text-amber-400">
        These scopes are not currently mapped to any tools. Click on a scope to edit or delete it.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {unmappedScopes.map((scope) => (
          <button
            key={scope.id}
            onClick={() => onScopeClick(scope.id)}
            className="group rounded-lg border border-border bg-card p-3 text-left transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <span className="font-mono text-sm font-medium text-foreground">
                {scope.scope_string}
              </span>
              <Badge variant="outline" className={riskLevelColors[scope.risk_level]}>
                {scope.risk_level}
              </Badge>
            </div>
            {scope.display_name && (
              <p className="mb-1 text-sm text-foreground">{scope.display_name}</p>
            )}
            {scope.description && (
              <p className="mb-2 line-clamp-2 text-xs text-muted-foreground">
                {scope.description}
              </p>
            )}
            {scope.is_auto_discovered && (
              <Badge variant="secondary" className="text-xs">
                Auto-discovered
              </Badge>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
