import { Skeleton } from "@/components/ui/skeleton";
import { DataTableSkeleton } from "@/components/ui/table-skeleton";

export function PageLoadingSkeleton() {
  return (
    <div className="space-y-5 p-6" aria-busy="true" aria-label="Loading page">
      <div className="space-y-2">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>
      <DataTableSkeleton columns={5} rows={6} showSelection={false} />
    </div>
  );
}
