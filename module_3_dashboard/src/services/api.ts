import axios from "axios";
import type {
  DashboardData,
  DashboardContext,
  DashboardUploadContext,
  Direction,
  LaneDescriptor,
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

const DEFAULT_LANES: Direction[] = ["lane_1", "lane_2", "lane_3", "lane_4"];

function createZeroMap(lanes: Direction[]): Record<string, number> {
  return lanes.reduce<Record<string, number>>((acc, lane) => {
    acc[lane] = 0;
    return acc;
  }, {});
}

function buildOfflineDashboardData(): DashboardData {
  const now = new Date().toISOString();
  const zeroMap = createZeroMap(DEFAULT_LANES);
  const laneAliases = DEFAULT_LANES.reduce<Record<string, string>>((acc, lane, index) => {
    acc[lane] = `Lane ${index + 1}`;
    return acc;
  }, {});
  const laneDescriptors = DEFAULT_LANES.map((lane, index) => ({
    id: lane,
    label: laneAliases[lane],
    alias: laneAliases[lane],
    order: index,
    original: lane,
  }));
  const observations: LaneObservation[] = DEFAULT_LANES.map((lane) => ({
    lane,
    label: laneAliases[lane],
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
    signalStates: DEFAULT_LANES.reduce<Record<string, string>>((acc, lane) => {
      acc[lane] = "red";
      return acc;
    }, {}),
    directions: [...DEFAULT_LANES],
    telemetryAgeSeconds: 0,
    laneAliases,
    lanes: laneDescriptors,
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
    context: {
      displayName: "Offline feed",
      laneCount: status.directions.length,
      mode: status.mode,
      junctionType: status.junctionType,
      directions: status.directions,
      laneAliases,
      lanes: laneDescriptors,
      upload: null,
      source: {
        junctionId: status.junctionId,
        inputMode: "offline",
        videoSources: null,
      },
    },
  };
}

const api = axios.create({
  baseURL: ENV.apiBaseUrl,
  timeout: 60_000,
});

function normalizeDirection(value: unknown, fallback: Direction = DEFAULT_LANES[0]): Direction {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length) {
      return trimmed;
    }
  }
  return fallback;
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
  const directions = directionSource
    .map((lane: string, index) => normalizeDirection(lane, DEFAULT_LANES[index] ?? DEFAULT_LANES[0])) as Direction[];
  const rawCurrentGreen = raw.current_green ?? raw.currentGreen ?? null;
  const rawNextLane = raw.next_lane ?? raw.nextLane ?? null;
  const metadata = raw.metadata as Record<string, unknown> | undefined;
  const cycleCandidate = Number(raw.cycle_id ?? raw.cycleId);
  const laneAliasSource =
    raw.lane_aliases ??
    raw.laneAliases ??
    metadata?.["lane_aliases"] ??
    metadata?.["laneAliases"];
  const laneAliases =
    laneAliasSource && typeof laneAliasSource === "object" && !Array.isArray(laneAliasSource)
      ? Object.entries(laneAliasSource as Record<string, unknown>).reduce<Record<string, string>>(
          (acc, [key, value]) => {
            if (typeof value === "string" && value.trim().length > 0) {
              acc[key] = value;
            }
            return acc;
          },
          {}
        )
      : undefined;
  const rawLaneDescriptors =
    (Array.isArray(raw.lanes) ? raw.lanes : undefined) ??
    (Array.isArray(metadata?.["lanes"]) ? (metadata?.["lanes"] as unknown[]) : undefined);
  const lanes = rawLaneDescriptors
    ? (rawLaneDescriptors as unknown[]).reduce<LaneDescriptor[]>((acc, entry, index) => {
        if (!entry || typeof entry !== "object") {
          return acc;
        }
        const record = entry as Record<string, unknown>;
        const fallbackId = directions[index] ?? DEFAULT_LANES[index] ?? `lane_${index + 1}`;
        const idCandidate = record.id ?? record.lane ?? fallbackId;
        const id = normalizeDirection(idCandidate, fallbackId);
        const aliasCandidate = record.alias ?? record.displayName ?? record.label;
        const alias = typeof aliasCandidate === "string" && aliasCandidate.trim().length
          ? aliasCandidate.trim()
          : laneAliases?.[id];
        const labelCandidate = record.label ?? alias ?? id;
        const label = typeof labelCandidate === "string" && labelCandidate.trim().length
          ? labelCandidate.trim()
          : alias ?? id;
        const originalCandidate = record.original ?? record.source ?? id;
        const original = typeof originalCandidate === "string" && originalCandidate.trim().length
          ? originalCandidate.trim()
          : id;
        acc.push({
          id,
          label,
          alias: alias ?? label,
          order: typeof record.order === "number" ? record.order : index,
          original,
        });
        return acc;
      }, [])
    : undefined;
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
    laneAliases,
    lanes,
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

function buildObservations(
  status: SignalStatus,
  aliasMap: Record<string, string> = {}
): LaneObservation[] {
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
        label: aliasMap[lane] ?? lane,
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

function normalizeUploadContext(raw: unknown): DashboardUploadContext | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const resolved: DashboardUploadContext = {
    id: typeof record.id === "string" ? record.id : undefined,
    status: typeof record.status === "string" ? record.status : undefined,
    analysisType: typeof record.analysisType === "string" ? record.analysisType : undefined,
    siteLabel: typeof record.siteLabel === "string" ? record.siteLabel : undefined,
    cameraLabel: typeof record.cameraLabel === "string" ? record.cameraLabel : undefined,
    locationLabel: typeof record.locationLabel === "string" ? record.locationLabel : undefined,
    laneCount: typeof record.laneCount === "number" ? record.laneCount : undefined,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : undefined,
    notes: typeof record.notes === "string" ? record.notes : undefined,
    displayName: typeof record.displayName === "string" ? record.displayName : undefined,
    directions: Array.isArray(record.directions)
      ? (record.directions as unknown[])
          .map((item, index) => normalizeDirection(item, DEFAULT_LANES[index] ?? DEFAULT_LANES[0]))
          .filter(Boolean)
      : undefined,
  };
  const hasDetails = Object.values(resolved).some((value) => value !== undefined);
  return hasDetails ? resolved : null;
}

function normalizeContext(raw: unknown, status: SignalStatus): DashboardContext {
  const record = (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}) ?? {};
  const rawDirections = Array.isArray(record.directions)
    ? (record.directions as unknown[])
    : status.directions;
  const directions = rawDirections
    .map((direction, index) =>
      normalizeDirection(direction, status.directions[index] ?? status.directions[0] ?? DEFAULT_LANES[0])
    )
    .filter(Boolean) as Direction[];

  const laneCountCandidate = Number(record.laneCount ?? directions.length ?? status.directions.length);
  const laneCount = Number.isFinite(laneCountCandidate) ? Math.max(0, laneCountCandidate) : status.directions.length;
  const displayNameRaw = typeof record.displayName === "string" ? record.displayName.trim() : "";
  const description = typeof record.description === "string" ? record.description.trim() : undefined;
  const displayName = displayNameRaw.length
    ? displayNameRaw
    : status.junctionId && status.junctionId !== "OFFLINE"
      ? `Junction ${status.junctionId}`
      : "Traffic feed";

  const sourcePayload =
    record.source && typeof record.source === "object" ? (record.source as Record<string, unknown>) : {};
  const videoSourcesRaw = sourcePayload.videoSources;
  const videoSources =
    videoSourcesRaw && typeof videoSourcesRaw === "object" && !Array.isArray(videoSourcesRaw)
      ? Object.entries(videoSourcesRaw as Record<string, unknown>).reduce<Record<string, string>>((acc, [key, value]) => {
          if (typeof value === "string") {
            acc[key] = value;
          }
          return acc;
        }, {})
      : undefined;

  const laneAliases =
    record.laneAliases && typeof record.laneAliases === "object" && !Array.isArray(record.laneAliases)
      ? Object.entries(record.laneAliases as Record<string, unknown>).reduce<Record<string, string>>(
          (acc, [key, value]) => {
            if (typeof value === "string" && value.trim().length > 0) {
              acc[key] = value.trim();
            }
            return acc;
          },
          {}
        )
      : status.laneAliases ?? directions.reduce<Record<string, string>>((acc, lane, index) => {
          acc[lane] = `Lane ${index + 1}`;
          return acc;
        }, {});

  const lanes = Array.isArray(record.lanes)
    ? (record.lanes as Record<string, unknown>[]).map((item, index) => {
        const fallbackId = directions[index] ?? `lane-${index + 1}`;
        const idSource = typeof item.id === "string" && item.id.trim().length ? item.id.trim() : fallbackId;
        const id = normalizeDirection(idSource, fallbackId);
        const aliasSource = typeof item.alias === "string" && item.alias.trim().length ? item.alias.trim() : undefined;
        const alias = aliasSource ?? laneAliases?.[id];
        const labelSource = typeof item.label === "string" && item.label.trim().length ? item.label.trim() : undefined;
        const label = labelSource ?? alias ?? `Lane ${index + 1}`;
        const originalSource = typeof item.original === "string" && item.original.trim().length ? item.original.trim() : undefined;
        return {
          id,
          label,
          alias: alias ?? label,
          order: typeof item.order === "number" ? item.order : index,
          original: originalSource ?? id,
        };
      })
    : status.lanes ?? directions.map((lane, index) => ({
        id: lane,
        label: laneAliases?.[lane] ?? `Lane ${index + 1}`,
        alias: laneAliases?.[lane] ?? `Lane ${index + 1}`,
        order: index,
        original: lane,
      }));

  const upload = normalizeUploadContext(record.upload);

  return {
    displayName,
    description,
    laneCount,
    mode: record.mode ? normalizeMode(record.mode) : status.mode,
    junctionType:
      typeof record.junctionType === "string" ? (record.junctionType as string) : status.junctionType,
    directions: directions.length ? directions : status.directions,
    laneAliases,
    lanes,
    upload: upload ?? null,
    source: {
      junctionId:
        typeof sourcePayload.junctionId === "string" ? (sourcePayload.junctionId as string) : undefined,
      inputMode:
        typeof sourcePayload.inputMode === "string" ? (sourcePayload.inputMode as string) : undefined,
      videoSources: videoSources ?? null,
    },
  } satisfies DashboardContext;
}

async function fetchStatus(): Promise<{ status: SignalStatus; context: DashboardContext }> {
  const { data } = await api.get("/signal/status");
  const status = normalizeStatus(data);
  const context = normalizeContext((data as Record<string, unknown>).context, status);
  return { status, context };
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
    const [statusResult, nextPrediction, history, metrics] = await Promise.all([
      fetchStatus(),
      fetchNext(),
      fetchHistory(30),
      fetchMetrics(),
    ]);

    const { status, context } = statusResult;

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

    const laneAliases = context.laneAliases ?? normalizedStatus.laneAliases ?? {};

    return {
      status: normalizedStatus,
      metrics,
      history,
      observations: buildObservations(normalizedStatus, laneAliases),
      priorities,
      nextPrediction: nextPrediction ?? null,
      isOffline: false,
      context: {
        ...context,
        laneAliases,
      },
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
  files: { [key: string]: File },
  metadata: {
    siteLabel?: string;
    cameraLabel?: string;
    locationLabel?: string;
    contextNotes?: string;
    retainUploads?: boolean;
  } = {}
): Promise<void> {
  const formData = new FormData();
  formData.append("junction_type", junctionType);
  
  Object.entries(files).forEach(([direction, file]) => {
    formData.append(direction, file);
  });

  const appendIfPresent = (key: string, value?: string) => {
    const trimmed = value?.trim();
    if (trimmed) {
      formData.append(key, trimmed);
    }
  };

  appendIfPresent("site_label", metadata.siteLabel);
  appendIfPresent("camera_label", metadata.cameraLabel);
  appendIfPresent("location_label", metadata.locationLabel);
  appendIfPresent("context_notes", metadata.contextNotes);

  if (typeof metadata.retainUploads === "boolean") {
    formData.append("retain_uploads", metadata.retainUploads ? "true" : "false");
  }

  await api.post("/ingest/uploads", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
}

export async function clearOutputFrames(): Promise<void> {
  await api.post("/media/clear");
}

export async function deleteUploads(uploadIds: string[]): Promise<{ deleted: number; ids: string[] }> {
  const response = await api.delete("/ingest/uploads", {
    data: uploadIds,
  });
  return response.data;
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

  const toFrame = (item: Record<string, unknown>, index: number): OutputFrameInfo | null => {
    const urlCandidate = item.url ?? item.path ?? item.location;
    if (typeof urlCandidate !== "string" || urlCandidate.length === 0) {
      return null;
    }
    const category = normalizeCategory(
      (item.category ?? item.type) as string | undefined,
      urlCandidate
    );
    return {
      id: String(item.id ?? item.frame_id ?? `${groupId}-${index}`),
      url: urlCandidate,
      lane: typeof item.lane === "string" ? item.lane : undefined,
      laneLabel: typeof item.laneLabel === "string" ? item.laneLabel : undefined,
      capturedAt:
        typeof item.capturedAt === "string"
          ? item.capturedAt
          : typeof item.timestamp === "string"
            ? item.timestamp
            : undefined,
      annotation: typeof item.annotation === "string" ? item.annotation : undefined,
      label: typeof item.label === "string" ? item.label : undefined,
      category,
    } satisfies OutputFrameInfo;
  };

  if (Array.isArray(source)) {
    return source
      .map((entry, index) => {
        if (typeof entry === "string") {
          const category = normalizeCategory(undefined, entry);
          return {
            id: `${groupId}-${index}`,
            url: entry,
            lane: undefined,
            category,
          } satisfies OutputFrameInfo;
        }
        if (entry && typeof entry === "object") {
          return toFrame(entry as Record<string, unknown>, index);
        }
        return null;
      })
      .filter(Boolean) as OutputFrameInfo[];
  }

  if (source && typeof source === "object") {
    const values = Object.values(source as Record<string, unknown>);
    if (values.length) {
      return normalizeOutputFrameArray(groupId, values);
    }
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

  const laneAliases =
    record.laneAliases && typeof record.laneAliases === "object" && !Array.isArray(record.laneAliases)
      ? Object.entries(record.laneAliases as Record<string, unknown>).reduce<Record<string, string>>(
          (acc, [key, value]) => {
            if (typeof value === "string" && value.trim().length > 0) {
              acc[key] = value.trim();
            }
            return acc;
          },
          {}
        )
      : undefined;

  const lanes = Array.isArray(record.lanes)
    ? (record.lanes as Record<string, unknown>[]).map((item, index) => {
        const fallbackId = `lane-${index + 1}`;
        const idSource = typeof item.id === "string" && item.id.trim().length ? item.id.trim() : fallbackId;
        const id = normalizeDirection(idSource, fallbackId);
        const aliasSource = typeof item.alias === "string" && item.alias.trim().length ? item.alias.trim() : undefined;
        const alias = aliasSource ?? laneAliases?.[id];
        const labelSource = typeof item.label === "string" && item.label.trim().length ? item.label.trim() : undefined;
        const label = labelSource ?? alias ?? `Lane ${index + 1}`;
        const originalSource = typeof item.original === "string" && item.original.trim().length ? item.original.trim() : undefined;
        return {
          id,
          label,
          alias: alias ?? label,
          order: typeof item.order === "number" ? item.order : index,
          original: originalSource ?? id,
        };
      })
    : undefined;

  const groupsSource = record.groups;
  const directionsSource = record.directions ?? record.frames ?? record.lanes;

  if (Array.isArray(groupsSource)) {
    const groups = groupsSource.map((item, index) => {
      const groupRecord = (item ?? {}) as Record<string, unknown>;
      const idCandidate = groupRecord.id ?? groupRecord.key ?? groupRecord.lane ?? `group-${index}`;
      const id = String(idCandidate);
      const labelSource =
        groupRecord.label ??
        groupRecord.name ??
        laneAliases?.[id] ??
        `Lane ${index + 1}`;
      return {
        id,
        label: String(labelSource),
        description: typeof groupRecord.description === "string" ? groupRecord.description : undefined,
        frames: normalizeOutputFrameArray(id, groupRecord.frames ?? groupRecord.images ?? groupRecord.urls),
      };
    });
    return {
      generatedAt,
      groups,
      laneAliases,
      lanes,
    } satisfies OutputFrameManifest;
  }

  if (directionsSource && typeof directionsSource === "object") {
    const entries = Object.entries(directionsSource as Record<string, unknown>);
    const groups = entries.map(([key, value], index) => {
      const id = key || `group-${index}`;
      const label = laneAliases?.[id] ?? (id || `Lane ${index + 1}`).replace(/_/g, " ");
      return {
        id,
        label,
        frames: normalizeOutputFrameArray(id, value),
      };
    });
    return {
      generatedAt,
      groups,
      laneAliases,
      lanes,
    } satisfies OutputFrameManifest;
  }

  return {
    ...fallback,
    laneAliases,
    lanes,
  } satisfies OutputFrameManifest;
}

export async function fetchOutputFrameManifest(): Promise<OutputFrameManifest> {
  try {
    const { data } = await api.get("/media/output", {
      params: {
        ts: Date.now(),
      },
      headers: {
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    });
    return normalizeOutputFrameManifest(data);
  } catch (error) {
    console.warn("Output frame manifest unavailable, showing empty state", error);
    return normalizeOutputFrameManifest(undefined);
  }
}

