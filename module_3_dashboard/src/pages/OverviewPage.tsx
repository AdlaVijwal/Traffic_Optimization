import { useMemo } from "react";
import { useDashboardData } from "../hooks/useDashboardData";
import { useOutputFrames } from "../hooks/useOutputFrames";
import { useUploadsData } from "../hooks/useUploadsData";
import {
  mockDashboardData,
  mockOutputFrameManifest,
} from "../services/mockData";
import { OverviewHero } from "../components/overview/OverviewHero";
import { KpiStatusBanner } from "../components/overview/KpiStatusBanner";
import { OverviewCommandPanel } from "../components/overview/CommandPanel";
import { LaneMapPanel } from "../components/overview/LaneMapPanel";
import { SkeletonPanel } from "../components/common/Skeleton";

export function OverviewPage() {
  const { data, isFetching, isError } = useDashboardData();
  const dashboard = useMemo(() => {
    if (data) {
      return data;
    }
    if (isError) {
      return mockDashboardData();
    }
    return null;
  }, [data, isError]);
  const outputQuery = useOutputFrames();
  const manifest = useMemo(() => {
    if (outputQuery.data) {
      return outputQuery.data;
    }
    if (outputQuery.isError) {
      return mockOutputFrameManifest();
    }
    return undefined;
  }, [outputQuery.data, outputQuery.isError]);
  const uploadsData = useUploadsData();

  if (!dashboard) {
    return (
      <div className="flex flex-col gap-6 pb-12">
        <SkeletonPanel />
        <SkeletonPanel />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 pb-12">
      <KpiStatusBanner dashboard={dashboard} isFetching={isFetching} />
      <OverviewHero dashboard={dashboard} isFetching={isFetching} />
      <OverviewCommandPanel
        dashboard={dashboard}
        isDashboardFetching={isFetching}
        manifest={manifest}
        manifestLoading={outputQuery.isFetching}
        uploads={uploadsData.uploads}
        uploadsLoading={uploadsData.isLoading || uploadsData.isFetching}
        hasActiveRuns={uploadsData.hasActiveRuns}
      />
      <LaneMapPanel dashboard={dashboard} />
    </div>
  );
}
