import { AlertTriangle, Camera, RefreshCcw } from "lucide-react";
import type { DashboardData } from "../../types/dashboard";
import { Panel } from "../common/Panel";
import { SectionHeader } from "../common/SectionHeader";

interface IncidentFeedProps {
  dashboard: DashboardData;
}

export function IncidentFeed({ dashboard }: IncidentFeedProps) {
  const incidents: Array<{
    title: string;
    description: string;
    icon: "camera" | "refresh" | "alert";
  }> = [];
  const { status, metrics, isOffline } = dashboard;

  if (isOffline) {
    incidents.push({
      title: "System offline",
      description:
        "Detector and signal services paused. Start Modules 1 and 2 to resume telemetry.",
      icon: "alert",
    });
  }

  if (metrics.staleIncidents > 0) {
    incidents.push({
      title: "Telemetry exceeded freshness budget",
      description: `${metrics.staleIncidents} occurrences today. Latest allowed age ${metrics.telemetryStaleAfter}s.`,
      icon: "refresh",
    });
  }

  const hasZeroLane = Object.values(status.laneCounts).some(
    (count) => count === 0
  );
  if (hasZeroLane) {
    incidents.push({
      title: "Zero vehicle count detected",
      description:
        "One or more camera approaches reported zero vehicles. Verify camera feed or thresholds.",
      icon: "camera",
    });
  }

  return (
    <Panel accent="neutral">
      <SectionHeader
        title="Operator alerts"
        subtitle="Contextual notices generated from live telemetry"
      />
      <div className="mt-5 space-y-3">
        {incidents.length === 0 ? (
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
            Network nominal. No operator actions required.
          </div>
        ) : (
          incidents.map((incident, index) => {
            const Icon =
              incident.icon === "camera"
                ? Camera
                : incident.icon === "refresh"
                ? RefreshCcw
                : AlertTriangle;
            return (
              <div
                key={`${incident.title}-${index}`}
                className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70"
              >
                <Icon
                  className={
                    incident.icon === "alert"
                      ? "mt-1 h-4 w-4 text-control-alert"
                      : "mt-1 h-4 w-4 text-sky-300"
                  }
                />
                <div>
                  <p className="font-medium text-white">{incident.title}</p>
                  <p className="text-xs text-white/60">
                    {incident.description}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Panel>
  );
}
