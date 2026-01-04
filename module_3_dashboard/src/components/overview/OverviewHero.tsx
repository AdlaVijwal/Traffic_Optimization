import { ArrowUpRight, Radio, TimerReset } from "lucide-react";
import type { DashboardData } from "../../types/dashboard";
import { formatLaneLabel } from "../../utils/laneLabels";
import { Panel } from "../common/Panel";

interface OverviewHeroProps {
  dashboard: DashboardData;
  isFetching: boolean;
}

export function OverviewHero({ dashboard, isFetching }: OverviewHeroProps) {
  const { status, metrics, isOffline, context } = dashboard;
  const latency = `${status.latencyMs.toFixed(0)} ms`;
  const telemetryAge = `${status.telemetryAgeSeconds.toFixed(1)} s`;
  const subtitle = context.description
    ? context.description
    : context.junctionType
    ? context.junctionType.replace(/_/g, " ")
    : undefined;
  const laneAliases = context.laneAliases ?? status.laneAliases ?? {};
  const currentLaneLabel = formatLaneLabel(status.currentGreen, laneAliases);
  const nextLaneCandidate = dashboard.nextPrediction?.lane ?? status.nextLane;
  const nextLaneLabel = formatLaneLabel(nextLaneCandidate, laneAliases);
  const monitoredLanes = context.lanes?.length ?? context.directions.length;

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
            {context.displayName}
            {subtitle ? (
              <span className="text-white/60"> · {subtitle}</span>
            ) : null}
          </h1>
          <p className="max-w-2xl text-base text-white/70">
            Monitor the live hand-off between detection and signal logic.{" "}
            {context.laneCount <= 1
              ? " Single-lane feeds surface wait times without junction jargon."
              : " The overview brings together core live data, lane pressure and incident notifications so you can act before congestion forms."}
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
              Data age {telemetryAge}
            </span>
            <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2">
              <ArrowUpRight size={16} className="text-emerald-300" />
              Latency {latency}
            </span>
            <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2">
              {metrics.cyclesExecuted} signal rounds observed
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
            Live timing briefing
          </p>
          <div className="space-y-2">
            <p>
              Current release:
              <span className="pl-2 font-semibold text-white">
                {currentLaneLabel}
              </span>
            </p>
            <p>
              Next up:
              <span className="pl-2 font-semibold text-white">
                {nextLaneLabel}
              </span>
            </p>
            <p>
              Adaptive green time:
              <span className="pl-2 font-semibold text-white">
                {status.remainingSeconds.toFixed(0)} s
              </span>
            </p>
            <p>
              Active lanes:
              <span className="pl-2 font-semibold text-white">
                {monitoredLanes}
              </span>
            </p>
          </div>
          <div className="space-y-2 text-xs text-white/60">
            <p>
              Average green duration: {metrics.averageGreenDuration.toFixed(1)}{" "}
              s
            </p>
            <p>Forecast horizon: {metrics.forecastHorizon} signal rounds</p>
            <p>Data freshness limit: {metrics.telemetryStaleAfter} s</p>
          </div>

          {/* Trend Sparklines */}
          {dashboard.history && dashboard.history.length > 1 && (
            <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
              <p className="text-xs uppercase tracking-[0.35em] text-white/50">
                Recent Activity
              </p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/60">Green duration</span>
                <div className="flex items-center gap-2">
                  <svg width="60" height="20" className="opacity-70">
                    <polyline
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      points={dashboard.history
                        .slice(-10)
                        .map((h, i, arr) => {
                          const max = Math.max(
                            ...arr.map((x) => x.greenDuration)
                          );
                          const y = 18 - (h.greenDuration / max) * 16;
                          const x = (i / (arr.length - 1)) * 58 + 1;
                          return `${x},${y}`;
                        })
                        .join(" ")}
                      className="text-sky-400"
                    />
                  </svg>
                  <span className="text-sm font-semibold text-white">
                    {dashboard.history[
                      dashboard.history.length - 1
                    ].greenDuration.toFixed(1)}
                    s
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
