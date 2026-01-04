import { useState, useEffect, useMemo, useRef } from "react";
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
  CheckCircle2,
  PlayCircle,
  Navigation,
  Info,
  HelpCircle,
  Lightbulb,
  Download,
  Upload,
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
  const [showAlert, setShowAlert] = useState(false);
  const [alertType, setAlertType] = useState<
    "analysis" | "signaling" | "entry"
  >("entry");
  const [hasShownEntryAlert, setHasShownEntryAlert] = useState(false);
  const [showHelpGuide, setShowHelpGuide] = useState(false);
  const [showAnalysisCompleteAlert, setShowAnalysisCompleteAlert] =
    useState(false);
  const [hasShownAnalysisAlert, setHasShownAnalysisAlert] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const isLoading = isDashboardLoading || isUploadsLoading;

  // Get the most recent completed upload
  const completedUpload = uploads?.find((run) => run.status === "completed");

  // Get current signal state from dashboard
  const currentSignal = dashboard?.history?.[dashboard.history.length - 1];
  const lanes = dashboard?.status?.lanes || dashboard?.context?.lanes || [];

  // Get live vehicle counts per lane (for bar charts)
  const laneObservations = dashboard?.observations || [];
  const getLaneVehicleBreakdown = (laneId: string) => {
    const observation = laneObservations.find((obs) => obs.lane === laneId);
    return observation?.classBreakdown || {};
  };

  // Live timer - updates every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Alert system - show entry alert on first load
  useEffect(() => {
    if (!hasShownEntryAlert && currentSignal) {
      setAlertType("entry");
      setShowAlert(true);
      setHasShownEntryAlert(true);

      // Auto-dismiss after 4 seconds
      const timer = setTimeout(() => {
        setShowAlert(false);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [currentSignal, hasShownEntryAlert]);

  // Show alert when signaling starts (green lane changes)
  useEffect(() => {
    if (currentSignal && hasShownEntryAlert) {
      setAlertType("signaling");
      setShowAlert(true);

      const timer = setTimeout(() => {
        setShowAlert(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [currentSignal?.greenLane]);

  // Analysis Complete Alert - Check if analysis finished
  useEffect(() => {
    if (
      completedUpload &&
      !hasShownAnalysisAlert &&
      dashboard?.history &&
      dashboard.history.length > 0
    ) {
      // Check if analysis has completed (no new signals for 30 seconds or more)
      const lastSignalTime =
        dashboard.history[dashboard.history.length - 1]?.decidedAt;
      if (lastSignalTime) {
        const ageSeconds = differenceInSeconds(
          new Date(),
          new Date(lastSignalTime)
        );
        if (ageSeconds > 30) {
          setShowAnalysisCompleteAlert(true);
          setHasShownAnalysisAlert(true);

          // Play sound alert
          if (audioRef.current) {
            audioRef.current
              .play()
              .catch((e) => console.log("Audio play failed:", e));
          }
        }
      }
    }
  }, [completedUpload, dashboard?.history, hasShownAnalysisAlert]);

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

  // Determine junction type and realistic traffic light display
  const junctionType = completedUpload?.analysisType || "four_way"; // one_way, two_way, four_way
  const trafficLightCount =
    junctionType === "one_way" ? 1 : junctionType === "two_way" ? 2 : 4; // four_way

  // Traffic Light Component
  const TrafficLight = ({
    state,
    label,
    size = "large",
  }: {
    state: SignalState;
    label: string;
    size?: "large" | "small";
  }) => {
    const isLarge = size === "large";
    const lightSize = isLarge ? "h-16 w-16" : "h-8 w-8";
    const containerPadding = isLarge ? "p-6" : "p-3";

    return (
      <div
        className={`flex flex-col items-center gap-3 rounded-xl border-2 border-control-border bg-gradient-to-b from-gray-800 to-gray-900 ${containerPadding} shadow-2xl`}
      >
        {isLarge && (
          <div className="text-xs font-bold uppercase tracking-wider text-control-muted">
            {label}
          </div>
        )}

        <div className="flex flex-col gap-2">
          {/* Red Light */}
          <div
            className={`rounded-full border-2 ${lightSize} transition-all duration-300 ${
              state === "red"
                ? "border-red-500 bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.8)]"
                : "border-gray-700 bg-gray-800/50"
            }`}
          />

          {/* Yellow Light */}
          <div
            className={`rounded-full border-2 ${lightSize} transition-all duration-300 ${
              state === "yellow"
                ? "border-yellow-500 bg-yellow-500 shadow-[0_0_20px_rgba(234,179,8,0.8)]"
                : "border-gray-700 bg-gray-800/50"
            }`}
          />

          {/* Green Light */}
          <div
            className={`rounded-full border-2 ${lightSize} transition-all duration-300 ${
              state === "green"
                ? "border-emerald-500 bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.8)] animate-pulse"
                : "border-gray-700 bg-gray-800/50"
            }`}
          />
        </div>

        {!isLarge && (
          <div className="text-[10px] font-semibold text-control-muted">
            {label}
          </div>
        )}
      </div>
    );
  };

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
    <div className="flex flex-col gap-6 pb-10">
      {/* Hidden Audio Element for Alert Sound */}
      <audio ref={audioRef} preload="auto">
        <source
          src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHGS57OihUBELTKXh8bllHAU2jdXzzn0pBSd4yO/glEILElyx6OyrWBQLSKLf87ZnHwU0iM/z1YU2BhxjuezpoVARDEyk4fG5ZRwFNo3V8859KQUneMjv4JRCCxJcseju"
          type="audio/wav"
        />
      </audio>

      {/* Analysis Complete Full-Page Alert Modal */}
      {showAnalysisCompleteAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg animate-in zoom-in-95 duration-300">
            <div className="rounded-2xl border-2 border-emerald-500 bg-gradient-to-br from-emerald-500/20 to-green-500/20 p-8 shadow-2xl backdrop-blur-xl">
              <div className="mb-6 flex items-center justify-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/30 animate-pulse">
                  <CheckCircle2 className="h-12 w-12 text-emerald-400" />
                </div>
              </div>

              <h2 className="mb-3 text-center text-3xl font-bold text-white">
                🎉 Analysis Complete!
              </h2>

              <p className="mb-6 text-center text-control-muted">
                Traffic signal optimization has finished processing. You can
                download the report or upload a new video to continue.
              </p>

              <div className="flex flex-col gap-3">
                <a
                  href="/api/media/output"
                  download
                  className="flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-6 py-3 font-semibold text-white transition-all hover:bg-emerald-400"
                >
                  <Download className="h-5 w-5" />
                  Download Analysis Report
                </a>

                <a
                  href="/uploads"
                  className="flex items-center justify-center gap-2 rounded-lg border-2 border-blue-500/50 bg-blue-500/20 px-6 py-3 font-semibold text-blue-300 transition-all hover:bg-blue-500/30"
                >
                  <Upload className="h-5 w-5" />
                  Upload New Video
                </a>

                <button
                  onClick={() => setShowAnalysisCompleteAlert(false)}
                  className="mt-2 text-sm text-control-muted hover:text-white"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Alert Toast */}
      {showAlert && (
        <div className="fixed right-6 top-6 z-50 animate-in slide-in-from-top-5 duration-300">
          <div
            className={`flex items-center gap-3 rounded-xl border-2 px-6 py-4 shadow-2xl ${
              alertType === "entry"
                ? "border-blue-500 bg-blue-500/20 backdrop-blur-xl"
                : alertType === "signaling"
                ? "border-emerald-500 bg-emerald-500/20 backdrop-blur-xl"
                : "border-purple-500 bg-purple-500/20 backdrop-blur-xl"
            }`}
          >
            {alertType === "entry" && (
              <Navigation className="h-6 w-6 text-blue-400" />
            )}
            {alertType === "signaling" && (
              <PlayCircle className="h-6 w-6 text-emerald-400" />
            )}
            {alertType === "analysis" && (
              <CheckCircle2 className="h-6 w-6 text-purple-400" />
            )}

            <div>
              <div className="font-bold text-white">
                {alertType === "entry" && "Welcome to Live Signaling"}
                {alertType === "signaling" && "Signal Changed"}
                {alertType === "analysis" && "Analysis Complete"}
              </div>
              <div className="text-sm text-white/70">
                {alertType === "entry" && "Real-time traffic control is active"}
                {alertType === "signaling" &&
                  `${currentSignal?.greenLane.toUpperCase()} lane now green`}
                {alertType === "analysis" &&
                  "Traffic analysis completed successfully"}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Compact Header */}
      <div className="glass-panel">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="mb-1 text-3xl font-bold tracking-tight">
              Live Signaling
            </h1>
            <p className="text-sm text-control-muted">
              Real-time AI traffic control
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Help Guide Button */}
            <button
              onClick={() => setShowHelpGuide(!showHelpGuide)}
              className="flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm font-medium text-blue-300 transition-all hover:bg-blue-500/20"
            >
              <HelpCircle className="h-4 w-4" />
              Quick Guide
            </button>
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2">
              <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400 shadow-lg shadow-emerald-500/50" />
              <span className="text-sm font-semibold text-emerald-300">
                Active
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Help Guide Panel */}
      {showHelpGuide && (
        <div className="glass-panel border-2 border-blue-500/30 bg-gradient-to-br from-blue-500/10 to-purple-500/10">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-yellow-400" />
              <h3 className="text-lg font-bold">Quick Start Guide</h3>
            </div>
            <button
              onClick={() => setShowHelpGuide(false)}
              className="text-sm text-control-muted hover:text-white"
            >
              Close
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-control-border bg-control-surface/50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/20 text-sm font-bold text-emerald-400">
                  1
                </div>
                <h4 className="font-semibold">Understanding Traffic Lights</h4>
              </div>
              <p className="text-sm text-control-muted">
                Large traffic lights at the top show the current state of each
                lane.
                <span className="font-semibold text-emerald-400">
                  {" "}
                  Green = Active (vehicles moving)
                </span>
                ,
                <span className="font-semibold text-red-400">
                  {" "}
                  Red = Waiting
                </span>
                .
              </p>
            </div>

            <div className="rounded-lg border border-control-border bg-control-surface/50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/20 text-sm font-bold text-blue-400">
                  2
                </div>
                <h4 className="font-semibold">Live vs Snapshot</h4>
              </div>
              <p className="text-sm text-control-muted">
                <span className="font-semibold">🔴 LIVE Analysis</span> shows
                real-time AI detection (bars grow as vehicles are detected).
                <span className="font-semibold">📸 Snapshot</span> shows frozen
                data from when the lane turned red.
              </p>
            </div>

            <div className="rounded-lg border border-control-border bg-control-surface/50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-500/20 text-sm font-bold text-purple-400">
                  3
                </div>
                <h4 className="font-semibold">Smart Alternation</h4>
              </div>
              <p className="text-sm text-control-muted">
                The system uses AI to prioritize lanes based on vehicle count
                (60%) and wait time (40%). Same lane{" "}
                <span className="font-semibold">never repeats twice</span> in a
                row (realistic traffic flow).
              </p>
            </div>

            <div className="rounded-lg border border-control-border bg-control-surface/50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-yellow-500/20 text-sm font-bold text-yellow-400">
                  4
                </div>
                <h4 className="font-semibold">Vehicle Types</h4>
              </div>
              <div className="text-sm text-control-muted">
                🚗 Cars (Blue) • 🚌 Buses (Purple) • 🚚 Trucks (Orange) • 🏍️
                Motorcycles (Yellow) • 🚶 Pedestrians (Green)
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Traffic Light Control Center - MAIN ATTRACTION */}
      <div className="glass-panel">
        <div className="mb-4 text-center">
          <h2 className="mb-1 text-2xl font-bold">
            Traffic Light Control Center
          </h2>
          <p className="text-sm text-control-muted">
            {junctionType === "one_way" &&
              "Single Lane Junction • 1 Traffic Light"}
            {junctionType === "two_way" &&
              "Two-Way Junction • 2 Traffic Lights"}
            {junctionType === "four_way" &&
              "Four-Way Intersection • 4 Traffic Lights"}
          </p>
        </div>

        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-control-border border-t-emerald-500" />
          </div>
        ) : laneCards.length > 0 ? (
          <div className="space-y-6">
            {/* Large Traffic Lights Display - Only show realistic count */}
            <div className="flex justify-center gap-8">
              {laneCards.slice(0, trafficLightCount).map((card) => (
                <TrafficLight
                  key={card.lane}
                  state={card.state}
                  label={card.label}
                  size="large"
                />
              ))}
            </div>

            {/* Compact Lane Info Cards - Show all lanes with data */}
            <div
              className={`grid gap-3 ${
                trafficLightCount === 1
                  ? "md:grid-cols-1 max-w-md mx-auto"
                  : trafficLightCount === 2
                  ? "md:grid-cols-2"
                  : "md:grid-cols-2 lg:grid-cols-4"
              }`}
            >
              {laneCards.map((card) => {
                const colors = getSignalColor(card.state);
                const signalTime = new Date(card.timestamp);
                const elapsedSeconds = differenceInSeconds(
                  currentTime,
                  signalTime
                );
                const greenRemaining =
                  card.state === "green"
                    ? Math.max(
                        0,
                        Math.round(card.greenDuration - elapsedSeconds)
                      )
                    : 0;
                const redWaitTime =
                  card.state === "red" ? Math.round(card.waitTime) : 0;

                // Get live vehicle breakdown for this lane
                const vehicleBreakdown = getLaneVehicleBreakdown(card.lane);
                const vehicleTypes = [
                  { name: "car", icon: "🚗", color: "bg-blue-500" },
                  { name: "bus", icon: "🚌", color: "bg-purple-500" },
                  { name: "truck", icon: "🚚", color: "bg-orange-500" },
                  { name: "motorcycle", icon: "🏍️", color: "bg-yellow-500" },
                  { name: "person", icon: "🚶", color: "bg-green-500" },
                ];

                // Get max count for scaling
                const maxCount = Math.max(
                  ...Object.values(vehicleBreakdown),
                  1
                );

                return (
                  <div
                    key={card.lane}
                    className={`rounded-lg border ${colors.border} ${
                      colors.bg
                    } p-4 transition-all ${
                      card.state === "green" ? "ring-2 ring-emerald-500/50" : ""
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <div>
                        <div className="font-bold">{card.label}</div>
                        <div className="text-xs text-control-muted">
                          {card.lane}
                        </div>
                      </div>
                      <Circle
                        className={`h-6 w-6 ${
                          card.state === "green" ? "animate-pulse" : ""
                        } ${colors.text}`}
                        fill="currentColor"
                      />
                    </div>

                    <div
                      className={`text-lg font-bold uppercase ${colors.text}`}
                    >
                      {card.state}
                    </div>

                    {card.state === "green" ? (
                      <div className="mt-2">
                        <div className="flex items-baseline gap-1">
                          <div className="text-2xl font-bold tabular-nums text-emerald-400">
                            {greenRemaining}
                          </div>
                          <div className="text-sm text-emerald-400/70">sec</div>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-control-border">
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
                    ) : (
                      <div className="mt-2 text-xs text-control-muted">
                        Wait:{" "}
                        <span className="font-semibold text-red-400">
                          {redWaitTime}s
                        </span>{" "}
                        (est.)
                      </div>
                    )}

                    {/* LIVE BAR CHART - Animated for GREEN, Frozen for RED */}
                    <div className="mt-3 border-t border-control-border/30 pt-3">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-control-muted">
                            {card.state === "green"
                              ? "🔴 LIVE Analysis"
                              : "📸 Snapshot"}
                          </div>
                          <div className="group relative">
                            <Info className="h-3 w-3 text-control-muted/50 hover:text-control-muted cursor-help" />
                            <div className="invisible group-hover:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 rounded-lg border border-control-border bg-control-surface p-2 text-[10px] text-control-muted shadow-xl z-50">
                              {card.state === "green"
                                ? "AI is actively detecting vehicles in real-time. Bars grow as more vehicles are detected."
                                : "Frozen snapshot of vehicle counts when this lane last had the green signal."}
                            </div>
                          </div>
                        </div>
                        <div className="text-[10px] text-control-muted">
                          {Object.values(vehicleBreakdown).reduce(
                            (a, b) => a + b,
                            0
                          )}{" "}
                          total
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        {vehicleTypes.map((type) => {
                          const count = vehicleBreakdown[type.name] || 0;
                          const percentage =
                            maxCount > 0 ? (count / maxCount) * 100 : 0;

                          return (
                            <div
                              key={type.name}
                              className="flex items-center gap-2"
                            >
                              <div className="w-5 text-xs">{type.icon}</div>
                              <div className="flex-1">
                                <div className="h-3 overflow-hidden rounded-full bg-control-border/30">
                                  <div
                                    className={`h-full ${type.color} ${
                                      card.state === "green"
                                        ? "transition-all duration-500"
                                        : ""
                                    }`}
                                    style={{ width: `${percentage}%` }}
                                  />
                                </div>
                              </div>
                              <div
                                className={`w-6 text-right text-xs font-bold tabular-nums ${
                                  card.state === "green"
                                    ? "text-emerald-400"
                                    : "text-control-muted"
                                }`}
                              >
                                {count}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-control-border p-12">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-500/10">
              <Video className="h-10 w-10 text-blue-400" />
            </div>
            <div className="text-center">
              <h3 className="mb-2 text-lg font-semibold">
                No Traffic Data Yet
              </h3>
              <p className="mb-4 max-w-md text-sm text-control-muted">
                Upload a traffic video to start AI analysis and see live signal
                control in action
              </p>
              <div className="flex flex-col gap-2 text-xs text-control-muted">
                <div className="flex items-center justify-center gap-2">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-[10px] font-bold text-emerald-400">
                    1
                  </div>
                  <span>Go to Uploads page</span>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-[10px] font-bold text-emerald-400">
                    2
                  </div>
                  <span>Upload your traffic camera footage</span>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-[10px] font-bold text-emerald-400">
                    3
                  </div>
                  <span>Watch AI analyze and optimize signals</span>
                </div>
              </div>
            </div>
            <a
              href="/uploads"
              className="mt-2 inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-emerald-400"
            >
              <Video className="h-4 w-4" />
              Upload Traffic Video
            </a>
          </div>
        )}
      </div>

      {/* Current Signal Summary - Compact with Info */}
      {currentSignal && (
        <div className="glass-panel">
          <div className="mb-3 flex items-center gap-2">
            <h3 className="text-sm font-semibold text-control-muted">
              Current Signal Status
            </h3>
            <div className="group relative">
              <Info className="h-4 w-4 text-control-muted/50 hover:text-control-muted cursor-help" />
              <div className="invisible group-hover:visible absolute bottom-full left-0 mb-2 w-64 rounded-lg border border-control-border bg-control-surface p-3 text-xs text-control-muted shadow-xl z-50">
                <p className="mb-1 font-semibold">How It Works:</p>
                <p>
                  System analyzes ALL lanes every cycle and gives green to the
                  highest priority lane (that didn't just have green). Priority
                  = vehicles (60%) + wait time (40%).
                </p>
              </div>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-control-border bg-control-surface/30 p-4">
              <div className="mb-1 text-xs text-control-muted">Active Lane</div>
              <div className="text-xl font-bold text-emerald-400">
                {currentSignal.greenLane.toUpperCase()}
              </div>
            </div>
            <div className="rounded-lg border border-control-border bg-control-surface/30 p-4">
              <div className="mb-1 text-xs text-control-muted">
                Green Duration
              </div>
              <div className="text-xl font-semibold">
                {Math.round(currentSignal.greenDuration)}s
              </div>
            </div>
            <div className="rounded-lg border border-control-border bg-control-surface/30 p-4">
              <div className="mb-1 text-xs text-control-muted">
                Last Updated
              </div>
              <div className="text-lg">
                {format(new Date(currentSignal.decidedAt), "HH:mm:ss")}
              </div>
            </div>
          </div>
        </div>
      )}

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

          {/* Period Explanation */}
          {laneCards.length > 0 && (
            <div className="mb-4 rounded-lg border border-blue-500/30 bg-blue-500/5 p-4">
              <div className="mb-2 text-sm font-semibold text-blue-400">
                📊 Signal Release Periods
              </div>
              <div className="text-xs text-control-muted">
                <span className="font-medium text-emerald-400">
                  Active Period:
                </span>{" "}
                Lane currently clearing traffic{" "}
                <span className="text-control-muted/70">→</span>{" "}
                <span className="font-medium text-blue-400">
                  Next in Queue:
                </span>{" "}
                Waiting lanes (ordered by priority)
                <span className="text-control-muted/70">
                  {" "}
                  → 10 sec relaxation time between releases
                </span>
              </div>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="flex h-60 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-control-border border-t-emerald-500" />
          </div>
        ) : laneCards.length > 0 ? (
          <div>
            {/* Lane Signal Cards with Period Labels */}
            <div className="space-y-6">
              {/* Active Period */}
              {laneCards.some((c) => c.state === "green") && (
                <div>
                  <div className="mb-3 flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-sm font-bold text-emerald-400">
                      1
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-emerald-400">
                        Active Release Period - Clearing Traffic
                      </div>
                      <div className="text-xs text-control-muted">
                        Lane currently processing vehicles
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    \n{" "}
                    {laneCards
                      .filter((c) => c.state === "green")
                      .map((card) => {
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
                        const redWaitTime =
                          card.state === "red" ? Math.round(card.waitTime) : 0;

                        return (
                          <div
                            key={card.lane}
                            className={`rounded-2xl border-2 ${colors.border} ${colors.bg} p-6 shadow-lg ${colors.glow} transition-all`}
                          >
                            {/* Lane Header */}
                            <div className="mb-4 flex items-center justify-between">
                              <div>
                                <div className="text-lg font-bold">
                                  {card.label}
                                </div>
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
                                    sec
                                  </div>
                                </div>
                                <div className="mt-2 h-2 overflow-hidden rounded-full bg-control-border">
                                  <div
                                    className="h-full bg-emerald-500 transition-all duration-1000 ease-linear"
                                    style={{
                                      width: `${
                                        (greenRemaining / card.greenDuration) *
                                        100
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
                                  <div className="text-lg text-red-400/70">
                                    sec
                                  </div>
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
                </div>
              )}

              {/* Queued Lanes Period */}
              {laneCards.some((c) => c.state === "red") && (
                <div>
                  <div className="mb-3 flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/20 text-sm font-bold text-blue-400">
                      2
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-blue-400">
                        Waiting Period - Queued for Release
                      </div>
                      <div className="text-xs text-control-muted">
                        Lanes waiting for green signal (10 sec relaxation
                        between periods)
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {laneCards
                      .filter((c) => c.state === "red")
                      .map((card) => {
                        const colors = getSignalColor(card.state);
                        const signalTime = new Date(card.timestamp);
                        const elapsedSeconds = differenceInSeconds(
                          currentTime,
                          signalTime
                        );

                        const redWaitTime =
                          card.state === "red" ? Math.round(card.waitTime) : 0;

                        return (
                          <div
                            key={card.lane}
                            className={`rounded-2xl border-2 ${colors.border} ${colors.bg} p-6 shadow-lg ${colors.glow} transition-all`}
                          >
                            {/* Lane Header */}
                            <div className="mb-4 flex items-center justify-between">
                              <div>
                                <div className="text-lg font-bold">
                                  {card.label}
                                </div>
                                <div className="text-xs text-control-muted">
                                  {card.lane}
                                </div>
                              </div>
                              <Circle
                                className={`h-8 w-8 ${colors.text}`}
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

                            {/* Red Wait Timer */}
                            <div className="mb-3">
                              <div className="mb-1 flex items-center gap-1 text-xs text-control-muted">
                                <span>Wait Time</span>
                                {card.isEstimated && (
                                  <span className="text-yellow-400">
                                    (est.)
                                  </span>
                                )}
                              </div>
                              <div className="flex items-baseline gap-2">
                                <div className="text-4xl font-bold tabular-nums text-red-400">
                                  {redWaitTime}
                                </div>
                                <div className="text-lg text-red-400/70">
                                  sec
                                </div>
                              </div>
                              <div className="mt-1 text-xs text-control-muted/70">
                                {card.isEstimated
                                  ? "Estimated • Varies by priority"
                                  : "Waiting for green signal"}
                              </div>
                            </div>

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
                </div>
              )}
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

      {/* How It Works - Compact */}
      <div className="glass-panel">
        <h2 className="mb-4 text-xl font-semibold">How It Works</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-control-border bg-control-surface/30 p-4">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/20">
              <Video className="h-5 w-5 text-blue-400" />
            </div>
            <h3 className="mb-1 font-semibold">Upload Video</h3>
            <p className="text-xs text-control-muted">
              Traffic camera footage from your junction
            </p>
          </div>
          <div className="rounded-lg border border-control-border bg-control-surface/30 p-4">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/20">
              <MapPin className="h-5 w-5 text-purple-400" />
            </div>
            <h3 className="mb-1 font-semibold">AI Analysis</h3>
            <p className="text-xs text-control-muted">
              YOLOv8 detects vehicles and calculates priorities
            </p>
          </div>
          <div className="rounded-lg border border-control-border bg-control-surface/30 p-4">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/20">
              <Radio className="h-5 w-5 text-emerald-400" />
            </div>
            <h3 className="mb-1 font-semibold">Smart Signaling</h3>
            <p className="text-xs text-control-muted">
              Optimal lane selection and duration
            </p>
          </div>
        </div>
      </div>

      {/* CTA - Compact */}
      <div className="glass-panel bg-gradient-to-br from-emerald-500/10 to-blue-500/10">
        <div className="flex flex-col items-center gap-3 text-center">
          <h2 className="text-xl font-semibold">Detailed Analytics</h2>
          <p className="max-w-xl text-sm text-control-muted">
            View junction visualization, vehicle breakdowns, and complete signal
            history
          </p>
          <a
            href="/overview"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-emerald-400"
          >
            Explore Overview
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </div>
  );
}
