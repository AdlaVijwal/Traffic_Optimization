import { useMemo } from "react";
import { useDashboardData } from "../hooks/useDashboardData";
import { mockDashboardData } from "../services/mockData";
import { SignalStatusBoard } from "../components/operations/SignalStatusBoard";
import { LaneStatusGrid } from "../components/operations/LaneStatusGrid";
import { IncidentFeed } from "../components/overview/IncidentFeed";

export function OperationsPage() {
  const { data } = useDashboardData();
  const dashboard = useMemo(() => data ?? mockDashboardData(), [data]);

  return (
    <div className="flex flex-col gap-8 pb-10">
      <SignalStatusBoard dashboard={dashboard} />
      <LaneStatusGrid dashboard={dashboard} />
      <IncidentFeed dashboard={dashboard} />
    </div>
  );
}
