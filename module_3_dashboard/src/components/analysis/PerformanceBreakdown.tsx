import { Panel } from "../common/Panel";
import { SectionHeader } from "../common/SectionHeader";
import type { DashboardData } from "../../types/dashboard";

interface PerformanceBreakdownProps {
  dashboard: DashboardData;
}

export function PerformanceBreakdown({ dashboard }: PerformanceBreakdownProps) {
  const { metrics } = dashboard;
  const lanes = Object.keys(metrics.averageWaitByLane);

  return (
    <Panel>
      <SectionHeader
        title="Performance breakdown"
        subtitle="Average wait and forecast horizon per lane across recent signal rounds"
      />
      <div className="mt-6 space-y-4 text-sm text-white/70">
        {lanes.length === 0 ? (
          <p>
            No metrics captured yet. Run the signal controller or switch to
            offline demo.
          </p>
        ) : (
          lanes.map((lane) => {
            const wait = metrics.averageWaitByLane[lane] ?? 0;
            const forecast = metrics.laneForecasts[lane] ?? 0;
            return (
              <div
                key={lane}
                className="rounded-2xl border border-white/10 bg-white/5 p-4"
              >
                <div className="flex items-center justify-between text-sm text-white">
                  <span className="font-semibold uppercase tracking-wide">
                    {lane.toUpperCase()}
                  </span>
                  <span className="text-xs text-white/50">
                    Forecast {forecast.toFixed(1)}
                  </span>
                </div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-control-accent to-emerald-400"
                    style={{ width: `${Math.min(100, wait * 3)}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-white/60">
                  Average wait {wait.toFixed(1)} seconds
                </p>
              </div>
            );
          })
        )}
      </div>
    </Panel>
  );
}
