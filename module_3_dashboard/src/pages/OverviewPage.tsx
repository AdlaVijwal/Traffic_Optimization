import { useMemo } from "react";
import { useDashboardData } from "../hooks/useDashboardData";
import { mockDashboardData } from "../services/mockData";
import { OverviewHero } from "../components/overview/OverviewHero";
import { MetricsGrid } from "../components/overview/MetricsGrid";
import { LanePressureGrid } from "../components/overview/LanePressureGrid";
import { FlowTimeline } from "../components/overview/FlowTimeline";
import { IncidentFeed } from "../components/overview/IncidentFeed";

export function OverviewPage() {
  const { data, isFetching } = useDashboardData();
  const dashboard = useMemo(() => data ?? mockDashboardData(), [data]);

  return (
    <div className="flex flex-col gap-8 pb-10">
      <OverviewHero dashboard={dashboard} isFetching={isFetching} />
      <MetricsGrid dashboard={dashboard} />
      <LanePressureGrid observations={dashboard.observations} />
      <div className="grid gap-8 xl:grid-cols-[2fr,1fr]">
        <FlowTimeline history={dashboard.history} />
        <IncidentFeed dashboard={dashboard} />
      </div>
    </div>
  );
}
