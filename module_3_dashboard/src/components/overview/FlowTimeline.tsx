import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SignalHistoryPoint } from "../../types/dashboard";
import { Panel } from "../common/Panel";
import { SectionHeader } from "../common/SectionHeader";

interface FlowTimelineProps {
  history: SignalHistoryPoint[];
}

export function FlowTimeline({ history }: FlowTimelineProps) {
  const chartData = history.map((entry) => ({
    cycle: entry.cycleId,
    throughput: entry.priorities.reduce(
      (acc, lane) => acc + lane.vehicleCount,
      0
    ),
    wait: entry.priorities.reduce(
      (acc, lane) => Math.max(acc, lane.waitingTime),
      0
    ),
    duration: entry.greenDuration,
  }));

  return (
    <Panel>
      <SectionHeader
        title="Throughput timeline"
        subtitle="Vehicles processed, wait peaks and green durations per signal round"
      />
      <div className="mt-6 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient
                id="throughputGradient"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="5%" stopColor="#34d399" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              stroke="rgba(255,255,255,0.08)"
              strokeDasharray="4 4"
            />
            <XAxis
              dataKey="cycle"
              stroke="rgba(255,255,255,0.6)"
              tickLine={false}
            />
            <YAxis stroke="rgba(255,255,255,0.6)" tickLine={false} />
            <Tooltip
              contentStyle={{ backgroundColor: "#0b1120", borderRadius: 12 }}
            />
            <Area
              type="monotone"
              dataKey="throughput"
              stroke="#34d399"
              fill="url(#throughputGradient)"
              strokeWidth={2}
              name="Vehicles"
            />
            <Area
              type="monotone"
              dataKey="wait"
              stroke="#fcd34d"
              fill="rgba(252, 211, 77, 0.2)"
              strokeWidth={2}
              name="Peak wait"
            />
            <Area
              type="monotone"
              dataKey="duration"
              stroke="#38bdf8"
              fill="rgba(56, 189, 248, 0.18)"
              strokeWidth={2}
              name="Green duration"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}
