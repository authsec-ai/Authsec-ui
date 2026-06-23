import { useState, useEffect } from "react";
import { CardContent } from "../../../../components/ui/card";
import { FilterCard as FilterShell } from "@/theme/components/cards";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../../components/ui/select";
import { Button } from "../../../../components/ui/button";

/** Only filters backed by the backend are kept here. */
export interface AuthLogsFilterParams {
  status?: "success" | "failure" | "all";
  timeRange?: string;
}

interface AuthLogsFilterCardProps {
  onFiltersChange: (filters: AuthLogsFilterParams) => void;
  initialFilters: AuthLogsFilterParams;
  onGroupByClick: () => void;
}

export function AuthLogsFilterCard({
  onFiltersChange,
  initialFilters,
  onGroupByClick,
}: AuthLogsFilterCardProps) {
  const [filters, setFilters] = useState<AuthLogsFilterParams>(initialFilters);

  useEffect(() => {
    onFiltersChange(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const handleFilterChange = (
    key: keyof AuthLogsFilterParams,
    value: string
  ) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({});
  };

  const activeFiltersCount = Object.keys(filters).filter(
    (key) =>
      filters[key as keyof AuthLogsFilterParams] &&
      filters[key as keyof AuthLogsFilterParams] !== "all"
  ).length;

  return (
    <FilterShell>
      <CardContent variant="compact">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-sm font-medium text-foreground">Filters</span>
            {activeFiltersCount > 0 && (
              <span className="text-xs text-foreground bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded">
                {activeFiltersCount}
              </span>
            )}
          </div>

          <div className="flex w-full flex-1 flex-wrap items-center gap-2">
            <Select
              value={filters.status || "all"}
              onValueChange={(value) => handleFilterChange("status", value)}
            >
              <SelectTrigger className="w-[130px] h-9 text-sm">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="failure">Failure</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filters.timeRange || "all"}
              onValueChange={(value) => handleFilterChange("timeRange", value)}
            >
              <SelectTrigger className="w-[150px] h-9 text-sm">
                <SelectValue placeholder="Time Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="5m">Last 5 minutes</SelectItem>
                <SelectItem value="1h">Last hour</SelectItem>
                <SelectItem value="24h">Last 24 hours</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              onClick={onGroupByClick}
              className="h-9 text-sm whitespace-nowrap"
            >
              Group By Users
            </Button>

            {activeFiltersCount > 0 && (
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
    </FilterShell>
  );
}
