import { formatISO } from "date-fns";
import type {
  DashboardData,
  Direction,
  LaneObservation,
  MetricsSnapshot,
  PriorityBreakdown,
  SignalHistoryPoint,
  SignalStatus,
} from "../types/dashboard";
import type { OutputFrameManifest } from "../types/uploads";

const directions: Direction[] = ["lane_1", "lane_2", "lane_3", "lane_4"];

function generateObservation(lane: Direction, step = 0): LaneObservation {
  const base = 12 + Math.round(Math.random() * 10);
  const signalStates: LaneObservation["signalState"][] = ["red", "green", "yellow"];
  const waitTime = Math.max(0, step * 8 + Math.random() * 6);
  const forecast = Math.max(0, base + Math.random() * 10 - step * 2);
  return {
    lane,
    label: lane.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()),
    vehicleCount: base + step,
    classBreakdown: {
      car: Math.round(base * 0.6),
      bus: Math.round(base * 0.1),
      truck: Math.round(base * 0.1),
      motorcycle: Math.round(base * 0.2),
    },
    waitTime,
    forecast,
    signalState: signalStates[Math.floor(Math.random() * signalStates.length)] ?? "red",
    trend: step % 3 === 0 ? "up" : step % 3 === 1 ? "down" : "steady",
    sparkline: Array.from({ length: 24 }, (_, index) => Math.max(4, base + Math.sin((index + step) / 3) * 5)),
  };
}

function generatePriorities(): PriorityBreakdown[] {
  return directions.map((lane, index) => ({
    lane,
    score: 60 - index * 7 + Math.random() * 5,
    vehicleCount: 10 + index * 3,
    waitingTime: index * 5 + Math.random() * 3,
    cooldownPenalty: index === 0 ? 5 : Math.max(0, 10 - index * 2),
    forecastCount: Math.random() * 12,
  }));
}

function generateHistory(): SignalHistoryPoint[] {
  return Array.from({ length: 12 }, (_, index) => ({
    cycleId: 120 + index,
    decidedAt: formatISO(new Date(Date.now() - index * 45_000)),
    greenLane: directions[index % directions.length],
    greenDuration: 20 + (index % 5) * 3,
    priorities: generatePriorities(),
  }));
}

function generateMetrics(): MetricsSnapshot {
  return {
    cyclesExecuted: 612,
    averageGreenDuration: 28.6,
    averageWaitByLane: directions.reduce<Record<string, number>>(
      (acc, lane, idx) => ({ ...acc, [lane]: 22 + idx * 4 }),
      {}
    ),
    laneForecasts: directions.reduce<Record<string, number>>(
      (acc, lane, idx) => ({ ...acc, [lane]: 50 - idx * 5 }),
      {}
    ),
    staleIncidents: 2,
    forecastHorizon: 12,
    telemetryStaleAfter: 30,
    lastUpdated: formatISO(new Date()),
  };
}

function generateStatus(): SignalStatus {
  return {
    junctionId: "JXN-102",
    junctionType: "crossroad",
    mode: "crossroad",
    currentGreen: "south",
    nextLane: "east",
    remainingSeconds: 18,
    cycleId: 612,
    latencyMs: 120,
    lastUpdated: formatISO(new Date()),
    laneCounts: directions.reduce<Record<string, number>>(
      (acc, lane, idx) => ({ ...acc, [lane]: 20 + idx * 6 }),
      {}
    ),
    laneWaitTimes: directions.reduce<Record<string, number>>(
      (acc, lane, idx) => ({ ...acc, [lane]: idx * 12 }),
      {}
    ),
    laneForecasts: directions.reduce<Record<string, number>>(
      (acc, lane, idx) => ({ ...acc, [lane]: 30 - idx * 4 }),
      {}
    ),
    laneTotals: directions.reduce<Record<string, number>>(
      (acc, lane, idx) => ({ ...acc, [lane]: 200 + idx * 50 }),
      {}
    ),
    laneGaps: directions.reduce<Record<string, number>>(
      (acc, lane, idx) => ({ ...acc, [lane]: Math.max(2, 12 - idx * 3) }),
      {}
    ),
    signalStates: directions.reduce<Record<string, string>>(
      (acc, lane, idx) => ({ ...acc, [lane]: idx === 2 ? "green" : idx === 1 ? "yellow" : "red" }),
      {}
    ),
    directions,
    telemetryAgeSeconds: 4.2,
  };
}

export function mockDashboardData(statusOverride?: Partial<SignalStatus>): DashboardData {
  const status = { ...generateStatus(), ...statusOverride };
  const priorities = generatePriorities();
  return {
    status,
    metrics: generateMetrics(),
    history: generateHistory(),
    observations: directions.map((lane, index) => generateObservation(lane, index)),
    priorities,
    nextPrediction: priorities[0] ?? null,
    isOffline: false,
    context: {
      displayName: status.junctionId ? `Junction ${status.junctionId}` : "Traffic feed",
      laneCount: status.directions.length,
      mode: status.mode,
      junctionType: status.junctionType,
      directions: status.directions,
      upload: {
        id: "mock-run-001",
        status: "processing",
        analysisType: "single",
        siteLabel: "Downtown Hub",
        cameraLabel: "Northbound Pole A",
        locationLabel: "5th Ave & Pine St",
        laneCount: 1,
        createdAt: formatISO(new Date(Date.now() - 5 * 60_000)),
        notes: "Pilot lane calibration with low-light conditions",
        displayName: "Downtown Hub - Camera A",
      },
      source: {
        junctionId: status.junctionId,
        inputMode: "synthetic",
        videoSources: null,
      },
    },
  };
}

function createPlaceholderFrame(lane: string, index: number) {
  const timestamp = formatISO(new Date(Date.now() - index * 45_000));
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="640" height="360" viewBox="0 0 640 360" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#0F172A" />
      <stop offset="100%" stop-color="#1E293B" />
    </linearGradient>
  </defs>
  <rect width="640" height="360" fill="url(#grad)" />
  <text x="50%" y="48%" dominant-baseline="middle" text-anchor="middle" font-family="'Space Grotesk', sans-serif" font-size="48" fill="#38BDF8" opacity="0.9">${lane.toUpperCase()}</text>
  <text x="50%" y="62%" dominant-baseline="middle" text-anchor="middle" font-family="'IBM Plex Sans', sans-serif" font-size="20" fill="#E2E8F0" opacity="0.85">Frame ${index + 1}</text>
</svg>`;
  return {
    url: `data:image/svg+xml,${encodeURIComponent(svg)}`,
    capturedAt: timestamp,
  };
}

export function mockOutputFrameManifest(): OutputFrameManifest {
  return {
    generatedAt: formatISO(new Date()),
    groups: directions.map((lane) => ({
      id: lane,
      label: `${lane.toUpperCase()} approach`,
      description: "Synthetic preview while live output frames are unavailable.",
      frames: Array.from({ length: 3 }, (_, index) => {
        const placeholder = createPlaceholderFrame(lane, index);
        return {
          id: `${lane}-${index}`,
          url: placeholder.url,
          lane,
          capturedAt: placeholder.capturedAt,
          annotation: `${18 + index * 4} vehicles detected`,
        };
      }),
    })),
  };
}
