import { ArrowUpRight, Radio, TimerReset } from "lucide-react";
import type { DashboardData } from "../../types/dashboard";
import { Panel } from "../common/Panel";

interface OverviewHeroProps {
  dashboard: DashboardData;
  isFetching: boolean;
}

export function OverviewHero({ dashboard, isFetching }: OverviewHeroProps) {
  const { status, metrics, isOffline } = dashboard;
  const latency = `${status.latencyMs.toFixed(0)} ms`;
  const telemetryAge = `${status.telemetryAgeSeconds.toFixed(1)} s`;

  return (
    <Panel accent={"primary"} className="relative overflow-hidden">
      <div className="pointer-events-none absolute -left-32 top-0 h-72 w-72 rounded-full bg-control-accent/30 blur-[140px]" />
      <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-sky-500/40 blur-[120px]" />
      <div className="relative z-10 grid gap-10 lg:grid-cols-[2fr,1fr]">
        <div className="flex flex-col gap-6">
          <p className="text-xs uppercase tracking-[0.5em] text-white/70">
            Integrated traffic operations
          </p>
          <h1 className="text-4xl font-semibold text-white md:text-5xl">
            Junction {status.junctionId} ·{" "}
            {status.junctionType.replace(/_/g, " ")}
          </h1>
          <p className="max-w-2xl text-base text-white/70">
            Monitor the live hand-off between detection and signal logic. The
            overview brings together core telemetry, lane pressure and incident
            notifications so you can act before congestion forms.
          </p>
          <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-wide text-white/80">
            <span className="flex items-center gap-2 rounded-full border border-white/20 bg-black/30 px-4 py-2">
              <Radio
                className={
                  isOffline ? "text-control-alert" : "text-control-accent"
                }
                size={16}
              />
              {isOffline ? "Offline mode" : "Live"}
            </span>
            <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2">
              <TimerReset size={16} className="text-sky-300" />
              Telemetry {telemetryAge}
            </span>
            <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2">
              <ArrowUpRight size={16} className="text-emerald-300" />
              Latency {latency}
            </span>
            <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2">
              {metrics.cyclesExecuted} cycles observed
            </span>
            {isFetching ? (
              <span className="rounded-full border border-control-accent/50 bg-control-accent/10 px-4 py-2 text-control-accent">
                Syncing latest snapshot…
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-black/30 p-6 text-sm text-white/70">
          <p className="text-xs uppercase tracking-[0.35em] text-white/50">
            Live mode briefing
          </p>
          <div className="space-y-2">
            <p>
              Current green lane:{" "}
              <span className="font-semibold text-white">
                {status.currentGreen?.toUpperCase() ?? "--"}
              </span>
            </p>
            <p>
              Next lane in queue:{" "}
              <span className="font-semibold text-white">
                {status.nextLane?.toUpperCase() ?? "--"}
              </span>
            </p>
            <p>
              Remaining green time:{" "}
              <span className="font-semibold text-white">
                {status.remainingSeconds.toFixed(0)} s
              </span>
            </p>
            <p>
              Directions monitored:{" "}
              <span className="font-semibold text-white">
                {status.directions.length}
              </span>
            </p>
          </div>
          <div className="space-y-2 text-xs text-white/60">
            <p>
              Average green duration: {metrics.averageGreenDuration.toFixed(1)}{" "}
              s
            </p>
            <p>Forecast horizon: {metrics.forecastHorizon} cycles</p>
            <p>Telemetry stale after: {metrics.telemetryStaleAfter} s</p>
          </div>
        </div>
      </div>
    </Panel>
  );
}
