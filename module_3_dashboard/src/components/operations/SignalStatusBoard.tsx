import { Activity, ArrowRight, Gauge, Timer } from "lucide-react";
import type { DashboardData } from "../../types/dashboard";
import { Panel } from "../common/Panel";

interface SignalStatusBoardProps {
  dashboard: DashboardData;
}

export function SignalStatusBoard({ dashboard }: SignalStatusBoardProps) {
  const { status, priorities, nextPrediction } = dashboard;
  const activePriority = priorities.find(
    (item) => item.lane === status.currentGreen
  );

  return (
    <Panel accent="primary" className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-black/40 to-transparent" />
      <div className="relative z-10 grid gap-6 lg:grid-cols-[1.2fr,1fr]">
        <div className="space-y-5">
          <p className="text-xs uppercase tracking-[0.45em] text-white/60">
            Active cycle
          </p>
          <h2 className="text-3xl font-semibold text-white">
            Green lane {status.currentGreen?.toUpperCase() ?? "--"}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/50">
                <Timer className="h-4 w-4 text-sky-300" />
                Countdown
              </div>
              <p className="mt-2 text-3xl font-semibold text-white">
                {status.remainingSeconds.toFixed(0)}s
              </p>
              <p className="text-xs text-white/50">
                Cycle {status.cycleId ?? "--"}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/50">
                <ArrowRight className="h-4 w-4 text-emerald-300" />
                Next lane
              </div>
              <p className="mt-2 text-3xl font-semibold text-white">
                {nextPrediction?.lane.toUpperCase() ??
                  status.nextLane?.toUpperCase() ??
                  "TBD"}
              </p>
              <p className="text-xs text-white/50">
                Score {nextPrediction?.score?.toFixed(1) ?? "--"}
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-xs text-white/60">
            {activePriority ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-white">
                  Why this lane
                </p>
                <p>Density {activePriority.vehicleCount} vehicles</p>
                <p>
                  Waiting time {activePriority.waitingTime.toFixed(1)} seconds
                </p>
                <p>Forecast push {activePriority.forecastCount.toFixed(1)}</p>
                <p>
                  Cooldown guard {activePriority.cooldownPenalty.toFixed(1)}
                </p>
              </div>
            ) : (
              <p>No active priority data. Waiting for telemetry refresh.</p>
            )}
          </div>
        </div>
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/50">
              <Activity className="h-4 w-4 text-control-accent" />
              Priority ranking
            </div>
            <div className="mt-4 space-y-3 text-xs text-white/60">
              {priorities.map((item, index) => (
                <div
                  key={item.lane}
                  className="rounded-xl border border-white/10 bg-black/30 p-3"
                >
                  <div className="flex items-center justify-between text-sm text-white">
                    <span className="font-semibold uppercase tracking-wide">
                      #{index + 1} {item.lane.toUpperCase()}
                    </span>
                    <span className="flex items-center gap-1 text-control-accent">
                      <Gauge className="h-4 w-4" />
                      {item.score.toFixed(1)}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                    <span>Vehicles {item.vehicleCount}</span>
                    <span>Wait {item.waitingTime.toFixed(0)}s</span>
                    <span>Forecast {item.forecastCount.toFixed(1)}</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-control-accent to-sky-400"
                      style={{
                        width: `${Math.min(
                          100,
                          (item.score /
                            (activePriority?.score || item.score || 1)) *
                            100
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}
