export type Direction = "north" | "east" | "south" | "west";

export interface LaneObservation {
  lane: Direction;
  vehicleCount: number;
  classBreakdown: Record<string, number>;
  waitTime: number;
  forecast: number;
  signalState: "red" | "yellow" | "green" | "unknown";
  trend: "up" | "down" | "steady";
  sparkline: number[];
}

export interface PriorityBreakdown {
  lane: Direction;
  score: number;
  vehicleCount: number;
  waitingTime: number;
  cooldownPenalty: number;
  forecastCount: number;
}

export interface SignalStatus {
  junctionId: string;
  junctionType: string;
  mode: "single_flow" | "opposite_road" | "crossroad";
  currentGreen: Direction | null;
  nextLane: Direction | null;
  remainingSeconds: number;
  cycleId: number | null;
  latencyMs: number;
  lastUpdated: string;
  laneCounts: Record<string, number>;
  laneWaitTimes: Record<string, number>;
  laneForecasts: Record<string, number>;
  laneTotals: Record<string, number>;
  laneGaps: Record<string, number>;
  signalStates: Record<string, string>;
  directions: Direction[];
  telemetryAgeSeconds: number;
}

export interface MetricsSnapshot {
  cyclesExecuted: number;
  averageGreenDuration: number;
  averageWaitByLane: Record<string, number>;
  laneForecasts: Record<string, number>;
  staleIncidents: number;
  forecastHorizon: number;
  telemetryStaleAfter: number;
  lastUpdated: string;
}

export interface SignalHistoryPoint {
  cycleId: number;
  decidedAt: string;
  greenLane: Direction;
  greenDuration: number;
  priorities: PriorityBreakdown[];
}

export interface DashboardData {
  status: SignalStatus;
  observations: LaneObservation[];
  priorities: PriorityBreakdown[];
  metrics: MetricsSnapshot;
  history: SignalHistoryPoint[];
  nextPrediction: PriorityBreakdown | null;
  isOffline: boolean;
}
