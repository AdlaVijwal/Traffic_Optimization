import axios from "axios";
import type {
  DashboardData,
  Direction,
  LaneObservation,
  MetricsSnapshot,
  PriorityBreakdown,
  SignalHistoryPoint,
  SignalStatus,
} from "../types/dashboard";
import type {
  FrameManifest,
  UploadRun,
  OutputFrameManifest,
  OutputFrameInfo,
  OutputFrameCategory,
} from "../types/uploads";
import { ENV } from "../config/env";

const OFFLINE_DIRECTIONS: Direction[] = ["north", "east", "south", "west"];

function createZeroMap(): Record<string, number> {
  return OFFLINE_DIRECTIONS.reduce<Record<string, number>>((acc, lane) => {
    acc[lane] = 0;
    return acc;
  }, {});
}

function buildOfflineDashboardData(): DashboardData {
  const now = new Date().toISOString();
  const zeroMap = createZeroMap();
  const observations: LaneObservation[] = OFFLINE_DIRECTIONS.map((lane) => ({
    lane,
    vehicleCount: 0,
    classBreakdown: {
      car: 0,
      bus: 0,
      truck: 0,
      motorcycle: 0,
    },
    waitTime: 0,
    forecast: 0,
    signalState: "unknown",
    trend: "steady",
    sparkline: Array.from({ length: 24 }, () => 0),
  }));

  const status: SignalStatus = {
    junctionId: "OFFLINE",
    junctionType: "system_offline",
    mode: "crossroad",
    currentGreen: null,
    nextLane: null,
    remainingSeconds: 0,
    cycleId: null,
    latencyMs: 0,
    lastUpdated: now,
    laneCounts: { ...zeroMap },
    laneWaitTimes: { ...zeroMap },
    laneForecasts: { ...zeroMap },
    laneTotals: { ...zeroMap },
    laneGaps: { ...zeroMap },
    signalStates: OFFLINE_DIRECTIONS.reduce<Record<string, string>>((acc, lane) => {
      acc[lane] = "red";
      return acc;
    }, {}),
    directions: [...OFFLINE_DIRECTIONS],
    telemetryAgeSeconds: 0,
  };

  const metrics: MetricsSnapshot = {
    cyclesExecuted: 0,
    averageGreenDuration: 0,
    averageWaitByLane: { ...zeroMap },
    laneForecasts: { ...zeroMap },
    staleIncidents: 0,
    forecastHorizon: 0,
    telemetryStaleAfter: 30,
    lastUpdated: now,
  };

  return {
    status,
    metrics,
    history: [],
    observations,
    priorities: [],
    nextPrediction: null,
    isOffline: true,
  };
}

const api = axios.create({
  baseURL: ENV.apiBaseUrl,
  timeout: 60_000,
});

function normalizeDirection(value: unknown, fallback: Direction = "north"): Direction {
  const stringValue = typeof value === "string" ? value.toLowerCase() : "";
  const candidates: Direction[] = ["north", "east", "south", "west"];
  return (candidates.find((item) => item === stringValue) ?? fallback) as Direction;
}

function normalizeMode(value: unknown): SignalStatus["mode"] {
  const allowed: SignalStatus["mode"][] = ["single_flow", "opposite_road", "crossroad"];
  const stringValue = typeof value === "string" ? value.toLowerCase() : "";
  return (allowed.find((item) => item === stringValue) ?? "crossroad") as SignalStatus["mode"];
}

function normalizePriority(raw: Record<string, unknown>): PriorityBreakdown {
  return {
    lane: normalizeDirection(raw.lane ?? raw.direction),
    score: Number(raw.score ?? 0),
    vehicleCount: Number(raw.vehicle_count ?? raw.vehicleCount ?? 0),
    waitingTime: Number(raw.waiting_time ?? raw.waitingTime ?? 0),
    cooldownPenalty: Number(raw.cooldown_penalty ?? raw.cooldownPenalty ?? 0),
    forecastCount: Number(raw.forecast_count ?? raw.forecastCount ?? 0),
  };
}

function normalizeStatus(raw: Record<string, unknown>): SignalStatus {
  const lastUpdatedInput = raw.last_updated ?? raw.lastUpdated;
  const lastUpdated =
    typeof lastUpdatedInput === "string" && lastUpdatedInput.length > 0
      ? lastUpdatedInput
      : new Date().toISOString();
  const parsedLastUpdated = new Date(lastUpdated);
  const telemetryAgeSeconds = Number.isFinite(parsedLastUpdated.getTime())
    ? Math.max(0, (Date.now() - parsedLastUpdated.getTime()) / 1000)
    : 0;
  const laneCounts = (raw.lane_counts ?? raw.laneCounts ?? {}) as Record<string, number>;
  const laneWaitTimes = (raw.lane_wait_times ?? raw.laneWaitTimes ?? {}) as Record<string, number>;
  const laneForecasts = (raw.lane_forecasts ?? raw.laneForecasts ?? {}) as Record<string, number>;
  const laneTotals = (raw.lane_totals ?? raw.laneTotals ?? {}) as Record<string, number>;
  const laneGaps = (raw.lane_gaps ?? raw.laneGaps ?? {}) as Record<string, number>;
  const signalStates = (raw.signal_states ?? raw.signalStates ?? {}) as Record<string, string>;
  const directionSource = Array.isArray(raw.directions)
    ? (raw.directions as string[])
    : Object.keys(laneCounts);
  const directions = directionSource.map((lane: string) => normalizeDirection(lane)) as Direction[];
  const rawCurrentGreen = raw.current_green ?? raw.currentGreen ?? null;
  const rawNextLane = raw.next_lane ?? raw.nextLane ?? null;
  const metadata = raw.metadata as Record<string, unknown> | undefined;
  const cycleCandidate = Number(raw.cycle_id ?? raw.cycleId);
  return {
    junctionId:
      (raw.junction_id as string) ?? (metadata?.["junction_id"] as string) ?? "JXN-001",
    junctionType:
      (raw.junction_type as string) ?? (metadata?.["junction_type"] as string) ?? "unknown",
    mode: normalizeMode(raw.mode),
    currentGreen: rawCurrentGreen ? normalizeDirection(rawCurrentGreen) : null,
    nextLane: rawNextLane ? normalizeDirection(rawNextLane) : null,
    remainingSeconds: Number(raw.remaining_seconds ?? raw.remainingSeconds ?? 0),
    cycleId: Number.isFinite(cycleCandidate) ? cycleCandidate : null,
    latencyMs: Number(raw.latency_ms ?? raw.latencyMs ?? 0),
    lastUpdated,
    laneCounts,
    laneWaitTimes,
    laneForecasts,
    laneTotals,
    laneGaps,
    signalStates,
    directions,
    telemetryAgeSeconds,
  };
}

function normalizeHistory(raw: unknown[]): SignalHistoryPoint[] {
  return (raw ?? []).map((item) => {
    const record = (item ?? {}) as Record<string, unknown>;
    return {
      cycleId: (record.cycle_id as number) ?? (record.cycleId as number) ?? 0,
      decidedAt:
        (record.decided_at as string) ??
        (record.decidedAt as string) ??
        new Date().toISOString(),
      greenLane: normalizeDirection(record.green_lane ?? record.greenLane),
      greenDuration: Number(record.green_duration ?? record.greenDuration ?? 0),
      priorities: Array.isArray(record.priorities)
        ? (record.priorities as Record<string, unknown>[]).map(normalizePriority)
        : [],
    };
  });
}

function toNumberRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") {
    return {};
  }
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, number>>(
    (acc, [key, item]) => {
      acc[key] = Number(item ?? 0);
      return acc;
    },
    {}
  );
}

function normalizeMetrics(raw: Record<string, unknown>): MetricsSnapshot {
  const averageWait = toNumberRecord(raw?.average_wait_by_lane ?? raw?.averageWaitByLane);
  const forecast = toNumberRecord(raw?.lane_forecasts ?? raw?.laneForecasts);
  const lastUpdatedInput = raw?.last_updated ?? raw?.lastUpdated;
  const lastUpdated =
    typeof lastUpdatedInput === "string" && lastUpdatedInput.length > 0
      ? lastUpdatedInput
      : new Date().toISOString();
  return {
    cyclesExecuted: Number(raw?.cycles_executed ?? raw?.cyclesExecuted ?? 0),
    averageGreenDuration: Number(raw?.average_green_duration ?? raw?.averageGreenDuration ?? 0),
    averageWaitByLane: averageWait,
    laneForecasts: forecast,
    staleIncidents: Number(raw?.stale_incidents ?? raw?.staleIncidents ?? 0),
    forecastHorizon: Number(raw?.forecast_horizon ?? raw?.forecastHorizon ?? 0),
    telemetryStaleAfter: Number(raw?.telemetry_stale_after ?? raw?.telemetryStaleAfter ?? 0),
    lastUpdated,
  };
}

function buildObservations(status: SignalStatus): LaneObservation[] {
  return (status.directions.length ? status.directions : (Object.keys(status.laneCounts) as Direction[])).map(
    (lane) => {
      const vehicleCount = Number(status.laneCounts[lane] ?? 0);
      const wait = Number(status.laneWaitTimes[lane] ?? 0);
      const forecast = Number(status.laneForecasts[lane] ?? 0);
      const totals = Number(status.laneTotals[lane] ?? vehicleCount);
      const signalState = (status.signalStates?.[lane] ?? (status.currentGreen === lane ? "green" : "red")) as
        | "red"
        | "yellow"
        | "green"
        | "unknown";
      const trend = forecast > wait ? "up" : forecast < wait / 2 ? "down" : "steady";
      const sparkline = Array.from({ length: 24 }, (_, index) => Math.max(1, vehicleCount + Math.sin(index / 3) * 4));
      return {
        lane,
        vehicleCount,
        waitTime: wait,
        forecast,
        classBreakdown: {
          car: Math.max(0, Math.round(Math.min(totals, vehicleCount) * 0.55)),
          bus: Math.max(0, Math.round(vehicleCount * 0.1)),
          truck: Math.max(0, Math.round(vehicleCount * 0.1)),
          motorcycle: Math.max(0, vehicleCount - Math.round(vehicleCount * 0.75)),
        },
        signalState,
        trend,
        sparkline,
      } satisfies LaneObservation;
    }
  );
}

async function fetchStatus(): Promise<SignalStatus> {
  const { data } = await api.get("/signal/status");
  return normalizeStatus(data);
}

async function fetchNext(): Promise<PriorityBreakdown | null> {
  try {
    const { data } = await api.get("/signal/next");
    return normalizePriority(data);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

async function fetchHistory(limit = 20): Promise<SignalHistoryPoint[]> {
  const { data } = await api.get("/signal/history", { params: { limit } });
  return normalizeHistory(data);
}

async function fetchMetrics(): Promise<MetricsSnapshot> {
  const { data } = await api.get("/metrics");
  return normalizeMetrics(data);
}

export async function fetchDashboardData(): Promise<DashboardData> {
  try {
    const [status, nextPrediction, history, metrics] = await Promise.all([
      fetchStatus(),
      fetchNext(),
      fetchHistory(30),
      fetchMetrics(),
    ]);

    const latestHistory = history.at(-1);
    const normalizedStatus: SignalStatus = {
      ...status,
      nextLane: (nextPrediction?.lane ?? latestHistory?.priorities?.[0]?.lane ?? status.nextLane) as Direction | null,
    };
    const priorities = latestHistory?.priorities?.length
      ? latestHistory.priorities
      : nextPrediction
        ? [nextPrediction]
        : [];

    return {
      status: normalizedStatus,
      metrics,
      history,
      observations: buildObservations(normalizedStatus),
      priorities,
      nextPrediction: nextPrediction ?? null,
      isOffline: false,
    } satisfies DashboardData;
  } catch (error) {
    console.warn("Signal API unreachable, switching to offline dashboard", error);
    return buildOfflineDashboardData();
  }
}

export async function fetchUploadRuns(): Promise<UploadRun[]> {
  const { data } = await api.get<UploadRun[]>("/ingest/uploads");
  return data;
}

export async function uploadJunctionVideos(
  junctionType: string,
  files: { [key: string]: File }
): Promise<void> {
  const formData = new FormData();
  formData.append("junction_type", junctionType);
  
  Object.entries(files).forEach(([direction, file]) => {
    formData.append(direction, file);
  });

  await api.post("/ingest/uploads", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
}

export async function clearOutputFrames(): Promise<void> {
  await api.post("/media/clear");
}

export async function uploadVideoForAnalysis(
  file: File,
  options: { junctionId?: string; analysisType?: string; laneHint?: string } = {}
): Promise<UploadRun> {
  const formData = new FormData();
  formData.append("file", file);
  if (options.junctionId) {
    formData.append("junction_id", options.junctionId);
  }
  if (options.analysisType) {
    formData.append("analysis_type", options.analysisType);
  }
  if (options.laneHint) {
    formData.append("lane_hint", options.laneHint);
  }
  const { data } = await api.post<UploadRun>("/ingest/uploads", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function deleteUploadRun(runId: string): Promise<void> {
  await api.delete(`/ingest/uploads/${runId}`);
}

export async function fetchUploadFrames(runId: string): Promise<Record<string, string>> {
  const { data } = await api.get<Record<string, string>>(`/ingest/uploads/${runId}/frames`);
  return data;
}

export async function fetchMediaManifest(): Promise<FrameManifest> {
  const { data } = await api.get<FrameManifest>("/media/manifest");
  return data;
}

function normalizeCategory(
  value: unknown,
  url?: string
): OutputFrameCategory | undefined {
  const allowed: OutputFrameCategory[] = ["full", "class", "other"];
  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    const match = allowed.find((candidate) => candidate === normalized);
    if (match) {
      return match;
    }
  }

  if (typeof url === "string") {
    if (url.includes("/classes/")) {
      return "class";
    }
    if (url.includes("frame_")) {
      return "full";
    }
  }

  return undefined;
}

function normalizeOutputFrameArray(groupId: string, source: unknown): OutputFrameInfo[] {
  if (!source) {
    return [];
  }

  if (Array.isArray(source)) {
    return source
      .map((item, index) => {
        if (typeof item === "string") {
            const category = normalizeCategory(undefined, item);
            return {
              id: `${groupId}-${index}`,
              url: item,
              category,
            } satisfies OutputFrameInfo;
        }
        if (item && typeof item === "object") {
          const record = item as Record<string, unknown>;
          const urlCandidate = record.url ?? record.path ?? record.location;
          if (typeof urlCandidate !== "string" || urlCandidate.length === 0) {
            return null;
          }
            const category = normalizeCategory(
              (record.category ?? record.type) as string | undefined,
              urlCandidate
            );
          return {
            id: String(record.id ?? record.frame_id ?? `${groupId}-${index}`),
            url: urlCandidate,
            lane: typeof record.lane === "string" ? record.lane : undefined,
            capturedAt:
              typeof record.capturedAt === "string"
                ? record.capturedAt
                : typeof record.timestamp === "string"
                  ? record.timestamp
                  : undefined,
            annotation: typeof record.annotation === "string" ? record.annotation : undefined,
              category,
            } satisfies OutputFrameInfo;
        }
        return null;
      })
      .filter(Boolean) as OutputFrameInfo[];
  }

  if (typeof source === "object") {
    return Object.entries(source as Record<string, unknown>)
      .map(([key, value], index) => {
        if (typeof value === "string") {
            const category = normalizeCategory(undefined, value);
          return {
            id: `${groupId}-${key || index}`,
            url: value,
            lane: key,
              category,
          } satisfies OutputFrameInfo;
        }
        if (value && typeof value === "object") {
          const record = value as Record<string, unknown>;
          const urlCandidate = record.url ?? record.path ?? record.location;
          if (typeof urlCandidate !== "string" || urlCandidate.length === 0) {
            return null;
          }
            const category = normalizeCategory(
              (record.category ?? record.type) as string | undefined,
              urlCandidate
            );
          return {
            id: String(record.id ?? key ?? `${groupId}-${index}`),
            url: urlCandidate,
            lane: typeof record.lane === "string" ? record.lane : key,
            capturedAt:
              typeof record.capturedAt === "string"
                ? record.capturedAt
                : typeof record.timestamp === "string"
                  ? record.timestamp
                  : undefined,
              annotation: typeof record.annotation === "string" ? record.annotation : undefined,
              category,
          } satisfies OutputFrameInfo;
        }
        return null;
      })
      .filter(Boolean) as OutputFrameInfo[];
  }

  return [];
}

function normalizeOutputFrameManifest(raw: unknown): OutputFrameManifest {
  const fallback: OutputFrameManifest = {
    generatedAt: new Date().toISOString(),
    groups: [],
  };

  if (!raw || typeof raw !== "object") {
    return fallback;
  }

  const record = raw as Record<string, unknown>;
  const generatedAt = typeof record.generatedAt === "string" ? record.generatedAt : fallback.generatedAt;

  const groupsSource = record.groups;
  const directionsSource = record.directions ?? record.frames ?? record.lanes;

  if (Array.isArray(groupsSource)) {
    return {
      generatedAt,
      groups: groupsSource.map((item, index) => {
        const groupRecord = (item ?? {}) as Record<string, unknown>;
        const idCandidate = groupRecord.id ?? groupRecord.key ?? groupRecord.lane ?? `group-${index}`;
        const id = String(idCandidate);
        const labelSource = groupRecord.label ?? groupRecord.name ?? id;
        return {
          id,
          label: String(labelSource),
          description: typeof groupRecord.description === "string" ? groupRecord.description : undefined,
          frames: normalizeOutputFrameArray(id, groupRecord.frames ?? groupRecord.images ?? groupRecord.urls),
        };
      }),
    } satisfies OutputFrameManifest;
  }

  if (directionsSource && typeof directionsSource === "object") {
    const entries = Object.entries(directionsSource as Record<string, unknown>);
    return {
      generatedAt,
      groups: entries.map(([key, value], index) => ({
        id: key || `group-${index}`,
        label: (key || `Group ${index + 1}`).replace(/_/g, " "),
        frames: normalizeOutputFrameArray(key || `group-${index}`, value),
      })),
    } satisfies OutputFrameManifest;
  }

  return fallback;
}

export async function fetchOutputFrameManifest(): Promise<OutputFrameManifest> {
  try {
    const { data } = await api.get("/media/output");
    const manifest = normalizeOutputFrameManifest(data);
    return manifest;
  } catch (error) {
    console.warn("Output frame manifest unavailable, showing empty state", error);
    return {
      generatedAt: new Date().toISOString(),
      groups: [],
    } satisfies OutputFrameManifest;
  }
}
