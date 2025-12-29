import type { DashboardData } from "../../types/dashboard";
import { Panel } from "../common/Panel";
import { SectionHeader } from "../common/SectionHeader";

interface LaneStatusGridProps {
  dashboard: DashboardData;
}

export function LaneStatusGrid({ dashboard }: LaneStatusGridProps) {
  const { observations, status } = dashboard;

  return (
    <Panel>
      <SectionHeader
        title="Lane telemetry"
        subtitle="Live counts, wait time, gap and lifetime served for each approach"
      />
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {observations.map((lane) => {
          const gap = Number(status.laneGaps[lane.lane] ?? 0);
          const lifetime = Number(status.laneTotals[lane.lane] ?? 0);
          const signalState =
            status.signalStates?.[lane.lane]?.toUpperCase() ?? "--";
          return (
            <div
              key={lane.lane}
              className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white/70"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold uppercase tracking-wide text-white">
                  {lane.lane.toUpperCase()}
                </p>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/60">
                  {signalState}
                </span>
              </div>
              <div className="mt-3 grid gap-2 text-xs text-white/70">
                <div className="flex items-center justify-between">
                  <span>Vehicles</span>
                  <span className="text-white">{lane.vehicleCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Avg wait</span>
                  <span className="text-white">
                    {lane.waitTime.toFixed(1)} s
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Forecast</span>
                  <span className="text-white">{lane.forecast.toFixed(1)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Headway gap</span>
                  <span className="text-white">{gap.toFixed(1)} s</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Lifetime served</span>
                  <span className="text-white">
                    {lifetime.toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-sky-500"
                  style={{ width: `${Math.min(100, lane.vehicleCount * 3)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
