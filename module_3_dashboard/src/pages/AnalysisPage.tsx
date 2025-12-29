import { useMemo } from "react";
import { useDashboardData } from "../hooks/useDashboardData";
import { mockDashboardData } from "../services/mockData";
import { FlowTimeline } from "../components/overview/FlowTimeline";
import { PerformanceBreakdown } from "../components/analysis/PerformanceBreakdown";
import { HistoryTable } from "../components/analysis/HistoryTable";

export function AnalysisPage() {
  const { data } = useDashboardData();
  const dashboard = useMemo(() => data ?? mockDashboardData(), [data]);

  return (
    <div className="flex flex-col gap-8 pb-10">
      <FlowTimeline history={dashboard.history} />
      <PerformanceBreakdown dashboard={dashboard} />
      <HistoryTable history={dashboard.history} />
    </div>
  );
}
