import { useState, useEffect } from "react";
import { CardContent } from "../../../../components/ui/card";
import { FilterCard } from "@/theme/components/cards";
import { Input } from "../../../../components/ui/input";
import { Button } from "../../../../components/ui/button";

interface M2MLogsFilterParams {
  client_id?: string;
}

interface M2MLogsFilterCardProps {
  onFiltersChange: (filters: M2MLogsFilterParams) => void;
  initialFilters: M2MLogsFilterParams;
}

export function M2MLogsFilterCard({
  onFiltersChange,
  initialFilters,
}: M2MLogsFilterCardProps) {
  const [filters, setFilters] = useState<M2MLogsFilterParams>(initialFilters);

  useEffect(() => {
    onFiltersChange(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const clearFilters = () => {
    setFilters({});
  };

  const hasActiveFilters = !!(filters.client_id);

  return (
    <FilterCard>
      <CardContent variant="compact">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-sm font-medium text-foreground">Filters</span>
            {hasActiveFilters && (
              <span className="text-xs text-foreground bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded">
                1
              </span>
            )}
          </div>

          <div className="flex w-full flex-1 flex-wrap items-center gap-2">
            <Input
              className="w-[220px] h-9 text-sm"
              placeholder="Filter by Client ID"
              value={filters.client_id ?? ""}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  client_id: e.target.value || undefined,
                }))
              }
            />

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-9 text-sm text-foreground hover:text-foreground"
              >
                Clear
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </FilterCard>
  );
}
