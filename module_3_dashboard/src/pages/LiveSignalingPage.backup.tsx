import { useState, useEffect, useMemo } from "react";
import { useDashboardData } from "../hooks/useDashboardData";
import { useUploadsData } from "../hooks/useUploadsData";
import {
  Radio,
  Video,
  Clock,
  ArrowRight,
  MapPin,
  Circle,
  ArrowRightCircle,
  AlertTriangle,
} from "lucide-react";
import { format, differenceInSeconds } from "date-fns";

type SignalState = "green" | "red" | "yellow";

interface LaneSignalCard {
  lane: string;
  label: string;
  state: SignalState;
  greenDuration: number;
  timestamp: string;
  waitTime: number; // Seconds waiting in red
  isEstimated?: boolean; // Whether wait time is estimated (vs actual from backend)
}

interface SignalPeriod {
  periodNumber: number;
  title: string;
  status: "active" | "upcoming" | "waiting";
  lanes: LaneSignalCard[];
  estimatedStartTime: number; // Seconds from now
  totalDuration: number; // Total seconds for this period
}

export function LiveSignalingPage() {
  const { data: dashboard, isLoading: isDashboardLoading } = useDashboardData();
  const { uploads, isLoading: isUploadsLoading } = useUploadsData();
  const [currentTime, setCurrentTime] = useState(new Date());

  const isLoading = isDashboardLoading || isUploadsLoading;

  // Live timer - updates every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Get the most recent completed upload
  const completedUpload = uploads?.find((run) => run.status === "completed");

  // Get current signal state from dashboard
  const currentSignal = dashboard?.history?.[dashboard.history.length - 1];
  const lanes = dashboard?.status?.lanes || dashboard?.context?.lanes || [];

  // Calculate signal sequence (which lanes go green in order)
  const signalSequence = useMemo(() => {
    const signalHistory = dashboard?.history || [];
    if (signalHistory.length < 2) return [];
    const recent = signalHistory.slice(-10);
    const sequence = recent.map((h) => h.greenLane);
    // Remove duplicates while preserving order
    return [...new Set(sequence)];
  }, [dashboard?.history]);

  // Check if data is stale (backend hasn't updated in 30+ seconds)
  const isDataStale = useMemo(() => {
    if (!currentSignal) return false;
    const ageSeconds = differenceInSeconds(
      currentTime,
      new Date(currentSignal.decidedAt)
    );
    return ageSeconds > 30;
  }, [currentSignal, currentTime]);

  // Build lane signal cards with REALISTIC timers (max 90 seconds)
  const buildLaneCards = (): LaneSignalCard[] => {
    if (!currentSignal || lanes.length === 0) return [];

    const signalTime = new Date(currentSignal.decidedAt);
    const elapsedSeconds = differenceInSeconds(currentTime, signalTime);

    // Maximum realistic wait = (lanes - 1) × backend max_green_seconds
    // Backend max_green_seconds is 60s, so for 4 lanes: 3 × 60 = 180s max
    // We cap display to prevent extreme values in edge cases
    const BACKEND_MAX_GREEN = 60; // Must match module_2_signal_logic/app/settings.py
    const MAX_DISPLAY_WAIT = Math.min(
      (lanes.length - 1) * BACKEND_MAX_GREEN,
      180 // Absolute cap for display readability
    );
    const remainingOnCurrent = Math.max(
      0,
      currentSignal.greenDuration - elapsedSeconds
    );

    return lanes.map((laneDesc, index) => {
      const isGreen = currentSignal.greenLane === laneDesc.id;

      // WAIT TIME CALCULATION (ESTIMATED)
      // Wait = remaining time on current green + estimated time for lanes ahead
      // ⚠️ LIMITATION: Assumes round-robin rotation. Backend uses priority-based
      // scheduling, so high-traffic lanes may appear multiple times in sequence.
      // For accurate predictions, backend should expose predicted wait times via API.
      let waitTime = 0;
      let isEstimated = true;
      if (!isGreen) {
        // Calculate position in assumed round-robin sequence
        const greenIndex = lanes.findIndex(
          (l) => l.id === currentSignal.greenLane
        );
        const laneIndex = index;

        // How many lanes are ahead of us in the queue?
        const positionDiff = laneIndex - greenIndex;
        const positionsAway =
          positionDiff <= 0 ? positionDiff + lanes.length : positionDiff;

        // Wait = remaining time on current + time for lanes ahead in queue
        const avgGreenTime = Math.round(currentSignal.greenDuration);
        const lanesAheadInQueue = positionsAway - 1; // -1 because current lane is already green

        waitTime = remainingOnCurrent + lanesAheadInQueue * avgGreenTime;
        waitTime = Math.round(
          Math.min(MAX_DISPLAY_WAIT, Math.max(0, waitTime))
        );
      }

      return {
        lane: laneDesc.id,
        label: laneDesc.label || laneDesc.alias || laneDesc.id,
        state: isGreen ? "green" : "red",
        greenDuration: currentSignal.greenDuration,
        timestamp: currentSignal.decidedAt,
        waitTime: isGreen ? 0 : waitTime,
        isEstimated: !isGreen && isEstimated,
      };
    });
  };

  const laneCards = buildLaneCards();

  // Group lanes into signal periods (max 4 periods)
  const signalPeriods = useMemo((): SignalPeriod[] => {
    if (laneCards.length === 0) return [];

    const RELAXATION_TIME = 10; // 10 seconds between analysis periods
    const periods: SignalPeriod[] = [];

    // Sort lanes: active first, then by wait time
    const sortedLanes = [...laneCards].sort((a, b) => {
      if (a.state === "green" && b.state !== "green") return -1;
      if (a.state !== "green" && b.state === "green") return 1;
      return a.waitTime - b.waitTime;
    });

    // Period 1: Current active lane
    const activeLane = sortedLanes.find((l) => l.state === "green");
    if (activeLane) {
      periods.push({
        periodNumber: 1,
        title: "Active Release - Clearing Traffic",
        status: "active",
        lanes: [activeLane],
        estimatedStartTime: 0,
        totalDuration: Math.round(activeLane.greenDuration),
      });
    }

    // Remaining lanes - group into 2-3 periods
    const waitingLanes = sortedLanes.filter((l) => l.state !== "green");
    const lanesPerPeriod = Math.ceil(waitingLanes.length / 3);

    let cumulativeTime = activeLane
      ? Math.round(activeLane.greenDuration) + RELAXATION_TIME
      : 0;

    for (
      let i = 0;
      i < Math.min(3, Math.ceil(waitingLanes.length / lanesPerPeriod));
      i++
    ) {
      const startIdx = i * lanesPerPeriod;
      const endIdx = Math.min(startIdx + lanesPerPeriod, waitingLanes.length);
      const periodLanes = waitingLanes.slice(startIdx, endIdx);

      if (periodLanes.length === 0) continue;

      const avgDuration =
        periodLanes.reduce((sum, l) => sum + Math.round(l.greenDuration), 0) /
        periodLanes.length;
      const periodDuration = Math.round(avgDuration * periodLanes.length);

      periods.push({
        periodNumber: periods.length + 1,
        title: `Period ${periods.length + 1} - Queue ${i + 1}`,
        status: i === 0 ? "upcoming" : "waiting",
        lanes: periodLanes,
        estimatedStartTime: cumulativeTime,
        totalDuration: periodDuration,
      });

      cumulativeTime += periodDuration + RELAXATION_TIME;
    }

    return periods;
  }, [laneCards]);

  const getSignalColor = (state: SignalState) => {
    switch (state) {
      case "green":
        return {
          bg: "bg-emerald-500/20",
          border: "border-emerald-500",
          text: "text-emerald-400",
          glow: "shadow-emerald-500/50",
        };
      case "yellow":
        return {
          bg: "bg-amber-500/20",
          border: "border-amber-500",
          text: "text-amber-400",
          glow: "shadow-amber-500/50",
        };
      case "red":
        return {
          bg: "bg-red-500/20",
          border: "border-red-500/50",
          text: "text-red-400",
          glow: "shadow-red-500/30",
        };
    }
  };

  return (
    <div className="flex flex-col gap-8 pb-10">
      {/* Hero Section */}
      <div className="glass-panel flex flex-col gap-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h1 className="mb-3 text-4xl font-bold tracking-tight">
              Live Traffic Signaling
            </h1>
            <p className="text-lg text-control-muted">
              Real-time signal optimization based on AI video analysis
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-6 py-3">
            <div className="h-3 w-3 animate-pulse rounded-full bg-emerald-400 shadow-lg shadow-emerald-500/50" />
            <span className="font-medium text-emerald-300">System Active</span>
          </div>
        </div>
      </div>

      {/* SECTION 1: Real-time Signal Status (Static for now - CCTV ready) */}
      <div className="glass-panel">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="mb-1 text-2xl font-semibold">
              Real-time Signaling Status
            </h2>
            <p className="text-sm text-control-muted">
              Live CCTV integration (Ready for future deployment)
            </p>
          </div>
          <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm text-blue-300">
            CCTV Integration Pending
          </div>
        </div>

        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-control-border border-t-emerald-500" />
          </div>
        ) : currentSignal ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-control-border bg-control-surface/30 p-6">
              <div className="mb-4 flex items-center gap-3">
                <Radio className="h-6 w-6 text-emerald-400" />
                <h3 className="text-lg font-semibold">Current Signal</h3>
              </div>
              <div className="grid gap-6 md:grid-cols-3">
                <div className="space-y-2">
                  <div className="text-sm text-control-muted">Active Lane</div>
                  <div className="text-2xl font-bold text-emerald-400">
                    {currentSignal.greenLane.toUpperCase()}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm text-control-muted">
                    Green Duration
                  </div>
                  <div className="text-2xl font-semibold">
                    {Math.round(currentSignal.greenDuration)}s
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm text-control-muted">Last Updated</div>
                  <div className="text-lg">
                    {format(new Date(currentSignal.decidedAt), "HH:mm:ss")}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-control-border">
            <Radio className="h-12 w-12 text-control-muted/50" />
            <p className="text-control-muted">Waiting for signal data...</p>
          </div>
        )}
      </div>

      {/* SECTION 2: Upload Analysis - Signal States per Lane */}
      <div className="glass-panel">
        <div className="mb-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex-1">
              <h2 className="mb-1 text-2xl font-semibold">
                Upload Analysis - Lane Signal States
              </h2>
              <p className="text-sm text-control-muted">
                Live signal allocation with real-time timers
              </p>
            </div>
            <div className="flex items-center gap-3">
              {completedUpload && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm">
                  <div className="font-medium text-emerald-300">
                    {completedUpload.displayName ||
                      completedUpload.siteLabel ||
                      "Active Upload"}
                  </div>
                  <div className="text-xs text-emerald-400/70">
                    {completedUpload.analysisType?.replace("_", " ") ||
                      "Analysis"}
                  </div>
                </div>
              )}
              {isDataStale && (
                <div className="flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-2 text-sm">
                  <AlertTriangle className="h-4 w-4 text-yellow-400" />
                  <div>
                    <div className="font-medium text-yellow-300">
                      Stale Data
                    </div>
                    <div className="text-xs text-yellow-400/70">
                      No updates for{" "}
                      {Math.round(
                        differenceInSeconds(
                          currentTime,
                          new Date(currentSignal?.decidedAt || new Date())
                        )
                      )}
                      s
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Signal Sequence Order */}
          {signalSequence.length > 0 && (
            <div className="mb-6 rounded-xl border border-control-border bg-control-surface/30 p-4">
              <div className="mb-3 flex items-center gap-2">
                <ArrowRightCircle className="h-5 w-5 text-blue-400" />
                <span className="font-semibold text-blue-400">
                  Recent Signal History (Last 10 Cycles)
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {signalSequence.map((laneId, idx) => {
                  const laneInfo = lanes.find((l) => l.id === laneId);
                  const label = laneInfo?.label || laneInfo?.alias || laneId;
                  const isActive = currentSignal?.greenLane === laneId;

                  return (
                    <div key={idx} className="flex items-center gap-2">
                      <div
                        className={`rounded-lg px-3 py-1.5 font-semibold ${
                          isActive
                            ? "bg-emerald-500/20 text-emerald-400 ring-2 ring-emerald-500"
                            : "bg-control-surface/50 text-control-muted"
                        }`}
                      >
                        {label}
                      </div>
                      {idx < signalSequence.length - 1 && (
                        <ArrowRight className="h-4 w-4 text-control-muted/50" />
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 text-xs text-control-muted">
                ⚠️ Note: Backend uses priority-based scheduling, not strict
                round-robin. High-traffic lanes may appear multiple times. This
                shows historical order, not guaranteed future sequence.
              </div>
            </div>
          )}

          {!completedUpload && (
            <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
              No completed uploads found. Upload a video to see lane analysis.
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="flex h-60 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-control-border border-t-emerald-500" />
          </div>
        ) : laneCards.length > 0 ? (
          <div>
            {/* Lane Signal Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {laneCards.map((card) => {
                const colors = getSignalColor(card.state);
                const signalTime = new Date(card.timestamp);
                const elapsedSeconds = differenceInSeconds(
                  currentTime,
                  signalTime
                );

                // Live countdown for green, count up for red wait time
                const greenRemaining =
                  card.state === "green"
                    ? Math.max(
                        0,
                        Math.round(card.greenDuration - elapsedSeconds)
                      )
                    : 0;
                const redWaitTime = card.state === "red" ? card.waitTime : 0;

                return (
                  <div
                    key={card.lane}
                    className={`rounded-2xl border-2 ${colors.border} ${colors.bg} p-6 shadow-lg ${colors.glow} transition-all`}
                  >
                    {/* Lane Header */}
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <div className="text-lg font-bold">{card.label}</div>
                        <div className="text-xs text-control-muted">
                          {card.lane}
                        </div>
                      </div>
                      <Circle
                        className={`h-8 w-8 ${
                          card.state === "green" ? "animate-pulse" : ""
                        } ${colors.text}`}
                        fill="currentColor"
                      />
                    </div>

                    {/* Signal State */}
                    <div className="mb-4">
                      <div className="mb-1 text-xs text-control-muted">
                        Current State
                      </div>
                      <div
                        className={`text-3xl font-bold uppercase ${colors.text}`}
                      >
                        {card.state}
                      </div>
                    </div>

                    {/* Green Countdown Timer */}
                    {card.state === "green" && (
                      <div className="mb-3">
                        <div className="mb-1 text-xs text-control-muted">
                          Time Remaining
                        </div>
                        <div className="flex items-baseline gap-2">
                          <div className="text-4xl font-bold tabular-nums text-emerald-400">
                            {greenRemaining}
                          </div>
                          <div className="text-lg text-emerald-400/70">
                            seconds
                          </div>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-control-border">
                          <div
                            className="h-full bg-emerald-500 transition-all duration-1000 ease-linear"
                            style={{
                              width: `${
                                (greenRemaining / card.greenDuration) * 100
                              }%`,
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Red Wait Timer */}
                    {card.state === "red" && (
                      <div className="mb-3">
                        <div className="mb-1 flex items-center gap-1 text-xs text-control-muted">
                          <span>Wait Time</span>
                          {card.isEstimated && (
                            <span
                              className="text-yellow-400"
                              title="Estimated based on round-robin assumption. Backend uses priority-based scheduling."
                            >
                              (est.)
                            </span>
                          )}
                        </div>
                        <div className="flex items-baseline gap-2">
                          <div className="text-4xl font-bold tabular-nums text-red-400">
                            {redWaitTime}
                          </div>
                          <div className="text-lg text-red-400/70">seconds</div>
                        </div>
                        <div className="mt-1 text-xs text-control-muted/70">
                          {card.isEstimated
                            ? "Estimated • Actual may vary based on traffic priority"
                            : "Waiting for green signal"}
                        </div>
                      </div>
                    )}

                    {/* Timestamp */}
                    <div className="border-t border-control-border/50 pt-3">
                      <div className="flex items-center gap-2 text-xs text-control-muted">
                        <Clock className="h-3 w-3" />
                        {format(new Date(card.timestamp), "HH:mm:ss")}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Signal Logic Explanation */}
            <div className="mt-6 space-y-3">
              <div className="rounded-xl border border-control-border bg-control-surface/20 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20">
                    <MapPin className="h-4 w-4 text-emerald-400" />
                  </div>
                  <div className="flex-1">
                    <div className="mb-1 font-semibold">
                      Priority-Based Signal Logic
                    </div>
                    <div className="text-sm text-control-muted">
                      The system uses{" "}
                      <span className="font-medium text-blue-400">
                        AI-powered priority scoring
                      </span>{" "}
                      to determine which lane gets green. Factors include:
                      vehicle count (60%), wait time (40%), traffic gaps, and
                      forecasted arrivals. When one lane shows{" "}
                      <span className="text-emerald-400 font-medium">
                        GREEN
                      </span>
                      , all others are{" "}
                      <span className="text-red-400 font-medium">RED</span>.
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="mb-1 font-semibold text-yellow-300">
                      Wait Time Estimation
                    </div>
                    <div className="text-sm text-yellow-400/80">
                      Wait times are estimated assuming round-robin rotation.
                      Actual times may vary based on dynamic priority scoring.
                      Maximum wait capped at {(lanes.length - 1) * 60}s for{" "}
                      {lanes.length} lanes (backend max green: 60s/lane).
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-60 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-control-border">
            <Video className="h-16 w-16 text-control-muted/50" />
            <div className="text-center">
              <p className="mb-1 font-medium text-control-muted">
                No lane data available
              </p>
              <p className="text-sm text-control-muted/70">
                Upload a video to start analyzing traffic signals
              </p>
            </div>
            <a
              href="/uploads"
              className="mt-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-emerald-400"
            >
              Go to Uploads
            </a>
          </div>
        )}
      </div>

      {/* How It Works */}
      <div className="glass-panel">
        <h2 className="mb-6 text-2xl font-semibold">How It Works</h2>
        <div className="grid gap-6 md:grid-cols-3">
          <div className="rounded-xl border border-control-border bg-control-surface/30 p-6">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/20">
              <Video className="h-6 w-6 text-blue-400" />
            </div>
            <h3 className="mb-2 text-lg font-semibold">1. Upload Video</h3>
            <p className="text-sm text-control-muted">
              Upload traffic camera footage from your junction (1-way, 2-way, or
              4-way)
            </p>
          </div>
          <div className="rounded-xl border border-control-border bg-control-surface/30 p-6">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/20">
              <MapPin className="h-6 w-6 text-purple-400" />
            </div>
            <h3 className="mb-2 text-lg font-semibold">2. AI Analysis</h3>
            <p className="text-sm text-control-muted">
              YOLOv8 detects vehicles, calculates wait times and priority scores
            </p>
          </div>
          <div className="rounded-xl border border-control-border bg-control-surface/30 p-6">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/20">
              <Radio className="h-6 w-6 text-emerald-400" />
            </div>
            <h3 className="mb-2 text-lg font-semibold">3. Smart Signaling</h3>
            <p className="text-sm text-control-muted">
              System determines which lane gets green light and optimal duration
            </p>
          </div>
        </div>
      </div>

      {/* CTA to Overview */}
      <div className="glass-panel bg-gradient-to-br from-emerald-500/10 to-blue-500/10">
        <div className="flex flex-col items-center gap-4 text-center">
          <h2 className="text-2xl font-semibold">Want Detailed Analytics?</h2>
          <p className="max-w-2xl text-control-muted">
            Visit the Overview page for junction visualization, vehicle
            breakdowns, priority analysis, and complete signal history.
          </p>
          <a
            href="/overview"
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 font-semibold text-white transition-all hover:bg-emerald-400 hover:shadow-lg hover:shadow-emerald-500/20"
          >
            Explore Overview
            <ArrowRight className="h-5 w-5" />
          </a>
        </div>
      </div>
    </div>
  );
}
