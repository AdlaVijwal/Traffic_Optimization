import { Activity, GaugeCircle, Timer, Users } from "lucide-react";
import type { DashboardData } from "../../types/dashboard";
import { StatCard } from "../common/StatCard";

interface MetricsGridProps {
  dashboard: DashboardData;
}

export function MetricsGrid({ dashboard }: MetricsGridProps) {
  const { status, metrics, priorities } = dashboard;
  const totalVehicles = dashboard.observations.reduce(
    (acc, item) => acc + item.vehicleCount,
    0
  );
  const topScore = priorities.length
    ? Math.max(...priorities.map((item) => item.score))
    : 0;
  const peakWait = dashboard.observations.reduce(
    (acc, lane) => Math.max(acc, lane.waitTime),
    0
  );

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Vehicles observed"
        value={totalVehicles.toLocaleString()}
        hint="Across all live approaches"
        icon={<Users className="h-4 w-4 text-control-accent" />}
        accent="accent"
        trend={totalVehicles > 0 ? "up" : "steady"}
      />
      <StatCard
        label="Peak wait"
        value={`${peakWait.toFixed(1)} s`}
        hint="Longest queue among approaches"
        icon={<Timer className="h-4 w-4 text-amber-300" />}
        accent="warning"
        trend={peakWait > 30 ? "down" : "steady"}
      />
      <StatCard
        label="Top priority score"
        value={topScore.toFixed(1)}
        hint="Signal controller engine"
        icon={<GaugeCircle className="h-4 w-4 text-emerald-300" />}
        accent="success"
      />
      <StatCard
        label="Signal rounds today"
        value={metrics.cyclesExecuted.toLocaleString()}
        hint={`Latency ${status.latencyMs.toFixed(0)} ms`}
        icon={<Activity className="h-4 w-4 text-sky-300" />}
      />
    </div>
  );
}
