import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchDashboardData } from "../services/api";
import type { DashboardData } from "../types/dashboard";

export function useDashboardData() {
  const query = useQuery<DashboardData>({
    queryKey: ["dashboard-data"],
    queryFn: fetchDashboardData,
    staleTime: 4000,
    refetchInterval: 5000,
    refetchOnWindowFocus: false,
  });

  const { data, ...queryRest } = query;

  const derived = useMemo(() => {
    if (!data) {
      return {
        activeDirections: 0,
        hasIncidents: false,
      };
    }
    const hasIncidents = data.metrics.staleIncidents > 0 || data.isOffline;
    return {
      activeDirections: data.status.directions.length,
      hasIncidents,
    };
  }, [data]);

  return {
    ...queryRest,
    data,
    derived,
  };
}
