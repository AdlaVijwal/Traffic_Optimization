import type { SignalHistoryPoint } from "../../types/dashboard";
import { Panel } from "../common/Panel";
import { SectionHeader } from "../common/SectionHeader";

interface HistoryTableProps {
  history: SignalHistoryPoint[];
}

export function HistoryTable({ history }: HistoryTableProps) {
  return (
    <Panel>
      <SectionHeader
        title="Decision history"
        subtitle="Recent signal controller rounds with priorities considered"
      />
      <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
        <table className="min-w-full divide-y divide-white/5 text-sm text-white/70">
          <thead className="bg-white/5 text-xs uppercase tracking-wide text-white/50">
            <tr>
              <th className="px-4 py-3 text-left">Signal round</th>
              <th className="px-4 py-3 text-left">Green lane</th>
              <th className="px-4 py-3 text-left">Duration</th>
              <th className="px-4 py-3 text-left">Top priorities</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {history.slice(0, 12).map((entry) => (
              <tr key={entry.cycleId} className="bg-black/20">
                <td className="px-4 py-3 font-medium text-white">
                  {entry.cycleId}
                </td>
                <td className="px-4 py-3 uppercase">{entry.greenLane}</td>
                <td className="px-4 py-3">
                  {entry.greenDuration.toFixed(1)} s
                </td>
                <td className="px-4 py-3 text-xs text-white/60">
                  {entry.priorities
                    .slice(0, 3)
                    .map(
                      (item) =>
                        `${item.lane.toUpperCase()} (${
                          item.vehicleCount
                        } vehicles, wait ${item.waitingTime.toFixed(0)}s)`
                    )
                    .join(" · ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {history.length === 0 ? (
          <div className="bg-black/30 px-4 py-6 text-center text-sm text-white/60">
            No history captured. Once the signal controller schedules lanes this
            timeline will populate.
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
