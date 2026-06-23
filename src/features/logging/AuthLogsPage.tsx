import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import type { AuthLog } from "../../types/entities";
import { Activity, Settings, X, AlertCircle } from "lucide-react";
import {
  AuthLogsView,
  AuthLogsViewSkeleton,
  AuthLogsFilterCard,
  UserAttributeSelectorModal,
  type UserAttribute,
} from "./components/auth-logs";
import type { AuthLogsFilterParams } from "./components/auth-logs/AuthLogsFilterCard";
import { useGetLogsQuery } from "../../app/api/logsApi";
import { SessionManager } from "../../utils/sessionManager";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { useTourStep, TOUR_REGISTRY } from "@/features/guided-tour";

/** UserSelection mirrors the shape expected by UserAttributeSelectorModal */
interface UserSelection {
  type: UserAttribute;
  values: string[];
}

// Helper function to convert timeRange to RFC3339 timestamps
function getTimeRangeTimestamps(timeRange?: string): {
  start_time?: string;
  end_time?: string;
} {
  if (!timeRange || timeRange === "all") return {};

  const now = new Date();
  const end_time = now.toISOString();
  const offsets: Record<string, number> = {
    "5m": 5 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
  };
  const ms = offsets[timeRange];
  if (!ms) return {};
  return { start_time: new Date(now.getTime() - ms).toISOString(), end_time };
}

export function AuthLogsPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<AuthLogsFilterParams>({});
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [isGroupByModalOpen, setIsGroupByModalOpen] = useState(false);
  const [userSelection, setUserSelection] = useState<UserSelection | null>(null);

  useTourStep({
    tourConfig: TOUR_REGISTRY["auth-logs-intro"],
  });

  const sessionData = SessionManager.getSession();
  const workspaceId = sessionData?.workspace_id;

  // status filter: backend expects lowercase 'success' | 'failure'
  const statusParam =
    filters.status && filters.status !== "all"
      ? (filters.status as "success" | "failure")
      : undefined;

  const { data, isLoading, isFetching, isError, error, refetch } =
    useGetLogsQuery(
      {
        workspace_id: workspaceId || "",
        page,
        page_size: pageSize,
        status: statusParam,
      },
      {
        skip: !workspaceId,
        refetchOnMountOrArgChange: true,
      }
    );

  const apiLogs = data?.logs ?? [];
  const pagination = data?.pagination;

  // Client-side filter for user selection (multi-user not supported server-side)
  const filteredLogs = useMemo(() => {
    return apiLogs.filter((log: AuthLog) => {
      if (!userSelection || userSelection.values.length === 0) return true;
      if (userSelection.values.length === 1) return true; // single user is server-side
      if (userSelection.type === "userId") {
        return userSelection.values.includes(log.userId ?? "");
      }
      if (userSelection.type === "username") {
        return userSelection.values.includes(log.userId ?? "");
      }
      return true;
    });
  }, [apiLogs, userSelection]);

  const handleExport = () => {
    const logText = filteredLogs
      .map((log) => JSON.stringify(log, null, 2))
      .join("\n\n");
    const blob = new Blob([logText], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `auth-logs-${new Date().toISOString()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleFiltersChange = (newFilters: AuthLogsFilterParams) => {
    setFilters(newFilters);
    setPage(1);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const handleGroupByApply = (selection: UserSelection) => {
    setUserSelection(selection);
    setPage(1);
  };

  const handleClearUserSelection = () => {
    setUserSelection(null);
    setPage(1);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100/50 dark:from-neutral-950 dark:via-neutral-900 dark:to-stone-950">
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container mx-auto max-w-[1600px] px-6 py-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                <Activity className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">
                  Authentication Logs
                </h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Monitor authentication attempts across this workspace
                </p>
              </div>
            </div>
            <Button
              onClick={() => navigate("/logs/configure")}
              className="gap-2"
              data-tour-id="logs-configure"
            >
              <Settings className="h-4 w-4" />
              Configure Logs
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto max-w-[1600px] px-6 py-6 space-y-6">
        {/* User Selection Badge */}
        {userSelection && userSelection.values.length > 0 && (
          <div className="flex items-center gap-2 rounded-lg border bg-emerald-50/50 dark:bg-emerald-950/20 px-4 py-3">
            <Badge variant="secondary">
              Filtered by{" "}
              {userSelection.type === "userId" ? "User ID" : "Username"}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {userSelection.values.length}{" "}
              {userSelection.values.length === 1 ? "user" : "users"} selected
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearUserSelection}
              className="ml-auto h-8 px-2"
            >
              <X className="h-4 w-4" />
              Clear
            </Button>
          </div>
        )}

        {/* Error State */}
        {isError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load logs. Please try again later.
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
        <div data-tour-id="auth-logs-filters">
          <AuthLogsFilterCard
            onFiltersChange={handleFiltersChange}
            initialFilters={filters}
            onGroupByClick={() => setIsGroupByModalOpen(true)}
          />
        </div>

        {/* Logs View */}
        <motion.div
          data-tour-id="auth-logs-table"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: "easeOut" }}
        >
          {isLoading ? (
            <AuthLogsViewSkeleton />
          ) : (
            <AuthLogsView
              logs={filteredLogs}
              onExport={handleExport}
              onRefresh={refetch}
              isRefreshing={isFetching}
              pagination={pagination}
              onPageChange={handlePageChange}
            />
          )}
        </motion.div>
      </div>

      {/* Group By Modal */}
      <UserAttributeSelectorModal
        isOpen={isGroupByModalOpen}
        onClose={() => setIsGroupByModalOpen(false)}
        onApply={handleGroupByApply}
      />
    </div>
  );
}
