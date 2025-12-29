import { SignalHigh, TrendingUp } from "lucide-react";
import type { LaneObservation } from "../../types/dashboard";
import { Panel } from "../common/Panel";
import { SectionHeader } from "../common/SectionHeader";

interface LanePressureGridProps {
  observations: LaneObservation[];
}

export function LanePressureGrid({ observations }: LanePressureGridProps) {
  return (
    <Panel>
      <SectionHeader
        title="Lane pressure"
        subtitle="Live density, wait time and trend per approach"
        actions={
          <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-wide text-white/60">
            <SignalHigh className="h-3.5 w-3.5" />
            Live occupancy
          </span>
        }
      />
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {observations.map((lane) => {
          const trendIcon = <TrendingUp className="h-4 w-4 text-sky-300" />;
          return (
            <div
              key={lane.lane}
              className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-white">
                  {lane.lane.toUpperCase()}
                </h3>
                {trendIcon}
              </div>
              <div className="grid gap-2 text-xs text-white/70">
                <div className="flex items-center justify-between">
                  <span>Vehicles</span>
                  <span className="text-white">{lane.vehicleCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Wait</span>
                  <span className="text-white">
                    {lane.waitTime.toFixed(1)} s
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Forecast</span>
                  <span className="text-white">{lane.forecast.toFixed(1)}</span>
                </div>
              </div>
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-control-accent via-sky-500 to-blue-500"
                  style={{ width: `${Math.min(100, lane.vehicleCount * 4)}%` }}
                />
              </div>
              <p className="text-[11px] uppercase tracking-wide text-white/40">
                Trend {lane.trend}
              </p>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
