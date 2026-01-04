import { useMemo, useState } from "react";
import { Map as MapIcon, ChevronDown } from "lucide-react";
import type { DashboardData, LaneDescriptor } from "../../types/dashboard";
import { formatLaneLabel } from "../../utils/laneLabels";
import { Panel } from "../common/Panel";
import { SkeletonLaneMap } from "../common/Skeleton";

type Orientation =
  | "north"
  | "south"
  | "east"
  | "west"
  | "north-east"
  | "north-west"
  | "south-east"
  | "south-west"
  | "center";

const orientationFallback: Orientation[] = [
  "north",
  "east",
  "south",
  "west",
  "north-east",
  "south-east",
  "south-west",
  "north-west",
  "center",
];

const orientationPlacement: Record<Orientation, string> = {
  north: "col-start-2 row-start-1 justify-self-center",
  south: "col-start-2 row-start-3 justify-self-center",
  east: "col-start-3 row-start-2 self-center justify-self-start",
  west: "col-start-1 row-start-2 self-center justify-self-end",
  "north-east": "col-start-3 row-start-1 self-end",
  "north-west": "col-start-1 row-start-1 self-end justify-self-end",
  "south-east": "col-start-3 row-start-3 self-start",
  "south-west": "col-start-1 row-start-3 self-start justify-self-end",
  center: "col-start-2 row-start-2 self-center justify-self-center",
};

const orientationDetectionOrder: Orientation[] = [
  "north-east",
  "north-west",
  "south-east",
  "south-west",
  "north",
  "east",
  "south",
  "west",
  "center",
];

const orientationPatterns: Record<Orientation, RegExp[]> = {
  "north-east": [/\bnorth\s*east\b/, /\bnortheast\b/, /\bne\b/],
  "north-west": [/\bnorth\s*west\b/, /\bnorthwest\b/, /\bnw\b/],
  "south-east": [/\bsouth\s*east\b/, /\bsoutheast\b/, /\bse\b/],
  "south-west": [/\bsouth\s*west\b/, /\bsouthwest\b/, /\bsw\b/],
  north: [/\bnorth\b/, /\bnorthbound\b/, /\bnb\b/],
  east: [/\beast\b/, /\beastbound\b/, /\beb\b/],
  south: [/\bsouth\b/, /\bsouthbound\b/, /\bsb\b/],
  west: [/\bwest\b/, /\bwestbound\b/, /\bwb\b/],
  center: [/\bcenter\b/, /\bcentral\b/, /\ball lanes\b/],
};

function detectOrientationFromTokens(
  values: Array<string | undefined>
): Orientation | undefined {
  for (const orientation of orientationDetectionOrder) {
    const patterns = orientationPatterns[orientation];
    for (const value of values) {
      if (!value) {
        continue;
      }
      const normalized = value
        .toLowerCase()
        .replace(/[_-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!normalized.length) {
        continue;
      }
      if (patterns.some((pattern) => pattern.test(normalized))) {
        return orientation;
      }
    }
  }
  return undefined;
}

const stateStyles = {
  green: {
    dot: "bg-severity-calm",
    text: "text-severity-calm",
    label: "Go",
  },
  yellow: {
    dot: "bg-severity-caution",
    text: "text-severity-caution",
    label: "Prepare",
  },
  red: {
    dot: "bg-severity-critical",
    text: "text-severity-critical",
    label: "Hold",
  },
  unknown: {
    dot: "bg-white/40",
    text: "text-white/60",
    label: "Unknown",
  },
} as const;

type SignalStateKey = keyof typeof stateStyles;

function normalizeSignalState(
  value: unknown,
  fallback: SignalStateKey
): SignalStateKey {
  if (typeof value === "string") {
    const key = value.toLowerCase() as SignalStateKey;
    if (Object.prototype.hasOwnProperty.call(stateStyles, key)) {
      return key;
    }
  }
  return fallback;
}

function fallbackOrientation(
  id: string,
  label: string,
  index: number
): Orientation {
  const source = `${id} ${label}`.toLowerCase();
  if (
    source.includes("north east") ||
    source.includes("northeast") ||
    source.includes("ne")
  ) {
    return "north-east";
  }
  if (
    source.includes("north west") ||
    source.includes("northwest") ||
    source.includes("nw")
  ) {
    return "north-west";
  }
  if (
    source.includes("south east") ||
    source.includes("southeast") ||
    source.includes("se")
  ) {
    return "south-east";
  }
  if (
    source.includes("south west") ||
    source.includes("southwest") ||
    source.includes("sw")
  ) {
    return "south-west";
  }
  if (source.includes("north") || source.includes("nb")) {
    return "north";
  }
  if (source.includes("south") || source.includes("sb")) {
    return "south";
  }
  if (source.includes("east") || source.includes("eb")) {
    return "east";
  }
  if (source.includes("west") || source.includes("wb")) {
    return "west";
  }
  return orientationFallback[index % orientationFallback.length] ?? "center";
}

interface LaneMapPanelProps {
  dashboard: DashboardData;
}

export function LaneMapPanel({ dashboard }: LaneMapPanelProps) {
  const [tableOpen, setTableOpen] = useState(true);
  const { context, observations, status } = dashboard;
  const laneAliases = context.laneAliases ?? status.laneAliases ?? {};
  const laneDescriptorMap = useMemo(() => {
    const map = new Map<string, LaneDescriptor>();
    context.lanes?.forEach((descriptor) => {
      map.set(descriptor.id, descriptor);
      if (descriptor.original) {
        map.set(descriptor.original, descriptor);
      }
      if (descriptor.alias) {
        map.set(descriptor.alias, descriptor);
      }
      if (descriptor.label) {
        map.set(descriptor.label, descriptor);
      }
    });
    return map;
  }, [context.lanes]);

  const laneOrderMap = useMemo(() => {
    const descriptors = context.lanes;
    if (!descriptors || descriptors.length === 0) {
      return new Map<string, Orientation>();
    }
    const sorted = [...descriptors].sort((a, b) => {
      const aOrder = typeof a.order === "number" ? a.order : 0;
      const bOrder = typeof b.order === "number" ? b.order : 0;
      return aOrder - bOrder;
    });
    const entries: Array<[string, Orientation]> = [];
    sorted.forEach((descriptor, index) => {
      const orientation =
        orientationFallback[index % orientationFallback.length] ?? "center";
      entries.push([descriptor.id, orientation]);
      if (descriptor.original) {
        entries.push([descriptor.original, orientation]);
      }
      if (descriptor.alias) {
        entries.push([descriptor.alias, orientation]);
      }
      if (descriptor.label) {
        entries.push([descriptor.label, orientation]);
      }
    });
    return new Map<string, Orientation>(entries);
  }, [context.lanes]);

  const laneSummaries = useMemo(() => {
    const maxVehicles = Math.max(...observations.map((o) => o.vehicleCount), 1);
    const maxWaitTime = Math.max(...observations.map((o) => o.waitTime), 1);

    return observations.map((lane, index) => {
      const label = formatLaneLabel(lane.lane, laneAliases, lane.label);
      const fallbackState: SignalStateKey =
        status.currentGreen === lane.lane ? "green" : "red";
      const signalState = normalizeSignalState(
        status.signalStates?.[lane.lane],
        fallbackState
      );
      const style = stateStyles[signalState] ?? stateStyles.unknown;
      const descriptor =
        laneDescriptorMap.get(lane.lane) ?? laneDescriptorMap.get(label);
      const orientationFromTokens = detectOrientationFromTokens([
        lane.lane,
        label,
        laneAliases[lane.lane],
        context.directions?.[index],
        status.directions?.[index],
        descriptor?.alias,
        descriptor?.label,
        descriptor?.original,
      ]);
      const orientationFromOrder =
        (descriptor && laneOrderMap.get(descriptor.id)) ??
        (descriptor?.original
          ? laneOrderMap.get(descriptor.original)
          : undefined) ??
        laneOrderMap.get(lane.lane) ??
        laneOrderMap.get(label);
      const orientation =
        orientationFromTokens ??
        orientationFromOrder ??
        fallbackOrientation(lane.lane, label, index);

      // Calculate congestion level (0-1)
      const vehicleRatio = lane.vehicleCount / maxVehicles;
      const waitRatio = lane.waitTime / maxWaitTime;
      const congestionLevel = vehicleRatio * 0.6 + waitRatio * 0.4;

      // Generate heatmap color
      const getHeatmapColor = (level: number) => {
        if (level < 0.3) return "rgba(34, 197, 94, 0.3)"; // green
        if (level < 0.6) return "rgba(251, 191, 36, 0.4)"; // amber
        return "rgba(239, 68, 68, 0.5)"; // red
      };

      return {
        id: lane.lane,
        label,
        vehicleCount: lane.vehicleCount,
        waitTime: lane.waitTime,
        forecast: lane.forecast,
        signalState,
        style,
        orientation,
        trend: lane.trend,
        congestionLevel,
        heatmapColor: getHeatmapColor(congestionLevel),
      };
    });
  }, [
    context.directions,
    laneAliases,
    laneDescriptorMap,
    laneOrderMap,
    observations,
    status.currentGreen,
    status.directions,
    status.signalStates,
  ]);

  return (
    <Panel accent="neutral" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-severity-info">
            <MapIcon className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-white/70">
              Junction layout
            </p>
            <p className="text-xs text-white/50">
              Overlay combines live detections with current signal phases
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setTableOpen((open) => !open)}
          className="group inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs uppercase tracking-[0.3em] text-white/70 transition hover:border-white/30 hover:text-white"
        >
          Lanes table
          <ChevronDown
            className={`h-4 w-4 transition-transform duration-200 ${
              tableOpen ? "rotate-180" : "rotate-0"
            }`}
          />
        </button>
      </div>
      <div className="grid gap-6 xl:grid-cols-[2fr,1fr]">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-control-surfaceMuted/70 p-6">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(60,224,195,0.08),transparent_65%)]" />
          <div className="relative mx-auto aspect-square max-w-[420px]">
            <div className="absolute inset-8 rounded-[40px] border border-white/10 bg-black/20" />
            <div className="absolute inset-[28%] rounded-3xl border border-white/10 bg-black/30 shadow-inner" />
            <div className="relative grid h-full grid-cols-3 grid-rows-3 gap-2 p-4">
              {laneSummaries.map((lane) => {
                const placement =
                  orientationPlacement[lane.orientation] ??
                  orientationPlacement.center;
                return (
                  <div
                    key={lane.id}
                    className={`${placement} flex min-w-[120px] flex-col gap-1 rounded-2xl border border-white/10 p-3 text-white/70 shadow-[0_12px_40px_rgba(4,6,12,0.4)] transition duration-200 hover:-translate-y-1 hover:border-white/20`}
                    style={{
                      backgroundColor: `color-mix(in srgb, ${lane.heatmapColor}, rgb(0 0 0 / 0.3))`,
                      boxShadow: `0 0 20px ${lane.heatmapColor}, 0 12px 40px rgba(4,6,12,0.4)`,
                    }}
                  >
                    <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.3em]">
                      <span className="text-white/70">{lane.label}</span>
                      <span
                        className={`flex items-center gap-1 font-semibold ${lane.style.text}`}
                      >
                        <span
                          className={`h-2 w-2 rounded-full ${lane.style.dot}`}
                          aria-hidden
                        />
                        {lane.style.label}
                      </span>
                    </div>
                    <p className="text-2xl font-semibold text-white">
                      {lane.vehicleCount}
                    </p>
                    <p className="text-xs text-white/60">
                      Wait {lane.waitTime.toFixed(1)} s · Forecast{" "}
                      {lane.forecast.toFixed(1)}
                    </p>
                    <p className="text-xs text-white/50">
                      Trend{" "}
                      {lane.trend === "up"
                        ? "Rising"
                        : lane.trend === "down"
                        ? "Easing"
                        : "Steady"}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <aside
          className={`overflow-hidden rounded-3xl border border-white/10 bg-black/25 transition-[max-height,opacity] duration-300 ${
            tableOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <div className="flex items-center justify-between px-5 py-4 text-xs uppercase tracking-[0.3em] text-white/50">
            <span>Lane detail</span>
            <span>Vehicles / wait / forecast</span>
          </div>
          <div className="divide-y divide-white/10">
            {laneSummaries.map((lane) => (
              <div key={lane.id} className="px-5 py-3 text-sm text-white/70">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-white">{lane.label}</span>
                  <span className={`text-xs uppercase ${lane.style.text}`}>
                    {lane.style.label}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-white/60">
                  <span>{lane.vehicleCount} vehicles</span>
                  <span>{lane.waitTime.toFixed(1)} s wait</span>
                  <span>{lane.forecast.toFixed(1)} forecast</span>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </Panel>
  );
}
