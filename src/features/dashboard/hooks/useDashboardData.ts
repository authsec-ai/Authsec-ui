import {
  // useGetDashboardStatsQuery, // COMMENTED OUT
  useGetQuickActionsStatusQuery,
  type QuickActionsStatus,
} from "../../../app/api/dashboardApi";

export interface UseDashboardDataProps {
  workspaceId: string;
}

export interface DashboardData {
  // Loading states
  isLoading: boolean;
  isError: boolean;
  error: any;

  // Stats
  stats: {
    activeSessions: number;
    inactiveSessions: number;
    totalSessions: number;
    totalEndUsers: number;
    totalAdminUsers: number;
    activeUserPercentage: number;
    mfaAdoptionRate: number;
  } | null;

  // Quick Actions Status
  quickActionsStatus: QuickActionsStatus | null;

  // Refetch functions
  refetch: () => void;
}

/**
 * Custom hook to fetch and process all dashboard data
 */
export function useDashboardData({ workspaceId }: UseDashboardDataProps): DashboardData {
  // COMMENTED OUT: Dashboard stats API
  // const {
  //   data: statsData,
  //   isLoading: statsLoading,
  //   error: statsError,
  //   refetch: refetchStats,
  // } = useGetDashboardStatsQuery({ workspace_id: workspaceId }, { skip: !workspaceId });

  const {
    data: quickActionsData,
    isLoading: quickActionsLoading,
    error: quickActionsError,
    refetch: refetchQuickActions,
  } = useGetQuickActionsStatusQuery({ workspace_id: workspaceId }, { skip: !workspaceId });

  const refetchAll = () => {
    // refetchStats(); // COMMENTED OUT
    refetchQuickActions();
  };

  // COMMENTED OUT: Return mock/empty stats data
  const statsData = null;
  const statsLoading = false;
  const statsError = null;

  return {
    isLoading: statsLoading || quickActionsLoading,
    isError: !!statsError || !!quickActionsError,
    error: statsError || quickActionsError,
    stats: statsData || null,
    quickActionsStatus: quickActionsData || null,
    refetch: refetchAll,
  };
}
