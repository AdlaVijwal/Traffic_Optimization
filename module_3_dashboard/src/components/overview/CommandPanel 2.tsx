import type { ComponentType } from "react";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Images,
  UploadCloud,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Panel } from "../common/Panel";
import { ComparisonSparkline } from "../common/ComparisonSparkline";
import type { DashboardData } from "../../types/dashboard";
import { formatLaneLabel } from "../../utils/laneLabels";
import type { OutputFrameManifest, UploadRun } from "../../types/uploads";

interface OverviewCommandPanelProps {
  dashboard: DashboardData;
  isDashboardFetching: boolean;
  uploads: UploadRun[];
  uploadsLoading: boolean;
  hasActiveRuns: boolean;
  manifest?: OutputFrameManifest;
  manifestLoading: boolean;
}

function TileHeader({
  icon: Icon,
  title,
  subtitle,
  to,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  to: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/80">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-white/70">
            {title}
          </p>
          <p className="text-xs text-white/50">{subtitle}</p>
        </div>
      </div>
      <Link
        to={to}
        className="group inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-wide text-white/70 transition hover:border-white/30 hover:text-white"
      >
        Expand
        <ArrowUpRight className="h-3 w-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}

export function OverviewCommandPanel({
  dashboard,
  isDashboardFetching,
  uploads,
  uploadsLoading,
  hasActiveRuns,
  manifest,
  manifestLoading,
}: OverviewCommandPanelProps) {
  const { context } = dashboard;
  const laneAliases =
    context?.laneAliases ?? dashboard.status.laneAliases ?? {};
  const activeDirections = dashboard.status.directions.length;
  const laneCount = context?.laneCount ?? activeDirections;
  const uploadContext = context?.upload;
  const uploadDirections = uploadContext?.directions;
  const captureLaneCount =
    uploadDirections?.length ?? context?.directions?.length ?? laneCount;
  const operationsSpark = dashboard.observations[0]?.sparkline ?? [];
  const currentLaneLabel = formatLaneLabel(
    dashboard.status.currentGreen,
    laneAliases,
    "N/A"
  );
  const nextLaneLabel = formatLaneLabel(
    dashboard.nextPrediction?.lane ?? dashboard.status.nextLane,
    laneAliases,
    "TBD"
  );
  const operationsAverageVehicles =
    operationsSpark.length > 0
      ? Math.round(
          operationsSpark.reduce((sum, value) => sum + value, 0) /
            operationsSpark.length
        )
      : 0;
  const operationsWindow = operationsSpark.slice(-15);
  const operationsBaseline = operationsWindow.length
    ? Array.from(
        { length: operationsWindow.length },
        () => operationsAverageVehicles
      )
    : [];
  const operationsBaselineRaw =
    operationsBaseline[operationsBaseline.length - 1] ??
    operationsAverageVehicles;
  const safeOperationsBaseline = Math.max(operationsBaselineRaw, 1);
  const operationsDelta =
    operationsWindow.length > 0
      ? operationsWindow[operationsWindow.length - 1] - operationsBaselineRaw
      : 0;
  const operationsDeltaPercent =
    operationsWindow.length > 0
      ? (operationsDelta / safeOperationsBaseline) * 100
      : 0;
  const operationsTrendLabel =
    operationsWindow.length === 0
      ? "Awaiting data"
      : operationsDeltaPercent > 5
      ? `UP ${operationsDeltaPercent.toFixed(0)}% vs avg`
      : operationsDeltaPercent < -5
      ? `DOWN ${Math.abs(operationsDeltaPercent).toFixed(0)}% vs avg`
      : "On target";
  const operationsTrendClass =
    operationsDeltaPercent < -5
      ? "text-severity-caution"
      : operationsDeltaPercent > 5
      ? "text-severity-calm"
      : "text-severity-neutral";
  const avgWaitValues = Object.values(
    dashboard.metrics.averageWaitByLane ?? {}
  );
  const averageWait =
    avgWaitValues.length > 0
      ? Math.round(
          (avgWaitValues.reduce((sum, value) => sum + value, 0) /
            avgWaitValues.length) *
            10
        ) / 10
      : 0;
  const historyWaitSeries = dashboard.history.map((item) => {
    if (!item.priorities.length) {
      return averageWait;
    }
    const totalWait = item.priorities.reduce(
      (sum, priority) => sum + priority.waitingTime,
      0
    );
    return totalWait / item.priorities.length;
  });
  const waitWindow = historyWaitSeries.slice(-15);
  const waitBaseline = waitWindow.length
    ? Array.from({ length: waitWindow.length }, () => averageWait)
    : [];
  const waitCurrentValue =
    waitWindow.length > 0 ? waitWindow[waitWindow.length - 1] : averageWait;
  const waitBaselineRaw = waitBaseline[waitBaseline.length - 1] ?? averageWait;
  const waitBaselineValue = Math.max(waitBaselineRaw, 0.1);
  const waitDelta = waitCurrentValue - waitBaselineValue;
  const waitDeltaPercent = (waitDelta / waitBaselineValue) * 100;
  const waitTrendLabel =
    waitWindow.length === 0
      ? "Awaiting data"
      : waitDelta > 1.5
      ? `UP ${waitDelta.toFixed(1)}s vs avg`
      : waitDelta < -1.5
      ? `DOWN ${Math.abs(waitDelta).toFixed(1)}s vs avg`
      : "Within range";
  const waitTrendClass =
    waitDelta > 1.5
      ? "text-severity-critical"
      : waitDelta < -1.5
      ? "text-severity-calm"
      : "text-severity-neutral";
  const historyDurations = dashboard.history.map((item) => item.greenDuration);
  const durationWindow = historyDurations.slice(-15);
  const durationBaseline = durationWindow.length
    ? Array.from(
        { length: durationWindow.length },
        () => dashboard.metrics.averageGreenDuration
      )
    : [];
  const durationHistoryBaseline = historyDurations.length
    ? Array.from(
        { length: historyDurations.length },
        () => dashboard.metrics.averageGreenDuration
      )
    : [];
  const durationCurrentValue =
    durationWindow.length > 0
      ? durationWindow[durationWindow.length - 1]
      : dashboard.metrics.averageGreenDuration;
  const durationBaselineRaw =
    durationBaseline[durationBaseline.length - 1] ??
    dashboard.metrics.averageGreenDuration;
  const durationBaselineValue = Math.max(durationBaselineRaw, 0.1);
  const durationDelta = durationCurrentValue - durationBaselineValue;
  const durationTrendLabel =
    durationWindow.length === 0
      ? "Awaiting data"
      : durationDelta >= 2
      ? `Extended ${durationDelta.toFixed(1)}s`
      : durationDelta <= -2
      ? `Tightened ${Math.abs(durationDelta).toFixed(1)}s`
      : "Stable cadence";
  const durationTrendClass =
    durationDelta <= -2
      ? "text-severity-caution"
      : durationDelta >= 2
      ? "text-severity-calm"
      : "text-severity-neutral";
  const incidentSeries = dashboard.history
    .slice(-15)
    .map(
      (cycle) =>
        cycle.priorities.filter((priority) => priority.waitingTime > 25).length
    );
  if (incidentSeries.length === 0) {
    incidentSeries.push(dashboard.metrics.staleIncidents);
  }
  const incidentAverage =
    incidentSeries.reduce((sum, value) => sum + value, 0) /
    Math.max(1, incidentSeries.length);
  const incidentBaseline = incidentSeries.map(() => incidentAverage);
  const incidentCurrent = incidentSeries[incidentSeries.length - 1] ?? 0;
  const incidentBaselineRaw =
    incidentBaseline[incidentBaseline.length - 1] ?? incidentAverage;
  const incidentBaselineValue = Math.max(incidentBaselineRaw, 0.1);
  const incidentDelta = incidentCurrent - incidentBaselineValue;
  const incidentTrendLabel =
    incidentDelta > 1
      ? `Escalating +${incidentDelta.toFixed(1)}`
      : incidentDelta < -0.5
      ? `Clearing ${Math.abs(incidentDelta).toFixed(1)}`
      : "At baseline";
  const incidentTrendClass =
    incidentDelta > 1
      ? "text-severity-critical"
      : incidentDelta < -0.5
      ? "text-severity-calm"
      : "text-severity-neutral";
  const manifestGroups = manifest?.groups ?? [];
  const totalFrames = manifestGroups.reduce(
    (total, group) => total + group.frames.length,
    0
  );
  const uploadsActive = uploads.filter(
    (run) => run.status === "processing" || run.status === "pending"
  );
  const uploadsCompleted = uploads.filter((run) => run.status === "completed");
  const uploadsFailed = uploads.filter((run) => run.status === "failed");
  const activeUploadLabel =
    uploadContext?.displayName ??
    uploadContext?.siteLabel ??
    uploadContext?.cameraLabel;
  const operationsTitle =
    captureLaneCount <= 1 ? "Camera operations" : "Operations";
  const operationsSubtitle =
    captureLaneCount <= 1
      ? "Single-lane feed status"
      : "Live signal state and data pulse";
  const analysisSubtitle =
    captureLaneCount <= 1
      ? "Recent signal round quality for this feed"
      : "Latest performance breakdown snapshot";

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Panel accent="primary" className="flex flex-col gap-6">
        <TileHeader
          icon={Activity}
          title={operationsTitle}
          subtitle={operationsSubtitle}
          to="/operations"
        />
        <div className="grid gap-4 md:grid-cols-[1.3fr,1fr]">
          <div className="group rounded-2xl border border-white/10 bg-black/30 p-5 transition duration-300 hover:-translate-y-1 hover:border-control-accent/50 hover:bg-black/40">
            <p className="text-xs uppercase tracking-wide text-white/50">
              {captureLaneCount <= 1 ? "Camera label" : "Current green"}
            </p>
            <p className="mt-2 text-4xl font-semibold text-white">
              {captureLaneCount <= 1
                ? activeUploadLabel ?? currentLaneLabel
                : currentLaneLabel}
            </p>
            <p className="mt-3 text-xs text-white/60">
              {captureLaneCount <= 1
                ? `${dashboard.status.remainingSeconds} seconds remaining in capture`
                : `${dashboard.status.remainingSeconds} seconds remaining · Next lane: ${nextLaneLabel}`}
            </p>
            <div className="mt-4 flex items-center gap-4 text-xs text-white/50">
              <span>
                {captureLaneCount <= 1
                  ? "Single capture lane"
                  : `${captureLaneCount} active lanes`}
              </span>
              <span>
                Data age{" "}
                {isDashboardFetching
                  ? "syncing…"
                  : `${dashboard.status.telemetryAgeSeconds.toFixed(1)}s old`}
              </span>
            </div>
            {uploadContext ? (
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/60">
                <p className="font-medium text-white/80">
                  Active upload:{" "}
                  {uploadContext.displayName ?? uploadContext.id ?? "Unknown"}
                </p>
                <p>
                  {(uploadContext.analysisType ?? "manual").replace(/_/g, " ")}
                  {uploadContext.status ? ` · ${uploadContext.status}` : ""}
                </p>
              </div>
            ) : null}
            <div className="mt-5 flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-[0.28em] text-white/50">
              <span className={`font-semibold ${operationsTrendClass}`}>
                {operationsTrendLabel}
              </span>
              <span>Baseline {operationsAverageVehicles} veh/round</span>
            </div>
          </div>
          <div className="group rounded-2xl border border-white/10 bg-black/20 p-5 transition duration-300 hover:-translate-y-1 hover:border-severity-info/40 hover:bg-black/30">
            <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/50">
              <p>Throughput · last 15 min</p>
              <span className={`font-semibold ${operationsTrendClass}`}>
                {operationsTrendLabel}
              </span>
            </div>
            {operationsWindow.length > 0 ? (
              <ComparisonSparkline
                current={operationsWindow}
                baseline={operationsBaseline}
                className="mt-3"
              />
            ) : (
              <div className="mt-6 flex h-16 items-center justify-center text-xs text-white/40">
                No data window
              </div>
            )}
            <div className="mt-3 flex items-center justify-between text-xs text-white/60">
              <span>
                Live{" "}
                {operationsWindow.length > 0
                  ? operationsWindow[operationsWindow.length - 1].toFixed(1)
                  : "–"}{" "}
                veh/round
              </span>
              <span>Avg {operationsAverageVehicles} veh/round</span>
            </div>
          </div>
        </div>
      </Panel>

      <Panel accent="secondary" className="flex flex-col gap-6">
        <TileHeader
          icon={BarChart3}
          title="Analysis"
          subtitle={analysisSubtitle}
          to="/analysis"
        />
        <div className="grid gap-4 md:grid-cols-3">
          <div className="group rounded-2xl border border-white/10 bg-black/25 p-5 transition duration-300 hover:-translate-y-1 hover:border-severity-calm/50 hover:bg-black/40">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-wide text-white/50">
                Cycle cadence
              </p>
              <span
                className={`text-[11px] uppercase tracking-[0.3em] ${durationTrendClass}`}
              >
                {durationTrendLabel}
              </span>
            </div>
            {durationWindow.length > 0 ? (
              <ComparisonSparkline
                current={durationWindow}
                baseline={durationBaseline}
                className="mt-3"
              />
            ) : (
              <div className="mt-6 flex h-16 items-center justify-center text-xs text-white/40">
                Waiting on cycles
              </div>
            )}
            <p className="mt-3 text-2xl font-semibold text-white">
              {durationCurrentValue.toFixed(1)} s
            </p>
            <p className="mt-1 text-xs text-white/60">
              Avg {dashboard.metrics.averageGreenDuration.toFixed(1)} s ·{" "}
              {dashboard.metrics.cyclesExecuted.toLocaleString()} cycles
            </p>
          </div>
          <div className="group rounded-2xl border border-white/10 bg-black/25 p-5 transition duration-300 hover:-translate-y-1 hover:border-severity-critical/40 hover:bg-black/40">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-wide text-white/50">
                Queue wait trend
              </p>
              <span
                className={`text-[11px] uppercase tracking-[0.3em] ${waitTrendClass}`}
              >
                {waitTrendLabel}
              </span>
            </div>
            {waitWindow.length > 0 ? (
              <ComparisonSparkline
                current={waitWindow}
                baseline={waitBaseline}
                className="mt-3"
              />
            ) : (
              <div className="mt-6 flex h-16 items-center justify-center text-xs text-white/40">
                Awaiting queue metrics
              </div>
            )}
            <p className="mt-3 text-2xl font-semibold text-white">
              {waitCurrentValue.toFixed(1)} s
            </p>
            <p className="mt-1 text-xs text-white/60">
              Baseline {averageWait.toFixed(1)} s · Δ{" "}
              {waitDelta >= 0 ? "+" : ""}
              {waitDelta.toFixed(1)} s
            </p>
          </div>
          <div className="group rounded-2xl border border-white/10 bg-black/25 p-5 transition duration-300 hover:-translate-y-1 hover:border-severity-critical/50 hover:bg-black/40">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-wide text-white/50">
                Incident pressure
              </p>
              <span
                className={`text-[11px] uppercase tracking-[0.3em] ${incidentTrendClass}`}
              >
                {incidentTrendLabel}
              </span>
            </div>
            {incidentSeries.length > 0 ? (
              <ComparisonSparkline
                current={incidentSeries}
                baseline={incidentBaseline}
                className="mt-3"
              />
            ) : (
              <div className="mt-6 flex h-16 items-center justify-center text-xs text-white/40">
                No incident history
              </div>
            )}
            <p className="mt-3 text-2xl font-semibold text-white">
              {incidentCurrent.toFixed(0)} events
            </p>
            <p className="mt-1 text-xs text-white/60">
              Live alerts {dashboard.metrics.staleIncidents} · Avg{" "}
              {incidentAverage.toFixed(1)}
            </p>
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-white/50">
              Green duration trail
            </p>
            <span
              className={`text-[11px] uppercase tracking-[0.3em] ${durationTrendClass}`}
            >
              {durationTrendLabel}
            </span>
          </div>
          {historyDurations.length > 0 ? (
            <ComparisonSparkline
              current={historyDurations}
              baseline={durationHistoryBaseline}
              className="mt-3"
            />
          ) : (
            <div className="flex h-16 items-center justify-center text-xs text-white/40">
              Waiting on history
            </div>
          )}
        </div>
      </Panel>

      <Panel className="flex flex-col gap-6">
        <TileHeader
          icon={Images}
          title="Outputs"
          subtitle={
            uploadContext
              ? "Frames generated for this run"
              : "Camera analysis frame rendering status"
          }
          to="/outputs"
        />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
            <p className="text-xs uppercase tracking-wide text-white/50">
              Frame groups
            </p>
            <p className="mt-2 text-3xl font-semibold text-white">
              {manifestLoading && totalFrames === 0
                ? "…"
                : manifestGroups.length}
            </p>
            <p className="mt-2 text-xs text-white/60">
              Total frames{" "}
              {manifestLoading && totalFrames === 0 ? "…" : totalFrames}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
            <p className="text-xs uppercase tracking-wide text-white/50">
              Last generated
            </p>
            <p className="mt-2 text-xl font-semibold text-white">
              {manifest?.generatedAt
                ? new Date(manifest.generatedAt).toLocaleTimeString()
                : "Pending"}
            </p>
            <p className="mt-2 text-xs text-white/60">
              {manifestLoading
                ? "Syncing frame summary…"
                : "Refresh every 15 seconds"}
            </p>
          </div>
        </div>
        <div className="grid gap-3">
          {manifestGroups.slice(0, 3).map((group) => (
            <div
              key={group.id}
              className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70"
            >
              <div>
                <p className="font-medium text-white">{group.label}</p>
                <p className="text-xs text-white/50">
                  {group.description ?? "Live detection frames"}
                </p>
              </div>
              <span className="text-xs text-white/60">
                {group.frames.length} frames
              </span>
            </div>
          ))}
          {manifestGroups.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-5 text-sm text-white/50">
              No frame summary available yet.
            </div>
          ) : null}
        </div>
      </Panel>

      <Panel className="flex flex-col gap-6">
        <TileHeader
          icon={UploadCloud}
          title="Uploads"
          subtitle="Upload run health"
          to="/uploads"
        />
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
            <p className="text-xs uppercase tracking-wide text-white/50">
              Active
            </p>
            <p className="mt-2 text-3xl font-semibold text-white">
              {uploadsLoading ? "…" : uploadsActive.length}
            </p>
            <p className="mt-2 text-xs text-white/60">
              {hasActiveRuns ? "Processing inflight" : "Standing by"}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
            <p className="text-xs uppercase tracking-wide text-white/50">
              Completed
            </p>
            <p className="mt-2 text-3xl font-semibold text-white">
              {uploadsLoading ? "…" : uploadsCompleted.length}
            </p>
            <p className="mt-2 text-xs text-white/60">
              Last run{" "}
              {uploadsCompleted[0]?.createdAt
                ? new Date(uploadsCompleted[0].createdAt).toLocaleDateString()
                : "–"}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
            <p className="text-xs uppercase tracking-wide text-white/50">
              Failed
            </p>
            <p className="mt-2 text-3xl font-semibold text-white">
              {uploadsLoading ? "…" : uploadsFailed.length}
            </p>
            <p className="mt-2 text-xs text-white/60">
              Monitor camera feeds closely.
            </p>
          </div>
        </div>
        <div className="space-y-3">
          {uploads.slice(0, 3).map((run) => {
            const isActiveContext = Boolean(
              uploadContext?.id && run.id === uploadContext.id
            );
            const runLabel =
              run.notes?.split("\n")[0]?.trim() ??
              run.junctionId ??
              run.analysisType ??
              `Run ${run.id}`;
            return (
              <div
                key={run.id}
                className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-sm transition duration-150 ${
                  isActiveContext
                    ? "border-white/40 bg-white/10 text-white shadow-glow"
                    : "border-white/10 bg-white/5 text-white/70"
                }`}
              >
                <div>
                  <p className="font-medium text-white">{runLabel}</p>
                  <p className="text-xs text-white/60">
                    {run.status} ·{" "}
                    {new Date(run.createdAt).toLocaleTimeString()}
                  </p>
                </div>
                {typeof run.progress === "number" ? (
                  <span className="text-xs text-white/70">
                    {Math.round(run.progress)}%
                  </span>
                ) : null}
              </div>
            );
          })}
          {uploads.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-5 text-sm text-white/50">
              No recent uploads detected.
            </div>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}
