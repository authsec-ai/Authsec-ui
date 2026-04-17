import { useState } from "react";
import { Plus, X, Circle } from "lucide-react";
import { toast } from "react-hot-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUpdateToolScopeMapMutation } from "@/app/api/scopeMatrixApi";
import type { MCPToolResponse, OAuthScopeResponse, RiskLevel } from "@/app/api/types/scopeMatrix";

interface ToolScopeGridProps {
  rsId: string;
  tools: MCPToolResponse[];
  allScopes: OAuthScopeResponse[];
  onScopeClick: (scopeId: string) => void;
}

const riskLevelColors: Record<RiskLevel, string> = {
  low: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200 dark:border-orange-800",
  critical: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800",
};

export function ToolScopeGrid({ rsId, tools, allScopes, onScopeClick }: ToolScopeGridProps) {
  const [updateToolScopeMap, { isLoading }] = useUpdateToolScopeMapMutation();
  const [loadingToolId, setLoadingToolId] = useState<string | null>(null);

  const handleAddScope = async (toolId: string, scopeId: string) => {
    setLoadingToolId(toolId);
    try {
      await updateToolScopeMap({
        rsId,
        body: {
          mappings: [{ tool_id: toolId, scope_id: scopeId, remove: false }],
        },
      }).unwrap();
      toast.success("Scope mapped to tool");
    } catch (error) {
      toast.error("Failed to map scope");
      console.error("Map scope error:", error);
    } finally {
      setLoadingToolId(null);
    }
  };

  const handleRemoveScope = async (toolId: string, scopeId: string) => {
    setLoadingToolId(toolId);
    try {
      await updateToolScopeMap({
        rsId,
        body: {
          mappings: [{ tool_id: toolId, scope_id: scopeId, remove: true }],
        },
      }).unwrap();
      toast.success("Scope unmapped from tool");
    } catch (error) {
      toast.error("Failed to unmap scope");
      console.error("Unmap scope error:", error);
    } finally {
      setLoadingToolId(null);
    }
  };

  const getAvailableScopes = (tool: MCPToolResponse) => {
    const mappedScopeIds = new Set((tool.scopes ?? []).map((s) => s.scope_id));
    return allScopes.filter((scope) => !mappedScopeIds.has(scope.id));
  };

  if (tools.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-muted-foreground">No tools found for this resource server.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {tools.map((tool) => {
        const availableScopes = getAvailableScopes(tool);
        const isToolLoading = loadingToolId === tool.id;

        return (
          <div
            key={tool.id}
            className="rounded-lg border border-border bg-card p-4 transition-shadow hover:shadow-sm"
          >
            <div className="mb-3 flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-foreground">{tool.name}</h3>
                  {tool.title && (
                    <span className="text-sm text-muted-foreground">({tool.title})</span>
                  )}
                </div>
                {tool.description && (
                  <p className="mt-1 text-sm text-muted-foreground">{tool.description}</p>
                )}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={availableScopes.length === 0 || isToolLoading}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Map Scope
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  {availableScopes.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      All scopes mapped
                    </div>
                  ) : (
                    availableScopes.map((scope) => (
                      <DropdownMenuItem
                        key={scope.id}
                        onClick={() => handleAddScope(tool.id, scope.id)}
                      >
                        <div className="flex flex-col gap-1">
                          <span className="font-medium">{scope.scope_string}</span>
                          {scope.display_name && (
                            <span className="text-xs text-muted-foreground">
                              {scope.display_name}
                            </span>
                          )}
                        </div>
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="flex flex-wrap gap-2">
              {(tool.scopes ?? []).length === 0 ? (
                <span className="text-sm text-muted-foreground">No scopes mapped</span>
              ) : (
                (tool.scopes ?? []).map((scope) => (
                  <div key={scope.scope_id} className="group relative inline-flex items-center">
                    <Badge
                      variant="outline"
                      className={`cursor-pointer pr-7 ${riskLevelColors[scope.risk_level]}`}
                      onClick={() => onScopeClick(scope.scope_id)}
                    >
                      {scope.auto_matched && (
                        <Circle className="mr-1.5 h-2 w-2 fill-current" />
                      )}
                      <span className="font-medium">{scope.scope_string}</span>
                      {scope.display_name && (
                        <span className="ml-1.5 opacity-75">- {scope.display_name}</span>
                      )}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 h-full px-1.5 opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveScope(tool.id, scope.scope_id);
                      }}
                      disabled={isToolLoading}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
