import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "../../components/ui/button";
import { Database, Settings, AlertCircle } from "lucide-react";
import {
  M2MLogsView,
  M2MLogsViewSkeleton,
  M2MLogsFilterCard,
} from "./components/m2m-logs";
import { useGetM2MLogsQuery } from "../../app/api/logsApi";
import { SessionManager } from "../../utils/sessionManager";
import { Alert, AlertDescription } from "../../components/ui/alert";

interface M2MLogsFilterParams {
  client_id?: string;
  page_size?: number;
}

export function M2MLogsPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<M2MLogsFilterParams>({});
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const sessionData = SessionManager.getSession();
  const workspaceId = sessionData?.workspace_id;

  const { data, isLoading, isFetching, isError, error, refetch } =
    useGetM2MLogsQuery(
      {
        workspace_id: workspaceId || "",
        page,
        page_size: pageSize,
        client_id: filters.client_id || undefined,
      },
      { skip: !workspaceId }
    );

  const m2mLogs = data?.logs ?? [];
  const pagination = data?.pagination;

  const handleExport = () => {
    const logText = m2mLogs
      .map((log) => JSON.stringify(log, null, 2))
      .join("\n\n");
    const blob = new Blob([logText], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `m2m-logs-${new Date().toISOString()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleFiltersChange = (newFilters: M2MLogsFilterParams) => {
    setFilters(newFilters);
    setPage(1);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100/50 dark:from-neutral-950 dark:via-neutral-900 dark:to-stone-950">
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container mx-auto max-w-[1600px] px-6 py-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Database className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">
                  Machine-to-Machine (M2M) Logs
                </h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Monitor service-to-service token issuance and PDP decisions
                </p>
              </div>
            </div>
            <Button
              onClick={() => navigate("/logs/configure")}
              className="gap-2"
            >
              <Settings className="h-4 w-4" />
              Configure Logs
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto max-w-[1600px] px-6 py-6 space-y-6">
        {/* Error State */}
        {isError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load M2M logs. Please try again later.
              {error &&
              "data" in error &&
              typeof error.data === "object" &&
              error.data &&
              "message" in error.data
                ? ` Error: ${(error.data as { message: string }).message}`
                : ""}
            </AlertDescription>
          </Alert>
        )}

        {/* Filter Card */}
        <M2MLogsFilterCard
          onFiltersChange={handleFiltersChange}
          initialFilters={filters}
        />

        {/* Logs View */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: "easeOut" }}
        >
          {isLoading ? (
            <M2MLogsViewSkeleton />
          ) : (
            <M2MLogsView
              logs={m2mLogs}
              onExport={handleExport}
              onRefresh={refetch}
              isRefreshing={isFetching}
              pagination={pagination}
              onPageChange={handlePageChange}
            />
          )}
        </motion.div>
      </div>
    </div>
  );
}
