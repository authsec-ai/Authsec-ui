import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "../../components/ui/button";
import { Settings, AlertCircle } from "lucide-react";
import { ConsolePage } from "@/components/console/ConsolePage";
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
    <ConsolePage
      title="M2M Logs"
      description="Monitor service-to-service token issuance and PDP decisions"
      actions={
        <Button
          onClick={() => navigate("/logs/configure")}
          className="gap-2 text-white"
        >
          <Settings className="h-4 w-4" />
          Configure Logs
        </Button>
      }
    >
      <div className="space-y-6">
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
    </ConsolePage>
  );
}
