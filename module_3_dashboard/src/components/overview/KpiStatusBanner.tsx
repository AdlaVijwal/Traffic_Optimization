import { useMemo } from "react";
import { Activity, AlertTriangle, Radio, RefreshCw } from "lucide-react";
import type { DashboardData } from "../../types/dashboard";
import { formatLaneLabel } from "../../utils/laneLabels";
import { Panel } from "../common/Panel";

interface KpiStatusBannerProps {
  dashboard: DashboardData;
  isFetching: boolean;
}

function clampScore(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function KpiStatusBanner({
  dashboard,
  isFetching,
}: KpiStatusBannerProps) {
  const { observations, metrics, status, context, history } = dashboard;
  const laneAliases = context.laneAliases ?? status.laneAliases ?? {};

  const { congestionScore, trendLabel, meanWait } = useMemo(() => {
    const waitValues = Object.values(metrics.averageWaitByLane ?? {});
    const laneLoad = observations.reduce(
      (total, lane) => total + lane.vehicleCount,
      0
    );
    const laneWait = observations.reduce(
      (total, lane) => total + lane.waitTime,
      0
    );
    const meanWait = waitValues.length
      ? waitValues.reduce((sum, value) => sum + value, 0) / waitValues.length
      : laneWait / Math.max(1, observations.length);

    const loadFactor = laneLoad / Math.max(1, observations.length * 40);
    const waitFactor = meanWait / 45;
    const compositeScore = clampScore(
      (loadFactor * 40 + waitFactor * 60) * 100
    );

    const latest = history.length ? history[history.length - 1] : undefined;
    const previous =
      history.length > 1 ? history[history.length - 2] : undefined;
    const latestWait = latest
      ? latest.priorities.reduce((sum, item) => sum + item.waitingTime, 0) /
        Math.max(1, latest.priorities.length)
      : undefined;
    const previousWait = previous
      ? previous.priorities.reduce((sum, item) => sum + item.waitingTime, 0) /
        Math.max(1, previous.priorities.length)
      : undefined;

    const delta =
      latestWait !== undefined && previousWait !== undefined
        ? latestWait - previousWait
        : undefined;

    let label = "Stable";
    if (delta !== undefined) {
      if (delta > 1.5) {
        label = `Rising ${delta.toFixed(1)}s`;
      } else if (delta < -1.5) {
        label = `Improving ${Math.abs(delta).toFixed(1)}s`;
      }
    }

    return { congestionScore: compositeScore, trendLabel: label, meanWait };
  }, [history, metrics.averageWaitByLane, observations]);

  const incidentCount = metrics.staleIncidents;
  const telemetryAge = `${status.telemetryAgeSeconds.toFixed(1)} s`;
  const latency = `${status.latencyMs.toFixed(0)} ms`;
  const currentLaneLabel = formatLaneLabel(
    status.currentGreen,
    laneAliases,
    "Idle"
  );
  const nextLaneLabel = formatLaneLabel(
    dashboard.nextPrediction?.lane ?? status.nextLane,
    laneAliases,
    "TBD"
  );

  const scoreTone =
    congestionScore >= 70
      ? {
          badge: "Critical load",
          color: "text-severity-critical",
          bar: "bg-severity-critical",
        }
      : congestionScore >= 40
      ? {
          badge: "Caution",
          color: "text-severity-caution",
          bar: "bg-severity-caution",
        }
      : {
          badge: "Flowing",
          color: "text-severity-calm",
          bar: "bg-severity-calm",
        };

  return (
    <Panel accent="primary" className="relative overflow-hidden p-0">
      <div className="pointer-events-none absolute -left-20 top-2 h-32 w-32 rounded-full bg-severity-info/20 blur-3xl" />
      <div className="pointer-events-none absolute right-12 -top-24 h-56 w-56 rounded-full bg-severity-calm/10 blur-3xl" />
      <div className="relative grid gap-6 p-6 md:grid-cols-[1.15fr,0.9fr,0.9fr]">
        <div className="group rounded-2xl border border-white/10 bg-white/10 p-5 transition hover:border-white/30 hover:bg-white/20">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-white/50">
                Congestion score
              </p>
              <p
                className={`mt-2 text-4xl font-semibold text-white ${scoreTone.color}`}
              >
                {congestionScore}
              </p>
            </div>
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-black/40 text-severity-info">
              <Activity className="h-5 w-5" />
            </span>
          </div>
          <p className="mt-3 text-xs uppercase tracking-wide text-white/60">
            {scoreTone.badge} · {trendLabel}
          </p>
          <div className="mt-4 h-2 w-full rounded-full bg-white/10">
            <div
              className={`h-full rounded-full ${scoreTone.bar}`}
              style={{
                width: `${congestionScore}%`,
                transition: "width 400ms ease",
              }}
            />
          </div>
          <p className="mt-3 text-[11px] uppercase tracking-[0.32em] text-white/40">
            Average wait {meanWait.toFixed(1)} s · latency {latency} · data age{" "}
            {telemetryAge}
          </p>
        </div>

        <div className="group rounded-2xl border border-white/10 bg-white/10 p-5 transition hover:border-white/25 hover:bg-white/20">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-white/50">
                Live incidents
              </p>
              <p className="mt-2 text-3xl font-semibold text-white">
                {incidentCount}
              </p>
            </div>
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-black/40 text-severity-caution">
              <AlertTriangle className="h-5 w-5" />
            </span>
          </div>
          <p className="mt-3 text-xs text-white/60">
            {incidentCount > 0
              ? "Investigate flagged approaches or stalled uploads"
              : "No unresolved alerts at this time"}
          </p>
          <div className="mt-4 flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-white/40">
            <RefreshCw className="h-3.5 w-3.5" />
            Snapshot{" "}
            {metrics.lastUpdated &&
            !Number.isNaN(new Date(metrics.lastUpdated).getTime())
              ? new Date(metrics.lastUpdated).toLocaleTimeString()
              : "recent"}
          </div>
        </div>

        <div className="group rounded-2xl border border-white/10 bg-white/10 p-5 transition hover:border-white/25 hover:bg-white/20">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-white/50">
                Signal state
              </p>
              <p className="mt-2 text-3xl font-semibold text-white">
                {currentLaneLabel}
              </p>
            </div>
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-black/40 text-severity-info">
              <Radio className="h-5 w-5" />
            </span>
          </div>
          <p className="mt-3 text-xs text-white/60">
            Next up{" "}
            <span className="pl-1 font-medium text-white">{nextLaneLabel}</span>
          </p>
          <p className="mt-2 text-xs text-white/60">
            Remaining green{" "}
            <span className="font-medium text-white">
              {status.remainingSeconds.toFixed(0)} s
            </span>
          </p>
          {isFetching ? (
            <p className="mt-4 text-[11px] uppercase tracking-[0.32em] text-severity-info">
              Syncing live snapshot…
            </p>
          ) : (
            <p className="mt-4 text-[11px] uppercase tracking-[0.32em] text-white/40">
              Cycle {status.cycleId ?? "pending"}
            </p>
          )}
        </div>
      </div>
    </Panel>
  );
}
